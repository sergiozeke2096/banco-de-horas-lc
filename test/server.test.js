const assert = require("node:assert/strict");
const { beforeEach, test } = require("node:test");
const ExcelJS = require("exceljs");
const request = require("supertest");

process.env.ADMIN_NAME = "Admin Teste";
process.env.ADMIN_PASSWORD = "SenhaForte!123";
process.env.ALLOW_LOCAL_STORAGE_FALLBACK = "true";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const app = require("../server");
const defaultLocation = {
  latitude: -23.55052,
  longitude: -46.633308,
  locationLabel: "Lat -23.55052, Long -46.63331",
};

beforeEach(() => {
  process.env.ADMIN_NAME = "Admin Teste";
  process.env.ADMIN_PASSWORD = "SenhaForte!123";
  process.env.ALLOW_LOCAL_STORAGE_FALLBACK = "true";
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  app.__testing.resetInMemoryState();
});

async function login(agent, employeeId, password) {
  const response = await agent.post("/api/auth/login").send({ employeeId, password });
  assert.equal(response.status, 200);
  return response;
}

async function registerEmployee(agent, employeeId = "1001", name = "Funcionario Teste") {
  const response = await agent.post("/api/admin/employees").send({
    name,
    employeeId,
    password: "senha-funcionario",
  });

  assert.equal(response.status, 201);
  return response.body.user;
}

async function createRecord(agent, overrides = {}) {
  const payload = {
    action: "Entrada",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "ABC1D23",
    vehicleKm: 125430,
    ...defaultLocation,
    ...overrides,
  };

  return agent.post("/api/me/records").send(payload);
}

async function createVehicleTransfer(agent, overrides = {}) {
  const payload = {
    fromVehiclePlate: "ABC1D23",
    fromVehicleKm: 125450,
    toVehiclePlate: "DEF4G56",
    toVehicleKm: 200000,
    recordedAt: "2026-03-11T12:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "12:00:00",
    ...defaultLocation,
    ...overrides,
  };

  return agent.post("/api/me/vehicle-transfers").send(payload);
}

async function registerVehicle(agent, plate = "ABC1D23", description = "Fiorino branca", initialKm = 1000) {
  const response = await agent.post("/api/admin/vehicles").send({ plate, description, initialKm });
  assert.equal(response.status, 201);
  return response.body.vehicle;
}

function binaryParser(response, callback) {
  response.setEncoding("binary");
  let data = "";
  response.on("data", (chunk) => {
    data += chunk;
  });
  response.on("end", () => {
    callback(null, Buffer.from(data, "binary"));
  });
}

test("admin configurado por ambiente consegue autenticar e cadastrar funcionario", async () => {
  const agent = request.agent(app);

  const loginResponse = await login(agent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  assert.equal(loginResponse.body.user.role, "admin");

  const employee = await registerEmployee(agent, "2001");
  assert.equal(employee.employeeId, "2001");
});

test("admin configurado por ambiente consegue autenticar com alias comum", async () => {
  const agent = request.agent(app);

  const loginResponse = await login(agent, "admin", process.env.ADMIN_PASSWORD);
  assert.equal(loginResponse.body.user.role, "admin");
  assert.equal(loginResponse.body.user.employeeId, process.env.ADMIN_NAME);
});

test("login aceita diferenca de maiusculas e minusculas no identificador", async () => {
  const agent = request.agent(app);

  const loginResponse = await login(agent, "admin teste", process.env.ADMIN_PASSWORD);
  assert.equal(loginResponse.body.user.role, "admin");
  assert.equal(loginResponse.body.user.employeeId, process.env.ADMIN_NAME);
});

test("login do admin resincroniza o hash quando ADMIN_PASSWORD muda no ambiente", async () => {
  const originalPassword = process.env.ADMIN_PASSWORD;
  const firstAgent = request.agent(app);
  const firstLogin = await firstAgent.post("/api/auth/login").send({
    employeeId: process.env.ADMIN_NAME,
    password: originalPassword,
  });
  assert.equal(firstLogin.status, 200);

  process.env.ADMIN_PASSWORD = "NovaSenhaDoEnv!456";
  app.__testing.resetInitializationState();

  const newPasswordAgent = request.agent(app);
  const newPasswordLogin = await newPasswordAgent.post("/api/auth/login").send({
    employeeId: process.env.ADMIN_NAME,
    password: process.env.ADMIN_PASSWORD,
  });
  assert.equal(newPasswordLogin.status, 200);

  const oldPasswordAgent = request.agent(app);
  const oldPasswordLogin = await oldPasswordAgent.post("/api/auth/login").send({
    employeeId: process.env.ADMIN_NAME,
    password: originalPassword,
  });
  assert.equal(oldPasswordLogin.status, 401);
});

test("backend rejeita uma saida como primeira batida do dia", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "3001");
  await registerVehicle(adminAgent, "ABC1D23", "Utilitario 3001", 120000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "3001", "senha-funcionario");

  const response = await employeeAgent.post("/api/me/records").send({
    action: "Saida",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "ABC1D23",
    vehicleKm: 125430,
    ...defaultLocation,
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /primeiro registro do dia deve ser uma Entrada/i);
});

test("backend aceita sequencia valida completa de jornada", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "4001");
  await registerVehicle(adminAgent, "DEF4G56", "Van 4001", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "4001", "senha-funcionario");

  const records = [
    { action: "Entrada", recordedAt: "2026-03-11T08:00:00.000Z", localTime: "08:00:00", vehiclePlate: "DEF4G56", vehicleKm: 1000 },
    { action: "Saida para almoco", recordedAt: "2026-03-11T12:00:00.000Z", localTime: "12:00:00" },
    { action: "Retorno do almoco", recordedAt: "2026-03-11T13:00:00.000Z", localTime: "13:00:00" },
    { action: "Saida", recordedAt: "2026-03-11T17:00:00.000Z", localTime: "17:00:00", vehiclePlate: "DEF4G56", vehicleKm: 1000 },
  ];

  for (const record of records) {
    const response = await employeeAgent.post("/api/me/records").send({
      ...record,
      localDate: "11/03/2026",
      ...defaultLocation,
    });

    assert.equal(response.status, 201);
  }

  const listResponse = await employeeAgent.get("/api/me/records");
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.records.length, 4);
});

test("reenvio com o mesmo clientRequestId retorna o registro existente sem duplicar", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "4008");
  await registerVehicle(adminAgent, "OFF1234", "Veiculo fila offline", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "4008", "senha-funcionario");

  const payload = {
    action: "Entrada",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "OFF1234",
    vehicleKm: 1000,
    clientRequestId: "fila-offline-teste-1",
    ...defaultLocation,
  };

  const firstResponse = await employeeAgent.post("/api/me/records").send(payload);
  assert.equal(firstResponse.status, 201);
  const firstRecordId = firstResponse.body.record.id;

  const replayResponse = await employeeAgent.post("/api/me/records").send(payload);
  assert.equal(replayResponse.status, 200);
  assert.equal(replayResponse.body.record.id, firstRecordId);

  const listResponse = await employeeAgent.get("/api/me/records");
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.records.length, 1);
});

test("reenvio com clientRequestId novo continua validando a sequencia normalmente", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "4009");
  await registerVehicle(adminAgent, "OFF5678", "Veiculo fila offline 2", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "4009", "senha-funcionario");

  const entryResponse = await employeeAgent.post("/api/me/records").send({
    action: "Entrada",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "OFF5678",
    vehicleKm: 1000,
    clientRequestId: "fila-offline-teste-2",
    ...defaultLocation,
  });
  assert.equal(entryResponse.status, 201);

  const duplicateActionResponse = await employeeAgent.post("/api/me/records").send({
    action: "Entrada",
    recordedAt: "2026-03-11T09:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "09:00:00",
    vehiclePlate: "OFF5678",
    vehicleKm: 1010,
    clientRequestId: "fila-offline-teste-3",
    ...defaultLocation,
  });
  assert.equal(duplicateActionResponse.status, 409);
});

test("backend reaproveita veiculo e km atuais em parada e retorno sem exigir novo cadastro", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "4004");
  await registerVehicle(adminAgent, "CTX1234", "Veiculo contexto", 4500);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "4004", "senha-funcionario");

  const entryResponse = await employeeAgent.post("/api/me/records").send({
    action: "Entrada",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "CTX1234",
    vehicleKm: 4500,
    ...defaultLocation,
  });
  assert.equal(entryResponse.status, 201);

  const lunchStartResponse = await employeeAgent.post("/api/me/records").send({
    action: "Saida para almoco",
    recordedAt: "2026-03-11T12:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "12:00:00",
    ...defaultLocation,
  });
  assert.equal(lunchStartResponse.status, 201);
  assert.equal(lunchStartResponse.body.record.vehicle_plate, "CTX1234");
  assert.equal(lunchStartResponse.body.record.vehicle_km, 4500);

  const lunchReturnResponse = await employeeAgent.post("/api/me/records").send({
    action: "Retorno do almoco",
    recordedAt: "2026-03-11T13:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "13:00:00",
    ...defaultLocation,
  });
  assert.equal(lunchReturnResponse.status, 201);
  assert.equal(lunchReturnResponse.body.record.vehicle_plate, "CTX1234");
  assert.equal(lunchReturnResponse.body.record.vehicle_km, 4500);
});

test("backend continua exigindo veiculo e km no termino da jornada", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "4005");
  await registerVehicle(adminAgent, "FIM1234", "Veiculo termino", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "4005", "senha-funcionario");

  const entryResponse = await employeeAgent.post("/api/me/records").send({
    action: "Entrada",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "FIM1234",
    vehicleKm: 1000,
    ...defaultLocation,
  });
  assert.equal(entryResponse.status, 201);

  const exitResponse = await employeeAgent.post("/api/me/records").send({
    action: "Saida",
    recordedAt: "2026-03-11T17:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "17:00:00",
    ...defaultLocation,
  });

  assert.equal(exitResponse.status, 400);
  assert.match(exitResponse.body.error, /placa e o KM do veiculo/i);
});

test("backend aceita mais de um almoco na mesma jornada", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "4002");
  await registerVehicle(adminAgent, "MUL1234", "Multiple lunch", 3000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "4002", "senha-funcionario");

  const records = [
    { action: "Entrada", recordedAt: "2026-03-11T08:00:00.000Z", localTime: "08:00:00", vehicleKm: 3000 },
    { action: "Saida para almoco", recordedAt: "2026-03-11T10:00:00.000Z", localTime: "10:00:00", vehicleKm: 3010 },
    { action: "Retorno do almoco", recordedAt: "2026-03-11T10:15:00.000Z", localTime: "10:15:00", vehicleKm: 3010 },
    { action: "Saida para almoco", recordedAt: "2026-03-11T12:00:00.000Z", localTime: "12:00:00", vehicleKm: 3020 },
    { action: "Retorno do almoco", recordedAt: "2026-03-11T13:00:00.000Z", localTime: "13:00:00", vehicleKm: 3020 },
    { action: "Saida", recordedAt: "2026-03-11T17:00:00.000Z", localTime: "17:00:00", vehicleKm: 3040 },
  ];

  for (const record of records) {
    const response = await employeeAgent.post("/api/me/records").send({
      ...record,
      localDate: "11/03/2026",
      vehiclePlate: "MUL1234",
      ...defaultLocation,
    });
    assert.equal(response.status, 201);
  }

  const summaryResponse = await adminAgent.get("/api/admin/summary").query({
    employeeId: "4002",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryResponse.body.summary.length, 1);
  assert.equal(summaryResponse.body.summary[0].workedHours, "07:45");
  assert.equal(summaryResponse.body.summary[0].intervalHours, "01:15");
});

test("backend aceita mais de um ciclo de inicio e fim no mesmo dia", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "4003");
  await registerVehicle(adminAgent, "CIC1234", "Multiple cycles", 5000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "4003", "senha-funcionario");

  const records = [
    { action: "Entrada", recordedAt: "2026-03-11T08:00:00.000Z", localTime: "08:00:00", vehicleKm: 5000 },
    { action: "Saida", recordedAt: "2026-03-11T12:00:00.000Z", localTime: "12:00:00", vehicleKm: 5020 },
    { action: "Entrada", recordedAt: "2026-03-11T13:00:00.000Z", localTime: "13:00:00", vehicleKm: 5020 },
    { action: "Saida", recordedAt: "2026-03-11T17:00:00.000Z", localTime: "17:00:00", vehicleKm: 5050 },
  ];

  for (const record of records) {
    const response = await employeeAgent.post("/api/me/records").send({
      ...record,
      localDate: "11/03/2026",
      vehiclePlate: "CIC1234",
      ...defaultLocation,
    });
    assert.equal(response.status, 201);
  }

  const summaryResponse = await adminAgent.get("/api/admin/summary").query({
    employeeId: "4003",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryResponse.body.summary.length, 1);
  assert.equal(summaryResponse.body.summary[0].workedHours, "08:00");
});

test("resumo usa carga horaria de 9:18 apenas para a matricula 2", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "2");
  await registerEmployee(adminAgent, "3");
  await registerVehicle(adminAgent, "ROM0002", "Veiculo matricula 2", 1000);
  await registerVehicle(adminAgent, "PAD0003", "Veiculo matricula 3", 2000);

  const employeeTwoAgent = request.agent(app);
  await login(employeeTwoAgent, "2", "senha-funcionario");
  assert.equal((await employeeTwoAgent.post("/api/me/records").send({
    action: "Entrada",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "ROM0002",
    vehicleKm: 1000,
    ...defaultLocation,
  })).status, 201);
  assert.equal((await employeeTwoAgent.post("/api/me/records").send({
    action: "Saida",
    recordedAt: "2026-03-11T16:30:00.000Z",
    localDate: "11/03/2026",
    localTime: "16:30:00",
    vehiclePlate: "ROM0002",
    vehicleKm: 1030,
    ...defaultLocation,
  })).status, 201);

  const employeeThreeAgent = request.agent(app);
  await login(employeeThreeAgent, "3", "senha-funcionario");
  assert.equal((await employeeThreeAgent.post("/api/me/records").send({
    action: "Entrada",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "PAD0003",
    vehicleKm: 2000,
    ...defaultLocation,
  })).status, 201);
  assert.equal((await employeeThreeAgent.post("/api/me/records").send({
    action: "Saida",
    recordedAt: "2026-03-11T16:30:00.000Z",
    localDate: "11/03/2026",
    localTime: "16:30:00",
    vehiclePlate: "PAD0003",
    vehicleKm: 2040,
    ...defaultLocation,
  })).status, 201);

  const employeeTwoSummary = await adminAgent.get("/api/admin/summary").query({
    employeeId: "2",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(employeeTwoSummary.status, 200);
  assert.equal(employeeTwoSummary.body.summary.length, 1);
  assert.equal(employeeTwoSummary.body.summary[0].workedHours, "08:30");
  assert.equal(employeeTwoSummary.body.summary[0].overtimeHours, "00:00");

  const employeeThreeSummary = await adminAgent.get("/api/admin/summary").query({
    employeeId: "3",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(employeeThreeSummary.status, 200);
  assert.equal(employeeThreeSummary.body.summary.length, 1);
  assert.equal(employeeThreeSummary.body.summary[0].workedHours, "08:30");
  assert.equal(employeeThreeSummary.body.summary[0].overtimeHours, "00:30");
});

test("resumo usa carga horaria de 9:18 para Everton Ricardo mesmo com outra matricula", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "9902", "Everton Ricardo");
  await registerVehicle(adminAgent, "EVR9902", "Veiculo Everton", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "9902", "senha-funcionario");
  assert.equal((await employeeAgent.post("/api/me/records").send({
    action: "Entrada",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "EVR9902",
    vehicleKm: 1000,
    ...defaultLocation,
  })).status, 201);
  assert.equal((await employeeAgent.post("/api/me/records").send({
    action: "Saida",
    recordedAt: "2026-03-11T17:18:00.000Z",
    localDate: "11/03/2026",
    localTime: "17:18:00",
    vehiclePlate: "EVR9902",
    vehicleKm: 1040,
    ...defaultLocation,
  })).status, 201);

  const summaryResponse = await adminAgent.get("/api/admin/summary").query({
    employeeId: "9902",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryResponse.body.summary.length, 1);
  assert.equal(summaryResponse.body.summary[0].workedHours, "09:18");
  assert.equal(summaryResponse.body.summary[0].overtimeHours, "00:00");
});

test("backend aceita jornada noturna cruzando meia-noite e consolida no dia de entrada", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "4010");
  await registerVehicle(adminAgent, "NOT1234", "Noturno", 1500);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "4010", "senha-funcionario");

  const entryResponse = await employeeAgent.post("/api/me/records").send({
    action: "Entrada",
    recordedAt: "2026-03-11T22:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "22:00:00",
    vehiclePlate: "NOT1234",
    vehicleKm: 1500,
    ...defaultLocation,
  });
  assert.equal(entryResponse.status, 201);

  const exitResponse = await employeeAgent.post("/api/me/records").send({
    action: "Saida",
    recordedAt: "2026-03-12T06:00:00.000Z",
    localDate: "12/03/2026",
    localTime: "06:00:00",
    vehiclePlate: "NOT1234",
    vehicleKm: 1515,
    ...defaultLocation,
  });
  assert.equal(exitResponse.status, 201);

  const summaryResponse = await adminAgent.get("/api/admin/summary").query({
    employeeId: "4010",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-12",
  });
  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryResponse.body.summary.length, 1);
  assert.equal(summaryResponse.body.summary[0].localDate, "11/03/2026");
  assert.equal(summaryResponse.body.summary[0].workedHours, "08:00");
  assert.equal(summaryResponse.body.summary[0].dailyKm, 15);
});

test("backend rejeita almoco em duplicidade sem retorno", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "5001");
  await registerVehicle(adminAgent, "HIJ7K89", "Fiorino 5001", 2000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "5001", "senha-funcionario");

  const firstEntry = await employeeAgent.post("/api/me/records").send({
    action: "Entrada",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "HIJ7K89",
    vehicleKm: 2000,
    ...defaultLocation,
  });
  assert.equal(firstEntry.status, 201);

  const lunchStart = await employeeAgent.post("/api/me/records").send({
    action: "Saida para almoco",
    recordedAt: "2026-03-11T12:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "12:00:00",
    vehiclePlate: "HIJ7K89",
    vehicleKm: 2010,
    ...defaultLocation,
  });
  assert.equal(lunchStart.status, 201);

  const invalidDuplicate = await employeeAgent.post("/api/me/records").send({
    action: "Saida para almoco",
    recordedAt: "2026-03-11T12:30:00.000Z",
    localDate: "11/03/2026",
    localTime: "12:30:00",
    vehiclePlate: "HIJ7K89",
    vehicleKm: 2012,
    ...defaultLocation,
  });

  assert.equal(invalidDuplicate.status, 409);
  assert.match(invalidDuplicate.body.error, /Retorno do almoco/i);
});

test("backend rejeita registro com veiculo nao cadastrado", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "5010");

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "5010", "senha-funcionario");

  const response = await employeeAgent.post("/api/me/records").send({
    action: "Entrada",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "ZZZ0000",
    vehicleKm: 1000,
    ...defaultLocation,
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /veiculo cadastrado/i);
});

test("backend rejeita registro sem localizacao ativa", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "5011");
  await registerVehicle(adminAgent, "LOC1234", "Veiculo localizacao", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "5011", "senha-funcionario");

  const response = await employeeAgent.post("/api/me/records").send({
    action: "Entrada",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "LOC1234",
    vehicleKm: 1000,
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /ative a localizacao/i);
});

test("admin consegue editar funcionario e sincronizar identificacao nos registros", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  const employee = await registerEmployee(adminAgent, "6001");
  await registerVehicle(adminAgent, "ABC1D23", "Utilitario 6001", 125430);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "6001", "senha-funcionario");
  const recordResponse = await createRecord(employeeAgent);
  assert.equal(recordResponse.status, 201);

  const updateResponse = await adminAgent.patch(`/api/admin/employees/${employee.id}`).send({
    name: "Funcionario Atualizado",
    employeeId: "6002",
  });

  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body.employee.employeeId, "6002");

  const sessionResponse = await employeeAgent.get("/api/auth/session");
  assert.equal(sessionResponse.status, 200);
  assert.equal(sessionResponse.body.user.employeeId, "6002");
  assert.equal(sessionResponse.body.user.name, "Funcionario Atualizado");

  const recordsResponse = await adminAgent.get("/api/me/records");
  assert.equal(recordsResponse.status, 200);
  assert.equal(recordsResponse.body.records[0].employee_id, "6002");
  assert.equal(recordsResponse.body.records[0].employee_name, "Funcionario Atualizado");
});

test("admin consegue corrigir o horario de um registro de ponto", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "6003");
  await registerVehicle(adminAgent, "EDT6003", "Utilitario 6003", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "6003", "senha-funcionario");

  const entryResponse = await createRecord(employeeAgent, {
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "EDT6003",
    vehicleKm: 1000,
  });
  assert.equal(entryResponse.status, 201);

  const exitResponse = await createRecord(employeeAgent, {
    action: "Saida",
    recordedAt: "2026-03-11T17:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "17:00:00",
    vehiclePlate: "EDT6003",
    vehicleKm: 1040,
  });
  assert.equal(exitResponse.status, 201);

  const correctionResponse = await adminAgent.patch(`/api/admin/records/${entryResponse.body.record.id}`).send({
    recordedAt: "2026-03-11T09:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "09:00:00",
  });
  assert.equal(correctionResponse.status, 200);
  assert.equal(correctionResponse.body.record.local_time, "09:00:00");

  const recordsResponse = await adminAgent.get("/api/me/records").query({
    employeeId: "6003",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(recordsResponse.status, 200);
  assert.equal(recordsResponse.body.records.length, 2);
  assert.equal(recordsResponse.body.records[1].local_time, "09:00:00");

  const summaryResponse = await adminAgent.get("/api/admin/summary").query({
    employeeId: "6003",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryResponse.body.summary[0].workedHours, "08:00");
  assert.equal(summaryResponse.body.summary[0].overtimeHours, "00:00");
});

test("admin consegue corrigir o KM de um registro de ponto", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "6005");
  await registerVehicle(adminAgent, "EDT6005", "Utilitario 6005", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "6005", "senha-funcionario");

  const entryResponse = await createRecord(employeeAgent, {
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "EDT6005",
    vehicleKm: 1100,
  });
  assert.equal(entryResponse.status, 201);

  const correctionResponse = await adminAgent.patch(`/api/admin/records/${entryResponse.body.record.id}`).send({
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehicleKm: 1185,
  });
  assert.equal(correctionResponse.status, 200);
  assert.equal(correctionResponse.body.record.vehicle_km, 1185);

  const recordsResponse = await adminAgent.get("/api/me/records").query({
    employeeId: "6005",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(recordsResponse.status, 200);
  assert.equal(recordsResponse.body.records[0].vehicle_km, 1185);

  const vehiclesResponse = await adminAgent.get("/api/admin/vehicles");
  assert.equal(vehiclesResponse.status, 200);
  const vehicle = vehiclesResponse.body.vehicles.find((item) => item.plate === "EDT6005");
  assert.equal(vehicle.currentKm, 1185);
});

test("admin consegue corrigir o tipo de um registro de ponto", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "6006");
  await registerVehicle(adminAgent, "EDT6006", "Utilitario 6006", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "6006", "senha-funcionario");

  const entryResponse = await createRecord(employeeAgent, {
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "EDT6006",
    vehicleKm: 1000,
  });
  assert.equal(entryResponse.status, 201);

  const lunchResponse = await createRecord(employeeAgent, {
    action: "Saida para almoco",
    recordedAt: "2026-03-11T12:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "12:00:00",
    vehiclePlate: "EDT6006",
    vehicleKm: 1025,
  });
  assert.equal(lunchResponse.status, 201);

  const correctionResponse = await adminAgent.patch(`/api/admin/records/${lunchResponse.body.record.id}`).send({
    action: "Saida",
    recordedAt: "2026-03-11T12:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "12:00:00",
    vehicleKm: 1025,
  });
  assert.equal(correctionResponse.status, 200);
  assert.equal(correctionResponse.body.record.action, "Saida");

  const recordsResponse = await adminAgent.get("/api/me/records").query({
    employeeId: "6006",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(recordsResponse.status, 200);
  assert.equal(recordsResponse.body.records.length, 2);
  assert.equal(recordsResponse.body.records[0].action, "Saida");

  const summaryResponse = await adminAgent.get("/api/admin/summary").query({
    employeeId: "6006",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryResponse.body.summary[0].workedHours, "04:00");
});

test("admin consegue corrigir registro mesmo se a sequencia ficar inconsistente", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "6009");
  await registerVehicle(adminAgent, "EDT6010", "Utilitario 6009", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "6009", "senha-funcionario");

  const entryResponse = await createRecord(employeeAgent, {
    recordedAt: "2026-03-11T22:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "22:00:00",
    vehiclePlate: "EDT6010",
    vehicleKm: 1000,
  });
  assert.equal(entryResponse.status, 201);

  const lunchResponse = await createRecord(employeeAgent, {
    action: "Saida para almoco",
    recordedAt: "2026-03-12T03:26:41.000Z",
    localDate: "12/03/2026",
    localTime: "03:26:41",
    vehiclePlate: "EDT6010",
    vehicleKm: 1010,
  });
  assert.equal(lunchResponse.status, 201);

  const returnResponse = await createRecord(employeeAgent, {
    action: "Retorno do almoco",
    recordedAt: "2026-03-12T03:40:00.000Z",
    localDate: "12/03/2026",
    localTime: "03:40:00",
    vehiclePlate: "EDT6010",
    vehicleKm: 1010,
  });
  assert.equal(returnResponse.status, 201);

  const exitResponse = await createRecord(employeeAgent, {
    action: "Saida",
    recordedAt: "2026-03-12T06:00:00.000Z",
    localDate: "12/03/2026",
    localTime: "06:00:00",
    vehiclePlate: "EDT6010",
    vehicleKm: 1020,
  });
  assert.equal(exitResponse.status, 201);

  const correctionResponse = await adminAgent.patch(`/api/admin/records/${lunchResponse.body.record.id}`).send({
    action: "Saida",
    recordedAt: "2026-03-12T09:13:52.000Z",
    localDate: "12/03/2026",
    localTime: "09:13:52",
    vehicleKm: 1010,
  });
  assert.equal(correctionResponse.status, 200);
  assert.equal(correctionResponse.body.record.action, "Saida");
  assert.match(correctionResponse.body.warning, /sequencia da jornada ficou inconsistente/i);
});

test("admin consegue excluir um registro de ponto e recalcular o KM do veiculo", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "6007");
  await registerVehicle(adminAgent, "EDT6007", "Utilitario 6007", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "6007", "senha-funcionario");

  const entryResponse = await createRecord(employeeAgent, {
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "EDT6007",
    vehicleKm: 1000,
  });
  assert.equal(entryResponse.status, 201);

  const exitResponse = await createRecord(employeeAgent, {
    action: "Saida",
    recordedAt: "2026-03-11T17:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "17:00:00",
    vehiclePlate: "EDT6007",
    vehicleKm: 1040,
  });
  assert.equal(exitResponse.status, 201);

  const deleteResponse = await adminAgent.delete(`/api/admin/records/${exitResponse.body.record.id}`);
  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.body.ok, true);

  const recordsResponse = await adminAgent.get("/api/me/records").query({
    employeeId: "6007",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(recordsResponse.status, 200);
  assert.equal(recordsResponse.body.records.length, 1);
  assert.equal(recordsResponse.body.records[0].action, "Entrada");

  const vehiclesResponse = await adminAgent.get("/api/admin/vehicles");
  assert.equal(vehiclesResponse.status, 200);
  const vehicle = vehiclesResponse.body.vehicles.find((item) => item.plate === "EDT6007");
  assert.equal(vehicle.currentKm, 1000);
});

test("admin consegue excluir registro mesmo se a sequencia da jornada ficar inconsistente", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "6008");
  await registerVehicle(adminAgent, "EDT6008", "Utilitario 6008", 1000);
  await registerVehicle(adminAgent, "EDT6009", "Utilitario 6009", 2000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "6008", "senha-funcionario");

  const entryResponse = await createRecord(employeeAgent, {
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "EDT6008",
    vehicleKm: 1000,
  });
  assert.equal(entryResponse.status, 201);

  const transferResponse = await createVehicleTransfer(employeeAgent, {
    fromVehiclePlate: "EDT6008",
    fromVehicleKm: 1050,
    toVehiclePlate: "EDT6009",
    toVehicleKm: 2000,
    recordedAt: "2026-03-11T12:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "12:00:00",
  });
  assert.equal(transferResponse.status, 201);

  const exitResponse = await createRecord(employeeAgent, {
    action: "Saida",
    recordedAt: "2026-03-11T17:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "17:00:00",
    vehiclePlate: "EDT6009",
    vehicleKm: 2040,
  });
  assert.equal(exitResponse.status, 201);

  const deleteResponse = await adminAgent.delete(`/api/admin/records/${entryResponse.body.record.id}`);
  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.body.ok, true);
  assert.match(deleteResponse.body.warning, /sequencia da jornada ficou inconsistente/i);
});

test("funcionario comum nao pode corrigir horario de registro pelo endpoint admin", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "6004");
  await registerVehicle(adminAgent, "EDT6004", "Utilitario 6004", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "6004", "senha-funcionario");

  const entryResponse = await createRecord(employeeAgent, {
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "EDT6004",
    vehicleKm: 1000,
  });
  assert.equal(entryResponse.status, 201);

  const deniedResponse = await employeeAgent.patch(`/api/admin/records/${entryResponse.body.record.id}`).send({
    recordedAt: "2026-03-11T09:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "09:00:00",
  });
  assert.equal(deniedResponse.status, 403);
  assert.match(deniedResponse.body.error, /administrador/i);
});

test("admin consegue redefinir a senha do funcionario", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  const employee = await registerEmployee(adminAgent, "7001");

  const resetResponse = await adminAgent.post(`/api/admin/employees/${employee.id}/password`).send({
    password: "nova-senha-segura",
  });
  assert.equal(resetResponse.status, 200);

  const oldPasswordAgent = request.agent(app);
  const oldPasswordLogin = await oldPasswordAgent.post("/api/auth/login").send({
    employeeId: "7001",
    password: "senha-funcionario",
  });
  assert.equal(oldPasswordLogin.status, 401);

  const newPasswordAgent = request.agent(app);
  const newPasswordLogin = await newPasswordAgent.post("/api/auth/login").send({
    employeeId: "7001",
    password: "nova-senha-segura",
  });
  assert.equal(newPasswordLogin.status, 200);
});

test("admin consegue excluir funcionario sem registros", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  const employee = await registerEmployee(adminAgent, "8001");

  const deleteResponse = await adminAgent.delete(`/api/admin/employees/${employee.id}`);
  assert.equal(deleteResponse.status, 200);

  const listResponse = await adminAgent.get("/api/admin/employees");
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.employees.length, 0);
});

test("admin nao consegue excluir funcionario com registros", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  const employee = await registerEmployee(adminAgent, "9001");
  await registerVehicle(adminAgent, "ABC1D23", "Utilitario 9001", 125430);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "9001", "senha-funcionario");
  const recordResponse = await createRecord(employeeAgent);
  assert.equal(recordResponse.status, 201);

  const deleteResponse = await adminAgent.delete(`/api/admin/employees/${employee.id}`);
  assert.equal(deleteResponse.status, 409);
  assert.match(deleteResponse.body.error, /possui registros/i);
});

test("admin consegue cadastrar e excluir veiculos", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);

  const vehicle = await registerVehicle(adminAgent, "XYZ9K88", "Van prata", 250000);
  assert.equal(vehicle.plate, "XYZ9K88");
  assert.equal(vehicle.initialKm, 250000);
  assert.equal(vehicle.currentKm, 250000);

  const listResponse = await adminAgent.get("/api/admin/vehicles");
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.vehicles.length, 1);
  assert.equal(listResponse.body.vehicles[0].description, "Van prata");

  const deleteResponse = await adminAgent.delete(`/api/admin/vehicles/${vehicle.id}`);
  assert.equal(deleteResponse.status, 200);

  const listAfterDelete = await adminAgent.get("/api/admin/vehicles");
  assert.equal(listAfterDelete.status, 200);
  assert.equal(listAfterDelete.body.vehicles.length, 0);
});

test("funcionario autenticado consegue listar veiculos cadastrados", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerVehicle(adminAgent, "AAA1B22", "Truck azul", 1500);
  await registerEmployee(adminAgent, "9301");

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "9301", "senha-funcionario");

  const response = await employeeAgent.get("/api/vehicles");
  assert.equal(response.status, 200);
  assert.equal(response.body.vehicles.length, 1);
  assert.equal(response.body.vehicles[0].plate, "AAA1B22");
  assert.equal(response.body.vehicles[0].inUseByOtherEmployee, false);
});

test("funcionario nao consegue selecionar veiculo que ja esta em uso por outro funcionario", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerVehicle(adminAgent, "USO1234", "Veiculo em uso", 1000);
  await registerEmployee(adminAgent, "9351");
  await registerEmployee(adminAgent, "9352");

  const firstEmployeeAgent = request.agent(app);
  await login(firstEmployeeAgent, "9351", "senha-funcionario");
  const firstEntry = await createRecord(firstEmployeeAgent, {
    vehiclePlate: "USO1234",
    vehicleKm: 1000,
  });
  assert.equal(firstEntry.status, 201);

  const secondEmployeeAgent = request.agent(app);
  await login(secondEmployeeAgent, "9352", "senha-funcionario");

  const vehiclesResponse = await secondEmployeeAgent.get("/api/vehicles");
  assert.equal(vehiclesResponse.status, 200);
  assert.equal(vehiclesResponse.body.vehicles[0].plate, "USO1234");
  assert.equal(vehiclesResponse.body.vehicles[0].inUseByOtherEmployee, true);
  assert.equal(vehiclesResponse.body.vehicles[0].inUseBy.employeeId, "9351");

  const blockedEntry = await createRecord(secondEmployeeAgent, {
    vehiclePlate: "USO1234",
    vehicleKm: 1000,
  });
  assert.equal(blockedEntry.status, 409);
  assert.match(blockedEntry.body.error, /ja esta em uso/i);
});

test("registro de ponto atualiza o KM atual do veiculo cadastrado", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerVehicle(adminAgent, "KMV1A23", "Utilitario", 5000);
  await registerEmployee(adminAgent, "9401");

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "9401", "senha-funcionario");

  const recordResponse = await createRecord(employeeAgent, {
    vehiclePlate: "KMV1A23",
    vehicleKm: 5125,
  });
  assert.equal(recordResponse.status, 201);

  const listResponse = await adminAgent.get("/api/admin/vehicles");
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.vehicles[0].currentKm, 5125);
});

test("registro de ponto rejeita KM menor que o atual do veiculo cadastrado", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerVehicle(adminAgent, "KMV9Z88", "Sprinter", 9000);
  await registerEmployee(adminAgent, "9501");

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "9501", "senha-funcionario");

  const invalidRecord = await createRecord(employeeAgent, {
    vehiclePlate: "KMV9Z88",
    vehicleKm: 8999,
  });
  assert.equal(invalidRecord.status, 409);
  assert.match(invalidRecord.body.error, /nao pode ser menor que o KM atual/i);
});

test("funcionario consegue trocar de veiculo no meio da jornada sem quebrar o resumo", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerVehicle(adminAgent, "TRC1111", "Veiculo inicial", 100);
  await registerVehicle(adminAgent, "TRC2222", "Veiculo troca", 200);
  await registerEmployee(adminAgent, "9551");

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "9551", "senha-funcionario");

  const entryResponse = await createRecord(employeeAgent, {
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "TRC1111",
    vehicleKm: 100,
  });
  assert.equal(entryResponse.status, 201);

  const contextBeforeTransfer = await employeeAgent.get("/api/me/vehicle-context");
  assert.equal(contextBeforeTransfer.status, 200);
  assert.equal(contextBeforeTransfer.body.context.activeJourney, true);
  assert.equal(contextBeforeTransfer.body.context.currentVehicle.plate, "TRC1111");

  const transferResponse = await createVehicleTransfer(employeeAgent, {
    fromVehiclePlate: "TRC1111",
    fromVehicleKm: 120,
    toVehiclePlate: "TRC2222",
    toVehicleKm: 200,
  });
  assert.equal(transferResponse.status, 201);
  assert.equal(transferResponse.body.context.currentVehicle.plate, "TRC2222");
  assert.equal(transferResponse.body.context.currentVehicle.km, 200);

  const exitResponse = await employeeAgent.post("/api/me/records").send({
    action: "Saida",
    recordedAt: "2026-03-11T16:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "16:00:00",
    vehiclePlate: "TRC2222",
    vehicleKm: 240,
    ...defaultLocation,
  });
  assert.equal(exitResponse.status, 201);

  const vehiclesResponse = await adminAgent.get("/api/admin/vehicles");
  assert.equal(vehiclesResponse.status, 200);
  const firstVehicle = vehiclesResponse.body.vehicles.find((vehicle) => vehicle.plate === "TRC1111");
  const secondVehicle = vehiclesResponse.body.vehicles.find((vehicle) => vehicle.plate === "TRC2222");
  assert.equal(firstVehicle.currentKm, 120);
  assert.equal(secondVehicle.currentKm, 240);

  const summaryResponse = await adminAgent.get("/api/admin/summary").query({
    employeeId: "9551",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryResponse.body.summary.length, 1);
  assert.equal(summaryResponse.body.summary[0].workedHours, "08:00");
  assert.equal(summaryResponse.body.summary[0].dailyKm, 60);
  assert.match(summaryResponse.body.summary[0].vehiclePlate, /TRC1111/);
  assert.match(summaryResponse.body.summary[0].vehiclePlate, /TRC2222/);

  const filteredSummary = await adminAgent.get("/api/admin/summary").query({
    employeeId: "9551",
    vehiclePlate: "TRC2222",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(filteredSummary.status, 200);
  assert.equal(filteredSummary.body.summary.length, 1);
  assert.equal(filteredSummary.body.summary[0].workedHours, "08:00");
});

test("registros e trocas na virada do dia usam o horario de Sao Paulo", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerVehicle(adminAgent, "DIA1111", "Veiculo antes da meia-noite", 100);
  await registerVehicle(adminAgent, "DIA2222", "Veiculo depois da meia-noite", 200);
  await registerEmployee(adminAgent, "9561");

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "9561", "senha-funcionario");

  const entryResponse = await createRecord(employeeAgent, {
    recordedAt: "2026-08-05T02:30:00.000Z",
    localDate: undefined,
    localTime: undefined,
    vehiclePlate: "DIA1111",
    vehicleKm: 100,
  });
  assert.equal(entryResponse.status, 201);
  assert.equal(entryResponse.body.record.local_date, "04/08/2026");
  assert.equal(entryResponse.body.record.local_time, "23:30:00");

  const transferResponse = await createVehicleTransfer(employeeAgent, {
    recordedAt: "2026-08-05T03:10:00.000Z",
    localDate: undefined,
    localTime: undefined,
    fromVehiclePlate: "DIA1111",
    fromVehicleKm: 120,
    toVehiclePlate: "DIA2222",
    toVehicleKm: 200,
  });
  assert.equal(transferResponse.status, 201);
  assert.equal(transferResponse.body.transfer.local_date, "05/08/2026");
  assert.equal(transferResponse.body.transfer.local_time, "00:10:00");
});

test("backend rejeita troca de veiculo sem jornada ativa", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerVehicle(adminAgent, "SEM1111", "Veiculo 1", 100);
  await registerVehicle(adminAgent, "SEM2222", "Veiculo 2", 200);
  await registerEmployee(adminAgent, "9552");

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "9552", "senha-funcionario");

  const transferResponse = await createVehicleTransfer(employeeAgent, {
    fromVehiclePlate: "SEM1111",
    fromVehicleKm: 100,
    toVehiclePlate: "SEM2222",
    toVehicleKm: 200,
  });
  assert.equal(transferResponse.status, 409);
  assert.match(transferResponse.body.error, /inicie a jornada/i);
});

test("backend rejeita troca para veiculo que ja esta em uso por outro funcionario", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerVehicle(adminAgent, "ATV1111", "Atual", 100);
  await registerVehicle(adminAgent, "ATV2222", "Ocupado", 200);
  await registerEmployee(adminAgent, "9553");
  await registerEmployee(adminAgent, "9554");

  const firstEmployeeAgent = request.agent(app);
  await login(firstEmployeeAgent, "9553", "senha-funcionario");
  assert.equal((await createRecord(firstEmployeeAgent, {
    vehiclePlate: "ATV1111",
    vehicleKm: 100,
  })).status, 201);

  const secondEmployeeAgent = request.agent(app);
  await login(secondEmployeeAgent, "9554", "senha-funcionario");
  assert.equal((await createRecord(secondEmployeeAgent, {
    vehiclePlate: "ATV2222",
    vehicleKm: 200,
  })).status, 201);

  const blockedTransfer = await createVehicleTransfer(firstEmployeeAgent, {
    fromVehiclePlate: "ATV1111",
    fromVehicleKm: 120,
    toVehiclePlate: "ATV2222",
    toVehicleKm: 200,
  });
  assert.equal(blockedTransfer.status, 409);
  assert.match(blockedTransfer.body.error, /ja esta em uso/i);
});

test("filtros administrativos recortam registros e resumo por funcionario, veiculo e periodo", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);

  await registerEmployee(adminAgent, "9101");
  await registerEmployee(adminAgent, "9102");
  await registerVehicle(adminAgent, "AAA1B11", "Veiculo A", 100);
  await registerVehicle(adminAgent, "BBB2C22", "Veiculo B", 200);
  await registerVehicle(adminAgent, "CCC3D33", "Veiculo C", 300);

  const employeeOneAgent = request.agent(app);
  await login(employeeOneAgent, "9101", "senha-funcionario");
  assert.equal((await createRecord(employeeOneAgent, {
    recordedAt: "2026-03-10T08:00:00.000Z",
    localDate: "10/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "AAA1B11",
    vehicleKm: 100,
  })).status, 201);

  assert.equal((await createRecord(employeeOneAgent, {
    action: "Saida",
    recordedAt: "2026-03-10T17:00:00.000Z",
    localDate: "10/03/2026",
    localTime: "17:00:00",
    vehiclePlate: "AAA1B11",
    vehicleKm: 140,
  })).status, 201);

  assert.equal((await createRecord(employeeOneAgent, {
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "BBB2C22",
    vehicleKm: 200,
  })).status, 201);

  const employeeTwoAgent = request.agent(app);
  await login(employeeTwoAgent, "9102", "senha-funcionario");
  assert.equal((await createRecord(employeeTwoAgent, {
    recordedAt: "2026-03-11T09:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "09:00:00",
    vehiclePlate: "CCC3D33",
    vehicleKm: 300,
  })).status, 201);

  const filteredRecords = await adminAgent.get("/api/me/records").query({
    employeeId: "9101",
    vehiclePlate: "BBB2C22",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(filteredRecords.status, 200);
  assert.equal(filteredRecords.body.records.length, 1);
  assert.equal(filteredRecords.body.records[0].employee_id, "9101");
  assert.equal(filteredRecords.body.records[0].vehicle_plate, "BBB2C22");

  const filteredSummary = await adminAgent.get("/api/admin/summary").query({
    employeeId: "9101",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(filteredSummary.status, 200);
  assert.equal(filteredSummary.body.summary.length, 1);
  assert.equal(filteredSummary.body.summary[0].employeeId, "9101");
  assert.equal(filteredSummary.body.summary[0].vehiclePlate, "BBB2C22");
});

test("resumo administrativo sem filtro de data mostra apenas as ultimas 48 horas", async () => {
  const realDateNow = Date.now;
  Date.now = () => new Date("2026-03-12T12:00:00.000Z").getTime();

  try {
    const adminAgent = request.agent(app);
    await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);

    await registerEmployee(adminAgent, "9151");
    await registerVehicle(adminAgent, "LIM1234", "Veiculo janela", 1000);

    const employeeAgent = request.agent(app);
    await login(employeeAgent, "9151", "senha-funcionario");

    assert.equal((await createRecord(employeeAgent, {
      recordedAt: "2026-03-10T08:00:00.000Z",
      localDate: "10/03/2026",
      localTime: "08:00:00",
      vehiclePlate: "LIM1234",
      vehicleKm: 1000,
    })).status, 201);

    assert.equal((await createRecord(employeeAgent, {
      action: "Saida",
      recordedAt: "2026-03-10T11:00:00.000Z",
      localDate: "10/03/2026",
      localTime: "11:00:00",
      vehiclePlate: "LIM1234",
      vehicleKm: 1040,
    })).status, 201);

    assert.equal((await createRecord(employeeAgent, {
      recordedAt: "2026-03-11T09:00:00.000Z",
      localDate: "11/03/2026",
      localTime: "09:00:00",
      vehiclePlate: "LIM1234",
      vehicleKm: 1050,
    })).status, 201);

    const summaryResponse = await adminAgent.get("/api/admin/summary");
    assert.equal(summaryResponse.status, 200);
    assert.equal(summaryResponse.body.windowHours, 48);
    assert.equal(summaryResponse.body.summary.length, 1);
    assert.equal(summaryResponse.body.summary[0].localDate, "11/03/2026");
  } finally {
    Date.now = realDateNow;
  }
});

test("resumo administrativo nao perde jornada noturna quando a entrada fica fora da janela de 48h", async () => {
  const realDateNow = Date.now;
  Date.now = () => new Date("2026-03-12T12:00:00.000Z").getTime();

  try {
    const adminAgent = request.agent(app);
    await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);

    await registerEmployee(adminAgent, "9161");
    await registerVehicle(adminAgent, "MAD1234", "Veiculo madrugada", 2000);

    const employeeAgent = request.agent(app);
    await login(employeeAgent, "9161", "senha-funcionario");

    assert.equal((await createRecord(employeeAgent, {
      recordedAt: "2026-03-10T00:30:00.000Z",
      localDate: "09/03/2026",
      localTime: "21:30:00",
      vehiclePlate: "MAD1234",
      vehicleKm: 2000,
    })).status, 201);

    assert.equal((await createRecord(employeeAgent, {
      action: "Saida",
      recordedAt: "2026-03-10T13:00:00.000Z",
      localDate: "10/03/2026",
      localTime: "10:00:00",
      vehiclePlate: "MAD1234",
      vehicleKm: 2050,
    })).status, 201);

    const summaryResponse = await adminAgent.get("/api/admin/summary");
    assert.equal(summaryResponse.status, 200);
    assert.equal(summaryResponse.body.summary.length, 1);
    assert.equal(summaryResponse.body.summary[0].localDate, "09/03/2026");
    assert.equal(summaryResponse.body.summary[0].workedHours, "12:30");
  } finally {
    Date.now = realDateNow;
  }
});

test("resumo administrativo retorna totais agregados por funcionario e da empresa", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "9171");
  await registerEmployee(adminAgent, "9172");
  await registerVehicle(adminAgent, "AGR1111", "Veiculo agregado 1", 1000);
  await registerVehicle(adminAgent, "AGR2222", "Veiculo agregado 2", 500);

  const employeeOneAgent = request.agent(app);
  await login(employeeOneAgent, "9171", "senha-funcionario");

  assert.equal((await createRecord(employeeOneAgent, {
    recordedAt: "2026-04-01T08:00:00.000Z", localDate: "01/04/2026", localTime: "08:00:00",
    vehiclePlate: "AGR1111", vehicleKm: 1000,
  })).status, 201);
  assert.equal((await createRecord(employeeOneAgent, {
    action: "Saida", recordedAt: "2026-04-01T16:00:00.000Z", localDate: "01/04/2026", localTime: "16:00:00",
    vehiclePlate: "AGR1111", vehicleKm: 1050,
  })).status, 201);
  assert.equal((await createRecord(employeeOneAgent, {
    recordedAt: "2026-04-02T08:00:00.000Z", localDate: "02/04/2026", localTime: "08:00:00",
    vehiclePlate: "AGR1111", vehicleKm: 1050,
  })).status, 201);
  assert.equal((await createRecord(employeeOneAgent, {
    action: "Saida", recordedAt: "2026-04-02T16:00:00.000Z", localDate: "02/04/2026", localTime: "16:00:00",
    vehiclePlate: "AGR1111", vehicleKm: 1100,
  })).status, 201);

  const employeeTwoAgent = request.agent(app);
  await login(employeeTwoAgent, "9172", "senha-funcionario");

  assert.equal((await createRecord(employeeTwoAgent, {
    recordedAt: "2026-04-01T08:00:00.000Z", localDate: "01/04/2026", localTime: "08:00:00",
    vehiclePlate: "AGR2222", vehicleKm: 500,
  })).status, 201);
  assert.equal((await createRecord(employeeTwoAgent, {
    action: "Saida", recordedAt: "2026-04-01T18:00:00.000Z", localDate: "01/04/2026", localTime: "18:00:00",
    vehiclePlate: "AGR2222", vehicleKm: 540,
  })).status, 201);

  const summaryResponse = await adminAgent.get("/api/admin/summary?dateFrom=2026-04-01&dateTo=2026-04-02");
  assert.equal(summaryResponse.status, 200);
  assert.equal(summaryResponse.body.summary.length, 3);

  const aggregates = summaryResponse.body.aggregates;
  assert.equal(aggregates.length, 2);

  const employeeOneTotals = aggregates.find((item) => item.employeeId === "9171");
  assert.equal(employeeOneTotals.daysWorked, 2);
  assert.equal(employeeOneTotals.workedHours, "16:00");
  assert.equal(employeeOneTotals.overtimeHours, "00:00");
  assert.equal(employeeOneTotals.dailyKm, 100);

  const employeeTwoTotals = aggregates.find((item) => item.employeeId === "9172");
  assert.equal(employeeTwoTotals.daysWorked, 1);
  assert.equal(employeeTwoTotals.workedHours, "10:00");
  assert.equal(employeeTwoTotals.overtimeHours, "02:00");
  assert.equal(employeeTwoTotals.dailyKm, 40);

  const companyTotals = summaryResponse.body.companyTotals;
  assert.equal(companyTotals.employeeCount, 2);
  assert.equal(companyTotals.workedHours, "26:00");
  assert.equal(companyTotals.overtimeHours, "02:00");
  assert.equal(companyTotals.dailyKm, 140);
});

test("exportacoes CSV e XLSX respeitam os filtros administrativos", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "9201");
  await registerEmployee(adminAgent, "9202");
  await registerVehicle(adminAgent, "FILT123", "Filtro principal", 400);
  await registerVehicle(adminAgent, "OUTR456", "Outro veiculo", 500);

  const employeeOneAgent = request.agent(app);
  await login(employeeOneAgent, "9201", "senha-funcionario");

  assert.equal((await createRecord(employeeOneAgent, {
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "FILT123",
    vehicleKm: 400,
  })).status, 201);

  const employeeTwoAgent = request.agent(app);
  await login(employeeTwoAgent, "9202", "senha-funcionario");

  assert.equal((await createRecord(employeeTwoAgent, {
    recordedAt: "2026-03-12T08:00:00.000Z",
    localDate: "12/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "OUTR456",
    vehicleKm: 500,
  })).status, 201);

  const csvResponse = await adminAgent.get("/api/admin/export.csv").query({
    vehiclePlate: "FILT123",
    dateFrom: "2026-03-11",
    dateTo: "2026-03-11",
  });
  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.text, /FILT123/);
  assert.doesNotMatch(csvResponse.text, /OUTR456/);
  assert.doesNotMatch(csvResponse.text, /Google Maps/);
  assert.doesNotMatch(csvResponse.text, /Latitude/);
  assert.doesNotMatch(csvResponse.text, /Longitude/);

  const xlsxResponse = await adminAgent
    .get("/api/admin/export.xlsx")
    .query({
      vehiclePlate: "FILT123",
      dateFrom: "2026-03-11",
      dateTo: "2026-03-11",
    })
    .buffer(true)
    .parse(binaryParser);

  assert.equal(xlsxResponse.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsxResponse.body);
  const registros = workbook.getWorksheet("Registros");
  const legenda = workbook.getWorksheet("Legenda");
  assert.ok(registros);
  assert.ok(legenda);
  assert.equal(registros.rowCount, 2);
  assert.equal(registros.getRow(2).getCell(6).value, "FILT123");
  assert.deepEqual(registros.getRow(1).values.slice(1), [
    "Funcionario",
    "Matricula",
    "Acao",
    "Data",
    "Hora",
    "Placa do veiculo",
    "KM do veiculo",
  ]);
  const legendaText = legenda.getSheetValues().flat().filter(Boolean).join(" | ");
  assert.doesNotMatch(legendaText, /Google Maps/);
  assert.doesNotMatch(legendaText, /Latitude/);
  assert.doesNotMatch(legendaText, /Longitude/);
});

test("admin consegue gerar link temporario para exportacao XLSX externa", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "9601");
  await registerVehicle(adminAgent, "EXT1234", "Exportacao externa", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "9601", "senha-funcionario");

  const recordResponse = await createRecord(employeeAgent, {
    recordedAt: "2026-03-12T08:00:00.000Z",
    localDate: "12/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "EXT1234",
    vehicleKm: 1200,
  });
  assert.equal(recordResponse.status, 201);

  const linkResponse = await adminAgent.post("/api/admin/export.xlsx/link").send({
    employeeId: "9601",
    vehiclePlate: "EXT1234",
    dateFrom: "2026-03-12",
    dateTo: "2026-03-12",
  });
  assert.equal(linkResponse.status, 200);
  assert.match(linkResponse.body.url, /^\/api\/admin\/export\.xlsx\/direct\?token=/);

  const downloadResponse = await request(app)
    .get(linkResponse.body.url)
    .buffer(true)
    .parse(binaryParser);

  assert.equal(downloadResponse.status, 200);
  assert.match(downloadResponse.headers["content-type"], /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.equal(
    downloadResponse.headers["x-export-filters"],
    "?employeeId=9601&vehiclePlate=EXT1234&dateFrom=2026-03-12&dateTo=2026-03-12"
  );
  assert.ok(downloadResponse.body.length > 0);
});

test("painel de pendencias exige admin", async () => {
  const employeeAgent = request.agent(app);
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "9701");
  await login(employeeAgent, "9701", "senha-funcionario");

  const response = await employeeAgent.get("/api/admin/alerts");
  assert.equal(response.status, 403);
});

test("pendencias apontam jornada aberta e ignoram funcionario com jornada fechada", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerVehicle(adminAgent, "PEN1234", "Van pendencias", 1000);
  await registerVehicle(adminAgent, "PEN5678", "Van jornada fechada", 1100);
  await registerEmployee(adminAgent, "9702", "Esqueceu o Termino");
  await registerEmployee(adminAgent, "9703", "Jornada completa");

  const openAgent = request.agent(app);
  await login(openAgent, "9702", "senha-funcionario");
  const openEntryAt = new Date(Date.now() - 20 * 60 * 60 * 1000);
  assert.equal((await createRecord(openAgent, {
    action: "Entrada",
    recordedAt: openEntryAt.toISOString(),
    localDate: "20/07/2026",
    localTime: "06:00:00",
    vehiclePlate: "PEN1234",
    vehicleKm: 1000,
  })).status, 201);

  const closedAgent = request.agent(app);
  await login(closedAgent, "9703", "senha-funcionario");
  const closedEntryAt = new Date(Date.now() - 8 * 60 * 60 * 1000);
  const closedExitAt = new Date(Date.now() - 1 * 60 * 60 * 1000);
  assert.equal((await createRecord(closedAgent, {
    action: "Entrada",
    recordedAt: closedEntryAt.toISOString(),
    localDate: "21/07/2026",
    localTime: "08:00:00",
    vehiclePlate: "PEN5678",
    vehicleKm: 1100,
  })).status, 201);
  assert.equal((await createRecord(closedAgent, {
    action: "Saida para almoco",
    recordedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    localDate: "21/07/2026",
    localTime: "11:00:00",
    vehiclePlate: "PEN5678",
    vehicleKm: 1150,
  })).status, 201);
  assert.equal((await createRecord(closedAgent, {
    action: "Retorno do almoco",
    recordedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    localDate: "21/07/2026",
    localTime: "12:00:00",
    vehiclePlate: "PEN5678",
    vehicleKm: 1150,
  })).status, 201);
  assert.equal((await createRecord(closedAgent, {
    action: "Saida",
    recordedAt: closedExitAt.toISOString(),
    localDate: "21/07/2026",
    localTime: "16:00:00",
    vehiclePlate: "PEN5678",
    vehicleKm: 1200,
  })).status, 201);

  const response = await adminAgent.get("/api/admin/alerts");
  assert.equal(response.status, 200);

  const openJourneyAlerts = response.body.alerts.filter((alert) => alert.type === "jornada_aberta");
  assert.equal(openJourneyAlerts.length, 1);
  assert.equal(openJourneyAlerts[0].employeeId, "9702");
  assert.equal(openJourneyAlerts[0].severity, "alta");
  assert.ok(response.body.counts.alta >= 1);
  assert.ok(!response.body.alerts.some((alert) => alert.employeeId === "9703" && alert.type !== "sem_batida"));
});

test("pendencias respeitam o filtro de matricula", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerVehicle(adminAgent, "PEN9994", "Van filtro A", 1000);
  await registerVehicle(adminAgent, "PEN9995", "Van filtro B", 1000);
  await registerEmployee(adminAgent, "9704", "Aberta A");
  await registerEmployee(adminAgent, "9705", "Aberta B");

  for (const [employeeId, plate] of [["9704", "PEN9994"], ["9705", "PEN9995"]]) {
    const agent = request.agent(app);
    await login(agent, employeeId, "senha-funcionario");
    assert.equal((await createRecord(agent, {
      action: "Entrada",
      recordedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
      localDate: "22/07/2026",
      localTime: "06:00:00",
      vehiclePlate: plate,
      vehicleKm: 1000,
    })).status, 201);
  }

  const response = await adminAgent.get("/api/admin/alerts").query({ employeeId: "9704" });
  assert.equal(response.status, 200);
  assert.ok(response.body.alerts.length > 0);
  assert.ok(response.body.alerts.every((alert) => alert.employeeId === "9704"));
});

const WEEK_SUMMARY_HOUR_MS = 60 * 60 * 1000;
const weekSummaryLocalDateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
const weekSummaryLocalTimeFormatter = new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium", timeZone: "America/Sao_Paulo" });

function hoursAgoPunchFields(hours) {
  const date = new Date(Date.now() - hours * WEEK_SUMMARY_HOUR_MS);
  return {
    recordedAt: date.toISOString(),
    localDate: weekSummaryLocalDateFormatter.format(date),
    localTime: weekSummaryLocalTimeFormatter.format(date),
  };
}

test("resumo semanal do funcionario comeca zerado sem registros", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "9801", "Sem Registro");

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "9801", "senha-funcionario");

  const response = await employeeAgent.get("/api/me/summary");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    daysWorked: 0,
    workedHours: "00:00",
    overtimeHours: "00:00",
    windowDays: 7,
    dailyWorkloadMinutes: 480,
  });
});

test("resumo semanal do funcionario soma jornada fechada de hoje e ignora registro fora da janela", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "9802", "Semana Cheia");
  await registerVehicle(adminAgent, "SEM9802", "Veiculo semana", 1000);

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "9802", "senha-funcionario");

  assert.equal((await employeeAgent.post("/api/me/records").send({
    action: "Entrada",
    ...hoursAgoPunchFields(8),
    vehiclePlate: "SEM9802",
    vehicleKm: 1000,
    ...defaultLocation,
  })).status, 201);
  assert.equal((await employeeAgent.post("/api/me/records").send({
    action: "Saida",
    ...hoursAgoPunchFields(0.5),
    vehiclePlate: "SEM9802",
    vehicleKm: 1080,
    ...defaultLocation,
  })).status, 201);

  const response = await employeeAgent.get("/api/me/summary");
  assert.equal(response.status, 200);
  assert.equal(response.body.daysWorked, 1);
  assert.equal(response.body.workedHours, "07:30");
  assert.equal(response.body.overtimeHours, "00:00");
  assert.equal(response.body.dailyWorkloadMinutes, 480);
});

test("admin recebe resumo semanal zerado ao chamar /api/me/summary", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);

  const response = await adminAgent.get("/api/me/summary");
  assert.equal(response.status, 200);
  assert.equal(response.body.daysWorked, 0);
  assert.equal(response.body.workedHours, "00:00");
});

test("resumo semanal usa carga horaria de 9:18 para a matricula 2", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "2");

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "2", "senha-funcionario");

  const response = await employeeAgent.get("/api/me/summary");
  assert.equal(response.status, 200);
  assert.equal(response.body.dailyWorkloadMinutes, 558);
});
