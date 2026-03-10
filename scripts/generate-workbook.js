const fs = require("fs");
const path = require("path");
const { createWorkbook } = require("../lib/timecard-workbook");

async function main() {
  const outputDir = path.join(__dirname, "..", "artifacts");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const workbook = createWorkbook([
    {
      employee_name: "Exemplo Funcionario",
      employee_id: "1001",
      action: "Entrada",
      local_date: "08/03/2026",
      local_time: "08:00:00",
      recorded_at: "2026-03-08T11:00:00.000Z",
      latitude: -23.55052,
      longitude: -46.63331,
      location_label: "-23.55052, -46.63331",
    },
    {
      employee_name: "Exemplo Funcionario",
      employee_id: "1001",
      action: "Saida para almoco",
      local_date: "08/03/2026",
      local_time: "12:00:00",
      recorded_at: "2026-03-08T15:00:00.000Z",
      latitude: -23.55052,
      longitude: -46.63331,
      location_label: "-23.55052, -46.63331",
    },
    {
      employee_name: "Exemplo Funcionario",
      employee_id: "1001",
      action: "Retorno do almoco",
      local_date: "08/03/2026",
      local_time: "13:00:00",
      recorded_at: "2026-03-08T16:00:00.000Z",
      latitude: -23.55052,
      longitude: -46.63331,
      location_label: "-23.55052, -46.63331",
    },
    {
      employee_name: "Exemplo Funcionario",
      employee_id: "1001",
      action: "Saida",
      local_date: "08/03/2026",
      local_time: "17:00:00",
      recorded_at: "2026-03-08T20:00:00.000Z",
      latitude: -23.55052,
      longitude: -46.63331,
      location_label: "-23.55052, -46.63331",
    },
  ]);

  const outputPath = path.join(outputDir, "planilha-cartao-ponto-lc-transportes.xlsx");
  await workbook.xlsx.writeFile(outputPath);
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
