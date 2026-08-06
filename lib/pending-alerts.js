const { computeSummary } = require("./timecard-workbook");

const APP_TIME_ZONE = "America/Sao_Paulo";
const localDateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: APP_TIME_ZONE });
const DAY_MS = 24 * 60 * 60 * 1000;

// Limites que definem o que vira pendencia. Ajuste aqui se a operacao mudar.
const DEFAULT_ALERT_THRESHOLDS = {
  // Horas desde a Entrada sem nenhuma Saida registrada.
  openJourneyHours: 14,
  // Horas desde a Saida para almoco sem Retorno do almoco.
  openLunchHours: 3,
  // Turno ja fechado com jornada acima disso vira alerta de conferencia.
  longShiftHours: 12,
  // Turno fechado acima disso sem nenhum almoco registrado vira alerta.
  missingBreakHours: 6,
  // Janela de dias corridos analisada para dias uteis sem nenhuma batida.
  missingPunchDays: 7,
  // Janela geral de analise para turnos ja fechados.
  analysisDays: 15,
};

const SEVERITY_ORDER = { alta: 0, media: 1, baixa: 2 };
const ALERT_TYPES = {
  OPEN_JOURNEY: "jornada_aberta",
  OPEN_LUNCH: "almoco_sem_retorno",
  LONG_SHIFT: "jornada_longa",
  MISSING_BREAK: "sem_intervalo",
  MISSING_PUNCH: "sem_batida",
  BROKEN_SEQUENCE: "sequencia_inconsistente",
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDuration(totalMs) {
  const safeMinutes = Math.max(Math.round(totalMs / 60000), 0);
  return `${pad(Math.floor(safeMinutes / 60))}:${pad(safeMinutes % 60)}`;
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

// Converte um instante para a meia-noite (em UTC) do dia civil correspondente
// no fuso da operacao, para poder comparar dias sem sofrer com o offset.
function getLocalDayStart(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return parseLocalDate(localDateFormatter.format(date));
}

function toDayKey(date) {
  if (!date) {
    return "";
  }

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function toDayLabel(date) {
  if (!date) {
    return "";
  }

  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

function isBusinessDay(date) {
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

function getRecordDayKey(record) {
  return toDayKey(parseLocalDate(record.local_date) || getLocalDayStart(record.recorded_at));
}

function getTimestamp(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function sortRecordsAscending(records) {
  return [...records].sort((left, right) => {
    const leftTime = getTimestamp(left.recorded_at) ?? 0;
    const rightTime = getTimestamp(right.recorded_at) ?? 0;
    return leftTime - rightTime;
  });
}

function groupRecordsByEmployee(records) {
  const grouped = new Map();

  for (const record of records) {
    const key = String(record.employee_id || "");
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(record);
  }

  return grouped;
}

// Registros posteriores a ultima Saida. Vazio significa jornada fechada.
function getOpenJourneyRecords(sortedRecords) {
  const lastExitIndex = sortedRecords.map((record) => record.action).lastIndexOf("Saida");
  return lastExitIndex === -1 ? [...sortedRecords] : sortedRecords.slice(lastExitIndex + 1);
}

function buildAlert(record, { type, severity, title, detail, dayKey, since, elapsed }) {
  return {
    id: `${type}::${record.employee_id}::${dayKey}`,
    type,
    severity,
    title,
    detail,
    employeeName: record.employee_name || "",
    employeeId: String(record.employee_id || ""),
    localDate: record.local_date || "",
    dayKey,
    since: since || null,
    elapsed: elapsed || null,
  };
}

function detectOpenJourneyAlerts(sortedRecords, config, nowMs) {
  const openRecords = getOpenJourneyRecords(sortedRecords);
  if (!openRecords.length) {
    return [];
  }

  const openEntry = openRecords[0];
  const lastRecord = openRecords[openRecords.length - 1];
  const dayKey = getRecordDayKey(openEntry);

  if (lastRecord.action === "Saida para almoco") {
    const lunchStartedAt = getTimestamp(lastRecord.recorded_at);
    const elapsedMs = lunchStartedAt === null ? 0 : nowMs - lunchStartedAt;
    if (elapsedMs < config.openLunchHours * 60 * 60 * 1000) {
      return [];
    }

    return [
      buildAlert(lastRecord, {
        type: ALERT_TYPES.OPEN_LUNCH,
        severity: "alta",
        title: "Almoco sem retorno",
        detail: `Saiu para o almoco as ${lastRecord.local_time || "-"} do dia ${lastRecord.local_date || "-"} e ainda nao registrou o retorno.`,
        dayKey,
        since: lastRecord.recorded_at,
        elapsed: formatDuration(elapsedMs),
      }),
    ];
  }

  const startedAt = getTimestamp(openEntry.recorded_at);
  const elapsedMs = startedAt === null ? 0 : nowMs - startedAt;
  if (elapsedMs < config.openJourneyHours * 60 * 60 * 1000) {
    return [];
  }

  return [
    buildAlert(openEntry, {
      type: ALERT_TYPES.OPEN_JOURNEY,
      severity: "alta",
      title: "Jornada em aberto",
      detail: `Entrada as ${openEntry.local_time || "-"} do dia ${openEntry.local_date || "-"} sem o Termino registrado.`,
      dayKey,
      since: openEntry.recorded_at,
      elapsed: formatDuration(elapsedMs),
    }),
  ];
}

// A sequencia ja e validada na hora de bater o ponto, mas edicoes e exclusoes
// feitas pelo admin podem deixar a jornada inconsistente depois.
function detectBrokenSequenceAlerts(sortedRecords, analysisFromMs) {
  const alerts = [];
  let journeyOpen = false;
  let lunchOpen = false;

  for (const record of sortedRecords) {
    const recordedAtMs = getTimestamp(record.recorded_at);
    const withinWindow = recordedAtMs !== null && recordedAtMs >= analysisFromMs;
    let problem = null;

    if (record.action === "Entrada") {
      if (journeyOpen) {
        problem = "Uma nova Entrada foi registrada sem o Termino da jornada anterior.";
      }
      journeyOpen = true;
      lunchOpen = false;
    } else if (record.action === "Saida para almoco") {
      if (!journeyOpen) {
        problem = "Saida para almoco registrada sem Entrada correspondente.";
      } else if (lunchOpen) {
        problem = "Duas saidas para almoco seguidas, sem o retorno entre elas.";
      }
      journeyOpen = true;
      lunchOpen = true;
    } else if (record.action === "Retorno do almoco") {
      if (!lunchOpen) {
        problem = "Retorno do almoco registrado sem a saida correspondente.";
      }
      journeyOpen = true;
      lunchOpen = false;
    } else if (record.action === "Saida") {
      if (!journeyOpen) {
        problem = "Termino registrado sem Entrada correspondente.";
      }
      journeyOpen = false;
      lunchOpen = false;
    }

    if (problem && withinWindow) {
      alerts.push(
        buildAlert(record, {
          type: ALERT_TYPES.BROKEN_SEQUENCE,
          severity: "media",
          title: "Sequencia inconsistente",
          detail: `${problem} Conferir os registros do dia ${record.local_date || "-"}.`,
          dayKey: getRecordDayKey(record),
          since: record.recorded_at,
        }),
      );
    }
  }

  return alerts;
}

function detectClosedShiftAlerts(records, transfers, config, nowMs, openDayKeysByEmployee) {
  const analysisFromMs = nowMs - config.analysisDays * DAY_MS;
  const alerts = [];

  for (const shift of computeSummary(records, transfers)) {
    if (!shift.exits.length) {
      continue;
    }

    const lastEventMs = getTimestamp(shift.lastEventAt);
    if (lastEventMs === null || lastEventMs < analysisFromMs) {
      continue;
    }

    const dayKey = toDayKey(parseLocalDate(shift.day));
    const employeeKey = String(shift.employeeId || "");
    if (openDayKeysByEmployee.get(employeeKey) === dayKey) {
      continue;
    }

    const shiftReference = {
      employee_id: shift.employeeId,
      employee_name: shift.employeeName,
      local_date: shift.day,
    };

    if (shift.workedMinutes > config.longShiftHours * 60) {
      alerts.push(
        buildAlert(shiftReference, {
          type: ALERT_TYPES.LONG_SHIFT,
          severity: "media",
          title: "Jornada muito longa",
          detail: `Jornada de ${shift.worked} no dia ${shift.day}, acima de ${config.longShiftHours}h. Conferir se o Termino foi batido no horario certo.`,
          dayKey,
          since: shift.lastEventAt,
          elapsed: shift.worked,
        }),
      );
    }

    if (shift.workedMinutes >= config.missingBreakHours * 60 && !shift.lunchStarts.length) {
      alerts.push(
        buildAlert(shiftReference, {
          type: ALERT_TYPES.MISSING_BREAK,
          severity: "media",
          title: "Dia sem intervalo",
          detail: `Jornada de ${shift.worked} no dia ${shift.day} sem nenhum almoco registrado.`,
          dayKey,
          since: shift.lastEventAt,
          elapsed: shift.worked,
        }),
      );
    }
  }

  return alerts;
}

function detectMissingPunchAlerts(employees, recordsByEmployee, config, nowMs) {
  if (config.missingPunchDays <= 0) {
    return [];
  }

  const todayStart = getLocalDayStart(nowMs);
  if (!todayStart) {
    return [];
  }

  const alerts = [];

  for (const employee of employees) {
    if (employee.role === "admin") {
      continue;
    }

    const employeeKey = String(employee.employeeId || employee.employee_id || "");
    const employeeRecords = recordsByEmployee.get(employeeKey) || [];
    // Funcionario que nunca bateu ponto ainda nao entrou na rotina; nao vira alerta diario.
    if (!employeeRecords.length) {
      continue;
    }

    const recordedDayKeys = new Set(employeeRecords.map((record) => getRecordDayKey(record)));
    const createdAtMs = getTimestamp(employee.createdAt || employee.created_at);
    const createdDayStart = createdAtMs === null ? null : getLocalDayStart(createdAtMs);
    const missingDays = [];

    for (let offset = config.missingPunchDays; offset >= 1; offset -= 1) {
      const day = new Date(todayStart.getTime() - offset * DAY_MS);
      if (!isBusinessDay(day)) {
        continue;
      }

      // Nao cobra o dia do cadastro nem os anteriores a ele.
      if (createdDayStart && day.getTime() <= createdDayStart.getTime()) {
        continue;
      }

      if (!recordedDayKeys.has(toDayKey(day))) {
        missingDays.push(day);
      }
    }

    if (!missingDays.length) {
      continue;
    }

    const lastMissingDay = missingDays[missingDays.length - 1];
    const dayList = missingDays.map((day) => `${pad(day.getUTCDate())}/${pad(day.getUTCMonth() + 1)}`).join(", ");
    const plural = missingDays.length > 1 ? "dias uteis" : "dia util";

    alerts.push({
      id: `${ALERT_TYPES.MISSING_PUNCH}::${employeeKey}::${toDayKey(lastMissingDay)}`,
      type: ALERT_TYPES.MISSING_PUNCH,
      severity: "baixa",
      title: "Sem batida no dia",
      detail: `Nenhum registro em ${missingDays.length} ${plural}: ${dayList}.`,
      employeeName: employee.name || "",
      employeeId: employeeKey,
      localDate: toDayLabel(lastMissingDay),
      dayKey: toDayKey(lastMissingDay),
      since: null,
      elapsed: null,
    });
  }

  return alerts;
}

function compareAlerts(left, right) {
  const severityCompare = (SEVERITY_ORDER[left.severity] ?? 9) - (SEVERITY_ORDER[right.severity] ?? 9);
  if (severityCompare !== 0) {
    return severityCompare;
  }

  const dayCompare = String(right.dayKey || "").localeCompare(String(left.dayKey || ""), "pt-BR");
  if (dayCompare !== 0) {
    return dayCompare;
  }

  return String(left.employeeName || "").localeCompare(String(right.employeeName || ""), "pt-BR");
}

function detectPendingAlerts({
  records = [],
  transfers = [],
  employees = [],
  now = Date.now(),
  thresholds = {},
} = {}) {
  const config = { ...DEFAULT_ALERT_THRESHOLDS, ...thresholds };
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (Number.isNaN(nowMs)) {
    return [];
  }

  const analysisFromMs = nowMs - config.analysisDays * DAY_MS;
  const recordsByEmployee = groupRecordsByEmployee(records);
  const openDayKeysByEmployee = new Map();
  const alerts = [];

  for (const [employeeKey, employeeRecords] of recordsByEmployee) {
    const sortedRecords = sortRecordsAscending(employeeRecords);
    const openRecords = getOpenJourneyRecords(sortedRecords);
    if (openRecords.length) {
      openDayKeysByEmployee.set(employeeKey, getRecordDayKey(openRecords[0]));
    }

    alerts.push(...detectOpenJourneyAlerts(sortedRecords, config, nowMs));
    alerts.push(...detectBrokenSequenceAlerts(sortedRecords, analysisFromMs));
  }

  alerts.push(...detectClosedShiftAlerts(records, transfers, config, nowMs, openDayKeysByEmployee));
  alerts.push(...detectMissingPunchAlerts(employees, recordsByEmployee, config, nowMs));

  return alerts.sort(compareAlerts);
}

function summarizeAlerts(alerts = []) {
  return alerts.reduce(
    (totals, alert) => {
      totals.total += 1;
      if (totals[alert.severity] !== undefined) {
        totals[alert.severity] += 1;
      }

      return totals;
    },
    { total: 0, alta: 0, media: 0, baixa: 0 },
  );
}

module.exports = {
  detectPendingAlerts,
  summarizeAlerts,
  DEFAULT_ALERT_THRESHOLDS,
  ALERT_TYPES,
};
