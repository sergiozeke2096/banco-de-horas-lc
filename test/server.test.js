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

async function registerEmployee(agent, employeeId = "1001") {
  const response = await agent.post("/api/admin/employees").send({
    name: "Funcionario Teste",
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
    ...overrides,
  };

  return agent.post("/api/me/records").send(payload);
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

test("backend rejeita uma saida como primeira batida do dia", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "3001");

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "3001", "senha-funcionario");

  const response = await employeeAgent.post("/api/me/records").send({
    action: "Saida",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "ABC1D23",
    vehicleKm: 125430,
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /primeiro registro do dia deve ser uma Entrada/i);
});

test("backend aceita sequencia valida completa de jornada", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "4001");

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "4001", "senha-funcionario");

  const records = [
    { action: "Entrada", recordedAt: "2026-03-11T08:00:00.000Z", localTime: "08:00:00" },
    { action: "Saida para almoco", recordedAt: "2026-03-11T12:00:00.000Z", localTime: "12:00:00" },
    { action: "Retorno do almoco", recordedAt: "2026-03-11T13:00:00.000Z", localTime: "13:00:00" },
    { action: "Saida", recordedAt: "2026-03-11T17:00:00.000Z", localTime: "17:00:00" },
  ];

  for (const record of records) {
    const response = await employeeAgent.post("/api/me/records").send({
      ...record,
      localDate: "11/03/2026",
      vehiclePlate: "DEF4G56",
      vehicleKm: 1000,
    });

    assert.equal(response.status, 201);
  }

  const listResponse = await employeeAgent.get("/api/me/records");
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.records.length, 4);
});

test("backend aceita jornada noturna cruzando meia-noite e consolida no dia de entrada", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "4010");

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "4010", "senha-funcionario");

  const entryResponse = await employeeAgent.post("/api/me/records").send({
    action: "Entrada",
    recordedAt: "2026-03-11T22:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "22:00:00",
    vehiclePlate: "NOT1234",
    vehicleKm: 1500,
  });
  assert.equal(entryResponse.status, 201);

  const exitResponse = await employeeAgent.post("/api/me/records").send({
    action: "Saida",
    recordedAt: "2026-03-12T06:00:00.000Z",
    localDate: "12/03/2026",
    localTime: "06:00:00",
    vehiclePlate: "NOT1234",
    vehicleKm: 1515,
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

  const employeeAgent = request.agent(app);
  await login(employeeAgent, "5001", "senha-funcionario");

  const firstEntry = await employeeAgent.post("/api/me/records").send({
    action: "Entrada",
    recordedAt: "2026-03-11T08:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "08:00:00",
    vehiclePlate: "HIJ7K89",
    vehicleKm: 2000,
  });
  assert.equal(firstEntry.status, 201);

  const lunchStart = await employeeAgent.post("/api/me/records").send({
    action: "Saida para almoco",
    recordedAt: "2026-03-11T12:00:00.000Z",
    localDate: "11/03/2026",
    localTime: "12:00:00",
    vehiclePlate: "HIJ7K89",
    vehicleKm: 2010,
  });
  assert.equal(lunchStart.status, 201);

  const invalidDuplicate = await employeeAgent.post("/api/me/records").send({
    action: "Saida para almoco",
    recordedAt: "2026-03-11T12:30:00.000Z",
    localDate: "11/03/2026",
    localTime: "12:30:00",
    vehiclePlate: "HIJ7K89",
    vehicleKm: 2012,
  });

  assert.equal(invalidDuplicate.status, 409);
  assert.match(invalidDuplicate.body.error, /Retorno do almoco/i);
});

test("admin consegue editar funcionario e sincronizar identificacao nos registros", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  const employee = await registerEmployee(adminAgent, "6001");

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

test("filtros administrativos recortam registros e resumo por funcionario, veiculo e periodo", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);

  await registerEmployee(adminAgent, "9101");
  await registerEmployee(adminAgent, "9102");

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

test("exportacoes CSV e XLSX respeitam os filtros administrativos", async () => {
  const adminAgent = request.agent(app);
  await login(adminAgent, process.env.ADMIN_NAME, process.env.ADMIN_PASSWORD);
  await registerEmployee(adminAgent, "9201");
  await registerEmployee(adminAgent, "9202");

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
