require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const { computeSummary, createWorkbook } = require("./lib/timecard-workbook");

const ADMIN_NAME = "Lc tranporte";
const ADMIN_PASSWORD = "2096";
const SESSION_SECRET = process.env.SESSION_SECRET || "timecard-professional-secret";
const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const app = express();
let storageMode = "local";
let supabase = null;
let localUsers = [];
let localRecords = [];
let localUserSequence = 1;
let localRecordSequence = 1;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 12,
      sameSite: "lax",
    },
  })
);

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
  if (!req.session.user) {
    return res.status(401).json({ error: "Autenticacao obrigatoria." });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
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

async function ensureAdminUser() {
  if (storageMode === "supabase") {
    const admin = await runQuery(
      supabase
        .from("users")
        .select("id")
        .eq("employee_id", ADMIN_NAME)
        .eq("role", "admin")
        .maybeSingle()
    );

    if (admin) {
      return;
    }

    const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
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
  if (!admin) {
    const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    localUsers.push({
      id: localUserSequence++,
      name: ADMIN_NAME,
      employee_id: ADMIN_NAME,
      password_hash: passwordHash,
      role: "admin",
      created_at: new Date().toISOString(),
    });
  }
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
  res.json({ user: req.session.user || null });
});

app.post("/api/auth/register", asyncRoute(async (req, res) => {
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
  req.session.user = serializeUser(user);
  return res.status(201).json({ user: req.session.user });
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

  req.session.user = serializeUser(user);
  return res.json({ user: req.session.user });
}));

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/me/records", requireAuth, asyncRoute(async (req, res) => {
  const rows = await listRecordsForUser(req.session.user);
  return res.json({ records: rows });
}));

app.post("/api/me/records", requireAuth, asyncRoute(async (req, res) => {
  const user = req.session.user;
  if (user.role !== "employee") {
    return res.status(403).json({ error: "Somente funcionarios registram ponto." });
  }

  const { action, latitude, longitude, locationLabel, recordedAt, localDate, localTime } = req.body;
  const allowedActions = ["Entrada", "Saida para almoco", "Retorno do almoco", "Saida"];

  if (!allowedActions.includes(action)) {
    return res.status(400).json({ error: "Acao de ponto invalida." });
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
  });

  return res.status(201).json({ record });
}));

app.get("/api/admin/summary", requireAdmin, asyncRoute(async (_req, res) => {
  const rows = await listAllRecordsAscending();
  const summary = computeSummary(rows).map((item) => ({
    employeeName: item.employeeName,
    employeeId: item.employeeId,
    localDate: item.day,
    entry: item.entry,
    lunchStart: item.lunchStart,
    lunchEnd: item.lunchEnd,
    exit: item.exit,
    workedHours: item.worked,
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
      "Data e hora ISO",
      "Latitude",
      "Longitude",
      "Localizacao aproximada",
    ],
    ...rows.map((row) => [
      row.employee_name,
      row.employee_id,
      row.action,
      row.local_date,
      row.local_time,
      row.recorded_at,
      row.latitude ?? "",
      row.longitude ?? "",
      row.location_label ?? "",
    ]),
    [],
    ["Rodape explicativo"],
    ["Funcionario", "Nome do funcionario que registrou o ponto"],
    ["Matricula", "Codigo do funcionario"],
    ["Acao", "Tipo de ponto registrado"],
    ["Data", "Dia local do registro"],
    ["Hora", "Hora local do registro"],
    ["Data e hora ISO", "Timestamp completo usado para auditoria"],
    ["Latitude", "Latitude obtida no celular"],
    ["Longitude", "Longitude obtida no celular"],
    ["Localizacao aproximada", "Descricao curta da localizacao armazenada"],
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
  await initializeStorage();
  await ensureAdminUser();
  app.listen(PORT, () => {
    console.log(`Servidor iniciado em http://localhost:${PORT} usando modo ${storageMode}`);
  });
}

start().catch((error) => {
  console.error("Falha ao iniciar servidor:", error.message);
  process.exit(1);
});
