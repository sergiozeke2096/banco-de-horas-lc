require("dotenv").config();

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { computeSummary, createWorkbook } = require("./lib/timecard-workbook");

const ADMIN_NAME = "Lc transporte";
const LEGACY_ADMIN_NAME = "Lc tranporte";
const ADMIN_PASSWORD = "2096";
const SESSION_SECRET = process.env.SESSION_SECRET || "timecard-professional-secret";
const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH_COOKIE_NAME = "lc_transportes_auth";
const AUTH_DURATION_MS = 1000 * 60 * 60 * 12;

const app = express();
let storageMode = "local";
let supabase = null;
let localUsers = [];
let localRecords = [];
let localUserSequence = 1;
let localRecordSequence = 1;
let initializationPromise = null;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    employeeId: user.employee_id,
    role: user.role,
  };
}

function requireAuth(req, res, next) {
  if (!req.authUser) {
    return res.status(401).json({ error: "Autenticacao obrigatoria." });
  }
  return next();
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

function createMapsUrl(record) {
  if (typeof record.latitude !== "number" || typeof record.longitude !== "number") {
    return "";
  }

  return `https://www.google.com/maps/search/?api=1&query=${record.latitude},${record.longitude}`;
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

async function ensureAdminUser() {
  const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

  if (storageMode === "supabase") {
    const admin = await runQuery(
      supabase
        .from("users")
        .select("id, name, employee_id, password_hash")
        .eq("employee_id", ADMIN_NAME)
        .eq("role", "admin")
        .maybeSingle()
    );

    if (admin) {
      const shouldUpdatePassword = !bcrypt.compareSync(ADMIN_PASSWORD, admin.password_hash);
      const shouldUpdateName = admin.name !== ADMIN_NAME || admin.employee_id !== ADMIN_NAME;

      if (shouldUpdatePassword || shouldUpdateName) {
        await runQuery(
          supabase
            .from("users")
            .update({
              name: ADMIN_NAME,
              employee_id: ADMIN_NAME,
              password_hash: passwordHash,
            })
            .eq("id", admin.id)
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
            name: ADMIN_NAME,
            employee_id: ADMIN_NAME,
            password_hash: passwordHash,
          })
          .eq("id", legacyAdmin.id)
      );
      return;
    }

    await runQuery(
      supabase.from("users").insert({
        name: ADMIN_NAME,
        employee_id: ADMIN_NAME,
        password_hash: passwordHash,
        role: "admin",
      })
    );
    return;
  }

  const admin = localUsers.find((user) => user.employee_id === ADMIN_NAME && user.role === "admin");
  if (admin) {
    admin.name = ADMIN_NAME;
    admin.employee_id = ADMIN_NAME;
    admin.password_hash = passwordHash;
    return;
  }

  const legacyAdmin = localUsers.find((user) => user.employee_id === LEGACY_ADMIN_NAME && user.role === "admin");
  if (legacyAdmin) {
    legacyAdmin.name = ADMIN_NAME;
    legacyAdmin.employee_id = ADMIN_NAME;
    legacyAdmin.password_hash = passwordHash;
    return;
  }

  localUsers.push({
    id: localUserSequence++,
    name: ADMIN_NAME,
    employee_id: ADMIN_NAME,
    password_hash: passwordHash,
    role: "admin",
    created_at: new Date().toISOString(),
  });
}

async function initializeStorage() {
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      await runQuery(supabase.from("users").select("id").limit(1));
      storageMode = "supabase";
      return;
    } catch (error) {
      console.warn("Supabase indisponivel ou sem schema. Usando banco local para teste.", error.message);
    }
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

async function listRecordsForUser(user) {
  if (storageMode === "supabase") {
    if (user.role === "admin") {
      return runQuery(supabase.from("time_records").select("*").order("recorded_at", { ascending: false }));
    }

    return runQuery(
      supabase.from("time_records").select("*").eq("user_id", user.id).order("recorded_at", { ascending: false })
    );
  }

  if (user.role === "admin") {
    return [...localRecords].sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
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

async function listAllRecordsAscending() {
  if (storageMode === "supabase") {
    return runQuery(supabase.from("time_records").select("*").order("recorded_at", { ascending: true }));
  }

  return [...localRecords].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
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

app.post("/api/auth/register", requireAdmin, asyncRoute(createEmployeeFromRequest));

app.post("/api/admin/employees", requireAdmin, asyncRoute(createEmployeeFromRequest));

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
  const rows = await listRecordsForUser(req.authUser);
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

  const timestamp = recordedAt || new Date().toISOString();
  const date = localDate || new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(timestamp));
  const time = localTime || new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" }).format(new Date(timestamp));

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
    vehicle_plate: String(vehiclePlate).trim().toUpperCase(),
    vehicle_km: Number(vehicleKm),
  });

  return res.status(201).json({ record });
}));

app.get("/api/admin/summary", requireAdmin, asyncRoute(async (_req, res) => {
  const rows = await listAllRecordsAscending();
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
  return res.json({ summary });
}));

app.get("/api/admin/export.csv", requireAdmin, asyncRoute(async (_req, res) => {
  const rows = await listAllRecordsAscending();

  const csvRows = [
    [
      "Funcionario",
      "Matricula",
      "Acao",
      "Data",
      "Hora",
      "Latitude",
      "Longitude",
      "Placa do veiculo",
      "KM do veiculo",
      "Google Maps",
    ],
    ...rows.map((row) => [
      row.employee_name,
      row.employee_id,
      row.action,
      row.local_date,
      row.local_time,
      row.latitude ?? "",
      row.longitude ?? "",
      row.vehicle_plate ?? "",
      row.vehicle_km ?? "",
      createMapsUrl(row),
    ]),
    [],
    ["Rodape explicativo"],
    ["Funcionario", "Nome do funcionario que registrou o ponto"],
    ["Matricula", "Codigo do funcionario"],
    ["Acao", "Tipo de ponto registrado"],
    ["Data", "Dia local do registro"],
    ["Hora", "Hora local do registro"],
    ["Latitude", "Latitude obtida no celular"],
    ["Longitude", "Longitude obtida no celular"],
    ["Placa do veiculo", "Placa informada pelo funcionario ao registrar o ponto"],
    ["KM do veiculo", "Quilometragem informada no momento do registro"],
    ["Google Maps", "Link direto para abrir a coordenada registrada no Google Maps"],
  ];

  const csv = csvRows
    .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="cartao-ponto-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
}));

app.get("/api/admin/export.xlsx", requireAdmin, asyncRoute(async (_req, res) => {
  const rows = await listAllRecordsAscending();

  const workbook = createWorkbook(rows);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="planilha-cartao-ponto-lc-transportes-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Erro interno do servidor." });
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  await ensureInitialized();
  app.listen(PORT, () => {
    console.log(`Servidor iniciado em http://localhost:${PORT} usando modo ${storageMode}`);
  });
}

module.exports = app;

if (require.main === module) {
  start().catch((error) => {
    console.error("Falha ao iniciar servidor:", error.message);
    process.exit(1);
  });
}
