require("dotenv").config();

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { computeSummary, aggregateSummaryByEmployee, createWorkbook, getDailyWorkloadMinutes } = require("./lib/timecard-workbook");
const { detectPendingAlerts, summarizeAlerts, DEFAULT_ALERT_THRESHOLDS } = require("./lib/pending-alerts");

const LEGACY_ADMIN_NAME = "Lc tranporte";
const SESSION_SECRET = process.env.SESSION_SECRET || "timecard-professional-secret";
const PORT = Number(process.env.PORT || 3000);
const AUTH_COOKIE_NAME = "lc_transportes_auth";
const AUTH_DURATION_MS = 1000 * 60 * 60 * 12;
const SIGNED_EXPORT_DURATION_MS = 1000 * 60 * 5;
const SUPABASE_PAGE_SIZE = 1000;
const TIME_RECORD_ACTIONS = ["Entrada", "Saida para almoco", "Retorno do almoco", "Saida"];
const APP_TIME_ZONE = "America/Sao_Paulo";
const localDateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: APP_TIME_ZONE });
const localTimeFormatter = new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium", timeZone: APP_TIME_ZONE });

const app = express();
let serverInstance = null;
let storageMode = "local";
let supabase = null;
let localUsers = [];
let localRecords = [];
let localVehicles = [];
let localVehicleTransfers = [];
let localRoutes = [];
let localRouteStops = [];
let localUserSequence = 1;
let localRecordSequence = 1;
let localVehicleSequence = 1;
let localVehicleTransferSequence = 1;
let localRouteSequence = 1;
let localRouteStopSequence = 1;
let initializationPromise = null;

const trustProxyValue = process.env.TRUST_PROXY;
if (trustProxyValue) {
  app.set("trust proxy", /^\d+$/.test(trustProxyValue) ? Number(trustProxyValue) : trustProxyValue);
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
  },
}));

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    employeeId: user.employee_id,
    role: user.role,
  };
}

function serializeManagedEmployee(user) {
  return {
    id: user.id,
    name: user.name,
    employeeId: user.employee_id,
    role: user.role,
    createdAt: user.created_at,
  };
}

function serializeVehicle(vehicle) {
  return {
    id: vehicle.id,
    plate: vehicle.plate,
    description: vehicle.description || "",
    initialKm: vehicle.initial_km ?? 0,
    currentKm: vehicle.current_km ?? 0,
    createdAt: vehicle.created_at,
  };
}

function serializeVehicleWithUsage(vehicle, usage) {
  const baseVehicle = serializeVehicle(vehicle);
  return {
    ...baseVehicle,
    inUse: Boolean(usage),
    inUseByOtherEmployee: Boolean(usage),
    inUseBy: usage
      ? {
        userId: usage.userId,
        employeeId: usage.employeeId,
        employeeName: usage.employeeName,
      }
      : null,
  };
}

function serializeRouteStop(stop, route) {
  return {
    id: stop.id,
    operation: stop.operation || "",
    city: stop.city,
    client: stop.client || "",
    address: stop.address,
    contact: stop.contact || "",
    order: stop.stop_order,
    routeId: stop.route_id,
    routeName: route ? route.name : undefined,
  };
}

function serializeRoute(route, stops) {
  return {
    id: route.id,
    name: route.name,
    driver: route.driver || "",
    createdAt: route.created_at,
    stopCount: stops ? stops.length : undefined,
    stops: stops ? stops.map((stop) => serializeRouteStop(stop, route)) : undefined,
  };
}

function serializeVehicleContext(context) {
  return {
    activeJourney: Boolean(context?.activeJourney),
    journeyStartedAt: context?.journeyStartedAt || null,
    lastEventAt: context?.lastEventAt || null,
    currentVehicle: context?.currentVehicle
      ? {
        plate: context.currentVehicle.plate,
        km: context.currentVehicle.km,
        source: context.currentVehicle.source,
      }
      : null,
  };
}

function isSameEntityId(left, right) {
  return String(left) === String(right);
}

function requireAuth(req, res, next) {
  if (!req.authUser) {
    return res.status(401).json({ error: "Autenticacao obrigatoria." });
  }
  return next();
}

function getAdminConfig() {
  return {
    name: String(process.env.ADMIN_NAME || "").trim(),
    password: String(process.env.ADMIN_PASSWORD || ""),
  };
}

function normalizeLoginIdentifier(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getAdminLoginIdentifiers() {
  return Array.from(new Set(
    [getAdminConfig().name, LEGACY_ADMIN_NAME, "admin", "adm"]
      .map((value) => normalizeLoginIdentifier(value))
      .filter(Boolean)
  ));
}

function isAdminLoginIdentifier(value) {
  return getAdminLoginIdentifiers().includes(normalizeLoginIdentifier(value));
}

function allowLocalStorageFallback() {
  if (process.env.ALLOW_LOCAL_STORAGE_FALLBACK === undefined) {
    return process.env.NODE_ENV !== "production";
  }

  return process.env.ALLOW_LOCAL_STORAGE_FALLBACK === "true";
}

function shouldUseSecureCookies() {
  if (process.env.COOKIE_SECURE === "true") {
    return true;
  }

  if (process.env.COOKIE_SECURE === "false") {
    return false;
  }

  return process.env.NODE_ENV === "production";
}

async function validateSupabaseSchema() {
  const checks = [
    {
      table: "users",
      query: supabase
        .from("users")
        .select("id, name, employee_id, password_hash, role", { head: true, count: "exact" })
        .limit(1),
    },
    {
      table: "time_records",
      query: supabase
        .from("time_records")
        .select(
          "id, user_id, employee_name, employee_id, action, recorded_at, local_date, local_time, vehicle_plate, vehicle_km",
          { head: true, count: "exact" }
        )
        .limit(1),
    },
    {
      table: "vehicles",
      query: supabase
        .from("vehicles")
        .select("id, plate, description, initial_km, current_km", { head: true, count: "exact" })
        .limit(1),
    },
    {
      table: "vehicle_transfers",
      query: supabase
        .from("vehicle_transfers")
        .select(
          "id, user_id, employee_name, employee_id, from_vehicle_plate, from_vehicle_km, to_vehicle_plate, to_vehicle_km, recorded_at, local_date, local_time",
          { head: true, count: "exact" }
        )
        .limit(1),
    },
    {
      table: "routes",
      query: supabase
        .from("routes")
        .select("id, name, driver", { head: true, count: "exact" })
        .limit(1),
    },
    {
      table: "route_stops",
      query: supabase
        .from("route_stops")
        .select("id, route_id, operation, city, client, address, contact, stop_order", { head: true, count: "exact" })
        .limit(1),
    },
  ];

  const failures = [];

  for (const check of checks) {
    try {
      await runQuery(check.query);
    } catch (error) {
      failures.push(`${check.table}: ${error.message}`);
    }
  }

  if (failures.length) {
    throw new Error(
      `Schema do Supabase incompleto ou desatualizado. Execute supabase/schema.sql. Detalhes: ${failures.join(" | ")}`
    );
  }
}

function ensureRuntimeConfig() {
  const missing = [];
  const admin = getAdminConfig();

  if (!admin.name) {
    missing.push("ADMIN_NAME");
  }

  if (!admin.password) {
    missing.push("ADMIN_PASSWORD");
  }

  if (missing.length) {
    throw new Error(`Configuracao obrigatoria ausente: ${missing.join(", ")}.`);
  }
}

function requireAdmin(req, res, next) {
  if (!req.authUser || req.authUser.role !== "admin") {
    return res.status(403).json({ error: "Acesso restrito ao administrador." });
  }
  return next();
}

async function runQuery(query) {
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data;
}

async function listSupabaseRows(queryFactory) {
  const rows = [];
  let from = 0;

  while (true) {
    const page = await runQuery(queryFactory().range(from, from + SUPABASE_PAGE_SIZE - 1));
    rows.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) {
      return rows;
    }

    from += SUPABASE_PAGE_SIZE;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function parseDateInput(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

function parseLocalDate(value) {
  const match = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const parsedYear = Number(match[3]);
  const year = parsedYear < 100 ? 2000 + parsedYear : parsedYear;
  return new Date(Date.UTC(year, month - 1, day));
}

function normalizeAdminFilters(query = {}) {
  const employeeId = String(query.employeeId || "").trim();
  const vehiclePlate = String(query.vehiclePlate || "").trim().toUpperCase();
  const dateFrom = String(query.dateFrom || "").trim();
  const dateTo = String(query.dateTo || "").trim();

  const fromDate = dateFrom ? parseDateInput(dateFrom) : null;
  const toDate = dateTo ? parseDateInput(dateTo) : null;

  if (dateFrom && !fromDate) {
    throw new Error("Filtro dateFrom invalido. Use o formato YYYY-MM-DD.");
  }

  if (dateTo && !toDate) {
    throw new Error("Filtro dateTo invalido. Use o formato YYYY-MM-DD.");
  }

  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
    throw new Error("Filtro de periodo invalido. dateFrom deve ser anterior ou igual a dateTo.");
  }

  return {
    employeeId,
    vehiclePlate,
    dateFrom,
    dateTo,
    fromDate,
    toDate,
  };
}

function resolveRecordFilterDate(record) {
  return parseLocalDate(record.local_date) || new Date(record.recorded_at);
}

function matchesRecordFilters(record, filters = {}) {
  if (filters.employeeId && String(record.employee_id || "").trim() !== filters.employeeId) {
    return false;
  }

  if (filters.vehiclePlate && String(record.vehicle_plate || "").trim().toUpperCase() !== filters.vehiclePlate) {
    return false;
  }

  if (filters.fromDate || filters.toDate) {
    const recordDate = resolveRecordFilterDate(record);
    if (Number.isNaN(recordDate.getTime())) {
      return false;
    }

    if (filters.fromDate && recordDate.getTime() < filters.fromDate.getTime()) {
      return false;
    }

    if (filters.toDate && recordDate.getTime() > filters.toDate.getTime()) {
      return false;
    }
  }

  return true;
}

function applyRecordFilters(records, filters) {
  return records.filter((record) => matchesRecordFilters(record, filters));
}

function filterSummaryWithinLastHours(summaryItems, hours, now = Date.now()) {
  const cutoff = Number(now) - (Number(hours) * 60 * 60 * 1000);
  return summaryItems.filter((item) => {
    const lastEventAt = new Date(item.lastEventAt).getTime();
    return !Number.isNaN(lastEventAt) && lastEventAt >= cutoff;
  });
}

function buildFilterQueryString(filters) {
  const params = new URLSearchParams();

  if (filters.employeeId) {
    params.set("employeeId", filters.employeeId);
  }

  if (filters.vehiclePlate) {
    params.set("vehiclePlate", filters.vehiclePlate);
  }

  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

function getFiltersWithoutVehicle(filters) {
  return {
    ...filters,
    vehiclePlate: "",
  };
}

function matchesTransferFilters(transfer, filters = {}, options = {}) {
  const includeVehicle = options.includeVehicle !== false;

  if (filters.employeeId && String(transfer.employee_id || "").trim() !== filters.employeeId) {
    return false;
  }

  if (includeVehicle && filters.vehiclePlate) {
    const normalizedFromPlate = String(transfer.from_vehicle_plate || "").trim().toUpperCase();
    const normalizedToPlate = String(transfer.to_vehicle_plate || "").trim().toUpperCase();
    if (normalizedFromPlate !== filters.vehiclePlate && normalizedToPlate !== filters.vehiclePlate) {
      return false;
    }
  }

  if (filters.fromDate || filters.toDate) {
    const transferDate = resolveRecordFilterDate(transfer);
    if (Number.isNaN(transferDate.getTime())) {
      return false;
    }

    if (filters.fromDate && transferDate.getTime() < filters.fromDate.getTime()) {
      return false;
    }

    if (filters.toDate && transferDate.getTime() > filters.toDate.getTime()) {
      return false;
    }
  }

  return true;
}

function compareTimelineEntries(left, right) {
  const recordedAtCompare = String(left.recorded_at || "").localeCompare(String(right.recorded_at || ""), "pt-BR");
  if (recordedAtCompare !== 0) {
    return recordedAtCompare;
  }

  const localDateCompare = String(left.local_date || "").localeCompare(String(right.local_date || ""), "pt-BR");
  if (localDateCompare !== 0) {
    return localDateCompare;
  }

  const localTimeCompare = String(left.local_time || "").localeCompare(String(right.local_time || ""), "pt-BR");
  if (localTimeCompare !== 0) {
    return localTimeCompare;
  }

  return String(left.created_at || "").localeCompare(String(right.created_at || ""), "pt-BR");
}

function createAuthCookieValue(user) {
  const payload = {
    user,
    exp: Date.now() + AUTH_DURATION_MS,
  };
  return createSignedPayloadValue(payload);
}

function createSignedPayloadValue(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce((cookies, pair) => {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) {
      return cookies;
    }

    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function verifyAuthCookieValue(value) {
  const payload = verifySignedPayloadValue(value);
  if (!payload?.user) {
    return null;
  }

  return payload.user;
}

function verifySignedPayloadValue(value) {
  if (!value || !value.includes(".")) {
    return null;
  }

  const [encodedPayload, signature] = value.split(".");
  const expectedSignature = crypto.createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");

  if (
    Buffer.byteLength(signature) !== Buffer.byteLength(expectedSignature) ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload?.exp || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch (_error) {
    return null;
  }
}

function createSignedExportToken(filters) {
  return createSignedPayloadValue({
    type: "admin-export-xlsx",
    filters,
    exp: Date.now() + SIGNED_EXPORT_DURATION_MS,
  });
}

function sendWorkbookResponse(res, workbook, filters) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("X-Export-Filters", buildFilterQueryString(filters));
  res.setHeader("Content-Disposition", `attachment; filename="planilha-cartao-ponto-lc-transportes-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  return workbook.xlsx.write(res).then(() => {
    res.end();
  });
}

function setAuthCookie(res, user) {
  res.cookie(AUTH_COOKIE_NAME, createAuthCookieValue(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    maxAge: AUTH_DURATION_MS,
    path: "/",
  });
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
  });
}

async function updateAdminPasswordHash(userId, passwordHash) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("users")
        .update({ password_hash: passwordHash })
        .eq("id", userId)
        .eq("role", "admin")
        .select("*")
        .maybeSingle()
    );
  }

  const user = localUsers.find((item) => isSameEntityId(item.id, userId) && item.role === "admin");
  if (!user) {
    return null;
  }

  user.password_hash = passwordHash;
  return user;
}

async function verifyLoginPassword(user, password) {
  if (!user) {
    return false;
  }

  const normalizedPassword = String(password || "");
  if (user.password_hash && bcrypt.compareSync(normalizedPassword, user.password_hash)) {
    return true;
  }

  if (user.role !== "admin") {
    return false;
  }

  const adminConfig = getAdminConfig();
  if (!adminConfig.password || normalizedPassword !== adminConfig.password) {
    return false;
  }

  const passwordHash = bcrypt.hashSync(adminConfig.password, 10);
  const updatedUser = await updateAdminPasswordHash(user.id, passwordHash);
  if (updatedUser) {
    user.password_hash = passwordHash;
  }

  return true;
}

function ensureInitialized() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      ensureRuntimeConfig();
      await initializeStorage();
      await ensureAdminUser();
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  return initializationPromise;
}

app.use((req, _res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  req.authUser = verifyAuthCookieValue(cookies[AUTH_COOKIE_NAME]);
  next();
});

app.use(asyncRoute(async (_req, _res, next) => {
  await ensureInitialized();
  next();
}));

app.use(asyncRoute(async (req, _res, next) => {
  if (!req.authUser?.id) {
    next();
    return;
  }

  const currentUser = await getUserById(req.authUser.id);
  req.authUser = currentUser ? serializeUser(currentUser) : null;
  next();
}));

async function ensureAdminUser() {
  const adminConfig = getAdminConfig();
  const passwordHash = bcrypt.hashSync(adminConfig.password, 10);

  if (storageMode === "supabase") {
    const adminUser = await runQuery(
      supabase
        .from("users")
        .select("id, name, employee_id, password_hash")
        .eq("employee_id", adminConfig.name)
        .eq("role", "admin")
        .maybeSingle()
    );

    if (adminUser) {
      const shouldUpdateName = adminUser.name !== adminConfig.name || adminUser.employee_id !== adminConfig.name;

      if (shouldUpdateName) {
        await runQuery(
          supabase
            .from("users")
            .update({
              name: adminConfig.name,
              employee_id: adminConfig.name,
            })
            .eq("id", adminUser.id)
        );
      }
      return;
    }

    const legacyAdmin = await runQuery(
      supabase
        .from("users")
        .select("id")
        .eq("employee_id", LEGACY_ADMIN_NAME)
        .eq("role", "admin")
        .maybeSingle()
    );

    if (legacyAdmin) {
      await runQuery(
        supabase
          .from("users")
          .update({
            name: adminConfig.name,
            employee_id: adminConfig.name,
          })
          .eq("id", legacyAdmin.id)
      );
      return;
    }

    await runQuery(
      supabase.from("users").insert({
        name: adminConfig.name,
        employee_id: adminConfig.name,
        password_hash: passwordHash,
        role: "admin",
      })
    );
    return;
  }

  const adminUser = localUsers.find((user) => user.employee_id === adminConfig.name && user.role === "admin");
  if (adminUser) {
    adminUser.name = adminConfig.name;
    adminUser.employee_id = adminConfig.name;
    return;
  }

  const legacyAdmin = localUsers.find((user) => user.employee_id === LEGACY_ADMIN_NAME && user.role === "admin");
  if (legacyAdmin) {
    legacyAdmin.name = adminConfig.name;
    legacyAdmin.employee_id = adminConfig.name;
    return;
  }

  localUsers.push({
    id: localUserSequence++,
    name: adminConfig.name,
    employee_id: adminConfig.name,
    password_hash: passwordHash,
    role: "admin",
    created_at: new Date().toISOString(),
  });
}

async function initializeStorage() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseServiceRoleKey) {
    try {
      supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      await validateSupabaseSchema();
      storageMode = "supabase";
      return;
    } catch (error) {
      if (!allowLocalStorageFallback()) {
        throw new Error(`Falha ao conectar no Supabase e o fallback local esta desativado: ${error.message}`);
      }
      console.warn("Supabase indisponivel ou sem schema. Usando banco local para teste.", error.message);
    }
  }

  if (!allowLocalStorageFallback()) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios quando o fallback local esta desativado.");
  }

  storageMode = "local";
}

async function getUserByEmployeeId(employeeId) {
  const normalizedEmployeeId = String(employeeId || "").trim();

  if (storageMode === "supabase") {
    const exactUser = await runQuery(
      supabase.from("users").select("*").eq("employee_id", normalizedEmployeeId).maybeSingle()
    );
    if (exactUser) {
      return exactUser;
    }

    const caseInsensitiveMatches = await runQuery(
      supabase.from("users").select("*").ilike("employee_id", normalizedEmployeeId).limit(2)
    );
    if (caseInsensitiveMatches.length) {
      return caseInsensitiveMatches[0];
    }

    if (isAdminLoginIdentifier(normalizedEmployeeId)) {
      const adminConfig = getAdminConfig();
      const preferredAdminIds = [adminConfig.name, LEGACY_ADMIN_NAME]
        .map((value) => String(value || "").trim())
        .filter(Boolean);

      for (const preferredAdminId of preferredAdminIds) {
        const adminUser = await runQuery(
          supabase
            .from("users")
            .select("*")
            .eq("employee_id", preferredAdminId)
            .eq("role", "admin")
            .maybeSingle()
        );
        if (adminUser) {
          return adminUser;
        }
      }

      const adminUsers = await runQuery(
        supabase
          .from("users")
          .select("*")
          .eq("role", "admin")
          .limit(5)
      );
      return adminUsers[0] || null;
    }

    return null;
  }

  const exactUser = localUsers.find((user) => user.employee_id === normalizedEmployeeId);
  if (exactUser) {
    return exactUser;
  }

  const normalizedLookup = normalizeLoginIdentifier(normalizedEmployeeId);
  const caseInsensitiveUser = localUsers.find((user) => normalizeLoginIdentifier(user.employee_id) === normalizedLookup);
  if (caseInsensitiveUser) {
    return caseInsensitiveUser;
  }

  if (isAdminLoginIdentifier(normalizedEmployeeId)) {
    const adminConfig = getAdminConfig();
    const preferredAdminIds = [adminConfig.name, LEGACY_ADMIN_NAME]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    for (const preferredAdminId of preferredAdminIds) {
      const adminUser = localUsers.find((user) => user.role === "admin" && user.employee_id === preferredAdminId);
      if (adminUser) {
        return adminUser;
      }
    }

    return localUsers.find((user) => user.role === "admin") || null;
  }

  return null;
}

async function getUserById(userId) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase.from("users").select("*").eq("id", userId).maybeSingle()
    );
  }

  return localUsers.find((user) => isSameEntityId(user.id, userId)) || null;
}

async function insertEmployeeUser(name, employeeId, passwordHash) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("users")
        .insert({
          name: String(name).trim(),
          employee_id: String(employeeId).trim(),
          password_hash: passwordHash,
          role: "employee",
        })
        .select("*")
        .single()
    );
  }

  const user = {
    id: localUserSequence++,
    name: String(name).trim(),
    employee_id: String(employeeId).trim(),
    password_hash: passwordHash,
    role: "employee",
    created_at: new Date().toISOString(),
  };
  localUsers.push(user);
  return user;
}

async function listEmployees() {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("users")
        .select("*")
        .eq("role", "employee")
        .order("name", { ascending: true })
    );
  }

  return [...localUsers]
    .filter((user) => user.role === "employee")
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pt-BR"));
}

async function listVehicles() {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("vehicles")
        .select("*")
        .order("plate", { ascending: true })
    );
  }

  return [...localVehicles].sort((left, right) =>
    String(left.plate || "").localeCompare(String(right.plate || ""), "pt-BR")
  );
}

async function getVehicleByPlate(plate) {
  const normalizedPlate = String(plate || "").trim().toUpperCase();

  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("vehicles")
        .select("*")
        .eq("plate", normalizedPlate)
        .maybeSingle()
    );
  }

  return localVehicles.find((vehicle) => String(vehicle.plate || "").trim().toUpperCase() === normalizedPlate) || null;
}

async function getVehicleById(vehicleId) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("vehicles")
        .select("*")
        .eq("id", vehicleId)
        .maybeSingle()
    );
  }

  return localVehicles.find((vehicle) => isSameEntityId(vehicle.id, vehicleId)) || null;
}

async function insertVehicle(plate, description, initialKm) {
  const payload = {
    plate: String(plate).trim().toUpperCase(),
    description: String(description || "").trim(),
    initial_km: Number(initialKm),
    current_km: Number(initialKm),
  };

  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("vehicles")
        .insert(payload)
        .select("*")
        .single()
    );
  }

  const vehicle = {
    id: localVehicleSequence++,
    ...payload,
    created_at: new Date().toISOString(),
  };
  localVehicles.push(vehicle);
  return vehicle;
}

async function deleteVehicle(vehicleId) {
  if (storageMode === "supabase") {
    const { error } = await supabase.from("vehicles").delete().eq("id", vehicleId);
    if (error) {
      throw error;
    }
    return true;
  }

  const before = localVehicles.length;
  localVehicles = localVehicles.filter((vehicle) => !isSameEntityId(vehicle.id, vehicleId));
  return localVehicles.length !== before;
}

async function updateVehicleCurrentKm(vehicleId, currentKm) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("vehicles")
        .update({ current_km: Number(currentKm) })
        .eq("id", vehicleId)
        .select("*")
        .maybeSingle()
    );
  }

  const vehicle = localVehicles.find((item) => isSameEntityId(item.id, vehicleId));
  if (!vehicle) {
    return null;
  }

  vehicle.current_km = Number(currentKm);
  return vehicle;
}

async function refreshVehicleCurrentKmByPlate(plate) {
  const vehicle = await getVehicleByPlate(plate);
  if (!vehicle) {
    return null;
  }

  const normalizedPlate = String(vehicle.plate || "").trim().toUpperCase();
  const records = await listAllRecordsAscending();
  const transfers = await listAllVehicleTransfersAscending();
  const observedKms = [
    Number(vehicle.initial_km ?? 0),
    ...records
      .filter((record) => String(record.vehicle_plate || "").trim().toUpperCase() === normalizedPlate)
      .map((record) => Number(record.vehicle_km))
      .filter((km) => !Number.isNaN(km)),
    ...transfers.flatMap((transfer) => {
      const values = [];
      if (String(transfer.from_vehicle_plate || "").trim().toUpperCase() === normalizedPlate) {
        values.push(Number(transfer.from_vehicle_km));
      }
      if (String(transfer.to_vehicle_plate || "").trim().toUpperCase() === normalizedPlate) {
        values.push(Number(transfer.to_vehicle_km));
      }
      return values.filter((km) => !Number.isNaN(km));
    }),
  ];

  const nextCurrentKm = Math.max(...observedKms, Number(vehicle.initial_km ?? 0), 0);
  return updateVehicleCurrentKm(vehicle.id, nextCurrentKm);
}

async function listAllRoutes() {
  if (storageMode === "supabase") {
    return listSupabaseRows(() => (
      supabase.from("routes").select("*").order("created_at", { ascending: false })
    ));
  }

  return [...localRoutes].sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
}

async function listAllRouteStops() {
  if (storageMode === "supabase") {
    return listSupabaseRows(() => (
      supabase.from("route_stops").select("*").order("stop_order", { ascending: true })
    ));
  }

  return [...localRouteStops].sort((left, right) => left.stop_order - right.stop_order);
}

async function getRouteById(routeId) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("routes")
        .select("*")
        .eq("id", routeId)
        .maybeSingle()
    );
  }

  return localRoutes.find((route) => isSameEntityId(route.id, routeId)) || null;
}

async function listRouteStopsForRoute(routeId) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("route_stops")
        .select("*")
        .eq("route_id", routeId)
        .order("stop_order", { ascending: true })
    );
  }

  return localRouteStops
    .filter((stop) => isSameEntityId(stop.route_id, routeId))
    .sort((left, right) => left.stop_order - right.stop_order);
}

async function insertRoute(name, driver) {
  const payload = {
    name: String(name).trim(),
    driver: String(driver || "").trim(),
  };

  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("routes")
        .insert(payload)
        .select("*")
        .single()
    );
  }

  const route = {
    id: localRouteSequence++,
    ...payload,
    created_at: new Date().toISOString(),
  };
  localRoutes.push(route);
  return route;
}

async function updateRoute(routeId, name, driver) {
  const payload = {
    name: String(name).trim(),
    driver: String(driver || "").trim(),
  };

  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("routes")
        .update(payload)
        .eq("id", routeId)
        .select("*")
        .maybeSingle()
    );
  }

  const route = localRoutes.find((item) => isSameEntityId(item.id, routeId));
  if (!route) {
    return null;
  }

  Object.assign(route, payload);
  return route;
}

async function deleteRouteStopsForRoute(routeId) {
  if (storageMode === "supabase") {
    const { error } = await supabase.from("route_stops").delete().eq("route_id", routeId);
    if (error) {
      throw error;
    }
    return true;
  }

  localRouteStops = localRouteStops.filter((stop) => !isSameEntityId(stop.route_id, routeId));
  return true;
}

async function insertRouteStops(routeId, stops) {
  const payloads = stops.map((stop, index) => ({
    route_id: routeId,
    operation: String(stop.operation || "").trim(),
    city: String(stop.city).trim(),
    client: String(stop.client || "").trim(),
    address: String(stop.address).trim(),
    contact: String(stop.contact || "").trim(),
    stop_order: index,
  }));

  if (!payloads.length) {
    return [];
  }

  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("route_stops")
        .insert(payloads)
        .select("*")
    );
  }

  const insertedStops = payloads.map((payload) => ({
    id: localRouteStopSequence++,
    ...payload,
    created_at: new Date().toISOString(),
  }));
  localRouteStops.push(...insertedStops);
  return insertedStops;
}

async function getRouteStopById(stopId) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("route_stops")
        .select("*")
        .eq("id", stopId)
        .maybeSingle()
    );
  }

  return localRouteStops.find((stop) => isSameEntityId(stop.id, stopId)) || null;
}

// Edita uma unica parada, sem tocar nas outras da mesma rota. E o caminho
// seguro: editar so o que a busca por cidade mostrou, nunca a rota inteira
// (que pode ter paradas de outras cidades misturadas).
async function updateRouteStop(stopId, fields) {
  const payload = {
    operation: String(fields.operation || "").trim(),
    city: String(fields.city).trim(),
    client: String(fields.client || "").trim(),
    address: String(fields.address).trim(),
    contact: String(fields.contact || "").trim(),
  };

  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("route_stops")
        .update(payload)
        .eq("id", stopId)
        .select("*")
        .maybeSingle()
    );
  }

  const stop = localRouteStops.find((item) => isSameEntityId(item.id, stopId));
  if (!stop) {
    return null;
  }

  Object.assign(stop, payload);
  return stop;
}

async function deleteRouteStopById(stopId) {
  if (storageMode === "supabase") {
    const { error } = await supabase.from("route_stops").delete().eq("id", stopId);
    if (error) {
      throw error;
    }
    return true;
  }

  const before = localRouteStops.length;
  localRouteStops = localRouteStops.filter((stop) => !isSameEntityId(stop.id, stopId));
  return localRouteStops.length !== before;
}

async function deleteRoute(routeId) {
  if (storageMode === "supabase") {
    const { error } = await supabase.from("routes").delete().eq("id", routeId);
    if (error) {
      throw error;
    }
    return true;
  }

  const before = localRoutes.length;
  localRoutes = localRoutes.filter((route) => !isSameEntityId(route.id, routeId));
  localRouteStops = localRouteStops.filter((stop) => !isSameEntityId(stop.route_id, routeId));
  return localRoutes.length !== before;
}

async function insertVehicleTransfer(payload) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("vehicle_transfers")
        .insert(payload)
        .select("*")
        .single()
    );
  }

  const transfer = {
    id: localVehicleTransferSequence++,
    ...payload,
    created_at: new Date().toISOString(),
  };
  localVehicleTransfers.push(transfer);
  return transfer;
}

async function listUserVehicleTransfersAscending(userId) {
  if (storageMode === "supabase") {
    return listSupabaseRows(() => (
      supabase
        .from("vehicle_transfers")
        .select("*")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: true })
    ));
  }

  return localVehicleTransfers
    .filter((transfer) => transfer.user_id === userId)
    .sort(compareTimelineEntries);
}

async function listAllVehicleTransfersAscending(filters = null, options = {}) {
  if (storageMode === "supabase") {
    const rows = await listSupabaseRows(() => (
      supabase
        .from("vehicle_transfers")
        .select("*")
        .order("recorded_at", { ascending: true })
    ));
    return filters ? rows.filter((transfer) => matchesTransferFilters(transfer, filters, options)) : rows;
  }

  const rows = [...localVehicleTransfers].sort(compareTimelineEntries);
  return filters ? rows.filter((transfer) => matchesTransferFilters(transfer, filters, options)) : rows;
}

async function buildVehicleContextForUser(userId) {
  const userRecords = await listUserRecordsAscending(userId);
  const openJourneyRecords = getOpenJourneyRecords(userRecords);

  if (!openJourneyRecords.length) {
    return {
      activeJourney: false,
      journeyStartedAt: null,
      lastEventAt: null,
      currentVehicle: null,
    };
  }

  const journeyStartedAt = openJourneyRecords[0].recorded_at;
  const userTransfers = await listUserVehicleTransfersAscending(userId);
  const relevantTransfers = userTransfers.filter((transfer) =>
    new Date(transfer.recorded_at).getTime() >= new Date(journeyStartedAt).getTime()
  );

  const events = [
    ...openJourneyRecords.map((record) => ({
      recorded_at: record.recorded_at,
      local_date: record.local_date,
      local_time: record.local_time,
      created_at: record.created_at,
      vehiclePlate: record.vehicle_plate,
      vehicleKm: record.vehicle_km,
      source: "time_record",
    })),
    ...relevantTransfers.map((transfer) => ({
      recorded_at: transfer.recorded_at,
      local_date: transfer.local_date,
      local_time: transfer.local_time,
      created_at: transfer.created_at,
      vehiclePlate: transfer.to_vehicle_plate,
      vehicleKm: transfer.to_vehicle_km,
      source: "vehicle_transfer",
    })),
  ].sort(compareTimelineEntries);

  const lastEvent = events[events.length - 1] || null;

  return {
    activeJourney: true,
    journeyStartedAt,
    lastEventAt: lastEvent?.recorded_at || openJourneyRecords[openJourneyRecords.length - 1].recorded_at,
    currentVehicle: lastEvent?.vehiclePlate
      ? {
        plate: lastEvent.vehiclePlate,
        km: typeof lastEvent.vehicleKm === "number" ? lastEvent.vehicleKm : Number(lastEvent.vehicleKm || 0),
        source: lastEvent.source,
      }
      : null,
  };
}

async function listActiveVehicleAssignments() {
  const employees = await listEmployees();
  const assignments = [];

  for (const employee of employees) {
    const context = await buildVehicleContextForUser(employee.id);
    if (!context.activeJourney || !context.currentVehicle?.plate) {
      continue;
    }

    assignments.push({
      userId: employee.id,
      employeeId: employee.employee_id,
      employeeName: employee.name,
      plate: String(context.currentVehicle.plate).trim().toUpperCase(),
      km: Number(context.currentVehicle.km ?? 0),
    });
  }

  return assignments;
}

function buildVehicleUsageMap(assignments = []) {
  const usageMap = new Map();

  assignments.forEach((assignment) => {
    usageMap.set(String(assignment.plate || "").trim().toUpperCase(), assignment);
  });

  return usageMap;
}

function getVehicleUsageConflict(usageMap, vehiclePlate, userId) {
  const usage = usageMap.get(String(vehiclePlate || "").trim().toUpperCase());
  if (!usage) {
    return null;
  }

  return String(usage.userId) === String(userId) ? null : usage;
}

async function updateEmployeeUser(userId, updates) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("users")
        .update(updates)
        .eq("id", userId)
        .eq("role", "employee")
        .select("*")
        .maybeSingle()
    );
  }

  const user = localUsers.find((item) => isSameEntityId(item.id, userId) && item.role === "employee");
  if (!user) {
    return null;
  }

  Object.assign(user, updates);
  return user;
}

async function updateEmployeePassword(userId, passwordHash) {
  return updateEmployeeUser(userId, { password_hash: passwordHash });
}

async function countRecordsForUser(userId) {
  if (storageMode === "supabase") {
    const { count, error } = await supabase
      .from("time_records")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return count || 0;
  }

  return localRecords.filter((record) => record.user_id === userId).length;
}

async function syncRecordSnapshotForUser(userId, userSnapshot) {
  const updates = {
    employee_name: userSnapshot.name,
    employee_id: userSnapshot.employee_id,
  };

  if (storageMode === "supabase") {
    await runQuery(
      supabase
        .from("time_records")
        .update(updates)
        .eq("user_id", userId)
    );
    await runQuery(
      supabase
        .from("vehicle_transfers")
        .update(updates)
        .eq("user_id", userId)
    );
    return;
  }

  localRecords = localRecords.map((record) => (
    record.user_id === userId
      ? { ...record, ...updates }
      : record
  ));
  localVehicleTransfers = localVehicleTransfers.map((transfer) => (
    transfer.user_id === userId
      ? { ...transfer, ...updates }
      : transfer
  ));
}

async function deleteEmployeeUser(userId) {
  if (storageMode === "supabase") {
    const { error } = await supabase.from("users").delete().eq("id", userId).eq("role", "employee");
    if (error) {
      throw error;
    }
    return true;
  }

  const before = localUsers.length;
  localUsers = localUsers.filter((user) => !(isSameEntityId(user.id, userId) && user.role === "employee"));
  return localUsers.length !== before;
}

async function listRecordsForUser(user, filters = null) {
  if (storageMode === "supabase") {
    if (user.role === "admin") {
      const rows = await listSupabaseRows(() => (
        supabase.from("time_records").select("*").order("recorded_at", { ascending: false })
      ));
      return filters ? applyRecordFilters(rows, filters) : rows;
    }

    return listSupabaseRows(() => (
      supabase.from("time_records").select("*").eq("user_id", user.id).order("recorded_at", { ascending: false })
    ));
  }

  if (user.role === "admin") {
    const rows = [...localRecords].sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
    return filters ? applyRecordFilters(rows, filters) : rows;
  }

  return localRecords
    .filter((record) => record.user_id === user.id)
    .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
}

async function findRecordByClientRequestId(clientRequestId) {
  if (!clientRequestId) {
    return null;
  }

  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("time_records")
        .select("*")
        .eq("client_request_id", clientRequestId)
        .maybeSingle()
    );
  }

  return localRecords.find((record) => record.client_request_id === clientRequestId) || null;
}

async function insertRecord(user, payload) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("time_records")
        .insert(payload)
        .select("*")
        .single()
    );
  }

  const record = {
    id: localRecordSequence++,
    ...payload,
    created_at: new Date().toISOString(),
  };
  localRecords.push(record);
  return record;
}

async function getRecordById(recordId) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("time_records")
        .select("*")
        .eq("id", recordId)
        .maybeSingle()
    );
  }

  return localRecords.find((record) => isSameEntityId(record.id, recordId)) || null;
}

async function updateRecordById(recordId, updates) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("time_records")
        .update(updates)
        .eq("id", recordId)
        .select("*")
        .maybeSingle()
    );
  }

  const record = localRecords.find((item) => isSameEntityId(item.id, recordId));
  if (!record) {
    return null;
  }

  Object.assign(record, updates);
  return record;
}

async function deleteRecordById(recordId) {
  if (storageMode === "supabase") {
    const { error } = await supabase.from("time_records").delete().eq("id", recordId);
    if (error) {
      throw error;
    }
    return true;
  }

  const before = localRecords.length;
  localRecords = localRecords.filter((record) => !isSameEntityId(record.id, recordId));
  return localRecords.length !== before;
}

async function listAllRecordsAscending(filters = null) {
  if (storageMode === "supabase") {
    const rows = await listSupabaseRows(() => (
      supabase.from("time_records").select("*").order("recorded_at", { ascending: true })
    ));
    return filters ? applyRecordFilters(rows, filters) : rows;
  }

  const rows = [...localRecords].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
  return filters ? applyRecordFilters(rows, filters) : rows;
}

async function listUserRecordsAscending(userId) {
  if (storageMode === "supabase") {
    return listSupabaseRows(() => (
      supabase
        .from("time_records")
        .select("*")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: true })
    ));
  }

  return localRecords
    .filter((record) => record.user_id === userId)
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
}

function compareCombinedUserTimeline(left, right) {
  const compare = compareTimelineEntries(left, right);
  if (compare !== 0) {
    return compare;
  }

  if (left.type === right.type) {
    return 0;
  }

  return left.type === "point" ? -1 : 1;
}

function validateExistingRecordTimeline(records = []) {
  const acceptedRecords = [];
  const sortedRecords = [...records].sort(compareTimelineEntries);

  for (const record of sortedRecords) {
    const sequenceError = validateRecordSequence(acceptedRecords, record.action, record.recorded_at);
    if (sequenceError) {
      return sequenceError;
    }

    acceptedRecords.push(record);
  }

  return null;
}

function validateTimelineWithTransfers(records = [], transfers = []) {
  const events = [
    ...records.map((record) => ({ ...record, type: "point" })),
    ...transfers.map((transfer) => ({ ...transfer, type: "transfer" })),
  ].sort(compareCombinedUserTimeline);

  let journeyActive = false;

  for (const event of events) {
    if (event.type === "transfer") {
      if (!journeyActive) {
        return "O horario informado deixaria uma troca de veiculo fora da jornada do funcionario.";
      }
      continue;
    }

    if (event.action === "Entrada") {
      journeyActive = true;
      continue;
    }

    if (event.action === "Saida") {
      journeyActive = false;
    }
  }

  return null;
}

function buildAdminRecordWarning(records = [], transfers = []) {
  const sequenceError = validateExistingRecordTimeline(records);
  const transferError = validateTimelineWithTransfers(records, transfers);
  const warnings = [sequenceError, transferError].filter(Boolean);
  if (!warnings.length) {
    return null;
  }

  return `Atencao: a sequencia da jornada ficou inconsistente. ${warnings.join(" ")}`;
}

function getOpenJourneyRecords(records) {
  const lastExitIndex = [...records].map((record) => record.action).lastIndexOf("Saida");
  return lastExitIndex === -1 ? records : records.slice(lastExitIndex + 1);
}

function getAllowedNextActions(records) {
  if (!records.length) {
    return [TIME_RECORD_ACTIONS[0]];
  }

  const lastAction = records[records.length - 1].action;
  if (lastAction === "Entrada") {
    return ["Saida para almoco", "Saida"];
  }
  if (lastAction === "Saida para almoco") {
    return ["Retorno do almoco"];
  }
  if (lastAction === "Retorno do almoco") {
    return ["Saida para almoco", "Saida"];
  }
  if (lastAction === "Saida") {
    return ["Entrada"];
  }

  return [];
}

function canReuseCurrentVehicleForAction(action) {
  return action === "Saida para almoco" || action === "Retorno do almoco";
}

function validateRecordSequence(records, nextAction, timestamp) {
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) {
    return "Horario do registro invalido.";
  }

  if (records.length) {
    const lastRecord = records[records.length - 1];
    if (new Date(timestamp).getTime() < new Date(lastRecord.recorded_at).getTime()) {
      return "O horario informado nao pode ser anterior ao ultimo registro ja existente.";
    }
  }

  const journeyRecords = getOpenJourneyRecords(records);
  const allowedActions = getAllowedNextActions(journeyRecords);
  if (!allowedActions.includes(nextAction)) {
    if (!journeyRecords.length) {
      return "O primeiro registro do dia deve ser uma Entrada.";
    }

    return `Sequencia de ponto invalida. Proxima acao permitida: ${allowedActions.join(" ou ")}.`;
  }

  return null;
}

function resetInMemoryState() {
  storageMode = "local";
  supabase = null;
  localUsers = [];
  localRecords = [];
  localVehicles = [];
  localVehicleTransfers = [];
  localRoutes = [];
  localRouteStops = [];
  localUserSequence = 1;
  localRecordSequence = 1;
  localVehicleSequence = 1;
  localVehicleTransferSequence = 1;
  localRouteSequence = 1;
  localRouteStopSequence = 1;
  initializationPromise = null;
}

function resetInitializationState() {
  initializationPromise = null;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/session", (req, res) => {
  res.json({ user: req.authUser || null });
});

async function createEmployeeFromRequest(req, res) {
  const { name, employeeId, password } = req.body;

  if (!name || !employeeId || !password) {
    return res.status(400).json({ error: "Nome, matricula e senha sao obrigatorios." });
  }

  const cleanEmployeeId = String(employeeId).trim();
  const existingUser = await getUserByEmployeeId(cleanEmployeeId);
  if (existingUser) {
    return res.status(409).json({ error: "Ja existe um usuario com essa matricula." });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = await insertEmployeeUser(name, cleanEmployeeId, passwordHash);
  return res.status(201).json({ user: serializeUser(user) });
}

async function requireManagedEmployee(employeeId) {
  const employee = await getUserById(employeeId);
  if (!employee || employee.role !== "employee") {
    return null;
  }

  return employee;
}

app.post("/api/auth/register", requireAdmin, asyncRoute(createEmployeeFromRequest));

app.post("/api/admin/employees", requireAdmin, asyncRoute(createEmployeeFromRequest));

app.get("/api/vehicles", requireAuth, asyncRoute(async (_req, res) => {
  const vehicles = await listVehicles();
  if (_req.authUser.role !== "employee") {
    return res.json({ vehicles: vehicles.map(serializeVehicle) });
  }

  const activeAssignments = await listActiveVehicleAssignments();
  const usageMap = buildVehicleUsageMap(activeAssignments);
  const serializedVehicles = vehicles.map((vehicle) => {
    const usage = usageMap.get(String(vehicle.plate || "").trim().toUpperCase());
    if (usage && String(usage.userId) === String(_req.authUser.id)) {
      return {
        ...serializeVehicle(vehicle),
        inUse: true,
        inUseByOtherEmployee: false,
        inUseBy: {
          userId: usage.userId,
          employeeId: usage.employeeId,
          employeeName: usage.employeeName,
        },
      };
    }

    return serializeVehicleWithUsage(vehicle, usage || null);
  });

  return res.json({ vehicles: serializedVehicles });
}));

app.post("/api/admin/vehicles", requireAdmin, asyncRoute(async (req, res) => {
  const { plate, description, initialKm } = req.body;

  if (!plate) {
    return res.status(400).json({ error: "Informe a placa do veiculo." });
  }

  if (initialKm === undefined || initialKm === null || Number.isNaN(Number(initialKm)) || Number(initialKm) < 0) {
    return res.status(400).json({ error: "Informe o KM inicial do veiculo." });
  }

  const existingVehicle = await getVehicleByPlate(plate);
  if (existingVehicle) {
    return res.status(409).json({ error: "Ja existe um veiculo com essa placa." });
  }

  const vehicle = await insertVehicle(plate, description, initialKm);
  return res.status(201).json({ vehicle: serializeVehicle(vehicle) });
}));

app.get("/api/admin/vehicles", requireAdmin, asyncRoute(async (_req, res) => {
  const vehicles = await listVehicles();
  return res.json({ vehicles: vehicles.map(serializeVehicle) });
}));

app.delete("/api/admin/vehicles/:vehicleId", requireAdmin, asyncRoute(async (req, res) => {
  const vehicle = await getVehicleById(req.params.vehicleId);
  if (!vehicle) {
    return res.status(404).json({ error: "Veiculo nao encontrado." });
  }

  await deleteVehicle(vehicle.id);
  return res.json({ ok: true });
}));

function normalizeCityKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDriverKey(value) {
  return String(value || "").trim().toLowerCase();
}

function parseAndValidateRouteBody(body) {
  const { name, driver, stops } = body || {};
  const normalizedName = String(name || "").trim();
  const normalizedDriver = String(driver || "").trim();
  const normalizedStops = Array.isArray(stops)
    ? stops
      .map((stop) => ({
        operation: String(stop?.operation || "").trim(),
        city: String(stop?.city || "").trim(),
        client: String(stop?.client || "").trim(),
        address: String(stop?.address || "").trim(),
        contact: String(stop?.contact || "").trim(),
      }))
      .filter((stop) => stop.city && stop.address)
    : [];

  if (!normalizedName) {
    return { error: "Informe um nome para a rota." };
  }

  if (!normalizedStops.length) {
    return { error: "Informe ao menos um endereco com cidade para a rota." };
  }

  return { name: normalizedName, driver: normalizedDriver, stops: normalizedStops };
}

app.get("/api/admin/routes/cities", requireAdmin, asyncRoute(async (_req, res) => {
  const stops = await listAllRouteStops();
  const countsByCity = new Map();

  for (const stop of stops) {
    const city = String(stop.city || "").trim();
    if (!city) {
      continue;
    }

    const key = normalizeCityKey(city);
    const current = countsByCity.get(key) || { city, stopCount: 0 };
    current.stopCount += 1;
    countsByCity.set(key, current);
  }

  const cities = [...countsByCity.values()].sort((left, right) => (
    left.city.localeCompare(right.city, "pt-BR")
  ));

  return res.json({ cities });
}));

app.get("/api/admin/routes/drivers", requireAdmin, asyncRoute(async (_req, res) => {
  const routes = await listAllRoutes();
  const countsByDriver = new Map();

  for (const route of routes) {
    const driver = String(route.driver || "").trim();
    if (!driver) {
      continue;
    }

    const key = normalizeDriverKey(driver);
    const current = countsByDriver.get(key) || { driver, routeCount: 0 };
    current.routeCount += 1;
    countsByDriver.set(key, current);
  }

  const drivers = [...countsByDriver.values()].sort((left, right) => (
    left.driver.localeCompare(right.driver, "pt-BR")
  ));

  return res.json({ drivers });
}));

// Sem ?city nem ?driver, lista todas as rotas (resumo). Com ?city, devolve os
// enderecos daquela cidade juntando todas as rotas (um PDF pode misturar
// cidades). Com ?driver, devolve as rotas inteiras daquele motorista, cada
// uma com as paradas completas, para editar ou conferir a rota toda.
app.get("/api/admin/routes", requireAdmin, asyncRoute(async (req, res) => {
  const city = String(req.query.city || "").trim();
  const driver = String(req.query.driver || "").trim();

  if (driver) {
    const driverKey = normalizeDriverKey(driver);
    const [allRoutes, allStops] = await Promise.all([listAllRoutes(), listAllRouteStops()]);
    const stopsByRoute = new Map();
    for (const stop of allStops) {
      const key = String(stop.route_id);
      if (!stopsByRoute.has(key)) {
        stopsByRoute.set(key, []);
      }
      stopsByRoute.get(key).push(stop);
    }

    const routes = allRoutes
      .filter((route) => normalizeDriverKey(route.driver) === driverKey)
      .map((route) => {
        const stops = (stopsByRoute.get(String(route.id)) || []).sort((left, right) => left.stop_order - right.stop_order);
        return serializeRoute(route, stops);
      })
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

    return res.json({ driver, routes });
  }

  if (city) {
    const cityKey = normalizeCityKey(city);
    const [allRoutes, allStops] = await Promise.all([listAllRoutes(), listAllRouteStops()]);
    const routeById = new Map(allRoutes.map((route) => [String(route.id), route]));
    const matchingStops = allStops
      .filter((stop) => normalizeCityKey(stop.city) === cityKey)
      .map((stop) => serializeRouteStop(stop, routeById.get(String(stop.route_id))))
      .sort((left, right) => String(left.routeName || "").localeCompare(String(right.routeName || ""), "pt-BR"));

    return res.json({ city, stops: matchingStops });
  }

  const [allRoutes, allStops] = await Promise.all([listAllRoutes(), listAllRouteStops()]);
  const stopCountByRoute = new Map();
  for (const stop of allStops) {
    const key = String(stop.route_id);
    stopCountByRoute.set(key, (stopCountByRoute.get(key) || 0) + 1);
  }

  const routes = allRoutes.map((route) => ({
    ...serializeRoute(route),
    stopCount: stopCountByRoute.get(String(route.id)) || 0,
  }));

  return res.json({ routes });
}));

app.get("/api/admin/routes/:routeId", requireAdmin, asyncRoute(async (req, res) => {
  const route = await getRouteById(req.params.routeId);
  if (!route) {
    return res.status(404).json({ error: "Rota nao encontrada." });
  }

  const stops = await listRouteStopsForRoute(route.id);
  return res.json({ route: serializeRoute(route, stops) });
}));

app.post("/api/admin/routes", requireAdmin, asyncRoute(async (req, res) => {
  const parsed = parseAndValidateRouteBody(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const route = await insertRoute(parsed.name, parsed.driver);
  const insertedStops = await insertRouteStops(route.id, parsed.stops);
  return res.status(201).json({ route: serializeRoute(route, insertedStops) });
}));

// Edicao substitui nome, motorista e a lista inteira de paradas (mesmo
// formato de colagem usado no cadastro), para corrigir qualquer texto
// transcrito errado sem precisar de um formulario por campo.
app.put("/api/admin/routes/:routeId", requireAdmin, asyncRoute(async (req, res) => {
  const existingRoute = await getRouteById(req.params.routeId);
  if (!existingRoute) {
    return res.status(404).json({ error: "Rota nao encontrada." });
  }

  const parsed = parseAndValidateRouteBody(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const updatedRoute = await updateRoute(existingRoute.id, parsed.name, parsed.driver);
  await deleteRouteStopsForRoute(existingRoute.id);
  const insertedStops = await insertRouteStops(existingRoute.id, parsed.stops);
  return res.json({ route: serializeRoute(updatedRoute, insertedStops) });
}));

// Edicao focada em uma unica parada, para corrigir um endereco/contato sem
// risco de mexer nas demais paradas da mesma rota (que podem ser de outra
// cidade). E o caminho usado pelo botao "Editar" na busca por cidade/motorista.
app.put("/api/admin/routes/:routeId/stops/:stopId", requireAdmin, asyncRoute(async (req, res) => {
  const route = await getRouteById(req.params.routeId);
  if (!route) {
    return res.status(404).json({ error: "Rota nao encontrada." });
  }

  const existingStop = await getRouteStopById(req.params.stopId);
  if (!existingStop || !isSameEntityId(existingStop.route_id, route.id)) {
    return res.status(404).json({ error: "Parada nao encontrada nesta rota." });
  }

  const { operation, city, client, address, contact } = req.body || {};
  const normalizedCity = String(city || "").trim();
  const normalizedAddress = String(address || "").trim();

  if (!normalizedCity || !normalizedAddress) {
    return res.status(400).json({ error: "Informe cidade e endereco para a parada." });
  }

  const updatedStop = await updateRouteStop(existingStop.id, {
    operation,
    city: normalizedCity,
    client,
    address: normalizedAddress,
    contact,
  });
  return res.json({ stop: serializeRouteStop(updatedStop, route) });
}));

app.delete("/api/admin/routes/:routeId/stops/:stopId", requireAdmin, asyncRoute(async (req, res) => {
  const route = await getRouteById(req.params.routeId);
  if (!route) {
    return res.status(404).json({ error: "Rota nao encontrada." });
  }

  const existingStop = await getRouteStopById(req.params.stopId);
  if (!existingStop || !isSameEntityId(existingStop.route_id, route.id)) {
    return res.status(404).json({ error: "Parada nao encontrada nesta rota." });
  }

  await deleteRouteStopById(existingStop.id);
  return res.json({ ok: true });
}));

app.delete("/api/admin/routes/:routeId", requireAdmin, asyncRoute(async (req, res) => {
  const route = await getRouteById(req.params.routeId);
  if (!route) {
    return res.status(404).json({ error: "Rota nao encontrada." });
  }

  await deleteRoute(route.id);
  return res.json({ ok: true });
}));

app.get("/api/admin/employees", requireAdmin, asyncRoute(async (_req, res) => {
  const employees = await listEmployees();
  return res.json({ employees: employees.map(serializeManagedEmployee) });
}));

app.patch("/api/admin/employees/:employeeId", requireAdmin, asyncRoute(async (req, res) => {
  const employee = await requireManagedEmployee(req.params.employeeId);
  if (!employee) {
    return res.status(404).json({ error: "Funcionario nao encontrado." });
  }

  const { name, employeeId } = req.body;
  if (!name || !employeeId) {
    return res.status(400).json({ error: "Nome e matricula sao obrigatorios." });
  }

  const cleanEmployeeId = String(employeeId).trim();
  const existingUser = await getUserByEmployeeId(cleanEmployeeId);
  if (existingUser && existingUser.id !== employee.id) {
    return res.status(409).json({ error: "Ja existe um usuario com essa matricula." });
  }

  const updatedEmployee = await updateEmployeeUser(employee.id, {
    name: String(name).trim(),
    employee_id: cleanEmployeeId,
  });

  await syncRecordSnapshotForUser(employee.id, updatedEmployee);

  return res.json({ employee: serializeManagedEmployee(updatedEmployee) });
}));

app.post("/api/admin/employees/:employeeId/password", requireAdmin, asyncRoute(async (req, res) => {
  const employee = await requireManagedEmployee(req.params.employeeId);
  if (!employee) {
    return res.status(404).json({ error: "Funcionario nao encontrado." });
  }

  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Informe a nova senha." });
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);
  const updatedEmployee = await updateEmployeePassword(employee.id, passwordHash);
  return res.json({ employee: serializeManagedEmployee(updatedEmployee) });
}));

app.delete("/api/admin/employees/:employeeId", requireAdmin, asyncRoute(async (req, res) => {
  const employee = await requireManagedEmployee(req.params.employeeId);
  if (!employee) {
    return res.status(404).json({ error: "Funcionario nao encontrado." });
  }

  const recordCount = await countRecordsForUser(employee.id);
  if (recordCount > 0) {
    return res.status(409).json({ error: "Funcionario possui registros e nao pode ser excluido." });
  }

  await deleteEmployeeUser(employee.id);
  return res.json({ ok: true });
}));

app.patch("/api/admin/records/:recordId", requireAdmin, asyncRoute(async (req, res) => {
  const record = await getRecordById(req.params.recordId);
  if (!record) {
    return res.status(404).json({ error: "Registro nao encontrado." });
  }

  const { action, recordedAt, localDate, localTime, vehicleKm } = req.body || {};
  const normalizedAction = String(action || record.action || "").trim();
  const normalizedRecordedAt = String(recordedAt || "").trim();
  const normalizedLocalDate = String(localDate || "").trim();
  const normalizedLocalTime = String(localTime || "").trim();
  const hasVehicleKm = vehicleKm !== undefined && vehicleKm !== null && String(vehicleKm).trim() !== "";
  const normalizedVehicleKm = hasVehicleKm ? Number(vehicleKm) : Number(record.vehicle_km ?? 0);

  if (!TIME_RECORD_ACTIONS.includes(normalizedAction)) {
    return res.status(400).json({ error: "Informe um tipo valido para o registro." });
  }

  if (!normalizedRecordedAt || Number.isNaN(new Date(normalizedRecordedAt).getTime())) {
    return res.status(400).json({ error: "Informe uma data e hora validas para o registro." });
  }

  if (!normalizedLocalDate || !normalizedLocalTime) {
    return res.status(400).json({ error: "Informe a data e a hora locais do registro." });
  }

  if (hasVehicleKm && (Number.isNaN(normalizedVehicleKm) || normalizedVehicleKm < 0)) {
    return res.status(400).json({ error: "Informe um KM valido para o registro." });
  }

  const editedRecord = {
    ...record,
    action: normalizedAction,
    recorded_at: normalizedRecordedAt,
    local_date: normalizedLocalDate,
    local_time: normalizedLocalTime,
    vehicle_km: normalizedVehicleKm,
  };

  const userRecords = await listUserRecordsAscending(record.user_id);
  const nextRecords = userRecords.map((item) => (
    isSameEntityId(item.id, record.id)
      ? editedRecord
      : item
  ));

  const userTransfers = await listUserVehicleTransfersAscending(record.user_id);
  const warning = buildAdminRecordWarning(nextRecords, userTransfers);

  const updatedRecord = await updateRecordById(record.id, {
    action: normalizedAction,
    recorded_at: normalizedRecordedAt,
    local_date: normalizedLocalDate,
    local_time: normalizedLocalTime,
    vehicle_km: normalizedVehicleKm,
  });

  if (record.vehicle_plate) {
    await refreshVehicleCurrentKmByPlate(record.vehicle_plate);
  }

  return res.json({ record: updatedRecord, warning });
}));

app.delete("/api/admin/records/:recordId", requireAdmin, asyncRoute(async (req, res) => {
  const record = await getRecordById(req.params.recordId);
  if (!record) {
    return res.status(404).json({ error: "Registro nao encontrado." });
  }

  const userRecords = await listUserRecordsAscending(record.user_id);
  const nextRecords = userRecords.filter((item) => !isSameEntityId(item.id, record.id));
  const userTransfers = await listUserVehicleTransfersAscending(record.user_id);
  const warning = buildAdminRecordWarning(nextRecords, userTransfers);

  await deleteRecordById(record.id);

  if (record.vehicle_plate) {
    await refreshVehicleCurrentKmByPlate(record.vehicle_plate);
  }

  return res.json({ ok: true, warning });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const { employeeId, password } = req.body;

  if (!employeeId || !password) {
    return res.status(400).json({ error: "Informe usuario e senha." });
  }

  const user = await getUserByEmployeeId(employeeId);
  const isPasswordValid = await verifyLoginPassword(user, password);
  if (!isPasswordValid) {
    return res.status(401).json({ error: "Credenciais invalidas." });
  }

  const sessionUser = serializeUser(user);
  setAuthCookie(res, sessionUser);
  return res.json({ user: sessionUser });
}));

app.post("/api/auth/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get("/api/me/records", requireAuth, asyncRoute(async (req, res) => {
  const filters = req.authUser.role === "admin" ? normalizeAdminFilters(req.query) : null;
  const rows = await listRecordsForUser(req.authUser, filters);
  return res.json({ records: rows });
}));

app.get("/api/me/vehicle-context", requireAuth, asyncRoute(async (req, res) => {
  if (req.authUser.role !== "employee") {
    return res.json({ context: serializeVehicleContext(null) });
  }

  const context = await buildVehicleContextForUser(req.authUser.id);
  return res.json({ context: serializeVehicleContext(context) });
}));

const EMPLOYEE_WEEK_SUMMARY_DAYS = 7;

app.get("/api/me/summary", requireAuth, asyncRoute(async (req, res) => {
  if (req.authUser.role !== "employee") {
    return res.json({ daysWorked: 0, workedHours: "00:00", overtimeHours: "00:00", windowDays: EMPLOYEE_WEEK_SUMMARY_DAYS });
  }

  const todayStart = parseLocalDate(localDateFormatter.format(new Date()));
  const fromDate = new Date(todayStart.getTime() - (EMPLOYEE_WEEK_SUMMARY_DAYS - 1) * 24 * 60 * 60 * 1000);
  const isWithinWeek = (row) => {
    const rowDate = parseLocalDate(row.local_date) || new Date(row.recorded_at);
    return rowDate.getTime() >= fromDate.getTime() && rowDate.getTime() <= todayStart.getTime();
  };

  const records = (await listUserRecordsAscending(req.authUser.id)).filter(isWithinWeek);
  const transfers = (await listUserVehicleTransfersAscending(req.authUser.id)).filter(isWithinWeek);

  // Reaproveita o mesmo calculo de horas/carga horaria do resumo do admin
  // para os numeros nunca divergirem entre a tela do funcionario e a do admin.
  const { employees } = aggregateSummaryByEmployee(computeSummary(records, transfers));
  const own = employees[0] || { daysWorked: 0, workedHours: "00:00", overtimeHours: "00:00" };

  return res.json({
    daysWorked: own.daysWorked,
    workedHours: own.workedHours,
    overtimeHours: own.overtimeHours,
    windowDays: EMPLOYEE_WEEK_SUMMARY_DAYS,
    dailyWorkloadMinutes: getDailyWorkloadMinutes(req.authUser.employeeId, req.authUser.name),
  });
}));

app.post("/api/me/records", requireAuth, asyncRoute(async (req, res) => {
  const user = req.authUser;
  if (user.role !== "employee") {
    return res.status(403).json({ error: "Somente funcionarios registram ponto." });
  }

  const { action, latitude, longitude, locationLabel, recordedAt, localDate, localTime, vehiclePlate, vehicleKm, clientRequestId } = req.body;
  const allowedActions = TIME_RECORD_ACTIONS;

  if (!allowedActions.includes(action)) {
    return res.status(400).json({ error: "Acao de ponto invalida." });
  }

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return res.status(400).json({ error: "Ative a localizacao para registrar o ponto." });
  }

  const normalizedClientRequestId = String(clientRequestId || "").trim() || null;
  if (normalizedClientRequestId) {
    const existingRecord = await findRecordByClientRequestId(normalizedClientRequestId);
    if (existingRecord) {
      return res.status(200).json({ record: existingRecord });
    }
  }

  const timestamp = recordedAt || new Date().toISOString();
  const date = localDate || localDateFormatter.format(new Date(timestamp));
  const time = localTime || localTimeFormatter.format(new Date(timestamp));
  const userRecords = await listUserRecordsAscending(user.id);
  const sequenceError = validateRecordSequence(userRecords, action, timestamp);

  if (sequenceError) {
    return res.status(409).json({ error: sequenceError });
  }

  const vehicleContext = await buildVehicleContextForUser(user.id);
  let normalizedVehiclePlate = String(vehiclePlate || "").trim().toUpperCase();
  let numericVehicleKm =
    vehicleKm === undefined || vehicleKm === null || String(vehicleKm).trim() === ""
      ? null
      : Number(vehicleKm);

  if (
    (!normalizedVehiclePlate || numericVehicleKm === null || Number.isNaN(numericVehicleKm)) &&
    canReuseCurrentVehicleForAction(action) &&
    vehicleContext.activeJourney &&
    vehicleContext.currentVehicle?.plate
  ) {
    normalizedVehiclePlate = String(vehicleContext.currentVehicle.plate).trim().toUpperCase();
    numericVehicleKm = Number(vehicleContext.currentVehicle.km ?? 0);
  }

  if (!normalizedVehiclePlate || numericVehicleKm === null || Number.isNaN(numericVehicleKm)) {
    return res.status(400).json({ error: "Informe a placa e o KM do veiculo." });
  }

  const registeredVehicle = await getVehicleByPlate(normalizedVehiclePlate);
  const activeAssignments = await listActiveVehicleAssignments();
  const usageMap = buildVehicleUsageMap(activeAssignments);

  if (!registeredVehicle) {
    return res.status(409).json({ error: "Selecione um veiculo cadastrado." });
  }

  if (vehicleContext.activeJourney && vehicleContext.currentVehicle?.plate) {
    if (normalizedVehiclePlate !== vehicleContext.currentVehicle.plate) {
      return res.status(409).json({
        error: `Este funcionario esta com o veiculo ${vehicleContext.currentVehicle.plate} em uso. Use o botao Trocar veiculo para mudar.`,
      });
    }
  } else {
    const vehicleConflict = getVehicleUsageConflict(usageMap, normalizedVehiclePlate, user.id);
    if (vehicleConflict) {
      return res.status(409).json({
        error: `O veiculo ${normalizedVehiclePlate} ja esta em uso por ${vehicleConflict.employeeName} (${vehicleConflict.employeeId}).`,
      });
    }
  }

  if (registeredVehicle && numericVehicleKm < Number(registeredVehicle.current_km ?? 0)) {
    return res.status(409).json({
      error: `O KM informado nao pode ser menor que o KM atual do veiculo (${registeredVehicle.current_km}).`,
    });
  }

  const record = await insertRecord(user, {
    user_id: user.id,
    employee_name: user.name,
    employee_id: user.employeeId,
    action,
    recorded_at: timestamp,
    local_date: date,
    local_time: time,
    latitude: typeof latitude === "number" ? latitude : null,
    longitude: typeof longitude === "number" ? longitude : null,
    location_label: locationLabel || "Localizacao nao informada",
    vehicle_plate: normalizedVehiclePlate,
    vehicle_km: numericVehicleKm,
    client_request_id: normalizedClientRequestId,
  });

  if (registeredVehicle) {
    await updateVehicleCurrentKm(registeredVehicle.id, numericVehicleKm);
  }

  return res.status(201).json({ record });
}));

app.post("/api/me/vehicle-transfers", requireAuth, asyncRoute(async (req, res) => {
  const user = req.authUser;
  if (user.role !== "employee") {
    return res.status(403).json({ error: "Somente funcionarios podem trocar de veiculo." });
  }

  const {
    fromVehiclePlate,
    fromVehicleKm,
    toVehiclePlate,
    toVehicleKm,
    latitude,
    longitude,
    locationLabel,
    recordedAt,
    localDate,
    localTime,
  } = req.body;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return res.status(400).json({ error: "Ative a localizacao para trocar o veiculo." });
  }

  if (
    fromVehicleKm === undefined ||
    fromVehicleKm === null ||
    Number.isNaN(Number(fromVehicleKm)) ||
    toVehicleKm === undefined ||
    toVehicleKm === null ||
    Number.isNaN(Number(toVehicleKm))
  ) {
    return res.status(400).json({ error: "Informe o KM final do veiculo atual e o KM do novo veiculo." });
  }

  if (!toVehiclePlate) {
    return res.status(400).json({ error: "Selecione o novo veiculo da troca." });
  }

  const context = await buildVehicleContextForUser(user.id);
  if (!context.activeJourney || !context.currentVehicle?.plate) {
    return res.status(409).json({ error: "Inicie a jornada antes de trocar de veiculo." });
  }

  const normalizedFromVehiclePlate = String(fromVehiclePlate || context.currentVehicle.plate).trim().toUpperCase();
  const normalizedToVehiclePlate = String(toVehiclePlate).trim().toUpperCase();
  const numericFromVehicleKm = Number(fromVehicleKm);
  const numericToVehicleKm = Number(toVehicleKm);

  if (normalizedFromVehiclePlate !== context.currentVehicle.plate) {
    return res.status(409).json({ error: "O veiculo atual mudou. Atualize a tela e tente novamente." });
  }

  if (normalizedToVehiclePlate === normalizedFromVehiclePlate) {
    return res.status(409).json({ error: "Selecione um veiculo diferente para concluir a troca." });
  }

  const currentVehicle = await getVehicleByPlate(normalizedFromVehiclePlate);
  const nextVehicle = await getVehicleByPlate(normalizedToVehiclePlate);
  const activeAssignments = await listActiveVehicleAssignments();
  const usageMap = buildVehicleUsageMap(activeAssignments);

  if (!currentVehicle) {
    return res.status(409).json({ error: "O veiculo atual nao esta mais cadastrado." });
  }

  if (!nextVehicle) {
    return res.status(409).json({ error: "Selecione um novo veiculo cadastrado." });
  }

  const nextVehicleConflict = getVehicleUsageConflict(usageMap, normalizedToVehiclePlate, user.id);
  if (nextVehicleConflict) {
    return res.status(409).json({
      error: `O veiculo ${normalizedToVehiclePlate} ja esta em uso por ${nextVehicleConflict.employeeName} (${nextVehicleConflict.employeeId}).`,
    });
  }

  const minimumCurrentKm = Math.max(
    Number(currentVehicle.current_km ?? 0),
    Number(context.currentVehicle.km ?? 0)
  );
  if (numericFromVehicleKm < minimumCurrentKm) {
    return res.status(409).json({
      error: `O KM final do veiculo atual nao pode ser menor que ${minimumCurrentKm}.`,
    });
  }

  if (numericToVehicleKm < Number(nextVehicle.current_km ?? 0)) {
    return res.status(409).json({
      error: `O KM do novo veiculo nao pode ser menor que o KM atual dele (${nextVehicle.current_km}).`,
    });
  }

  const timestamp = recordedAt || new Date().toISOString();
  if (context.lastEventAt && new Date(timestamp).getTime() < new Date(context.lastEventAt).getTime()) {
    return res.status(409).json({ error: "O horario da troca nao pode ser anterior ao ultimo evento da jornada." });
  }

  const date = localDate || localDateFormatter.format(new Date(timestamp));
  const time = localTime || localTimeFormatter.format(new Date(timestamp));

  const transfer = await insertVehicleTransfer({
    user_id: user.id,
    employee_name: user.name,
    employee_id: user.employeeId,
    from_vehicle_plate: normalizedFromVehiclePlate,
    from_vehicle_km: numericFromVehicleKm,
    to_vehicle_plate: normalizedToVehiclePlate,
    to_vehicle_km: numericToVehicleKm,
    recorded_at: timestamp,
    local_date: date,
    local_time: time,
    latitude,
    longitude,
    location_label: locationLabel || "Localizacao nao informada",
  });

  await updateVehicleCurrentKm(currentVehicle.id, numericFromVehicleKm);
  await updateVehicleCurrentKm(nextVehicle.id, numericToVehicleKm);

  const nextContext = await buildVehicleContextForUser(user.id);
  return res.status(201).json({
    transfer,
    context: serializeVehicleContext(nextContext),
  });
}));

app.get("/api/admin/summary", requireAdmin, asyncRoute(async (_req, res) => {
  const filters = normalizeAdminFilters(_req.query);
  const baseFilters = filters.vehiclePlate ? getFiltersWithoutVehicle(filters) : filters;
  const rows = await listAllRecordsAscending(baseFilters);
  const transfers = await listAllVehicleTransfersAscending(baseFilters, { includeVehicle: false });
  const shouldUseRecentWindow = !filters.dateFrom && !filters.dateTo;
  // Calculamos com o historico completo (sem cortar por horario) para nao
  // perder a Entrada de turnos que comecam antes da janela das 48h, como
  // turnos que atravessam a madrugada. O filtro de recencia e aplicado
  // depois, em cima do resumo ja fechado de cada turno.
  const computedSummary = computeSummary(rows, transfers);
  const recentSummary = shouldUseRecentWindow
    ? filterSummaryWithinLastHours(computedSummary, 48)
    : computedSummary;
  const filteredSummary = filters.vehiclePlate
    ? recentSummary.filter((item) => item.vehiclePlates.includes(filters.vehiclePlate))
    : recentSummary;
  const summary = filteredSummary.map((item) => ({
    employeeName: item.employeeName,
    employeeId: item.employeeId,
    localDate: item.day,
    vehiclePlate: item.vehiclePlate,
    intervalHours: item.interval,
    workedHours: item.worked,
    overtimeHours: item.overtime,
    dailyKm: item.dailyKm,
    entries: item.entries,
    lunchStarts: item.lunchStarts,
    lunchEnds: item.lunchEnds,
    exits: item.exits,
  }));
  const { employees: aggregates, company: companyTotals } = aggregateSummaryByEmployee(filteredSummary);
  return res.json({
    summary,
    aggregates,
    companyTotals,
    filters: {
      employeeId: filters.employeeId,
      vehiclePlate: filters.vehiclePlate,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    },
    windowHours: shouldUseRecentWindow ? 48 : null,
  });
}));

app.get("/api/admin/alerts", requireAdmin, asyncRoute(async (req, res) => {
  const filters = normalizeAdminFilters(req.query);
  // As pendencias sempre olham a janela recente inteira. Recortar por periodo ou
  // por veiculo esconderia a Entrada ou a Saida de uma jornada e geraria alerta
  // falso de jornada aberta, entao aqui so o filtro de matricula e aplicado.
  const alertFilters = { ...filters, vehiclePlate: "", dateFrom: "", dateTo: "", fromDate: null, toDate: null };
  const records = await listAllRecordsAscending(alertFilters);
  const transfers = await listAllVehicleTransfersAscending(alertFilters, { includeVehicle: false });
  const allEmployees = (await listEmployees()).map(serializeManagedEmployee);
  const employees = filters.employeeId
    ? allEmployees.filter((employee) => employee.employeeId === filters.employeeId)
    : allEmployees;
  const alerts = detectPendingAlerts({
    records,
    transfers,
    employees,
    now: Date.now(),
  });

  return res.json({
    alerts,
    counts: summarizeAlerts(alerts),
    thresholds: DEFAULT_ALERT_THRESHOLDS,
    filters: { employeeId: filters.employeeId },
  });
}));

app.get("/api/admin/export.csv", requireAdmin, asyncRoute(async (req, res) => {
  const filters = normalizeAdminFilters(req.query);
  const rows = await listAllRecordsAscending(filters);

  const csvRows = [
    [
      "Funcionario",
      "Matricula",
      "Acao",
      "Data",
      "Hora",
      "Placa do veiculo",
      "KM do veiculo",
    ],
    ...rows.map((row) => [
      row.employee_name,
      row.employee_id,
      row.action,
      row.local_date,
      row.local_time,
      row.vehicle_plate ?? "",
      row.vehicle_km ?? "",
    ]),
    [],
    ["Rodape explicativo"],
    ["Funcionario", "Nome do funcionario que registrou o ponto"],
    ["Matricula", "Codigo do funcionario"],
    ["Acao", "Tipo de ponto registrado"],
    ["Data", "Dia local do registro"],
    ["Hora", "Hora local do registro"],
    ["Placa do veiculo", "Placa informada pelo funcionario ao registrar o ponto"],
    ["KM do veiculo", "Quilometragem informada no momento do registro"],
  ];

  const csv = csvRows
    .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("X-Export-Filters", buildFilterQueryString(filters));
  res.setHeader("Content-Disposition", `attachment; filename="cartao-ponto-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
}));

app.get("/api/admin/export.xlsx", requireAdmin, asyncRoute(async (req, res) => {
  const filters = normalizeAdminFilters(req.query);
  const baseFilters = filters.vehiclePlate ? getFiltersWithoutVehicle(filters) : filters;
  const rows = await listAllRecordsAscending(baseFilters);
  const transfers = await listAllVehicleTransfersAscending(baseFilters, { includeVehicle: false });

  const workbook = createWorkbook(rows, transfers);
  await sendWorkbookResponse(res, workbook, filters);
}));

app.post("/api/admin/export.xlsx/link", requireAdmin, asyncRoute(async (req, res) => {
  const filters = normalizeAdminFilters(req.body || {});
  const token = createSignedExportToken(filters);
  return res.json({ url: `/api/admin/export.xlsx/direct?token=${encodeURIComponent(token)}` });
}));

app.get("/api/admin/export.xlsx/direct", asyncRoute(async (req, res) => {
  const tokenPayload = verifySignedPayloadValue(String(req.query.token || ""));
  if (!tokenPayload || tokenPayload.type !== "admin-export-xlsx") {
    return res.status(401).json({ error: "Link de exportacao invalido ou expirado." });
  }

  const filters = normalizeAdminFilters(tokenPayload.filters || {});
  const baseFilters = filters.vehiclePlate ? getFiltersWithoutVehicle(filters) : filters;
  const rows = await listAllRecordsAscending(baseFilters);
  const transfers = await listAllVehicleTransfersAscending(baseFilters, { includeVehicle: false });
  const workbook = createWorkbook(rows, transfers);
  await sendWorkbookResponse(res, workbook, filters);
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Erro interno do servidor." });
});

app.use((_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  ensureRuntimeConfig();
  await ensureInitialized();
  if (serverInstance) {
    return serverInstance;
  }

  serverInstance = app.listen(PORT, () => {
    console.log(`Servidor iniciado em http://localhost:${PORT} usando modo ${storageMode}`);
  });

  return serverInstance;
}

app.__testing = {
  resetInMemoryState,
  resetInitializationState,
  validateRecordSequence,
  getAllowedNextActions,
  canReuseCurrentVehicleForAction,
  normalizeAdminFilters,
  applyRecordFilters,
  detectPendingAlerts,
};

module.exports = app;
module.exports.start = start;
module.exports.__testing = app.__testing;

if (require.main === module) {
  start().catch((error) => {
    console.error("Falha ao iniciar servidor:", error.message);
    process.exit(1);
  });
}
