require("dotenv").config();

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { computeSummary, aggregateSummaryByEmployee, createWorkbook, getDailyWorkloadMinutes } = require("./lib/timecard-workbook");
const { detectPendingAlerts, summarizeAlerts, DEFAULT_ALERT_THRESHOLDS } = require("./lib/pending-alerts");
const { startWhatsAppBot, getConnectionState: getWhatsAppConnectionState } = require("./lib/whatsapp-bot");
const QRCode = require("qrcode");
const Anthropic = require("@anthropic-ai/sdk");

const LEGACY_ADMIN_NAME = "Lc tranporte";
const SESSION_SECRET = process.env.SESSION_SECRET || "timecard-professional-secret";
const PORT = Number(process.env.PORT || 3000);
const AUTH_COOKIE_NAME = "lc_transportes_auth";
const AUTH_DURATION_MS = 1000 * 60 * 60 * 12;
const SIGNED_EXPORT_DURATION_MS = 1000 * 60 * 5;
const SUPABASE_PAGE_SIZE = 1000;
const TIME_RECORD_ACTIONS = ["Entrada", "Saida para almoco", "Retorno do almoco", "Saida"];
const ADMIN_SECTIONS = ["overview", "registros", "cadastros", "rotas", "frota"];
const CHAT_MODEL = "claude-haiku-4-5";
const CHAT_MAX_TURNS = 6;
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
let localVehicleMaintenance = [];
let localUserSequence = 1;
let localRecordSequence = 1;
let localVehicleSequence = 1;
let localVehicleTransferSequence = 1;
let localRouteSequence = 1;
let localRouteStopSequence = 1;
let localVehicleMaintenanceSequence = 1;
let initializationPromise = null;

const trustProxyValue = process.env.TRUST_PROXY;
if (trustProxyValue) {
  app.set("trust proxy", /^\d+$/.test(trustProxyValue) ? Number(trustProxyValue) : trustProxyValue);
}

// Limite maior que o padrao (~100kb) porque o registro de ponto com foto
// manda uma selfie em base64 dentro do corpo JSON.
app.use(express.json({ limit: "3mb" }));
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
    permissions: user.permissions || [],
    requiresVehicle: user.requires_vehicle !== false,
    active: user.active !== false,
  };
}

function serializeManagedEmployee(user) {
  return {
    id: user.id,
    name: user.name,
    employeeId: user.employee_id,
    role: user.role,
    permissions: user.permissions || [],
    phone: user.phone || "",
    dailyWorkloadMinutes: user.daily_workload_minutes ?? null,
    requiresVehicle: user.requires_vehicle !== false,
    active: user.active !== false,
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

function serializeVehicleMaintenance(entry) {
  return {
    id: entry.id,
    vehicleId: entry.vehicle_id,
    description: entry.description,
    status: entry.status || "pending",
    dueAt: entry.due_at ?? null,
    performedAt: entry.performed_at ?? null,
    km: entry.km ?? null,
    cost: entry.cost ?? null,
    createdAt: entry.created_at,
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

// Um cookie de sessao antigo (de um periodo em que o servidor rodava em modo
// local, com IDs numericos como "1") nao e um UUID valido no Supabase. Sem
// essa checagem, toda requisicao com esse cookie derrubava com erro cru do
// Postgres (22P02) em vez de simplesmente tratar a sessao como invalida.
function looksLikeUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

// So os digitos, sem DDI/formatacao — assim "+55 47 99999-9999" e o numero
// que o bot do WhatsApp recebe (ex.: "5547999999999@s.whatsapp.net") batem
// no mesmo valor guardado em users.phone.
function normalizePhoneNumber(value) {
  return String(value || "").replace(/\D/g, "");
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
        .select("id, name, employee_id, password_hash, role, permissions, phone, daily_workload_minutes", { head: true, count: "exact" })
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

// Gestor bate ponto igual funcionario comum, alem de acessar as areas do
// painel liberadas pra ele. So o admin real nao tem tela de ponto.
function isPunchClockUser(user) {
  return user?.role === "employee" || user?.role === "manager";
}

// Admin real sempre ve todos os registros. Gestor so ve todos quando tem a
// permissao "registros" liberada; sem ela, cai no mesmo caso do funcionario
// (so os proprios registros).
function canManageAllRecords(user) {
  if (user?.role === "admin") {
    return true;
  }

  return user?.role === "manager" && Array.isArray(user.permissions) && user.permissions.includes("registros");
}

function normalizePermissionsList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => String(item || "").trim()).filter((item) => ADMIN_SECTIONS.includes(item)))];
}

// Converte o valor em HORAS que o admin digita no cadastro (ex.: "12") pra
// minutos, que e a unidade guardada no banco e usada pelo calculo de hora
// extra em lib/timecard-workbook.js. Em branco = sem excecao (usa o padrao
// de 8h do sistema).
function normalizeDailyWorkloadMinutes(hoursValue) {
  if (hoursValue === undefined || hoursValue === null || String(hoursValue).trim() === "") {
    return { minutes: null };
  }

  const hours = Number(String(hoursValue).replace(",", "."));
  if (Number.isNaN(hours) || hours <= 0 || hours > 24) {
    return { error: "Carga horaria diaria deve ser um numero de horas entre 0 e 24." };
  }

  return { minutes: Math.round(hours * 60) };
}

function requireAdmin(req, res, next) {
  if (!req.authUser || req.authUser.role !== "admin") {
    return res.status(403).json({ error: "Acesso restrito ao administrador." });
  }
  return next();
}

// Libera pro admin (sempre) ou pra um gestor com a area especifica liberada
// em `permissions`. Usada nas rotas administrativas que um gestor pode
// acessar de forma parcial, ao contrario de requireAdmin (tudo ou nada).
// Mesma regra usada pelo middleware requireAdminSection, mas como funcao
// pura para o chat (que decide quais ferramentas oferecer a cada usuario
// sem passar por uma rota Express).
function canAccessSection(user, section) {
  if (!user) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  return user.role === "manager" && Array.isArray(user.permissions) && user.permissions.includes(section);
}

function requireAdminSection(section) {
  return (req, res, next) => {
    if (!canAccessSection(req.authUser, section)) {
      return res.status(403).json({ error: "Voce nao tem permissao para acessar esta area." });
    }
    return next();
  };
}

let anthropicClient;
function getAnthropicClient() {
  const apiKey = String(process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) {
    return null;
  }

  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey });
  }

  return anthropicClient;
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

  if (storageMode === "supabase" && !looksLikeUuid(req.authUser.id)) {
    req.authUser = null;
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

// Usado pelo bot de WhatsApp pra descobrir qual funcionario mandou a
// mensagem, a partir do numero de telefone cadastrado no perfil dele.
async function getUserByPhone(phone) {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return null;
  }

  if (storageMode === "supabase") {
    return runQuery(
      supabase.from("users").select("*").eq("phone", normalizedPhone).maybeSingle()
    );
  }

  return localUsers.find((user) => normalizePhoneNumber(user.phone) === normalizedPhone) || null;
}

async function insertEmployeeUser(name, employeeId, passwordHash, role = "employee", permissions = [], phone = null, dailyWorkloadMinutes = null, requiresVehicle = true) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("users")
        .insert({
          name: String(name).trim(),
          employee_id: String(employeeId).trim(),
          password_hash: passwordHash,
          role,
          permissions,
          phone,
          daily_workload_minutes: dailyWorkloadMinutes,
          requires_vehicle: requiresVehicle,
          active: true,
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
    role,
    permissions,
    phone,
    daily_workload_minutes: dailyWorkloadMinutes,
    requires_vehicle: requiresVehicle,
    active: true,
    created_at: new Date().toISOString(),
  };
  localUsers.push(user);
  return user;
}

// Sem includeManagers, so traz motoristas/funcionarios (uso normal da tela de
// Cadastros por um gestor). Com includeManagers, o admin real tambem ve os
// logins de gestor (pra poder editar permissao ou excluir).
async function listEmployees(includeManagers = false) {
  const roles = includeManagers ? ["employee", "manager"] : ["employee"];

  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("users")
        .select("*")
        .in("role", roles)
        .order("name", { ascending: true })
    );
  }

  return [...localUsers]
    .filter((user) => roles.includes(user.role))
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pt-BR"));
}

// Monta o Map employeeId -> minutos que lib/timecard-workbook.js recebe como
// workloadOverridesById, pra funcionarios com jornada diferente de 8h (esse
// modulo e puro/sem banco, entao server.js busca os valores customizados).
async function buildWorkloadOverridesMap() {
  const overrides = new Map();

  if (storageMode === "supabase") {
    const rows = await runQuery(
      supabase.from("users").select("employee_id, daily_workload_minutes").not("daily_workload_minutes", "is", null)
    );
    for (const row of rows) {
      overrides.set(String(row.employee_id || "").trim(), row.daily_workload_minutes);
    }
    return overrides;
  }

  for (const user of localUsers) {
    if (typeof user.daily_workload_minutes === "number") {
      overrides.set(String(user.employee_id || "").trim(), user.daily_workload_minutes);
    }
  }
  return overrides;
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

async function updateVehicleById(vehicleId, updates) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("vehicles")
        .update(updates)
        .eq("id", vehicleId)
        .select("*")
        .maybeSingle()
    );
  }

  const vehicle = localVehicles.find((item) => isSameEntityId(item.id, vehicleId));
  if (!vehicle) {
    return null;
  }

  Object.assign(vehicle, updates);
  return vehicle;
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

async function listVehicleMaintenanceForVehicle(vehicleId) {
  if (storageMode === "supabase") {
    return listSupabaseRows(() => (
      supabase
        .from("vehicle_maintenance")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false })
    ));
  }

  return localVehicleMaintenance
    .filter((entry) => isSameEntityId(entry.vehicle_id, vehicleId))
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
}

async function listPendingVehicleMaintenanceOverview() {
  const [entries, vehicles] = await Promise.all([
    storageMode === "supabase"
      ? listSupabaseRows(() => (
        supabase
          .from("vehicle_maintenance")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
      ))
      : localVehicleMaintenance
        .filter((entry) => entry.status !== "done")
        .sort((left, right) => new Date(left.created_at) - new Date(right.created_at)),
    listVehicles(),
  ]);

  const vehiclesById = new Map(vehicles.map((vehicle) => [String(vehicle.id), vehicle]));
  return entries.map((entry) => ({ entry, vehicle: vehiclesById.get(String(entry.vehicle_id)) || null }));
}

async function insertVehicleMaintenance(payload) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("vehicle_maintenance")
        .insert(payload)
        .select("*")
        .single()
    );
  }

  const entry = {
    id: localVehicleMaintenanceSequence++,
    ...payload,
    created_at: new Date().toISOString(),
  };
  localVehicleMaintenance.push(entry);
  return entry;
}

async function getVehicleMaintenanceById(entryId) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("vehicle_maintenance")
        .select("*")
        .eq("id", entryId)
        .maybeSingle()
    );
  }

  return localVehicleMaintenance.find((entry) => isSameEntityId(entry.id, entryId)) || null;
}

async function updateVehicleMaintenanceById(entryId, updates) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("vehicle_maintenance")
        .update(updates)
        .eq("id", entryId)
        .select("*")
        .maybeSingle()
    );
  }

  const entry = localVehicleMaintenance.find((item) => isSameEntityId(item.id, entryId));
  if (!entry) {
    return null;
  }

  Object.assign(entry, updates);
  return entry;
}

async function deleteVehicleMaintenanceById(entryId) {
  if (storageMode === "supabase") {
    const { error } = await supabase.from("vehicle_maintenance").delete().eq("id", entryId);
    if (error) {
      throw error;
    }
    return true;
  }

  const before = localVehicleMaintenance.length;
  localVehicleMaintenance = localVehicleMaintenance.filter((entry) => !isSameEntityId(entry.id, entryId));
  return localVehicleMaintenance.length !== before;
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

// allowedRoles restringe quais contas podem ser atingidas: um gestor com
// permissao de cadastros so alcanca "employee" (motoristas); o admin real
// tambem alcanca "manager" (pra editar nome/senha/permissoes de um gestor).
async function updateEmployeeUser(userId, updates, allowedRoles = ["employee"]) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("users")
        .update(updates)
        .eq("id", userId)
        .in("role", allowedRoles)
        .select("*")
        .maybeSingle()
    );
  }

  const user = localUsers.find((item) => isSameEntityId(item.id, userId) && allowedRoles.includes(item.role));
  if (!user) {
    return null;
  }

  Object.assign(user, updates);
  return user;
}

async function updateEmployeePassword(userId, passwordHash, allowedRoles = ["employee"]) {
  return updateEmployeeUser(userId, { password_hash: passwordHash }, allowedRoles);
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

// So chamado quando o admin real pede explicitamente pra apagar o
// historico junto com o funcionario (acao irreversivel).
async function deleteRecordsAndTransfersForUser(userId) {
  if (storageMode === "supabase") {
    await runQuery(supabase.from("time_records").delete().eq("user_id", userId));
    await runQuery(supabase.from("vehicle_transfers").delete().eq("user_id", userId));
    return;
  }

  localRecords = localRecords.filter((record) => record.user_id !== userId);
  localVehicleTransfers = localVehicleTransfers.filter((transfer) => transfer.user_id !== userId);
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

async function deleteEmployeeUser(userId, allowedRoles = ["employee"]) {
  if (storageMode === "supabase") {
    const { error } = await supabase.from("users").delete().eq("id", userId).in("role", allowedRoles);
    if (error) {
      throw error;
    }
    return true;
  }

  const before = localUsers.length;
  localUsers = localUsers.filter((user) => !(isSameEntityId(user.id, userId) && allowedRoles.includes(user.role)));
  return localUsers.length !== before;
}

// showAll por padrao segue a permissao do usuario (admin, ou gestor com
// "registros"). Um gestor que tem essa permissao mas esta na tela de "Meu
// ponto" passa showAll=false explicitamente, pra ver so a propria jornada em
// vez da empresa toda misturada no cartao de ponto pessoal dele.
async function listRecordsForUser(user, filters = null, showAll = null) {
  const includeAll = showAll === null ? canManageAllRecords(user) : showAll;

  if (storageMode === "supabase") {
    if (includeAll) {
      const rows = await listSupabaseRows(() => (
        supabase.from("time_records").select("*").order("recorded_at", { ascending: false })
      ));
      return filters ? applyRecordFilters(rows, filters) : rows;
    }

    return listSupabaseRows(() => (
      supabase.from("time_records").select("*").eq("user_id", user.id).order("recorded_at", { ascending: false })
    ));
  }

  if (includeAll) {
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
  localVehicleMaintenance = [];
  localUserSequence = 1;
  localRecordSequence = 1;
  localVehicleSequence = 1;
  localVehicleTransferSequence = 1;
  localRouteSequence = 1;
  localRouteStopSequence = 1;
  localVehicleMaintenanceSequence = 1;
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
  const { name, employeeId, password, phone, dailyWorkloadHours } = req.body;

  if (!name || !employeeId || !password) {
    return res.status(400).json({ error: "Nome, matricula e senha sao obrigatorios." });
  }

  const cleanEmployeeId = String(employeeId).trim();
  const existingUser = await getUserByEmployeeId(cleanEmployeeId);
  if (existingUser) {
    return res.status(409).json({ error: "Ja existe um usuario com essa matricula." });
  }

  const workload = normalizeDailyWorkloadMinutes(dailyWorkloadHours);
  if (workload.error) {
    return res.status(400).json({ error: workload.error });
  }

  // So o admin real pode criar um login de gestor (com permissoes de
  // painel). Um gestor com acesso a Cadastros sempre cria um funcionario
  // comum aqui, mesmo que tente mandar role/permissions no corpo.
  let role = "employee";
  let permissions = [];
  if (req.authUser.role === "admin" && String(req.body.role || "") === "manager") {
    role = "manager";
    permissions = normalizePermissionsList(req.body.permissions);
  }

  const normalizedPhone = normalizePhoneNumber(phone) || null;
  const passwordHash = bcrypt.hashSync(password, 10);
  // Funcionario administrativo (nao dirige) bate o ponto sem escolher
  // veiculo/KM; motorista continua exigindo por padrao.
  const requiresVehicle = req.body.requiresVehicle === undefined ? true : Boolean(req.body.requiresVehicle);
  const user = await insertEmployeeUser(name, cleanEmployeeId, passwordHash, role, permissions, normalizedPhone, workload.minutes, requiresVehicle);
  return res.status(201).json({ user: serializeUser(user) });
}

// allowedRoles restringe quem pode ser "alcancado": um gestor so gerencia
// funcionarios comuns; o admin real tambem gerencia outros gestores.
async function requireManagedEmployee(employeeId, allowedRoles = ["employee"]) {
  const employee = await getUserById(employeeId);
  if (!employee || !allowedRoles.includes(employee.role)) {
    return null;
  }

  return employee;
}

app.post("/api/auth/register", requireAdmin, asyncRoute(createEmployeeFromRequest));

app.post("/api/admin/employees", requireAdminSection("cadastros"), asyncRoute(createEmployeeFromRequest));

app.get("/api/vehicles", requireAuth, asyncRoute(async (_req, res) => {
  const vehicles = await listVehicles();
  if (!isPunchClockUser(_req.authUser)) {
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

app.post("/api/admin/vehicles", requireAdminSection("cadastros"), asyncRoute(async (req, res) => {
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

app.get("/api/admin/vehicles", requireAdminSection("cadastros"), asyncRoute(async (_req, res) => {
  const vehicles = await listVehicles();
  return res.json({ vehicles: vehicles.map(serializeVehicle) });
}));

app.patch("/api/admin/vehicles/:vehicleId", requireAdminSection("cadastros"), asyncRoute(async (req, res) => {
  const vehicle = await getVehicleById(req.params.vehicleId);
  if (!vehicle) {
    return res.status(404).json({ error: "Veiculo nao encontrado." });
  }

  const { plate, description, initialKm, currentKm } = req.body;
  if (!plate) {
    return res.status(400).json({ error: "Informe a placa do veiculo." });
  }

  const normalizedPlate = String(plate).trim().toUpperCase();
  const existingVehicle = await getVehicleByPlate(normalizedPlate);
  if (existingVehicle && String(existingVehicle.id) !== String(vehicle.id)) {
    return res.status(409).json({ error: "Ja existe outro veiculo com essa placa." });
  }

  if (initialKm === undefined || initialKm === null || Number.isNaN(Number(initialKm)) || Number(initialKm) < 0) {
    return res.status(400).json({ error: "Informe o KM inicial do veiculo." });
  }

  const updates = {
    plate: normalizedPlate,
    description: String(description || "").trim(),
    initial_km: Number(initialKm),
  };

  if (currentKm !== undefined && currentKm !== null && String(currentKm).trim() !== "") {
    const numericCurrentKm = Number(currentKm);
    if (Number.isNaN(numericCurrentKm) || numericCurrentKm < 0) {
      return res.status(400).json({ error: "KM atual invalido." });
    }
    updates.current_km = numericCurrentKm;
  }

  const updatedVehicle = await updateVehicleById(vehicle.id, updates);
  return res.json({ vehicle: serializeVehicle(updatedVehicle) });
}));

app.delete("/api/admin/vehicles/:vehicleId", requireAdminSection("cadastros"), asyncRoute(async (req, res) => {
  const vehicle = await getVehicleById(req.params.vehicleId);
  if (!vehicle) {
    return res.status(404).json({ error: "Veiculo nao encontrado." });
  }

  await deleteVehicle(vehicle.id);
  return res.json({ ok: true });
}));

// Aba "Frota" do admin: historico de manutencao por veiculo cadastrado.
// Secao propria (nao "cadastros") pra dar pra liberar so essa area pra um
// gestor responsavel pela frota, sem dar acesso a cadastro de funcionario.
// A lista de veiculos em si vem de GET /api/vehicles (ja liberado pra
// qualquer usuario logado), so o historico de manutencao fica atras da
// secao "frota".
app.get("/api/admin/frota/vehicles/:vehicleId/maintenance", requireAdminSection("frota"), asyncRoute(async (req, res) => {
  const vehicle = await getVehicleById(req.params.vehicleId);
  if (!vehicle) {
    return res.status(404).json({ error: "Veiculo nao encontrado." });
  }

  const entries = await listVehicleMaintenanceForVehicle(vehicle.id);
  return res.json({ vehicle: serializeVehicle(vehicle), entries: entries.map(serializeVehicleMaintenance) });
}));

// Visao geral: todo veiculo com manutencao pendente aparece aqui direto,
// sem precisar buscar por placa primeiro. So sai da lista quando o admin
// confirma no endpoint /complete abaixo.
app.get("/api/admin/frota/maintenance/pending", requireAdminSection("frota"), asyncRoute(async (req, res) => {
  const overview = await listPendingVehicleMaintenanceOverview();
  return res.json({
    entries: overview.map(({ entry, vehicle }) => ({
      ...serializeVehicleMaintenance(entry),
      vehiclePlate: vehicle?.plate || null,
      vehicleDescription: vehicle?.description || "",
    })),
  });
}));

// Cria sempre como pendencia ("a fazer") — so entra na lista de "ja feito"
// quando o admin confirma no endpoint /complete abaixo.
app.post("/api/admin/frota/vehicles/:vehicleId/maintenance", requireAdminSection("frota"), asyncRoute(async (req, res) => {
  const vehicle = await getVehicleById(req.params.vehicleId);
  if (!vehicle) {
    return res.status(404).json({ error: "Veiculo nao encontrado." });
  }

  const { description, km, dueAt } = req.body;
  const normalizedDescription = String(description || "").trim();
  if (!normalizedDescription) {
    return res.status(400).json({ error: "Descreva a manutencao a ser feita." });
  }

  const normalizedKm = km === undefined || km === null || String(km).trim() === "" ? null : Number(km);
  if (normalizedKm !== null && Number.isNaN(normalizedKm)) {
    return res.status(400).json({ error: "KM invalido." });
  }

  const normalizedDueAt = String(dueAt || "").trim() || null;

  const entry = await insertVehicleMaintenance({
    vehicle_id: vehicle.id,
    description: normalizedDescription,
    status: "pending",
    due_at: normalizedDueAt,
    performed_at: null,
    km: normalizedKm,
    cost: null,
  });

  return res.status(201).json({ entry: serializeVehicleMaintenance(entry) });
}));

// Admin "da o ok": move a pendencia para a lista de ja feito, preenchendo
// data/KM/custo reais do servico.
app.post("/api/admin/frota/maintenance/:entryId/complete", requireAdminSection("frota"), asyncRoute(async (req, res) => {
  const entry = await getVehicleMaintenanceById(req.params.entryId);
  if (!entry) {
    return res.status(404).json({ error: "Registro de manutencao nao encontrado." });
  }

  const { performedAt, km, cost } = req.body;

  const normalizedKm = km === undefined || km === null || String(km).trim() === "" ? entry.km ?? null : Number(km);
  if (normalizedKm !== null && Number.isNaN(normalizedKm)) {
    return res.status(400).json({ error: "KM invalido." });
  }

  const normalizedCost = cost === undefined || cost === null || String(cost).trim() === "" ? null : Number(cost);
  if (normalizedCost !== null && Number.isNaN(normalizedCost)) {
    return res.status(400).json({ error: "Custo invalido." });
  }

  const normalizedPerformedAt = String(performedAt || "").trim() || localDateFormatter.format(new Date());

  const updatedEntry = await updateVehicleMaintenanceById(entry.id, {
    status: "done",
    performed_at: normalizedPerformedAt,
    km: normalizedKm,
    cost: normalizedCost,
  });

  return res.json({ entry: serializeVehicleMaintenance(updatedEntry) });
}));

app.delete("/api/admin/frota/maintenance/:entryId", requireAdminSection("frota"), asyncRoute(async (req, res) => {
  const entry = await getVehicleMaintenanceById(req.params.entryId);
  if (!entry) {
    return res.status(404).json({ error: "Registro de manutencao nao encontrado." });
  }

  await deleteVehicleMaintenanceById(entry.id);
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

app.get("/api/admin/routes/cities", requireAdminSection("rotas"), asyncRoute(async (_req, res) => {
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

app.get("/api/admin/routes/drivers", requireAdminSection("rotas"), asyncRoute(async (_req, res) => {
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
app.get("/api/admin/routes", requireAdminSection("rotas"), asyncRoute(async (req, res) => {
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

app.get("/api/admin/routes/:routeId", requireAdminSection("rotas"), asyncRoute(async (req, res) => {
  const route = await getRouteById(req.params.routeId);
  if (!route) {
    return res.status(404).json({ error: "Rota nao encontrada." });
  }

  const stops = await listRouteStopsForRoute(route.id);
  return res.json({ route: serializeRoute(route, stops) });
}));

app.post("/api/admin/routes", requireAdminSection("rotas"), asyncRoute(async (req, res) => {
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
app.put("/api/admin/routes/:routeId", requireAdminSection("rotas"), asyncRoute(async (req, res) => {
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
app.put("/api/admin/routes/:routeId/stops/:stopId", requireAdminSection("rotas"), asyncRoute(async (req, res) => {
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

app.delete("/api/admin/routes/:routeId/stops/:stopId", requireAdminSection("rotas"), asyncRoute(async (req, res) => {
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

app.delete("/api/admin/routes/:routeId", requireAdminSection("rotas"), asyncRoute(async (req, res) => {
  const route = await getRouteById(req.params.routeId);
  if (!route) {
    return res.status(404).json({ error: "Rota nao encontrada." });
  }

  await deleteRoute(route.id);
  return res.json({ ok: true });
}));

app.get("/api/admin/employees", requireAdminSection("cadastros"), asyncRoute(async (req, res) => {
  const employees = await listEmployees(req.authUser.role === "admin");
  return res.json({ employees: employees.map(serializeManagedEmployee) });
}));

app.patch("/api/admin/employees/:employeeId", requireAdminSection("cadastros"), asyncRoute(async (req, res) => {
  const isRealAdmin = req.authUser.role === "admin";
  const allowedRoles = isRealAdmin ? ["employee", "manager"] : ["employee"];
  const employee = await requireManagedEmployee(req.params.employeeId, allowedRoles);
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

  const updates = {
    name: String(name).trim(),
    employee_id: cleanEmployeeId,
  };

  if (req.body.phone !== undefined) {
    updates.phone = normalizePhoneNumber(req.body.phone) || null;
  }

  if (req.body.dailyWorkloadHours !== undefined) {
    const workload = normalizeDailyWorkloadMinutes(req.body.dailyWorkloadHours);
    if (workload.error) {
      return res.status(400).json({ error: workload.error });
    }
    updates.daily_workload_minutes = workload.minutes;
  }

  // Trocar entre funcionario comum e gestor (e as permissoes que vem junto)
  // so pode ser feito pelo admin real, igual ao cadastro novo.
  if (isRealAdmin && req.body.role !== undefined) {
    const requestedRole = String(req.body.role) === "manager" ? "manager" : "employee";
    updates.role = requestedRole;
    updates.permissions = requestedRole === "manager" ? normalizePermissionsList(req.body.permissions) : [];
  } else if (isRealAdmin && employee.role === "manager" && req.body.permissions !== undefined) {
    updates.permissions = normalizePermissionsList(req.body.permissions);
  }

  if (req.body.requiresVehicle !== undefined) {
    updates.requires_vehicle = Boolean(req.body.requiresVehicle);
  }

  if (req.body.active !== undefined) {
    updates.active = Boolean(req.body.active);
  }

  const updatedEmployee = await updateEmployeeUser(employee.id, updates, allowedRoles);

  await syncRecordSnapshotForUser(employee.id, updatedEmployee);

  return res.json({ employee: serializeManagedEmployee(updatedEmployee) });
}));

app.post("/api/admin/employees/:employeeId/password", requireAdminSection("cadastros"), asyncRoute(async (req, res) => {
  const allowedRoles = req.authUser.role === "admin" ? ["employee", "manager"] : ["employee"];
  const employee = await requireManagedEmployee(req.params.employeeId, allowedRoles);
  if (!employee) {
    return res.status(404).json({ error: "Funcionario nao encontrado." });
  }

  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Informe a nova senha." });
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);
  const updatedEmployee = await updateEmployeePassword(employee.id, passwordHash, allowedRoles);
  return res.json({ employee: serializeManagedEmployee(updatedEmployee) });
}));

app.delete("/api/admin/employees/:employeeId", requireAdminSection("cadastros"), asyncRoute(async (req, res) => {
  const isRealAdmin = req.authUser.role === "admin";
  const allowedRoles = isRealAdmin ? ["employee", "manager"] : ["employee"];
  const employee = await requireManagedEmployee(req.params.employeeId, allowedRoles);
  if (!employee) {
    return res.status(404).json({ error: "Funcionario nao encontrado." });
  }

  // Apagar o historico junto e uma acao irreversivel (perde registros de
  // ponto e de troca de veiculo pra sempre), entao so o admin real pode
  // pedir isso, e precisa mandar o parametro explicitamente.
  const forceWipe = isRealAdmin && String(req.query.wipeRecords || "") === "true";

  const recordCount = await countRecordsForUser(employee.id);
  if (recordCount > 0 && !forceWipe) {
    return res.status(409).json({ error: "Funcionario possui registros e nao pode ser excluido." });
  }

  if (forceWipe && recordCount > 0) {
    await deleteRecordsAndTransfersForUser(employee.id);
  }

  await deleteEmployeeUser(employee.id, allowedRoles);
  return res.json({ ok: true });
}));

app.patch("/api/admin/records/:recordId", requireAdminSection("registros"), asyncRoute(async (req, res) => {
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

app.delete("/api/admin/records/:recordId", requireAdminSection("registros"), asyncRoute(async (req, res) => {
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

  if (user.active === false) {
    return res.status(403).json({ error: "Funcionario inativo. Contate o administrador." });
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
  // Admin sempre ve a empresa toda (comportamento historico, sem precisar de
  // nenhum parametro). Gestor so ve todo mundo quando ?scope=all e mandado
  // (a aba admin de Registros manda) - sem isso ele ve so a propria jornada
  // (usado no cartao de "Meu ponto"), senao os dois modos se misturariam.
  const user = req.authUser;
  const wantsAll = user.role === "admin" || (req.query.scope === "all" && canManageAllRecords(user));
  const filters = wantsAll ? normalizeAdminFilters(req.query) : null;
  const rows = await listRecordsForUser(user, filters, wantsAll);
  return res.json({ records: rows });
}));

app.get("/api/me/vehicle-context", requireAuth, asyncRoute(async (req, res) => {
  if (!isPunchClockUser(req.authUser)) {
    return res.json({ context: serializeVehicleContext(null) });
  }

  const context = await buildVehicleContextForUser(req.authUser.id);
  return res.json({ context: serializeVehicleContext(context) });
}));

// Busca de enderecos somente-leitura para qualquer funcionario logado (nao
// exige a permissao de admin da secao "rotas") — usada na tela do motorista
// para achar o endereco de uma cidade e abrir no Google Maps.
app.get("/api/me/routes", requireAuth, asyncRoute(async (req, res) => {
  const city = String(req.query.city || "").trim();
  if (!city) {
    return res.json({ city: "", stops: [] });
  }

  const cityKey = normalizeCityKey(city);
  const [allRoutes, allStops] = await Promise.all([listAllRoutes(), listAllRouteStops()]);
  const routeById = new Map(allRoutes.map((route) => [String(route.id), route]));
  const matchingStops = allStops
    .filter((stop) => normalizeCityKey(stop.city) === cityKey)
    .map((stop) => serializeRouteStop(stop, routeById.get(String(stop.route_id))))
    .sort((left, right) => String(left.routeName || "").localeCompare(String(right.routeName || ""), "pt-BR"));

  return res.json({ city, stops: matchingStops });
}));

const EMPLOYEE_WEEK_SUMMARY_DAYS = 7;

app.get("/api/me/summary", requireAuth, asyncRoute(async (req, res) => {
  if (!isPunchClockUser(req.authUser)) {
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
  const workloadOverridesById = await buildWorkloadOverridesMap();

  // Reaproveita o mesmo calculo de horas/carga horaria do resumo do admin
  // para os numeros nunca divergirem entre a tela do funcionario e a do admin.
  const { employees } = aggregateSummaryByEmployee(computeSummary(records, transfers, workloadOverridesById));
  const own = employees[0] || { daysWorked: 0, workedHours: "00:00", overtimeHours: "00:00" };

  return res.json({
    daysWorked: own.daysWorked,
    workedHours: own.workedHours,
    overtimeHours: own.overtimeHours,
    windowDays: EMPLOYEE_WEEK_SUMMARY_DAYS,
    dailyWorkloadMinutes: getDailyWorkloadMinutes(req.authUser.employeeId, workloadOverridesById),
  });
}));

// Logica central de bater ponto, isolada da rota HTTP pra poder ser
// reaproveitada pelo bot de WhatsApp (lib/whatsapp-bot.js) sem duplicar
// nenhuma regra de negocio (sequencia de acoes, conflito de veiculo, etc.).
// Devolve { status, body } no formato pronto pra virar resposta HTTP, mas
// quem chama nao precisa estar dentro de uma rota Express.
async function createPunchRecord(user, payload) {
  const { action, latitude, longitude, locationLabel, recordedAt, localDate, localTime, vehiclePlate, vehicleKm, clientRequestId, photo } = payload;
  const allowedActions = TIME_RECORD_ACTIONS;

  if (!allowedActions.includes(action)) {
    return { status: 400, body: { error: "Acao de ponto invalida." } };
  }

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return { status: 400, body: { error: "Ative a localizacao para registrar o ponto." } };
  }

  // Foto e opcional aqui porque o bot de WhatsApp usa este mesmo caminho e
  // nao tem como capturar camera; quem exige a foto e a tela web/app.
  let normalizedPhoto = null;
  if (photo !== undefined && photo !== null) {
    if (typeof photo !== "string" || !photo.startsWith("data:image/") || photo.length > 2_000_000) {
      return { status: 400, body: { error: "Foto invalida. Tire a foto novamente." } };
    }
    normalizedPhoto = photo;
  }

  const normalizedClientRequestId = String(clientRequestId || "").trim() || null;
  if (normalizedClientRequestId) {
    const existingRecord = await findRecordByClientRequestId(normalizedClientRequestId);
    if (existingRecord) {
      return { status: 200, body: { record: existingRecord } };
    }
  }

  const timestamp = recordedAt || new Date().toISOString();
  const date = localDate || localDateFormatter.format(new Date(timestamp));
  const time = localTime || localTimeFormatter.format(new Date(timestamp));
  const userRecords = await listUserRecordsAscending(user.id);
  const sequenceError = validateRecordSequence(userRecords, action, timestamp);

  if (sequenceError) {
    return { status: 409, body: { error: sequenceError } };
  }

  // Funcionario administrativo (requiresVehicle=false) bate o ponto sem
  // veiculo — pula toda a validacao/conflito de veiculo abaixo.
  let normalizedVehiclePlate = null;
  let numericVehicleKm = null;
  let registeredVehicle = null;

  if (user.requiresVehicle !== false) {
    const vehicleContext = await buildVehicleContextForUser(user.id);
    normalizedVehiclePlate = String(vehiclePlate || "").trim().toUpperCase();
    numericVehicleKm =
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
      return { status: 400, body: { error: "Informe a placa e o KM do veiculo." } };
    }

    registeredVehicle = await getVehicleByPlate(normalizedVehiclePlate);
    const activeAssignments = await listActiveVehicleAssignments();
    const usageMap = buildVehicleUsageMap(activeAssignments);

    if (!registeredVehicle) {
      return { status: 409, body: { error: "Selecione um veiculo cadastrado." } };
    }

    if (vehicleContext.activeJourney && vehicleContext.currentVehicle?.plate) {
      if (normalizedVehiclePlate !== vehicleContext.currentVehicle.plate) {
        return {
          status: 409,
          body: { error: `Este funcionario esta com o veiculo ${vehicleContext.currentVehicle.plate} em uso. Use o botao Trocar veiculo para mudar.` },
        };
      }
    } else {
      const vehicleConflict = getVehicleUsageConflict(usageMap, normalizedVehiclePlate, user.id);
      if (vehicleConflict) {
        return {
          status: 409,
          body: { error: `O veiculo ${normalizedVehiclePlate} ja esta em uso por ${vehicleConflict.employeeName} (${vehicleConflict.employeeId}).` },
        };
      }
    }

    if (registeredVehicle && numericVehicleKm < Number(registeredVehicle.current_km ?? 0)) {
      return {
        status: 409,
        body: { error: `O KM informado nao pode ser menor que o KM atual do veiculo (${registeredVehicle.current_km}).` },
      };
    }
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
    photo_data: normalizedPhoto,
  });

  if (registeredVehicle) {
    await updateVehicleCurrentKm(registeredVehicle.id, numericVehicleKm);
  }

  return { status: 201, body: { record } };
}

app.post("/api/me/records", requireAuth, asyncRoute(async (req, res) => {
  const user = req.authUser;
  if (!isPunchClockUser(user)) {
    return res.status(403).json({ error: "Somente funcionarios registram ponto." });
  }

  const result = await createPunchRecord(user, req.body);
  return res.status(result.status).json(result.body);
}));

app.post("/api/me/vehicle-transfers", requireAuth, asyncRoute(async (req, res) => {
  const user = req.authUser;
  if (!isPunchClockUser(user)) {
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

// So o admin real ve isso — expor o QR de pareamento do bot pra um gestor
// seria dar acesso pra "roubar" a sessao de WhatsApp da empresa.
app.get("/api/admin/whatsapp/status", requireAdmin, asyncRoute(async (_req, res) => {
  const state = getWhatsAppConnectionState();
  if (state.status === "qr" && state.qr) {
    const qrDataUrl = await QRCode.toDataURL(state.qr, { width: 320, margin: 1 });
    return res.json({ status: state.status, qrDataUrl });
  }
  return res.json({ status: state.status, qrDataUrl: null });
}));

app.get("/api/admin/summary", requireAdminSection("overview"), asyncRoute(async (_req, res) => {
  const filters = normalizeAdminFilters(_req.query);
  const baseFilters = filters.vehiclePlate ? getFiltersWithoutVehicle(filters) : filters;
  const rows = await listAllRecordsAscending(baseFilters);
  const transfers = await listAllVehicleTransfersAscending(baseFilters, { includeVehicle: false });
  const workloadOverridesById = await buildWorkloadOverridesMap();
  const shouldUseRecentWindow = !filters.dateFrom && !filters.dateTo;
  // Calculamos com o historico completo (sem cortar por horario) para nao
  // perder a Entrada de turnos que comecam antes da janela das 48h, como
  // turnos que atravessam a madrugada. O filtro de recencia e aplicado
  // depois, em cima do resumo ja fechado de cada turno.
  const computedSummary = computeSummary(rows, transfers, workloadOverridesById);
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

app.get("/api/admin/alerts", requireAdminSection("overview"), asyncRoute(async (req, res) => {
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

app.get("/api/admin/export.csv", requireAdminSection("registros"), asyncRoute(async (req, res) => {
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

app.get("/api/admin/export.xlsx", requireAdminSection("registros"), asyncRoute(async (req, res) => {
  const filters = normalizeAdminFilters(req.query);
  const baseFilters = filters.vehiclePlate ? getFiltersWithoutVehicle(filters) : filters;
  const rows = await listAllRecordsAscending(baseFilters);
  const transfers = await listAllVehicleTransfersAscending(baseFilters, { includeVehicle: false });
  const workloadOverridesById = await buildWorkloadOverridesMap();

  const workbook = createWorkbook(rows, transfers, workloadOverridesById);
  await sendWorkbookResponse(res, workbook, filters);
}));

app.post("/api/admin/export.xlsx/link", requireAdminSection("registros"), asyncRoute(async (req, res) => {
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
  const workloadOverridesById = await buildWorkloadOverridesMap();
  const workbook = createWorkbook(rows, transfers, workloadOverridesById);
  await sendWorkbookResponse(res, workbook, filters);
}));

// Assistente de chat (Claude). So ferramentas de LEITURA - o chat nunca bate
// ponto, edita registro nem cadastra/exclui nada; isso continua so pelas
// telas normais. Cada ferramenta e liberada de acordo com o papel/permissao
// de quem esta conversando, igual as rotas HTTP equivalentes.
function buildChatTools(user) {
  const tools = [];

  if (isPunchClockUser(user)) {
    tools.push({
      name: "get_my_week_summary",
      description: "Devolve o resumo dos ultimos 7 dias do proprio funcionario que esta conversando: dias trabalhados, horas trabalhadas, horas extras e a carga horaria diaria dele. Use para perguntas como 'quantas horas trabalhei essa semana' ou 'tenho hora extra hoje'.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    });
    tools.push({
      name: "get_my_recent_records",
      description: "Lista os registros de ponto mais recentes do proprio funcionario (data, hora, tipo da batida e veiculo), do mais novo para o mais antigo. Use para perguntas como 'quando eu bati ponto hoje' ou 'qual foi meu ultimo registro'.",
      input_schema: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Quantidade de registros a devolver (padrao 10, maximo 30).", minimum: 1, maximum: 30 },
        },
        additionalProperties: false,
      },
    });
  }

  if (canAccessSection(user, "overview")) {
    tools.push({
      name: "get_company_hours_summary",
      description: "Resumo agregado de horas, horas extras e KM da empresa (ultimas 48h, mesma janela padrao do painel admin). Pode filtrar por matricula de um funcionario especifico. Use para perguntas administrativas como 'quantas horas extras a empresa teve' ou 'quantas horas o funcionario X fez'.",
      input_schema: {
        type: "object",
        properties: {
          employeeId: { type: "string", description: "Matricula do funcionario para filtrar (opcional; sem isso devolve a empresa toda)." },
        },
        additionalProperties: false,
      },
    });
    tools.push({
      name: "get_pending_alerts",
      description: "Lista as pendencias atuais detectadas pelo sistema (jornada aberta, almoco sem retorno, jornada longa, sem intervalo, sequencia inconsistente, funcionario sem bater ponto). Use para perguntas como 'tem alguma pendencia' ou 'algum funcionario esqueceu de bater ponto'.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    });
  }

  if (canAccessSection(user, "rotas")) {
    tools.push({
      name: "search_routes_by_city",
      description: "Busca todos os enderecos de entrega/coleta cadastrados numa cidade, juntando as rotas que tiverem parada la. Use para perguntas como 'quais rotas tem em Blumenau' ou 'tem entrega em Jaragua do Sul'.",
      input_schema: {
        type: "object",
        properties: {
          city: { type: "string", description: "Nome da cidade a buscar." },
        },
        required: ["city"],
        additionalProperties: false,
      },
    });
  }

  return tools;
}

async function executeChatTool(name, input, user) {
  if (name === "get_my_week_summary" && isPunchClockUser(user)) {
    const todayStart = parseLocalDate(localDateFormatter.format(new Date()));
    const fromDate = new Date(todayStart.getTime() - (EMPLOYEE_WEEK_SUMMARY_DAYS - 1) * 24 * 60 * 60 * 1000);
    const isWithinWeek = (row) => {
      const rowDate = parseLocalDate(row.local_date) || new Date(row.recorded_at);
      return rowDate.getTime() >= fromDate.getTime() && rowDate.getTime() <= todayStart.getTime();
    };
    const records = (await listUserRecordsAscending(user.id)).filter(isWithinWeek);
    const transfers = (await listUserVehicleTransfersAscending(user.id)).filter(isWithinWeek);
    const workloadOverridesById = await buildWorkloadOverridesMap();
    const { employees } = aggregateSummaryByEmployee(computeSummary(records, transfers, workloadOverridesById));
    const own = employees[0] || { daysWorked: 0, workedHours: "00:00", overtimeHours: "00:00" };
    return {
      daysWorked: own.daysWorked,
      workedHours: own.workedHours,
      overtimeHours: own.overtimeHours,
      windowDays: EMPLOYEE_WEEK_SUMMARY_DAYS,
      dailyWorkloadMinutes: getDailyWorkloadMinutes(user.employeeId, workloadOverridesById),
    };
  }

  if (name === "get_my_recent_records" && isPunchClockUser(user)) {
    const limit = Math.min(Math.max(Number(input?.limit) || 10, 1), 30);
    const records = await listRecordsForUser(user, null, false);
    return {
      records: records.slice(0, limit).map((record) => ({
        date: record.local_date,
        time: record.local_time,
        action: record.action,
        vehiclePlate: record.vehicle_plate || null,
      })),
    };
  }

  if (name === "get_company_hours_summary" && canAccessSection(user, "overview")) {
    const filters = normalizeAdminFilters({ employeeId: input?.employeeId || "" });
    const rows = await listAllRecordsAscending(filters);
    const transfers = await listAllVehicleTransfersAscending(filters, { includeVehicle: false });
    const workloadOverridesById = await buildWorkloadOverridesMap();
    const computedSummary = computeSummary(rows, transfers, workloadOverridesById);
    const recentSummary = filterSummaryWithinLastHours(computedSummary, 48);
    const { employees: aggregates, company: companyTotals } = aggregateSummaryByEmployee(recentSummary);
    return { windowHours: 48, aggregates, companyTotals };
  }

  if (name === "get_pending_alerts" && canAccessSection(user, "overview")) {
    const records = await listAllRecordsAscending();
    const transfers = await listAllVehicleTransfersAscending(null, { includeVehicle: false });
    const employees = (await listEmployees()).map(serializeManagedEmployee);
    const alerts = detectPendingAlerts({ records, transfers, employees, now: Date.now() });
    return { counts: summarizeAlerts(alerts), alerts: alerts.slice(0, 20) };
  }

  if (name === "search_routes_by_city" && canAccessSection(user, "rotas")) {
    const city = String(input?.city || "").trim();
    if (!city) {
      return { error: "Informe a cidade a buscar." };
    }
    const cityKey = normalizeCityKey(city);
    const [allRoutes, allStops] = await Promise.all([listAllRoutes(), listAllRouteStops()]);
    const routeById = new Map(allRoutes.map((route) => [String(route.id), route]));
    const stops = allStops
      .filter((stop) => normalizeCityKey(stop.city) === cityKey)
      .map((stop) => serializeRouteStop(stop, routeById.get(String(stop.route_id))));
    return { city, stopCount: stops.length, stops: stops.slice(0, 25) };
  }

  return { error: "Ferramenta indisponivel ou sem permissao para este usuario." };
}

function buildChatSystemPrompt(user) {
  const role = user.role === "admin" ? "administrador" : user.role === "manager" ? "gestor" : "funcionario";
  return [
    `Voce e o assistente do app "Banco de Horas LC / Cartao de Ponto LC Transporte", conversando com ${user.name} (${role}).`,
    "Responda em portugues do Brasil, de forma direta e curta.",
    "Use as ferramentas disponiveis para consultar dados reais antes de responder sobre horas, registros, pendencias ou rotas - nunca invente numeros ou enderecos.",
    "Voce so consegue LER dados. Nao pode bater ponto, editar registros, cadastrar ou excluir nada; se pedirem isso, oriente a pessoa a usar as telas normais do app.",
    "Se uma ferramenta relevante nao estiver disponivel para este usuario, explique que ele nao tem permissao para aquela informacao.",
  ].join(" ");
}

async function runChatConversation(user, priorMessages, userMessage) {
  const client = getAnthropicClient();
  if (!client) {
    throw new Error("Chat indisponivel: ANTHROPIC_API_KEY nao configurada no servidor.");
  }

  const tools = buildChatTools(user);
  const messages = [
    ...priorMessages.map((entry) => ({ role: entry.role, content: entry.text })),
    { role: "user", content: userMessage },
  ];

  for (let turn = 0; turn < CHAT_MAX_TURNS; turn += 1) {
    const response = await client.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: buildChatSystemPrompt(user),
      tools: tools.length ? tools : undefined,
      output_config: { effort: "low" },
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const reply = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return reply || "Nao consegui gerar uma resposta agora. Tente reformular a pergunta.";
    }

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") {
        continue;
      }
      let result;
      try {
        result = await executeChatTool(block.name, block.input, user);
      } catch (error) {
        result = { error: error.message || "Falha ao executar a ferramenta." };
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return "Essa pergunta precisou de muitas consultas e eu nao terminei a tempo. Pode tentar de forma mais especifica?";
}

app.post("/api/chat", requireAuth, asyncRoute(async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) {
    return res.status(400).json({ error: "Mensagem vazia." });
  }

  const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
  const history = rawHistory
    .filter((entry) => entry && (entry.role === "user" || entry.role === "assistant") && typeof entry.text === "string" && entry.text.trim())
    .slice(-20)
    .map((entry) => ({ role: entry.role, text: entry.text.trim() }));

  let reply;
  try {
    reply = await runChatConversation(req.authUser, history, message);
  } catch (error) {
    return res.status(503).json({ error: error.message || "Chat indisponivel no momento." });
  }

  return res.json({ reply });
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

  // Opt-in: so tenta ligar o bot de WhatsApp se WHATSAPP_ENABLED=true no
  // .env, pra dev/teste local nunca tentar abrir uma conexao/QR code por
  // padrao. Falha do bot nao derruba o servidor HTTP.
  if (String(process.env.WHATSAPP_ENABLED || "").trim() === "true") {
    startWhatsAppBot({
      createPunchRecord,
      getUserByPhone,
      buildVehicleContextForUser,
      canReuseCurrentVehicleForAction,
    }).catch((error) => {
      console.error("Falha ao iniciar o bot de WhatsApp:", error.message);
    });
  }

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
