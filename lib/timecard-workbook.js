const ExcelJS = require("exceljs");
const MAX_ACTION_SLOTS = 5;

function createMapsUrl(record) {
  if (typeof record.latitude !== "number" || typeof record.longitude !== "number") {
    return "";
  }

  return `https://www.google.com/maps/search/?api=1&query=${record.latitude},${record.longitude}`;
}

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

function computeSummary(records) {
  const buckets = new Map();

  for (const row of records) {
    const vehiclePlate = row.vehicle_plate || "Nao informado";
    const key = `${row.employee_id}::${row.local_date}::${vehiclePlate}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        employeeName: row.employee_name,
        employeeId: row.employee_id,
        day: row.local_date,
        vehiclePlate,
        entries: [],
        lunchStarts: [],
        lunchEnds: [],
        exits: [],
        minVehicleKm: null,
        maxVehicleKm: null,
      });
    }

    const bucket = buckets.get(key);
    if (typeof row.vehicle_km === "number") {
      bucket.minVehicleKm = bucket.minVehicleKm === null ? row.vehicle_km : Math.min(bucket.minVehicleKm, row.vehicle_km);
      bucket.maxVehicleKm = bucket.maxVehicleKm === null ? row.vehicle_km : Math.max(bucket.maxVehicleKm, row.vehicle_km);
    }
    if (row.action === "Entrada") {
      if (bucket.entries.length < MAX_ACTION_SLOTS) {
        bucket.entries.push({ time: row.local_time, recordedAt: row.recorded_at });
      }
    }
    if (row.action === "Saida para almoco") {
      if (bucket.lunchStarts.length < MAX_ACTION_SLOTS) {
        bucket.lunchStarts.push({ time: row.local_time, recordedAt: row.recorded_at });
      }
    }
    if (row.action === "Retorno do almoco") {
      if (bucket.lunchEnds.length < MAX_ACTION_SLOTS) {
        bucket.lunchEnds.push({ time: row.local_time, recordedAt: row.recorded_at });
      }
    }
    if (row.action === "Saida") {
      if (bucket.exits.length < MAX_ACTION_SLOTS) {
        bucket.exits.push({ time: row.local_time, recordedAt: row.recorded_at });
      }
    }
  }

  return [...buckets.values()].map((item) => {
    let workedMs = 0;
    let intervalMs = 0;

    for (let index = 0; index < MAX_ACTION_SLOTS; index += 1) {
      const entry = item.entries[index];
      const exit = item.exits[index];
      if (entry?.recordedAt && exit?.recordedAt) {
        workedMs += new Date(exit.recordedAt) - new Date(entry.recordedAt);
      }
    }

    for (let index = 0; index < MAX_ACTION_SLOTS; index += 1) {
      const lunchStart = item.lunchStarts[index];
      const lunchEnd = item.lunchEnds[index];
      if (lunchStart?.recordedAt && lunchEnd?.recordedAt) {
        intervalMs += new Date(lunchEnd.recordedAt) - new Date(lunchStart.recordedAt);
      }
    }

    workedMs -= intervalMs;

    const totalMinutes = Math.max(Math.round(workedMs / 60000), 0);
    const intervalMinutes = Math.max(Math.round(intervalMs / 60000), 0);
    const overtimeMinutes = Math.max(totalMinutes - 8 * 60, 0);
    const dailyKm =
      item.minVehicleKm !== null && item.maxVehicleKm !== null ? Math.max(item.maxVehicleKm - item.minVehicleKm, 0) : null;

    return {
      employeeName: item.employeeName,
      employeeId: item.employeeId,
      day: item.day,
      vehiclePlate: item.vehiclePlate,
      interval: formatMinutes(intervalMinutes),
      worked: formatMinutes(totalMinutes),
      overtime: formatMinutes(overtimeMinutes),
      dailyKm: dailyKm ?? "",
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

function createWorkbook(records) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Codex";
  workbook.company = "LC Transportes";
  workbook.created = new Date();

  const registros = workbook.addWorksheet("Registros");
  const resumo = workbook.addWorksheet("Resumo");
  const resumoDetalhado = workbook.addWorksheet("Resumo Detalhado");
  const legenda = workbook.addWorksheet("Legenda");

  registros.columns = [
    { header: "Funcionario", key: "employee_name", width: 28 },
    { header: "Matricula", key: "employee_id", width: 18 },
    { header: "Acao", key: "action", width: 24 },
    { header: "Data", key: "local_date", width: 14 },
    { header: "Hora", key: "local_time", width: 14 },
    { header: "Data e hora ISO", key: "recorded_at", width: 28 },
    { header: "Latitude", key: "latitude", width: 16 },
    { header: "Longitude", key: "longitude", width: 16 },
    { header: "Localizacao aproximada", key: "location_label", width: 32 },
    { header: "Placa do veiculo", key: "vehicle_plate", width: 18 },
    { header: "KM do veiculo", key: "vehicle_km", width: 18 },
    { header: "Google Maps", key: "maps_url", width: 42 },
  ];

  for (const record of records) {
    registros.addRow({
      ...record,
      maps_url: createMapsUrl(record),
    });
  }

  styleHeader(registros.getRow(1), "0B5AA8");
  registros.views = [{ state: "frozen", ySplit: 1 }];
  registros.autoFilter = "A1:L1";

  resumo.columns = [
    { header: "Funcionario", key: "employeeName", width: 28 },
    { header: "Matricula", key: "employeeId", width: 18 },
    { header: "Dia", key: "day", width: 14 },
    { header: "Veiculo", key: "vehiclePlate", width: 18 },
    { header: "Intervalo", key: "interval", width: 14 },
    { header: "Horas trabalhadas", key: "worked", width: 18 },
    { header: "Horas extras", key: "overtime", width: 16 },
    { header: "KM no dia", key: "dailyKm", width: 14 },
  ];

  resumoDetalhado.columns = [...resumo.columns];

  for (let index = 1; index <= MAX_ACTION_SLOTS; index += 1) {
    resumoDetalhado.columns.push({ header: `Entrada ${index}`, key: `entry${index}`, width: 14 });
    resumoDetalhado.columns.push({ header: `Saida almoco ${index}`, key: `lunchStart${index}`, width: 16 });
    resumoDetalhado.columns.push({ header: `Retorno almoco ${index}`, key: `lunchEnd${index}`, width: 18 });
    resumoDetalhado.columns.push({ header: `Saida ${index}`, key: `exit${index}`, width: 14 });
  }

  for (const row of computeSummary(records)) {
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
    ["Veiculo", "Placa do veiculo associado aos registros do dia."],
    ["Acao", "Tipo do registro: Entrada, Saida para almoco, Retorno do almoco ou Saida."],
    ["Data", "Data local informada no momento do registro."],
    ["Hora", "Horario local informado no momento do registro."],
    ["Data e hora ISO", "Timestamp completo usado para auditoria e integracoes."],
    ["Latitude", "Latitude capturada pelo aparelho no momento do registro."],
    ["Longitude", "Longitude capturada pelo aparelho no momento do registro."],
    ["Localizacao aproximada", "Texto resumido da localizacao salva."],
    ["Placa do veiculo", "Placa informada pelo funcionario ao registrar o ponto."],
    ["KM do veiculo", "Quilometragem informada no momento do registro."],
    ["Google Maps", "Link direto para abrir a coordenada registrada no Google Maps."],
    ["Intervalo", "Tempo total de intervalo registrado entre saida e retorno do almoco."],
    ["Horas trabalhadas", "Total diario calculado descontando o intervalo de almoco."],
    ["Horas extras", "Tempo trabalhado acima de 8 horas no dia."],
    ["KM no dia", "Diferenca entre o maior e o menor KM informado para o mesmo veiculo no dia."],
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

module.exports = {
  computeSummary,
  createWorkbook,
};
