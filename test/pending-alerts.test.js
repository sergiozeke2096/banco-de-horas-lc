const assert = require("node:assert/strict");
const { test } = require("node:test");
const { detectPendingAlerts, summarizeAlerts } = require("../lib/pending-alerts");

const APP_TIME_ZONE = "America/Sao_Paulo";
const localDateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: APP_TIME_ZONE });
const localTimeFormatter = new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium", timeZone: APP_TIME_ZONE });
const HOUR_MS = 60 * 60 * 1000;
// Quarta-feira, 12:00 no fuso da operacao. Data fixa para os testes de dia util.
const NOW = Date.UTC(2026, 7, 5, 15, 0, 0);

function hoursAgo(hours) {
  return new Date(NOW - hours * HOUR_MS);
}

function buildRecord(employeeId, action, recordedAt, employeeName = `Funcionario ${employeeId}`) {
  return {
    employee_id: employeeId,
    employee_name: employeeName,
    action,
    recorded_at: recordedAt.toISOString(),
    local_date: localDateFormatter.format(recordedAt),
    local_time: localTimeFormatter.format(recordedAt),
    vehicle_plate: "ABC1D23",
    vehicle_km: null,
  };
}

function detect(records, options = {}) {
  return detectPendingAlerts({ records, employees: [], now: NOW, ...options });
}

function typesOf(alerts) {
  return alerts.map((alert) => alert.type);
}

test("aponta jornada em aberto quando passa do limite sem o Termino", () => {
  const alerts = detect([buildRecord("1001", "Entrada", hoursAgo(15))]);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "jornada_aberta");
  assert.equal(alerts[0].severity, "alta");
  assert.equal(alerts[0].employeeId, "1001");
  assert.equal(alerts[0].elapsed, "15:00");
});

test("nao aponta jornada em aberto dentro do expediente normal", () => {
  const alerts = detect([buildRecord("1001", "Entrada", hoursAgo(2))]);

  assert.deepEqual(alerts, []);
});

test("aponta almoco sem retorno depois do limite", () => {
  const alerts = detect([
    buildRecord("1002", "Entrada", hoursAgo(5)),
    buildRecord("1002", "Saida para almoco", hoursAgo(4)),
  ]);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, "almoco_sem_retorno");
  assert.equal(alerts[0].severity, "alta");
  assert.equal(alerts[0].elapsed, "04:00");
});

test("nao aponta almoco sem retorno dentro do intervalo normal", () => {
  const alerts = detect([
    buildRecord("1002", "Entrada", hoursAgo(3)),
    buildRecord("1002", "Saida para almoco", hoursAgo(1)),
  ]);

  assert.deepEqual(alerts, []);
});

test("jornada completa e regular nao gera pendencia", () => {
  const alerts = detect([
    buildRecord("1003", "Entrada", hoursAgo(9)),
    buildRecord("1003", "Saida para almoco", hoursAgo(5)),
    buildRecord("1003", "Retorno do almoco", hoursAgo(4)),
    buildRecord("1003", "Saida", hoursAgo(1)),
  ]);

  assert.deepEqual(alerts, []);
});

test("aponta jornada fechada acima do limite de horas", () => {
  const alerts = detect([
    buildRecord("1004", "Entrada", hoursAgo(14)),
    buildRecord("1004", "Saida para almoco", hoursAgo(8)),
    buildRecord("1004", "Retorno do almoco", hoursAgo(7)),
    buildRecord("1004", "Saida", hoursAgo(0.5)),
  ]);

  assert.deepEqual(typesOf(alerts), ["jornada_longa"]);
  assert.equal(alerts[0].severity, "media");
  assert.equal(alerts[0].elapsed, "12:30");
});

test("aponta dia sem intervalo de almoco", () => {
  const alerts = detect([
    buildRecord("1005", "Entrada", hoursAgo(8)),
    buildRecord("1005", "Saida", hoursAgo(1)),
  ]);

  assert.deepEqual(typesOf(alerts), ["sem_intervalo"]);
  assert.equal(alerts[0].elapsed, "07:00");
});

test("aponta sequencia inconsistente deixada por edicao do admin", () => {
  const alerts = detect([
    buildRecord("1006", "Entrada", hoursAgo(10)),
    buildRecord("1006", "Entrada", hoursAgo(9)),
    buildRecord("1006", "Saida", hoursAgo(8)),
  ]);

  assert.deepEqual(typesOf(alerts), ["sequencia_inconsistente"]);
  assert.equal(alerts[0].severity, "media");
});

test("aponta retorno de almoco sem a saida correspondente", () => {
  const alerts = detect([
    buildRecord("1007", "Entrada", hoursAgo(6)),
    buildRecord("1007", "Retorno do almoco", hoursAgo(5)),
    buildRecord("1007", "Saida", hoursAgo(4)),
  ]);

  assert.deepEqual(typesOf(alerts), ["sequencia_inconsistente"]);
});

test("lista dias uteis sem nenhuma batida do funcionario", () => {
  const oldJourney = [
    buildRecord("1008", "Entrada", hoursAgo(24 * 10 + 9)),
    buildRecord("1008", "Saida para almoco", hoursAgo(24 * 10 + 5)),
    buildRecord("1008", "Retorno do almoco", hoursAgo(24 * 10 + 4)),
    buildRecord("1008", "Saida", hoursAgo(24 * 10 + 1)),
  ];
  const employees = [
    { employeeId: "1008", name: "Funcionario 1008", role: "employee", createdAt: new Date(NOW - 60 * 24 * HOUR_MS).toISOString() },
  ];

  const alerts = detect(oldJourney, { employees });

  assert.deepEqual(typesOf(alerts), ["sem_batida"]);
  assert.equal(alerts[0].severity, "baixa");
  // Sabado e domingo ficam de fora da contagem.
  assert.equal(alerts[0].detail, "Nenhum registro em 5 dias uteis: 29/07, 30/07, 31/07, 03/08, 04/08.");
});

test("nao cobra batida de funcionario que nunca registrou ponto", () => {
  const employees = [
    { employeeId: "1009", name: "Recem cadastrado", role: "employee", createdAt: new Date(NOW - 60 * 24 * HOUR_MS).toISOString() },
  ];

  assert.deepEqual(detect([], { employees }), []);
});

test("nao cobra dias anteriores ao cadastro do funcionario", () => {
  const records = [buildRecord("1010", "Entrada", hoursAgo(24 * 10 + 9)), buildRecord("1010", "Saida", hoursAgo(24 * 10 + 1))];
  const employees = [
    { employeeId: "1010", name: "Funcionario 1010", role: "employee", createdAt: new Date(NOW - 2 * 24 * HOUR_MS).toISOString() },
  ];

  const alerts = detect(records, { employees }).filter((alert) => alert.type === "sem_batida");

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].detail, "Nenhum registro em 1 dia util: 04/08.");
});

test("ignora o admin na checagem de dias sem batida", () => {
  const employees = [{ employeeId: "admin", name: "Admin", role: "admin", createdAt: new Date(NOW - 60 * 24 * HOUR_MS).toISOString() }];

  assert.deepEqual(detect([], { employees }), []);
});

test("ordena as pendencias colocando as urgentes primeiro", () => {
  const alerts = detect([
    buildRecord("2001", "Entrada", hoursAgo(8)),
    buildRecord("2001", "Saida", hoursAgo(1)),
    buildRecord("2002", "Entrada", hoursAgo(20)),
  ]);

  assert.deepEqual(typesOf(alerts), ["jornada_aberta", "sem_intervalo"]);
});

test("summarizeAlerts conta por severidade", () => {
  const counts = summarizeAlerts([
    { severity: "alta" },
    { severity: "alta" },
    { severity: "media" },
    { severity: "baixa" },
  ]);

  assert.deepEqual(counts, { total: 4, alta: 2, media: 1, baixa: 1 });
});

test("limites podem ser ajustados por parametro", () => {
  const records = [buildRecord("3001", "Entrada", hoursAgo(10))];

  assert.deepEqual(detect(records), []);
  assert.deepEqual(typesOf(detect(records, { thresholds: { openJourneyHours: 9 } })), ["jornada_aberta"]);
});
