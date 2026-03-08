const ExcelJS = require("exceljs");

function computeSummary(records) {
  const buckets = new Map();

  for (const row of records) {
    const key = `${row.employee_id}::${row.local_date}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        employeeName: row.employee_name,
        employeeId: row.employee_id,
        day: row.local_date,
        entry: "",
        lunchStart: "",
        lunchEnd: "",
        exit: "",
        entryAt: "",
        lunchStartAt: "",
        lunchEndAt: "",
        exitAt: "",
      });
    }

    const bucket = buckets.get(key);
    if (row.action === "Entrada") {
      bucket.entry = row.local_time;
      bucket.entryAt = row.recorded_at;
    }
    if (row.action === "Saida para almoco") {
      bucket.lunchStart = row.local_time;
      bucket.lunchStartAt = row.recorded_at;
    }
    if (row.action === "Retorno do almoco") {
      bucket.lunchEnd = row.local_time;
      bucket.lunchEndAt = row.recorded_at;
    }
    if (row.action === "Saida") {
      bucket.exit = row.local_time;
      bucket.exitAt = row.recorded_at;
    }
  }

  return [...buckets.values()].map((item) => {
    let workedMs = 0;

    if (item.entryAt && item.exitAt) {
      workedMs += new Date(item.exitAt) - new Date(item.entryAt);
    }

    if (item.lunchStartAt && item.lunchEndAt) {
      workedMs -= new Date(item.lunchEndAt) - new Date(item.lunchStartAt);
    }

    const totalMinutes = Math.max(Math.round(workedMs / 60000), 0);
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");

    return {
      employeeName: item.employeeName,
      employeeId: item.employeeId,
      day: item.day,
      entry: item.entry,
      lunchStart: item.lunchStart,
      lunchEnd: item.lunchEnd,
      exit: item.exit,
      worked: `${hours}:${minutes}`,
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
  ];

  for (const record of records) {
    registros.addRow(record);
  }

  styleHeader(registros.getRow(1), "0B5AA8");
  registros.views = [{ state: "frozen", ySplit: 1 }];
  registros.autoFilter = "A1:I1";

  resumo.columns = [
    { header: "Funcionario", key: "employeeName", width: 28 },
    { header: "Matricula", key: "employeeId", width: 18 },
    { header: "Dia", key: "day", width: 14 },
    { header: "Entrada", key: "entry", width: 14 },
    { header: "Saida almoco", key: "lunchStart", width: 16 },
    { header: "Retorno almoco", key: "lunchEnd", width: 18 },
    { header: "Saida", key: "exit", width: 14 },
    { header: "Horas trabalhadas", key: "worked", width: 18 },
  ];

  for (const row of computeSummary(records)) {
    resumo.addRow(row);
  }

  styleHeader(resumo.getRow(1), "D39B39");
  resumo.views = [{ state: "frozen", ySplit: 1 }];
  resumo.autoFilter = "A1:H1";

  legenda.columns = [
    { header: "Campo", key: "field", width: 26 },
    { header: "Descricao", key: "description", width: 72 },
  ];

  [
    ["Funcionario", "Nome do funcionario que registrou o ponto."],
    ["Matricula", "Codigo unico do funcionario."],
    ["Acao", "Tipo do registro: Entrada, Saida para almoco, Retorno do almoco ou Saida."],
    ["Data", "Data local informada no momento do registro."],
    ["Hora", "Horario local informado no momento do registro."],
    ["Data e hora ISO", "Timestamp completo usado para auditoria e integracoes."],
    ["Latitude", "Latitude capturada pelo aparelho no momento do registro."],
    ["Longitude", "Longitude capturada pelo aparelho no momento do registro."],
    ["Localizacao aproximada", "Texto resumido da localizacao salva."],
    ["Horas trabalhadas", "Total diario calculado descontando o intervalo de almoco."],
  ].forEach(([field, description]) => legenda.addRow({ field, description }));

  styleHeader(legenda.getRow(1), "196B52");
  legenda.views = [{ state: "frozen", ySplit: 1 }];

  applyGrid(registros);
  applyGrid(resumo);
  applyGrid(legenda);

  return workbook;
}

module.exports = {
  computeSummary,
  createWorkbook,
};
