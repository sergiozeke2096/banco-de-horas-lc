const ExcelJS = require("exceljs");
const MAX_ACTION_SLOTS = 5;
const DEFAULT_DAILY_WORKLOAD_MINUTES = 8 * 60;
const EVERTON_RICARDO_DAILY_WORKLOAD_MINUTES = (9 * 60) + 18;
const DAILY_WORKLOAD_MINUTES_BY_EMPLOYEE_ID = new Map([
  ["2", EVERTON_RICARDO_DAILY_WORKLOAD_MINUTES],
]);
const DAILY_WORKLOAD_MINUTES_BY_EMPLOYEE_NAME = new Map([
  ["everton ricardo", EVERTON_RICARDO_DAILY_WORKLOAD_MINUTES],
]);

function formatMinutes(totalMinutes) {
  const safeMinutes = Math.max(Math.round(totalMinutes), 0);
  const hours = String(Math.floor(safeMinutes / 60)).padStart(2, "0");
  const minutes = String(safeMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getExcelColumnName(columnNumber) {
  let dividend = columnNumber;
  let columnName = "";

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }

  return columnName;
}

function normalizeEmployeeLookupValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getDailyWorkloadMinutes(employeeId, employeeName) {
  const normalizedEmployeeId = String(employeeId || "").trim();
  const normalizedEmployeeName = normalizeEmployeeLookupValue(employeeName);

  return (
    DAILY_WORKLOAD_MINUTES_BY_EMPLOYEE_ID.get(normalizedEmployeeId) ||
    DAILY_WORKLOAD_MINUTES_BY_EMPLOYEE_NAME.get(normalizedEmployeeName) ||
    DEFAULT_DAILY_WORKLOAD_MINUTES
  );
}

function compareRecordsForSummary(left, right) {
  const employeeCompare = String(left.employee_id || "").localeCompare(String(right.employee_id || ""), "pt-BR");
  if (employeeCompare !== 0) {
    return employeeCompare;
  }

  const recordedAtCompare = String(left.recorded_at || "").localeCompare(String(right.recorded_at || ""), "pt-BR");
  if (recordedAtCompare !== 0) {
    return recordedAtCompare;
  }

  const dateCompare = String(left.local_date || "").localeCompare(String(right.local_date || ""), "pt-BR");
  if (dateCompare !== 0) {
    return dateCompare;
  }

  return String(left.local_time || "").localeCompare(String(right.local_time || ""), "pt-BR");
}

function getNumericKm(value) {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }

  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? null : numericValue;
}

function addVehicleObservation(bucket, vehiclePlate, vehicleKm) {
  const normalizedPlate = String(vehiclePlate || "Nao informado").trim() || "Nao informado";
  bucket.vehiclePlates.add(normalizedPlate);

  const numericKm = getNumericKm(vehicleKm);
  if (numericKm === null) {
    return;
  }

  const currentStats = bucket.vehicleKmByPlate.get(normalizedPlate) || { min: null, max: null };
  currentStats.min = currentStats.min === null ? numericKm : Math.min(currentStats.min, numericKm);
  currentStats.max = currentStats.max === null ? numericKm : Math.max(currentStats.max, numericKm);
  bucket.vehicleKmByPlate.set(normalizedPlate, currentStats);
}

function addWorkedMs(bucket, fromTimestamp, toTimestamp) {
  if (!fromTimestamp || !toTimestamp) {
    return;
  }

  const diffMs = new Date(toTimestamp).getTime() - new Date(fromTimestamp).getTime();
  if (Number.isNaN(diffMs) || diffMs <= 0) {
    return;
  }

  bucket.workedMs += diffMs;
}

function addIntervalMs(bucket, fromTimestamp, toTimestamp) {
  if (!fromTimestamp || !toTimestamp) {
    return;
  }

  const diffMs = new Date(toTimestamp).getTime() - new Date(fromTimestamp).getTime();
  if (Number.isNaN(diffMs) || diffMs <= 0) {
    return;
  }

  bucket.intervalMs += diffMs;
}

function getOrCreateSummaryBucket(buckets, employeeName, employeeId, workday) {
  const key = `${employeeId}::${workday}`;
  if (!buckets.has(key)) {
    buckets.set(key, {
      employeeName,
      employeeId,
      day: workday,
      entries: [],
      lunchStarts: [],
      lunchEnds: [],
      exits: [],
      workedMs: 0,
      intervalMs: 0,
      lastEventAt: null,
      vehiclePlates: new Set(),
      vehicleKmByPlate: new Map(),
    });
  }

  return buckets.get(key);
}

function computeSummary(records, vehicleTransfers = []) {
  const buckets = new Map();
  const employeeState = new Map();
  const pointEvents = [...records].map((row) => ({
    ...row,
    type: "point",
  }));
  const transferEvents = [...vehicleTransfers].map((row) => ({
    ...row,
    type: "transfer",
  }));
  const events = [...pointEvents, ...transferEvents].sort((left, right) => {
    const compare = compareRecordsForSummary(left, right);
    if (compare !== 0) {
      return compare;
    }

    if (left.type === right.type) {
      return 0;
    }

    return left.type === "point" ? -1 : 1;
  });

  for (const event of events) {
    const employeeKey = String(event.employee_id || "");
    const currentState = employeeState.get(employeeKey) || {
      workday: null,
      segmentStartedAt: null,
      activeLunchStartedAt: null,
      currentVehiclePlate: null,
    };

    if (event.type === "point") {
      if (event.action === "Entrada") {
        const bucket = getOrCreateSummaryBucket(buckets, event.employee_name, event.employee_id, event.local_date);
        addVehicleObservation(bucket, event.vehicle_plate, event.vehicle_km);
        bucket.lastEventAt = event.recorded_at;
        if (bucket.entries.length < MAX_ACTION_SLOTS) {
          bucket.entries.push({ time: event.local_time, recordedAt: event.recorded_at });
        }

        employeeState.set(employeeKey, {
          workday: event.local_date,
          segmentStartedAt: event.recorded_at,
          activeLunchStartedAt: null,
          currentVehiclePlate: event.vehicle_plate || null,
        });
        continue;
      }

      const workday = currentState.workday || event.local_date;
      const bucket = getOrCreateSummaryBucket(buckets, event.employee_name, event.employee_id, workday);
      addVehicleObservation(bucket, event.vehicle_plate, event.vehicle_km);
      bucket.lastEventAt = event.recorded_at;

      if (event.action === "Saida para almoco") {
        addWorkedMs(bucket, currentState.segmentStartedAt, event.recorded_at);
        if (bucket.lunchStarts.length < MAX_ACTION_SLOTS) {
          bucket.lunchStarts.push({ time: event.local_time, recordedAt: event.recorded_at });
        }

        employeeState.set(employeeKey, {
          workday,
          segmentStartedAt: null,
          activeLunchStartedAt: event.recorded_at,
          currentVehiclePlate: event.vehicle_plate || currentState.currentVehiclePlate,
        });
        continue;
      }

      if (event.action === "Retorno do almoco") {
        addIntervalMs(bucket, currentState.activeLunchStartedAt, event.recorded_at);
        if (bucket.lunchEnds.length < MAX_ACTION_SLOTS) {
          bucket.lunchEnds.push({ time: event.local_time, recordedAt: event.recorded_at });
        }

        employeeState.set(employeeKey, {
          workday,
          segmentStartedAt: event.recorded_at,
          activeLunchStartedAt: null,
          currentVehiclePlate: event.vehicle_plate || currentState.currentVehiclePlate,
        });
        continue;
      }

      if (event.action === "Saida") {
        addWorkedMs(bucket, currentState.segmentStartedAt, event.recorded_at);
        if (bucket.exits.length < MAX_ACTION_SLOTS) {
          bucket.exits.push({ time: event.local_time, recordedAt: event.recorded_at });
        }

        employeeState.set(employeeKey, {
          workday: null,
          segmentStartedAt: null,
          activeLunchStartedAt: null,
          currentVehiclePlate: null,
        });
      }

      continue;
    }

    const workday = currentState.workday || event.local_date;
    const bucket = getOrCreateSummaryBucket(buckets, event.employee_name, event.employee_id, workday);
    addVehicleObservation(bucket, event.from_vehicle_plate, event.from_vehicle_km);
    addVehicleObservation(bucket, event.to_vehicle_plate, event.to_vehicle_km);
    bucket.lastEventAt = event.recorded_at;

    if (currentState.segmentStartedAt && !currentState.activeLunchStartedAt) {
      addWorkedMs(bucket, currentState.segmentStartedAt, event.recorded_at);
    }

    employeeState.set(employeeKey, {
      workday,
      segmentStartedAt: currentState.activeLunchStartedAt ? null : event.recorded_at,
      activeLunchStartedAt: currentState.activeLunchStartedAt,
      currentVehiclePlate: event.to_vehicle_plate || currentState.currentVehiclePlate,
    });
  }

  return [...buckets.values()].map((item) => {
    const totalMinutes = Math.max(Math.round(item.workedMs / 60000), 0);
    const intervalMinutes = Math.max(Math.round(item.intervalMs / 60000), 0);
    const overtimeMinutes = Math.max(totalMinutes - getDailyWorkloadMinutes(item.employeeId, item.employeeName), 0);
    const dailyKm = [...item.vehicleKmByPlate.values()].reduce((total, stats) => {
      if (stats.min === null || stats.max === null) {
        return total;
      }

      return total + Math.max(stats.max - stats.min, 0);
    }, 0);
    const sortedVehiclePlates = [...item.vehiclePlates].sort((left, right) => left.localeCompare(right, "pt-BR"));

    return {
      employeeName: item.employeeName,
      employeeId: item.employeeId,
      day: item.day,
      lastEventAt: item.lastEventAt,
      vehiclePlate: sortedVehiclePlates.join(", "),
      vehiclePlates: sortedVehiclePlates,
      interval: formatMinutes(intervalMinutes),
      worked: formatMinutes(totalMinutes),
      overtime: formatMinutes(overtimeMinutes),
      workedMinutes: totalMinutes,
      overtimeMinutes,
      dailyKm,
      entries: item.entries.map((entry) => entry.time),
      lunchStarts: item.lunchStarts.map((entry) => entry.time),
      lunchEnds: item.lunchEnds.map((entry) => entry.time),
      exits: item.exits.map((entry) => entry.time),
    };
  });
}

function styleHeader(row, color) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: color },
  };
}

function applyGrid(sheet) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "D9E3F0" } },
        left: { style: "thin", color: { argb: "D9E3F0" } },
        bottom: { style: "thin", color: { argb: "D9E3F0" } },
        right: { style: "thin", color: { argb: "D9E3F0" } },
      };
    });
  });
}

function createWorkbook(records, vehicleTransfers = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Codex";
  workbook.company = "LC Transportes";
  workbook.created = new Date();

  const sortedRecords = [...records].sort((left, right) => {
    const employeeCompare = String(left.employee_id || "").localeCompare(String(right.employee_id || ""), "pt-BR");
    if (employeeCompare !== 0) return employeeCompare;

    const dateCompare = String(left.local_date || "").localeCompare(String(right.local_date || ""), "pt-BR");
    if (dateCompare !== 0) return dateCompare;

    const timeCompare = String(left.local_time || "").localeCompare(String(right.local_time || ""), "pt-BR");
    if (timeCompare !== 0) return timeCompare;

    return String(left.recorded_at || "").localeCompare(String(right.recorded_at || ""), "pt-BR");
  });

  const summaryRows = computeSummary(sortedRecords, vehicleTransfers).sort((left, right) => {
    const employeeCompare = String(left.employeeId || "").localeCompare(String(right.employeeId || ""), "pt-BR");
    if (employeeCompare !== 0) return employeeCompare;

    const dateCompare = String(left.day || "").localeCompare(String(right.day || ""), "pt-BR");
    if (dateCompare !== 0) return dateCompare;

    return String(left.vehiclePlate || "").localeCompare(String(right.vehiclePlate || ""), "pt-BR");
  });

  const registros = workbook.addWorksheet("Registros");
  const resumo = workbook.addWorksheet("Resumo");
  const resumoDetalhado = workbook.addWorksheet("Resumo Detalhado");
  const legenda = workbook.addWorksheet("Legenda");
  const summaryBaseColumns = [
    { header: "Funcionario", key: "employeeName", width: 28 },
    { header: "Matricula", key: "employeeId", width: 18 },
    { header: "Dia", key: "day", width: 14 },
    { header: "Veiculo", key: "vehiclePlate", width: 18 },
    { header: "Intervalo", key: "interval", width: 14 },
    { header: "Horas trabalhadas", key: "worked", width: 18 },
    { header: "Horas extras", key: "overtime", width: 16 },
    { header: "KM no dia", key: "dailyKm", width: 14 },
  ];
  const summaryDetailedColumns = [
    ...summaryBaseColumns.map((column) => ({ ...column })),
  ];

  registros.columns = [
    { header: "Funcionario", key: "employee_name", width: 28 },
    { header: "Matricula", key: "employee_id", width: 18 },
    { header: "Acao", key: "action", width: 24 },
    { header: "Data", key: "local_date", width: 14 },
    { header: "Hora", key: "local_time", width: 14 },
    { header: "Placa do veiculo", key: "vehicle_plate", width: 18 },
    { header: "KM do veiculo", key: "vehicle_km", width: 18 },
  ];

  for (const record of sortedRecords) {
    registros.addRow(record);
  }

  styleHeader(registros.getRow(1), "0B5AA8");
  registros.views = [{ state: "frozen", ySplit: 1 }];
  registros.autoFilter = "A1:G1";

  resumo.columns = summaryBaseColumns.map((column) => ({ ...column }));

  for (let index = 1; index <= MAX_ACTION_SLOTS; index += 1) {
    summaryDetailedColumns.push({ header: `Entrada ${index}`, key: `entry${index}`, width: 14 });
    summaryDetailedColumns.push({ header: `Saida almoco ${index}`, key: `lunchStart${index}`, width: 16 });
    summaryDetailedColumns.push({ header: `Retorno almoco ${index}`, key: `lunchEnd${index}`, width: 18 });
    summaryDetailedColumns.push({ header: `Saida ${index}`, key: `exit${index}`, width: 14 });
  }

  resumoDetalhado.columns = summaryDetailedColumns;

  for (const row of summaryRows) {
    const baseSummaryRow = {
      employeeName: row.employeeName,
      employeeId: row.employeeId,
      day: row.day,
      vehiclePlate: row.vehiclePlate,
      interval: row.interval,
      worked: row.worked,
      overtime: row.overtime,
      dailyKm: row.dailyKm,
    };
    resumo.addRow(baseSummaryRow);

    const detailedSummaryRow = { ...baseSummaryRow };
    for (let index = 0; index < MAX_ACTION_SLOTS; index += 1) {
      detailedSummaryRow[`entry${index + 1}`] = row.entries[index] || "";
      detailedSummaryRow[`lunchStart${index + 1}`] = row.lunchStarts[index] || "";
      detailedSummaryRow[`lunchEnd${index + 1}`] = row.lunchEnds[index] || "";
      detailedSummaryRow[`exit${index + 1}`] = row.exits[index] || "";
    }

    resumoDetalhado.addRow(detailedSummaryRow);
  }

  styleHeader(resumo.getRow(1), "D39B39");
  resumo.views = [{ state: "frozen", ySplit: 1 }];
  resumo.autoFilter = `A1:${getExcelColumnName(resumo.columns.length)}1`;

  styleHeader(resumoDetalhado.getRow(1), "8A6E2F");
  resumoDetalhado.views = [{ state: "frozen", ySplit: 1 }];
  resumoDetalhado.autoFilter = `A1:${getExcelColumnName(resumoDetalhado.columns.length)}1`;

  legenda.columns = [
    { header: "Campo", key: "field", width: 26 },
    { header: "Descricao", key: "description", width: 72 },
  ];

  [
    ["Funcionario", "Nome do funcionario que registrou o ponto."],
    ["Matricula", "Codigo unico do funcionario."],
    ["Veiculo", "Placa ou lista de placas usadas pelo funcionario ao longo da jornada do dia."],
    ["Acao", "Tipo do registro: Entrada, Saida para almoco, Retorno do almoco ou Saida."],
    ["Data", "Data local informada no momento do registro."],
    ["Hora", "Horario local informado no momento do registro."],
    ["Placa do veiculo", "Placa informada pelo funcionario ao registrar o ponto."],
    ["KM do veiculo", "Quilometragem informada no momento do registro."],
    ["Intervalo", "Tempo total de intervalo registrado entre saida e retorno do almoco."],
    ["Horas trabalhadas", "Total diario calculado descontando o intervalo de almoco."],
    ["Horas extras", "Tempo trabalhado acima da carga horaria diaria configurada para o funcionario."],
    ["KM no dia", "Soma das diferencas de KM dos veiculos usados na jornada do dia."],
    ["Resumo", "Aba compacta para leitura rapida do dia por funcionario e veiculo."],
    ["Resumo Detalhado", "Aba completa com ate cinco ciclos de batidas para o mesmo dia."],
    ["Entrada 1-5 / Saida 1-5", "Ate cinco pares de entradas e saidas no mesmo dia."],
    ["Saida almoco 1-5 / Retorno almoco 1-5", "Ate cinco intervalos de almoco no mesmo dia."],
  ].forEach(([field, description]) => legenda.addRow({ field, description }));

  styleHeader(legenda.getRow(1), "196B52");
  legenda.views = [{ state: "frozen", ySplit: 1 }];

  applyGrid(registros);
  applyGrid(resumo);
  applyGrid(resumoDetalhado);
  applyGrid(legenda);

  return workbook;
}

function aggregateSummaryByEmployee(summaryRows) {
  const buckets = new Map();

  for (const row of summaryRows) {
    const key = String(row.employeeId || "");
    if (!buckets.has(key)) {
      buckets.set(key, {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        workedMinutes: 0,
        overtimeMinutes: 0,
        dailyKm: 0,
        daysWorked: 0,
      });
    }

    const bucket = buckets.get(key);
    bucket.workedMinutes += row.workedMinutes || 0;
    bucket.overtimeMinutes += row.overtimeMinutes || 0;
    bucket.dailyKm += row.dailyKm || 0;
    bucket.daysWorked += 1;
  }

  const rawBuckets = [...buckets.values()];

  const employees = rawBuckets
    .sort((left, right) => left.employeeName.localeCompare(right.employeeName, "pt-BR"))
    .map((bucket) => ({
      employeeId: bucket.employeeId,
      employeeName: bucket.employeeName,
      workedHours: formatMinutes(bucket.workedMinutes),
      overtimeHours: formatMinutes(bucket.overtimeMinutes),
      dailyKm: bucket.dailyKm,
      daysWorked: bucket.daysWorked,
    }));

  const companyRaw = rawBuckets.reduce(
    (totals, bucket) => ({
      workedMinutes: totals.workedMinutes + bucket.workedMinutes,
      overtimeMinutes: totals.overtimeMinutes + bucket.overtimeMinutes,
      dailyKm: totals.dailyKm + bucket.dailyKm,
    }),
    { workedMinutes: 0, overtimeMinutes: 0, dailyKm: 0 }
  );

  return {
    employees,
    company: {
      workedHours: formatMinutes(companyRaw.workedMinutes),
      overtimeHours: formatMinutes(companyRaw.overtimeMinutes),
      dailyKm: companyRaw.dailyKm,
      employeeCount: rawBuckets.length,
    },
  };
}

module.exports = {
  computeSummary,
  aggregateSummaryByEmployee,
  createWorkbook,
  getDailyWorkloadMinutes,
};
