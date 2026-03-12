require("dotenv").config();

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { computeSummary, createWorkbook } = require("./lib/timecard-workbook");

const LEGACY_ADMIN_NAME = "Lc tranporte";
const SESSION_SECRET = process.env.SESSION_SECRET || "timecard-professional-secret";
const PORT = Number(process.env.PORT || 3000);
const AUTH_COOKIE_NAME = "lc_transportes_auth";
const AUTH_DURATION_MS = 1000 * 60 * 60 * 12;

const app = express();
let storageMode = "local";
let supabase = null;
let localUsers = [];
let localRecords = [];
let localVehicles = [];
let localUserSequence = 1;
let localRecordSequence = 1;
let localVehicleSequence = 1;
let initializationPromise = null;

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

function allowLocalStorageFallback() {
  if (process.env.ALLOW_LOCAL_STORAGE_FALLBACK === undefined) {
    return process.env.NODE_ENV !== "production";
  }

  return process.env.ALLOW_LOCAL_STORAGE_FALLBACK === "true";
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

function createAuthCookieValue(user) {
  const payload = {
    user,
    exp: Date.now() + AUTH_DURATION_MS,
  };
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
    if (!payload?.user || !payload?.exp || payload.exp < Date.now()) {
      return null;
    }
    return payload.user;
  } catch (_error) {
    return null;
  }
}

function setAuthCookie(res, user) {
  res.cookie(AUTH_COOKIE_NAME, createAuthCookieValue(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: AUTH_DURATION_MS,
    path: "/",
  });
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
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
      const shouldUpdatePassword = !bcrypt.compareSync(adminConfig.password, adminUser.password_hash);
      const shouldUpdateName = adminUser.name !== adminConfig.name || adminUser.employee_id !== adminConfig.name;

      if (shouldUpdatePassword || shouldUpdateName) {
        await runQuery(
          supabase
            .from("users")
            .update({
              name: adminConfig.name,
              employee_id: adminConfig.name,
              password_hash: passwordHash,
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
            password_hash: passwordHash,
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
    adminUser.password_hash = passwordHash;
    return;
  }

  const legacyAdmin = localUsers.find((user) => user.employee_id === LEGACY_ADMIN_NAME && user.role === "admin");
  if (legacyAdmin) {
    legacyAdmin.name = adminConfig.name;
    legacyAdmin.employee_id = adminConfig.name;
    legacyAdmin.password_hash = passwordHash;
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
      await runQuery(supabase.from("users").select("id").limit(1));
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
  if (storageMode === "supabase") {
    return runQuery(
      supabase.from("users").select("*").eq("employee_id", String(employeeId).trim()).maybeSingle()
    );
  }

  return localUsers.find((user) => user.employee_id === String(employeeId).trim()) || null;
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
    return;
  }

  localRecords = localRecords.map((record) => (
    record.user_id === userId
      ? { ...record, ...updates }
      : record
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
      const rows = await runQuery(supabase.from("time_records").select("*").order("recorded_at", { ascending: false }));
      return filters ? applyRecordFilters(rows, filters) : rows;
    }

    return runQuery(
      supabase.from("time_records").select("*").eq("user_id", user.id).order("recorded_at", { ascending: false })
    );
  }

  if (user.role === "admin") {
    const rows = [...localRecords].sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
    return filters ? applyRecordFilters(rows, filters) : rows;
  }

  return localRecords
    .filter((record) => record.user_id === user.id)
    .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
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

async function listAllRecordsAscending(filters = null) {
  if (storageMode === "supabase") {
    const rows = await runQuery(supabase.from("time_records").select("*").order("recorded_at", { ascending: true }));
    return filters ? applyRecordFilters(rows, filters) : rows;
  }

  const rows = [...localRecords].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
  return filters ? applyRecordFilters(rows, filters) : rows;
}

async function listUserRecordsAscending(userId) {
  if (storageMode === "supabase") {
    return runQuery(
      supabase
        .from("time_records")
        .select("*")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: true })
    );
  }

  return localRecords
    .filter((record) => record.user_id === userId)
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
}

function getOpenJourneyRecords(records) {
  const lastExitIndex = [...records].map((record) => record.action).lastIndexOf("Saida");
  return lastExitIndex === -1 ? records : records.slice(lastExitIndex + 1);
}

function getAllowedNextActions(records) {
  if (!records.length) {
    return ["Entrada"];
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
  localUserSequence = 1;
  localRecordSequence = 1;
  localVehicleSequence = 1;
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
  return res.json({ vehicles: vehicles.map(serializeVehicle) });
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

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const { employeeId, password } = req.body;

  if (!employeeId || !password) {
    return res.status(400).json({ error: "Informe usuario e senha." });
  }

  const user = await getUserByEmployeeId(employeeId);
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
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

app.post("/api/me/records", requireAuth, asyncRoute(async (req, res) => {
  const user = req.authUser;
  if (user.role !== "employee") {
    return res.status(403).json({ error: "Somente funcionarios registram ponto." });
  }

  const { action, latitude, longitude, locationLabel, recordedAt, localDate, localTime, vehiclePlate, vehicleKm } = req.body;
  const allowedActions = ["Entrada", "Saida para almoco", "Retorno do almoco", "Saida"];

  if (!allowedActions.includes(action)) {
    return res.status(400).json({ error: "Acao de ponto invalida." });
  }

  if (!vehiclePlate || vehicleKm === undefined || vehicleKm === null || Number.isNaN(Number(vehicleKm))) {
    return res.status(400).json({ error: "Informe a placa e o KM do veiculo." });
  }

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return res.status(400).json({ error: "Ative a localizacao para registrar o ponto." });
  }

  const normalizedVehiclePlate = String(vehiclePlate).trim().toUpperCase();
  const numericVehicleKm = Number(vehicleKm);
  const registeredVehicle = await getVehicleByPlate(normalizedVehiclePlate);

  if (!registeredVehicle) {
    return res.status(409).json({ error: "Selecione um veiculo cadastrado." });
  }

  if (registeredVehicle && numericVehicleKm < Number(registeredVehicle.current_km ?? 0)) {
    return res.status(409).json({
      error: `O KM informado nao pode ser menor que o KM atual do veiculo (${registeredVehicle.current_km}).`,
    });
  }

  const timestamp = recordedAt || new Date().toISOString();
  const date = localDate || new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(timestamp));
  const time = localTime || new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" }).format(new Date(timestamp));
  const userRecords = await listUserRecordsAscending(user.id);
  const sequenceError = validateRecordSequence(userRecords, action, timestamp);

  if (sequenceError) {
    return res.status(409).json({ error: sequenceError });
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
  });

  if (registeredVehicle) {
    await updateVehicleCurrentKm(registeredVehicle.id, numericVehicleKm);
  }

  return res.status(201).json({ record });
}));

app.get("/api/admin/summary", requireAdmin, asyncRoute(async (_req, res) => {
  const filters = normalizeAdminFilters(_req.query);
  const rows = await listAllRecordsAscending(filters);
  const summary = computeSummary(rows).map((item) => ({
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
  return res.json({
    summary,
    filters: {
      employeeId: filters.employeeId,
      vehiclePlate: filters.vehiclePlate,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    },
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
  const rows = await listAllRecordsAscending(filters);

  const workbook = createWorkbook(rows);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("X-Export-Filters", buildFilterQueryString(filters));
  res.setHeader("Content-Disposition", `attachment; filename="planilha-cartao-ponto-lc-transportes-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
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
  app.listen(PORT, () => {
    console.log(`Servidor iniciado em http://localhost:${PORT} usando modo ${storageMode}`);
  });
}

app.__testing = {
  resetInMemoryState,
  validateRecordSequence,
  getAllowedNextActions,
  normalizeAdminFilters,
  applyRecordFilters,
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
