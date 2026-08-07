const state = {
  user: null,
  records: [],
  summary: [],
  summaryAggregates: [],
  summaryCompanyTotals: null,
  employees: [],
  vehicles: [],
  apkUpdate: null,
  vehicleContext: null,
  offlineSnapshotActive: false,
  offlineSnapshotCachedAt: "",
  alerts: [],
  alertCounts: null,
  weekSummary: null,
  adminTab: "overview",
  summaryCollapsed: false,
  aggregatesCollapsed: false,
  alertsCollapsed: false,
  managedEmployeeId: "",
  showRegisterForm: false,
  showVehicleRegisterForm: false,
  employeeManageSearch: "",
  employeeManageSearchApplied: "",
  vehicleManageSearch: "",
  vehicleManageSearchApplied: "",
  adminFilters: {
    employeeId: "",
    vehiclePlate: "",
    dateFrom: "",
    dateTo: "",
  },
};

const APP_TIME_ZONE = "America/Sao_Paulo";
const formatters = {
  datetime: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: APP_TIME_ZONE }),
  date: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: APP_TIME_ZONE }),
  time: new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium", timeZone: APP_TIME_ZONE }),
};
const ADMIN_RECORD_ACTIONS = ["Entrada", "Saida para almoco", "Retorno do almoco", "Saida"];
const SHOW_EMPLOYEE_KM_FIELDS = false;

const authPanel = document.querySelector("#authPanel");
const appPanel = document.querySelector("#appPanel");
const apkUpdateDialog = document.querySelector("#apkUpdateDialog");
const apkUpdateTitle = document.querySelector("#apkUpdateTitle");
const apkUpdateMessage = document.querySelector("#apkUpdateMessage");
const apkUpdateMeta = document.querySelector("#apkUpdateMeta");
const apkUpdateNotes = document.querySelector("#apkUpdateNotes");
const apkUpdateRequired = document.querySelector("#apkUpdateRequired");
const apkUpdateButton = document.querySelector("#apkUpdateButton");
const apkUpdateLink = document.querySelector("#apkUpdateLink");
const apkUpdateDismissButton = document.querySelector("#apkUpdateDismissButton");
const employeePanel = document.querySelector("#employeePanel");
const adminPanel = document.querySelector("#adminPanel");
const authMessage = document.querySelector("#authMessage");
const clockStatus = document.querySelector("#clockStatus");
const sessionTitle = document.querySelector("#sessionTitle");
const sessionSubtitle = document.querySelector("#sessionSubtitle");
const recordsTitle = document.querySelector("#recordsTitle");
const recordsSubtitle = document.querySelector("#recordsSubtitle");
const locationStatus = document.querySelector("#locationStatus");
const pendingPunchIndicator = document.querySelector("#pendingPunchIndicator");
const pendingPunchErrors = document.querySelector("#pendingPunchErrors");
const offlineCacheBanner = document.querySelector("#offlineCacheBanner");
const currentVehicleStatus = document.querySelector("#currentVehicleStatus");
const changeVehicleButton = document.querySelector("#changeVehicleButton");
const recordsList = document.querySelector("#recordsList");
const summaryBody = document.querySelector("#summaryBody");
const summaryPanel = document.querySelector("#summaryPanel");
const summaryTitle = document.querySelector("#summaryTitle");
const summaryContent = document.querySelector("#summaryContent");
const toggleSummaryButton = document.querySelector("#toggleSummaryButton");
const employeeAggregatesPanel = document.querySelector("#employeeAggregatesPanel");
const employeeAggregatesContent = document.querySelector("#employeeAggregatesContent");
const employeeAggregatesBody = document.querySelector("#employeeAggregatesBody");
const toggleAggregatesButton = document.querySelector("#toggleAggregatesButton");
const journeyCard = document.querySelector("#journeyCard");
const journeyState = document.querySelector("#journeyState");
const journeySince = document.querySelector("#journeySince");
const journeyWorked = document.querySelector("#journeyWorked");
const journeyBreak = document.querySelector("#journeyBreak");
const journeyOvertimeTag = document.querySelector("#journeyOvertimeTag");
const weekSummaryCard = document.querySelector("#weekSummaryCard");
const weekSummaryDays = document.querySelector("#weekSummaryDays");
const weekSummaryWorked = document.querySelector("#weekSummaryWorked");
const weekSummaryOvertime = document.querySelector("#weekSummaryOvertime");
const nextActionHint = document.querySelector("#nextActionHint");
const adminTabs = document.querySelector("#adminTabs");
const adminTabButtons = [...document.querySelectorAll(".admin-tab")];
const adminTabOverview = document.querySelector("#adminTabOverview");
const adminTabCadastros = document.querySelector("#adminTabCadastros");
const adminOverviewDot = document.querySelector("#adminOverviewDot");
const recordsSection = document.querySelector("#recordsSection");
const alertsPanel = document.querySelector("#alertsPanel");
const alertsTitle = document.querySelector("#alertsTitle");
const alertsSubtitle = document.querySelector("#alertsSubtitle");
const alertsContent = document.querySelector("#alertsContent");
const toggleAlertsButton = document.querySelector("#toggleAlertsButton");
const companyStatTiles = document.querySelector("#companyStatTiles");
const statTileEmployeeCount = document.querySelector("#statTileEmployeeCount");
const statTileWorked = document.querySelector("#statTileWorked");
const statTileOvertime = document.querySelector("#statTileOvertime");
const statTileKm = document.querySelector("#statTileKm");
const exportActions = document.querySelector("#exportActions");
const recordsFilterPanel = document.querySelector("#recordsFilterPanel");
const employeeFilter = document.querySelector("#employeeFilter");
const vehiclePlateFilter = document.querySelector("#vehiclePlateFilter");
const dateFromFilter = document.querySelector("#dateFromFilter");
const dateToFilter = document.querySelector("#dateToFilter");
const applyAdminFiltersButton = document.querySelector("#applyAdminFiltersButton");
const clearAdminFiltersButton = document.querySelector("#clearAdminFiltersButton");
const exportXlsxLink = document.querySelector("#exportXlsxLink");
const recordTemplate = document.querySelector("#recordTemplate");
const loginForm = document.querySelector("#loginForm");
const loginSubmitButton = loginForm?.querySelector('button[type="submit"]');
const registerForm = document.querySelector("#registerForm");
const toggleRegisterButton = document.querySelector("#toggleRegisterButton");
const logoutButton = document.querySelector("#logoutButton");
const employeeAdminBody = document.querySelector("#employeeAdminBody");
const employeeManagerMessage = document.querySelector("#employeeManagerMessage");
const employeeEditorPanel = document.querySelector("#employeeEditorPanel");
const employeeEditorTitle = document.querySelector("#employeeEditorTitle");
const employeeEditForm = document.querySelector("#employeeEditForm");
const employeeManageSearchInput = document.querySelector("#employeeManageSearchInput");
const searchEmployeeButton = document.querySelector("#searchEmployeeButton");
const clearEmployeeSearchButton = document.querySelector("#clearEmployeeSearchButton");
const manageEmployeeIdInput = document.querySelector("#manageEmployeeId");
const editEmployeeNameInput = document.querySelector("#editEmployeeName");
const editEmployeeIdInput = document.querySelector("#editEmployeeId");
const cancelEmployeeEditButton = document.querySelector("#cancelEmployeeEditButton");
const employeePasswordForm = document.querySelector("#employeePasswordForm");
const employeePasswordInput = document.querySelector("#employeePasswordInput");
const deleteEmployeeButton = document.querySelector("#deleteEmployeeButton");
const vehicleRegisterForm = document.querySelector("#vehicleRegisterForm");
const toggleVehicleRegisterButton = document.querySelector("#toggleVehicleRegisterButton");
const registerVehiclePlateInput = document.querySelector("#registerVehiclePlate");
const registerVehicleDescriptionInput = document.querySelector("#registerVehicleDescription");
const registerVehicleInitialKmInput = document.querySelector("#registerVehicleInitialKm");
const vehicleManagerMessage = document.querySelector("#vehicleManagerMessage");
const vehicleSearchInput = document.querySelector("#vehicleSearchInput");
const vehicleSearchSuggestions = document.querySelector("#vehicleSearchSuggestions");
const searchVehicleButton = document.querySelector("#searchVehicleButton");
const clearVehicleSearchButton = document.querySelector("#clearVehicleSearchButton");
const vehicleAdminBody = document.querySelector("#vehicleAdminBody");
const vehicleDialog = document.querySelector("#vehicleDialog");
const vehicleForm = document.querySelector("#vehicleForm");
const vehicleSelectInput = document.querySelector("#vehicleSelectInput");
const vehicleKmField = document.querySelector("#vehicleKmField");
const vehicleKmInput = document.querySelector("#vehicleKmInput");
const vehicleFormMessage = document.querySelector("#vehicleFormMessage");
const vehicleCancelButton = document.querySelector("#vehicleCancelButton");
const vehicleTransferDialog = document.querySelector("#vehicleTransferDialog");
const vehicleTransferForm = document.querySelector("#vehicleTransferForm");
const currentVehiclePlateInput = document.querySelector("#currentVehiclePlateInput");
const currentVehicleKmField = document.querySelector("#currentVehicleKmField");
const currentVehicleKmInput = document.querySelector("#currentVehicleKmInput");
const nextVehicleSelectInput = document.querySelector("#nextVehicleSelectInput");
const nextVehicleKmField = document.querySelector("#nextVehicleKmField");
const nextVehicleKmInput = document.querySelector("#nextVehicleKmInput");
const vehicleTransferMessage = document.querySelector("#vehicleTransferMessage");
const vehicleTransferCancelButton = document.querySelector("#vehicleTransferCancelButton");
const recordEditDialog = document.querySelector("#recordEditDialog");
const recordEditForm = document.querySelector("#recordEditForm");
const recordEditTitle = document.querySelector("#recordEditTitle");
const recordEditSubtitle = document.querySelector("#recordEditSubtitle");
const recordEditIdInput = document.querySelector("#recordEditIdInput");
const recordEditActionInput = document.querySelector("#recordEditActionInput");
const recordEditDateTimeInput = document.querySelector("#recordEditDateTimeInput");
const recordEditKmInput = document.querySelector("#recordEditKmInput");
const recordEditMessage = document.querySelector("#recordEditMessage");
const recordEditCancelButton = document.querySelector("#recordEditCancelButton");
const recordEditDeleteButton = document.querySelector("#recordEditDeleteButton");
const actionButtons = [...document.querySelectorAll(".action-button")];
let vehicleDialogResolver = null;
let vehicleTransferDialogResolver = null;
const MAX_ACTION_SLOTS = 5;
const APK_UPDATE_STORAGE_KEY = "lc.apk_update_dismissed_version";
const APK_UPDATE_AUTODOWNLOAD_STORAGE_KEY = "lc.apk_update_autodownloaded_version";
const APK_UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const PENDING_PUNCH_STORAGE_KEY = "lc.pending_punches";
const PENDING_PUNCH_SYNC_INTERVAL_MS = 30 * 1000;
const ALERTS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const OFFLINE_SNAPSHOT_STORAGE_KEY = "lc.offline_snapshot";
let pendingPunchSyncInFlight = false;

function isUnconfiguredAndroidShell() {
  return isAndroidShell() && window.location.hostname === "localhost";
}

function isAndroidShell() {
  return navigator.userAgent.includes("LCAndroidShell/");
}

function showAndroidShellNotice() {
  if (loginSubmitButton) {
    loginSubmitButton.disabled = true;
    loginSubmitButton.textContent = "Configurar app Android";
  }

  document.querySelector("#loginEmployeeId")?.setAttribute("disabled", "disabled");
  document.querySelector("#loginPassword")?.setAttribute("disabled", "disabled");
  setMessage(
    "Este APK precisa apontar para a versao online do sistema. Configure ANDROID_APP_URL, execute npm run android:sync e gere o app novamente.",
    true
  );
}

function syncResponsiveTable(table) {
  if (!table) {
    return;
  }

  const headers = [...table.querySelectorAll("thead th")].map((header) => header.textContent.trim());
  const rows = table.querySelectorAll("tbody tr");

  rows.forEach((row) => {
    [...row.children].forEach((cell, index) => {
      if (cell.tagName !== "TD") {
        return;
      }

      if (cell.classList.contains("empty-row") || cell.colSpan > 1) {
        cell.removeAttribute("data-label");
        return;
      }

      cell.setAttribute("data-label", headers[index] || "");
    });
  });
}

function syncResponsiveTables() {
  document.querySelectorAll("table").forEach(syncResponsiveTable);
}

function setMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.style.color = isError ? "#a33f33" : "";
}

function updateClock() {
  clockStatus.textContent = `Agora: ${formatters.datetime.format(new Date())}`;
  // Mantem o contador da jornada andando sozinho enquanto a tela esta aberta.
  renderJourneyCard();
}

function getAndroidShellVersion() {
  const match = navigator.userAgent.match(/LCAndroidShell\/([0-9.]+)/);
  return match?.[1] || null;
}

function compareVersionParts(left, right) {
  const leftParts = String(left || "0").split(".").map((part) => Number(part) || 0);
  const rightParts = String(right || "0").split(".").map((part) => Number(part) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

function getDismissedApkUpdateVersion() {
  try {
    return window.localStorage.getItem(APK_UPDATE_STORAGE_KEY) || "";
  } catch (_error) {
    return "";
  }
}

function setDismissedApkUpdateVersion(versionName) {
  try {
    if (versionName) {
      window.localStorage.setItem(APK_UPDATE_STORAGE_KEY, versionName);
      return;
    }

    window.localStorage.removeItem(APK_UPDATE_STORAGE_KEY);
  } catch (_error) {
    // Local storage may be unavailable in some embedded WebViews.
  }
}

function getAutoDownloadedApkVersion() {
  try {
    return window.localStorage.getItem(APK_UPDATE_AUTODOWNLOAD_STORAGE_KEY) || "";
  } catch (_error) {
    return "";
  }
}

function setAutoDownloadedApkVersion(versionName) {
  try {
    window.localStorage.setItem(APK_UPDATE_AUTODOWNLOAD_STORAGE_KEY, versionName);
  } catch (_error) {
    // Local storage may be unavailable in some embedded WebViews.
  }
}

function startBackgroundApkDownload(updateInfo) {
  if (!updateInfo?.apkUrl) {
    return;
  }

  const absoluteApkUrl = getAbsoluteUrl(updateInfo.apkUrl);

  // APK 1.0 costuma lidar melhor com navegacao direta na mesma tela.
  openSameWindow(absoluteApkUrl);
  window.setTimeout(() => {
    openSameWindow(absoluteApkUrl);
  }, 250);
}

function closeApkUpdateDialog() {
  if (apkUpdateDialog?.open) {
    apkUpdateDialog.close();
  }
}

function renderApkUpdateDialog() {
  if (!apkUpdateDialog) {
    return;
  }

  const updateInfo = state.apkUpdate;

  if (!updateInfo) {
    apkUpdateButton.textContent = "Atualizar agora";
    apkUpdateButton.removeAttribute("aria-disabled");
    apkUpdateMessage.textContent = "Existe uma versao nova do APK pronta para instalar.";
    apkUpdateMeta.textContent = "";
    apkUpdateRequired.classList.add("hidden");
    apkUpdateNotes.innerHTML = "";
    apkUpdateNotes.classList.add("hidden");
    apkUpdateLink.href = "#";
    apkUpdateLink.classList.add("hidden");
    apkUpdateDismissButton.classList.remove("hidden");
    closeApkUpdateDialog();
    return;
  }

  apkUpdateTitle.textContent = updateInfo.required
    ? `Atualizacao obrigatoria: versao ${updateInfo.versionName}`
    : `Nova versao disponivel: ${updateInfo.versionName}`;
  apkUpdateMessage.textContent =
    `Seu APK atual e ${updateInfo.currentVersion || "desconhecido"}. A versao ${updateInfo.versionName} ja esta sendo baixada em segundo plano e a instalacao abre automaticamente quando terminar.`;

  const publishedDate = updateInfo.publishedAt ? new Date(updateInfo.publishedAt) : null;
  apkUpdateMeta.textContent =
    publishedDate && !Number.isNaN(publishedDate.getTime())
      ? `Publicado em ${formatters.datetime.format(publishedDate)}.`
      : "";

  apkUpdateRequired.classList.toggle("hidden", !updateInfo.required);
  apkUpdateDismissButton.classList.toggle("hidden", updateInfo.required);

  apkUpdateNotes.innerHTML = "";
  if (updateInfo.notes.length) {
    updateInfo.notes.forEach((note) => {
      const item = document.createElement("li");
      item.textContent = note;
      apkUpdateNotes.appendChild(item);
    });
    apkUpdateNotes.classList.remove("hidden");
  } else {
    apkUpdateNotes.classList.add("hidden");
  }

  apkUpdateLink.href = getAbsoluteUrl(updateInfo.apkUrl);
  apkUpdateLink.classList.remove("hidden");

  if (!updateInfo.required) {
    // Atualizacoes opcionais baixam sozinhas em segundo plano; o Android avisa
    // com a tela nativa de instalacao assim que o download terminar.
    closeApkUpdateDialog();
    return;
  }

  if (!apkUpdateDialog.open) {
    apkUpdateDialog.showModal();
  }
}

async function checkForApkUpdate() {
  if (!isAndroidShell() || isUnconfiguredAndroidShell()) {
    state.apkUpdate = null;
    renderApkUpdateDialog();
    return;
  }

  const currentVersion = getAndroidShellVersion();
  if (!currentVersion) {
    state.apkUpdate = null;
    renderApkUpdateDialog();
    return;
  }

  try {
    const response = await fetch(`/apk/latest.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Nao foi possivel verificar atualizacao do app.");
    }

    const manifest = await response.json();
    if (!manifest?.versionName || !manifest?.apkUrl) {
      state.apkUpdate = null;
      renderApkUpdateDialog();
      return;
    }

    const hasNewVersion = compareVersionParts(manifest.versionName, currentVersion) > 0;
    if (!hasNewVersion) {
      state.apkUpdate = null;
      renderApkUpdateDialog();
      return;
    }

    const requiredBelow = String(manifest.requiredBelow || "").trim();
    state.apkUpdate = {
      versionName: String(manifest.versionName).trim(),
      versionCode: Number(manifest.versionCode || 0),
      apkUrl: String(manifest.apkUrl).trim(),
      publishedAt: String(manifest.publishedAt || "").trim(),
      currentVersion,
      notes: Array.isArray(manifest.notes) ? manifest.notes.map((item) => String(item).trim()).filter(Boolean) : [],
      required: requiredBelow ? compareVersionParts(currentVersion, requiredBelow) <= 0 : false,
    };

    if (getAutoDownloadedApkVersion() !== state.apkUpdate.versionName) {
      startBackgroundApkDownload(state.apkUpdate);
      setAutoDownloadedApkVersion(state.apkUpdate.versionName);
    }
  } catch (_error) {
    state.apkUpdate = null;
  }

  renderApkUpdateDialog();
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    const networkError = new Error("Sem conexao com o servidor.");
    networkError.isNetworkError = true;
    throw networkError;
  }

  if (!response.ok) {
    let message = "Erro inesperado.";
    try {
      const data = await response.json();
      message = data.error || message;
    } catch (_error) {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function formatVehicle(record) {
  const vehiclePlate = record.vehicle_plate ? String(record.vehicle_plate).toUpperCase() : "Nao informado";
  if (state.user?.role === "employee" && !SHOW_EMPLOYEE_KM_FIELDS) {
    return `Veiculo: ${vehiclePlate}`;
  }

  const vehicleKm = record.vehicle_km ?? "Nao informado";
  return `Veiculo: ${vehiclePlate} - KM: ${vehicleKm}`;
}

function formatActionLabel(action) {
  return String(action || "")
    .replaceAll("Saida para almoco", "Parada")
    .replaceAll("Retorno do almoco", "Retorno");
}

function formatCreatedAt(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return formatters.datetime.format(date);
}

function formatDateTimeLocalValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return localDate.toISOString().slice(0, 19);
}

function buildRecordDatePayload(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    recordedAt: date.toISOString(),
    localDate: formatters.date.format(date),
    localTime: formatters.time.format(date),
  };
}

function createMapsUrl(record) {
  if (typeof record.latitude !== "number" || typeof record.longitude !== "number") {
    return "";
  }

  return `https://www.google.com/maps/search/?api=1&query=${record.latitude},${record.longitude}`;
}

function buildQueryString(params) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function getDownloadFileName(contentDisposition, fallbackFileName) {
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return fallbackFileName;
}

function getAbsoluteUrl(path) {
  return new URL(path, window.location.origin).toString();
}

function openExternalLink(url) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function openSameWindow(url) {
  window.location.assign(url);
}

function triggerNativeDownload(url) {
  const anchor = document.createElement("a");
  anchor.href = url;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function getSignedExportXlsxUrl(filters) {
  const data = await api("/api/admin/export.xlsx/link", {
    method: "POST",
    body: JSON.stringify(filters),
  });

  if (!data?.url) {
    throw new Error("Nao foi possivel preparar o link da planilha.");
  }

  return getAbsoluteUrl(data.url);
}

async function shareFileFromBlob(blob, fileName) {
  if (typeof File === "undefined" || !navigator.share) {
    return false;
  }

  const file = new File([blob], fileName, {
    type: blob.type || "application/octet-stream",
  });

  if (navigator.canShare && !navigator.canShare({ files: [file] })) {
    return false;
  }

  await navigator.share({
    title: fileName,
    files: [file],
  });

  return true;
}

function hasActiveAdminFilters() {
  return Boolean(
    state.adminFilters.employeeId ||
    state.adminFilters.vehiclePlate ||
    state.adminFilters.dateFrom ||
    state.adminFilters.dateTo
  );
}

function shouldShowAdminSummary() {
  return state.user?.role === "admin";
}

function formatElapsed(totalMs) {
  const safeMinutes = Math.max(Math.floor(totalMs / 60000), 0);
  return `${String(Math.floor(safeMinutes / 60)).padStart(2, "0")}:${String(safeMinutes % 60).padStart(2, "0")}`;
}

function getShortTime(record) {
  return String(record.local_time || "").slice(0, 5);
}

// Junta o que ja esta no servidor com a fila offline, para a tela do funcionario
// mostrar a jornada real mesmo antes da sincronizacao.
function getEmployeeTimelineRecords() {
  const queued = getPendingPunches()
    .filter((entry) => entry.status !== "error")
    .map((entry) => ({
      action: entry.payload.action,
      recorded_at: entry.payload.recordedAt,
      local_date: entry.payload.localDate,
      local_time: entry.payload.localTime,
      vehicle_plate: entry.payload.vehiclePlate,
      vehicle_km: entry.payload.vehicleKm,
      pending: true,
    }));

  return [...state.records, ...queued].sort(
    (left, right) => new Date(left.recorded_at) - new Date(right.recorded_at)
  );
}

function getOpenJourneyRecordsClient(sortedRecords) {
  const lastExitIndex = sortedRecords.map((record) => record.action).lastIndexOf("Saida");
  return lastExitIndex === -1 ? [...sortedRecords] : sortedRecords.slice(lastExitIndex + 1);
}

// Espelha a regra de sequencia do backend para nao oferecer botao que o servidor recusa.
function getAllowedNextActionsClient(sortedRecords) {
  const journeyRecords = getOpenJourneyRecordsClient(sortedRecords);
  if (!journeyRecords.length) {
    return ["Entrada"];
  }

  const lastAction = journeyRecords[journeyRecords.length - 1].action;
  if (lastAction === "Entrada" || lastAction === "Retorno do almoco") {
    return ["Saida para almoco", "Saida"];
  }
  if (lastAction === "Saida para almoco") {
    return ["Retorno do almoco"];
  }

  return ["Entrada"];
}

function computeJourneyState() {
  const sortedRecords = getEmployeeTimelineRecords();
  const openRecords = getOpenJourneyRecordsClient(sortedRecords);
  const today = formatters.date.format(new Date());
  const journeyRecords = openRecords.length
    ? openRecords
    : sortedRecords.filter((record) => record.local_date === today);

  const now = Date.now();
  let workedMs = 0;
  let breakMs = 0;
  let segmentStartedAt = null;
  let breakStartedAt = null;

  for (const record of journeyRecords) {
    const recordedAt = new Date(record.recorded_at).getTime();
    if (Number.isNaN(recordedAt)) {
      continue;
    }

    if (record.action === "Entrada" || record.action === "Retorno do almoco") {
      if (record.action === "Retorno do almoco" && breakStartedAt) {
        breakMs += recordedAt - breakStartedAt;
        breakStartedAt = null;
      }
      segmentStartedAt = recordedAt;
    } else if (record.action === "Saida para almoco") {
      if (segmentStartedAt) {
        workedMs += recordedAt - segmentStartedAt;
        segmentStartedAt = null;
      }
      breakStartedAt = recordedAt;
    } else if (record.action === "Saida") {
      if (segmentStartedAt) {
        workedMs += recordedAt - segmentStartedAt;
        segmentStartedAt = null;
      }
      breakStartedAt = null;
    }
  }

  // Segmento ainda aberto conta ate agora, para o contador andar sozinho.
  if (segmentStartedAt) {
    workedMs += now - segmentStartedAt;
  }
  if (breakStartedAt) {
    breakMs += now - breakStartedAt;
  }

  const lastRecord = journeyRecords[journeyRecords.length - 1] || null;
  const openEntry = openRecords[0] || null;
  let status = "idle";
  if (openRecords.length) {
    status = lastRecord?.action === "Saida para almoco" ? "break" : "working";
  } else if (journeyRecords.length) {
    status = "done";
  }

  return {
    status,
    records: journeyRecords,
    workedMs,
    breakMs,
    startedAt: openEntry || journeyRecords[0] || null,
    lastRecord,
    allowedActions: getAllowedNextActionsClient(sortedRecords),
  };
}

const JOURNEY_STATE_LABELS = {
  idle: "Jornada nao iniciada",
  working: "Trabalhando agora",
  break: "Em parada",
  done: "Jornada encerrada",
};

function renderJourneyCard() {
  if (!journeyCard || !journeyState || !journeyWorked || !journeyBreak) {
    return;
  }

  const isEmployee = state.user?.role === "employee";
  journeyCard.classList.toggle("hidden", !isEmployee);
  if (!isEmployee) {
    return;
  }

  const journey = computeJourneyState();
  journeyCard.dataset.state = journey.status;
  journeyState.textContent = JOURNEY_STATE_LABELS[journey.status];
  journeyWorked.textContent = formatElapsed(journey.workedMs);
  journeyBreak.textContent = formatElapsed(journey.breakMs);

  if (journeyOvertimeTag) {
    // Usa a carga horaria real do funcionario quando o backend ja informou
    // (alguns funcionarios tem excecao, ex.: 9:18 em vez de 8h); 8h e so o
    // valor padrao ate a primeira carga do resumo semanal chegar.
    const dailyWorkloadMinutes = state.weekSummary?.dailyWorkloadMinutes ?? 480;
    const isOvertime = journey.workedMs > dailyWorkloadMinutes * 60000;
    journeyOvertimeTag.classList.toggle("hidden", !isOvertime);
  }

  if (journeySince) {
    if (journey.status === "working" && journey.startedAt) {
      journeySince.textContent = `desde ${getShortTime(journey.startedAt)}`;
    } else if (journey.status === "break" && journey.lastRecord) {
      journeySince.textContent = `desde ${getShortTime(journey.lastRecord)}`;
    } else if (journey.status === "done" && journey.lastRecord) {
      journeySince.textContent = `encerrada as ${getShortTime(journey.lastRecord)}`;
    } else {
      journeySince.textContent = "";
    }
  }

  renderActionButtons(journey.allowedActions);
}

function renderActionButtons(allowedActions) {
  if (state.user?.role !== "employee") {
    return;
  }

  const nextAction = allowedActions[0];

  for (const button of actionButtons) {
    const isAllowed = allowedActions.includes(button.dataset.action);
    button.disabled = !isAllowed;
    button.classList.toggle("action-button-blocked", !isAllowed);
    button.classList.toggle("action-button-next", button.dataset.action === nextAction);
  }

  if (nextActionHint) {
    const labels = allowedActions.map(formatPunchLabel).join(" ou ");
    nextActionHint.textContent = `Proxima acao: ${labels}.`;
  }
}

// Na tela do funcionario o vocabulario e o dos botoes (Inicio/Parada/Retorno/Termino),
// nao o do banco (Entrada/Saida). O painel do admin continua com os nomes tecnicos.
const PUNCH_LABELS = {
  "Entrada": "Inicio",
  "Saida para almoco": "Parada",
  "Retorno do almoco": "Retorno",
  "Saida": "Termino",
};

function formatPunchLabel(action) {
  return PUNCH_LABELS[action] || formatActionLabel(action);
}

// "Saida para almoco" e "Saida" nao podem cair na mesma cor, por isso o mapa explicito.
const PUNCH_ITEM_CLASSES = {
  "Entrada": "punch-inicio",
  "Saida para almoco": "punch-parada",
  "Retorno do almoco": "punch-retorno",
  "Saida": "punch-termino",
};

function renderEmployeeTimeline() {
  const today = formatters.date.format(new Date());
  const todayRecords = getEmployeeTimelineRecords().filter((record) => record.local_date === today);

  if (!todayRecords.length) {
    recordsList.innerHTML = '<p class="muted">Nenhum registro hoje. Toque em Inicio para comecar a jornada.</p>';
    return;
  }

  const mapPin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>';

  recordsList.innerHTML = `<ol class="punch-timeline">${todayRecords
    .map((record) => {
      const mapsUrl = createMapsUrl(record);
      const plate = record.vehicle_plate ? String(record.vehicle_plate).toUpperCase() : "";
      const meta = [plate, record.pending ? "aguardando envio" : ""].filter(Boolean).join(" | ");
      const mapLink = mapsUrl
        ? `<a class="punch-map" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Ver no Google Maps">${mapPin}</a>`
        : "";

      return `
        <li class="punch-item ${PUNCH_ITEM_CLASSES[record.action] || ""}${record.pending ? " punch-pending" : ""}">
          <span class="punch-time">${escapeHtml(getShortTime(record))}</span>
          <span class="punch-body">
            <span class="punch-label">${escapeHtml(formatPunchLabel(record.action))}</span>
            ${meta ? `<span class="punch-meta">${escapeHtml(meta)}</span>` : ""}
          </span>
          ${mapLink}
        </li>
      `;
    })
    .join("")}</ol>`;
}

function renderRecords() {
  recordsList.innerHTML = "";

  if (state.user?.role === "admin" && !hasActiveAdminFilters()) {
    recordsList.innerHTML = '<p class="muted">Use os filtros para pesquisar registros e liberar a edicao administrativa.</p>';
    return;
  }

  if (state.user?.role === "employee") {
    renderEmployeeTimeline();
    return;
  }

  const visibleRecords = state.records;

  if (!visibleRecords.length) {
    recordsList.innerHTML = '<p class="muted">Nenhum registro encontrado para os filtros informados.</p>';
    return;
  }

  for (const record of visibleRecords) {
    const node = recordTemplate.content.cloneNode(true);
    const title =
      state.user.role === "admin"
        ? `${record.employee_name} (${record.employee_id})`
        : `${state.user.name} (${state.user.employeeId})`;
    const mapsUrl = createMapsUrl(record);

    node.querySelector(".record-title").textContent = title;
    node.querySelector(".record-meta").textContent = formatters.datetime.format(new Date(record.recorded_at));
    node.querySelector(".record-vehicle").textContent = formatVehicle(record);
    if (mapsUrl) {
      const mapLink = node.querySelector(".record-map-link");
      mapLink.href = mapsUrl;
      mapLink.classList.remove("hidden");
    }
    node.querySelector(".record-action").textContent = formatActionLabel(record.action);
    const editButton = node.querySelector("[data-edit-record]");
    if (state.user.role === "admin" && editButton) {
      editButton.dataset.editRecord = String(record.id);
      editButton.classList.remove("hidden");
    }
    recordsList.appendChild(node);
  }
}

function renderEmployeeFilter() {
  const isAdmin = state.user?.role === "admin";
  exportActions.classList.toggle("hidden", !isAdmin);

  if (!isAdmin) {
    recordsFilterPanel.classList.add("hidden");
    return;
  }

  recordsFilterPanel.classList.remove("hidden");
  employeeFilter.value = state.adminFilters.employeeId;
  vehiclePlateFilter.value = state.adminFilters.vehiclePlate;
  dateFromFilter.value = state.adminFilters.dateFrom;
  dateToFilter.value = state.adminFilters.dateTo;
  updateExportLinks();
}

function renderEmployeeVehicleContext() {
  if (!currentVehicleStatus || !changeVehicleButton) {
    return;
  }

  const isEmployee = state.user?.role === "employee";
  const hasVehicles = state.vehicles.length > 0;
  const context = state.vehicleContext;
  const availableTransferVehicles = getSelectableVehiclesForTransfer().length;

  currentVehicleStatus.classList.toggle("hidden", !isEmployee);
  changeVehicleButton.classList.toggle("hidden", !isEmployee);

  if (!isEmployee) {
    return;
  }

  if (state.offlineSnapshotActive) {
    currentVehicleStatus.textContent = context?.currentVehicle
      ? `Veiculo atual (dado salvo): ${context.currentVehicle.plate}.`
      : "Sem conexao para carregar o veiculo atual.";
    changeVehicleButton.disabled = true;
    return;
  }

  if (!hasVehicles) {
    currentVehicleStatus.textContent = "Nenhum veiculo cadastrado para uso.";
    changeVehicleButton.disabled = true;
    return;
  }

  if (!context?.activeJourney || !context.currentVehicle) {
    const availableVehicles = getSelectableVehiclesForPoint();
    currentVehicleStatus.textContent = availableVehicles.length
      ? "Inicie a jornada para liberar a troca de veiculo."
      : "Todos os veiculos estao em uso no momento.";
    changeVehicleButton.disabled = true;
    return;
  }

  currentVehicleStatus.textContent = SHOW_EMPLOYEE_KM_FIELDS
    ? `Veiculo atual: ${context.currentVehicle.plate} - KM ${context.currentVehicle.km}.`
    : `Veiculo atual: ${context.currentVehicle.plate}.`;
  changeVehicleButton.disabled = availableTransferVehicles === 0;
}

function findVehicleByPlate(plate) {
  const normalizedPlate = String(plate || "").trim().toUpperCase();
  if (!normalizedPlate) {
    return null;
  }

  return state.vehicles.find((vehicle) => String(vehicle.plate || "").trim().toUpperCase() === normalizedPlate) || null;
}

function getStoredVehicleKm(vehicle) {
  if (!vehicle) {
    return "";
  }

  if (vehicle.km !== undefined && vehicle.km !== null && vehicle.km !== "") {
    return String(vehicle.km);
  }

  if (vehicle.currentKm !== undefined && vehicle.currentKm !== null && vehicle.currentKm !== "") {
    return String(vehicle.currentKm);
  }

  if (vehicle.initialKm !== undefined && vehicle.initialKm !== null && vehicle.initialKm !== "") {
    return String(vehicle.initialKm);
  }

  return "0";
}

function syncEmployeeKmVisibility() {
  [vehicleKmField, currentVehicleKmField, nextVehicleKmField].forEach((field) => {
    field?.classList.toggle("hidden", !SHOW_EMPLOYEE_KM_FIELDS);
  });

  if (vehicleKmInput) {
    vehicleKmInput.required = SHOW_EMPLOYEE_KM_FIELDS;
  }

  if (currentVehicleKmInput) {
    currentVehicleKmInput.required = SHOW_EMPLOYEE_KM_FIELDS;
  }

  if (nextVehicleKmInput) {
    nextVehicleKmInput.required = SHOW_EMPLOYEE_KM_FIELDS;
  }
}

function syncSelectedVehicleKm() {
  if (!vehicleKmInput) {
    return;
  }

  vehicleKmInput.value = getStoredVehicleKm(findVehicleByPlate(vehicleSelectInput?.value));
}

function syncTransferVehicleKms() {
  if (currentVehicleKmInput) {
    currentVehicleKmInput.value = getStoredVehicleKm(state.vehicleContext?.currentVehicle);
  }

  if (nextVehicleKmInput) {
    nextVehicleKmInput.value = getStoredVehicleKm(findVehicleByPlate(nextVehicleSelectInput?.value));
  }
}

function getSelectableVehiclesForPoint() {
  const isEmployee = state.user?.role === "employee";
  if (!isEmployee) {
    return state.vehicles;
  }

  const currentVehiclePlate = state.vehicleContext?.currentVehicle?.plate || "";
  if (state.vehicleContext?.activeJourney && currentVehiclePlate) {
    return state.vehicles.filter((vehicle) => vehicle.plate === currentVehiclePlate);
  }

  return state.vehicles.filter((vehicle) => !vehicle.inUseByOtherEmployee);
}

function getSelectableVehiclesForTransfer() {
  const isEmployee = state.user?.role === "employee";
  if (!isEmployee) {
    return state.vehicles;
  }

  const currentVehiclePlate = state.vehicleContext?.currentVehicle?.plate || "";
  return state.vehicles.filter((vehicle) => vehicle.plate !== currentVehiclePlate && !vehicle.inUseByOtherEmployee);
}

function getManagedEmployee() {
  return state.employees.find((employee) => employee.id === state.managedEmployeeId) || null;
}

function normalizeSearchValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFilteredManagedEmployees() {
  const searchTerm = normalizeSearchValue(state.employeeManageSearchApplied);
  if (!searchTerm) {
    return [];
  }

  return state.employees.filter((employee) => {
    const haystack = `${employee.name} ${employee.employeeId}`.toLowerCase();
    return haystack.includes(searchTerm);
  });
}

function getFilteredVehiclesForManagement() {
  const searchTerm = normalizeSearchValue(state.vehicleManageSearchApplied);
  if (!searchTerm) {
    return [];
  }

  return state.vehicles.filter((vehicle) => {
    const haystack = `${vehicle.plate} ${vehicle.description || ""}`.toLowerCase();
    return haystack.includes(searchTerm);
  });
}

function setEmployeeManagerMessage(message, isError = false) {
  employeeManagerMessage.textContent = message;
  employeeManagerMessage.style.color = isError ? "#a33f33" : "";
}

function setVehicleManagerMessage(message, isError = false) {
  vehicleManagerMessage.textContent = message;
  vehicleManagerMessage.style.color = isError ? "#a33f33" : "";
}

function renderEmployeeEditor() {
  const employee = getManagedEmployee();

  if (!employee) {
    employeeEditorPanel.classList.add("hidden");
    manageEmployeeIdInput.value = "";
    employeeEditForm.reset();
    employeePasswordForm.reset();
    return;
  }

  employeeEditorPanel.classList.remove("hidden");
  employeeEditorTitle.textContent = `${employee.name} (${employee.employeeId})`;
  manageEmployeeIdInput.value = employee.id;
  editEmployeeNameInput.value = employee.name;
  editEmployeeIdInput.value = employee.employeeId;
  employeePasswordForm.reset();
}

function renderManagedEmployees() {
  const isAdmin = state.user?.role === "admin";

  if (!isAdmin) {
    state.employees = [];
    state.managedEmployeeId = "";
    state.employeeManageSearch = "";
    state.employeeManageSearchApplied = "";
    employeeAdminBody.innerHTML = "";
    setEmployeeManagerMessage("");
    renderEmployeeEditor();
    syncResponsiveTables();
    return;
  }

  const selectedEmployeeExists = state.employees.some((employee) => employee.id === state.managedEmployeeId);
  if (!selectedEmployeeExists) {
    state.managedEmployeeId = "";
  }

  employeeAdminBody.innerHTML = "";

  if (!state.employees.length) {
    employeeAdminBody.innerHTML = '<tr><td colspan="4" class="empty-row">Nenhum funcionario cadastrado.</td></tr>';
    renderEmployeeEditor();
    syncResponsiveTables();
    return;
  }

  if (employeeManageSearchInput) {
    employeeManageSearchInput.value = state.employeeManageSearch;
  }

  const visibleEmployees = getFilteredManagedEmployees();
  if (!state.employeeManageSearchApplied) {
    employeeAdminBody.innerHTML = '<tr><td colspan="4" class="empty-row">Use a busca para localizar o funcionario que deseja gerenciar.</td></tr>';
    renderEmployeeEditor();
    syncResponsiveTables();
    return;
  }

  if (!visibleEmployees.length) {
    employeeAdminBody.innerHTML = '<tr><td colspan="4" class="empty-row">Nenhum funcionario encontrado para a busca informada.</td></tr>';
    renderEmployeeEditor();
    syncResponsiveTables();
    return;
  }

  for (const employee of visibleEmployees) {
    const row = document.createElement("tr");
    if (employee.id === state.managedEmployeeId) {
      row.classList.add("employee-row-active");
    }

    const nameCell = document.createElement("td");
    nameCell.textContent = employee.name;

    const employeeIdCell = document.createElement("td");
    employeeIdCell.textContent = employee.employeeId;

    const createdAtCell = document.createElement("td");
    createdAtCell.textContent = formatCreatedAt(employee.createdAt);

    const actionsCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "employee-actions";

    const manageButton = document.createElement("button");
    manageButton.type = "button";
    manageButton.className = employee.id === state.managedEmployeeId ? "secondary table-action" : "ghost table-action";
    manageButton.dataset.manageEmployee = employee.id;
    manageButton.textContent = employee.id === state.managedEmployeeId ? "Selecionado" : "Gerenciar";

    actions.appendChild(manageButton);
    actionsCell.appendChild(actions);
    row.append(nameCell, employeeIdCell, createdAtCell, actionsCell);
    employeeAdminBody.appendChild(row);
  }

  renderEmployeeEditor();
  syncResponsiveTables();
}

function renderVehicles() {
  if (vehicleSelectInput) {
    vehicleSelectInput.innerHTML = '<option value="">Selecione uma placa</option>';
    for (const vehicle of getSelectableVehiclesForPoint()) {
      const option = document.createElement("option");
      option.value = vehicle.plate;
      option.textContent = vehicle.description ? `${vehicle.plate} - ${vehicle.description}` : vehicle.plate;
      vehicleSelectInput.appendChild(option);
    }
  }

  if (nextVehicleSelectInput) {
    nextVehicleSelectInput.innerHTML = '<option value="">Selecione a nova placa</option>';
    for (const vehicle of getSelectableVehiclesForTransfer()) {
      const option = document.createElement("option");
      option.value = vehicle.plate;
      option.textContent = vehicle.description ? `${vehicle.plate} - ${vehicle.description}` : vehicle.plate;
      nextVehicleSelectInput.appendChild(option);
    }
  }

  if (vehicleSearchSuggestions) {
    vehicleSearchSuggestions.innerHTML = "";
    for (const vehicle of state.vehicles) {
      const option = document.createElement("option");
      option.value = vehicle.description ? `${vehicle.plate} - ${vehicle.description}` : vehicle.plate;
      vehicleSearchSuggestions.appendChild(option);
    }
  }

  if (!vehicleAdminBody) {
    return;
  }

  if (state.user?.role !== "admin") {
    vehicleAdminBody.innerHTML = "";
    state.showVehicleRegisterForm = false;
    state.vehicleManageSearch = "";
    state.vehicleManageSearchApplied = "";
    vehicleRegisterForm.classList.add("hidden");
    syncResponsiveTables();
    return;
  }

  vehicleRegisterForm.classList.toggle("hidden", !state.showVehicleRegisterForm);
  toggleVehicleRegisterButton.textContent = state.showVehicleRegisterForm ? "Ocultar cadastro" : "Novo veiculo";

  vehicleAdminBody.innerHTML = "";

  if (!state.vehicles.length) {
    vehicleAdminBody.innerHTML = '<tr><td colspan="5" class="empty-row">Nenhum veiculo cadastrado.</td></tr>';
    syncResponsiveTables();
    return;
  }

  if (vehicleSearchInput) {
    vehicleSearchInput.value = state.vehicleManageSearch;
  }

  const visibleVehicles = getFilteredVehiclesForManagement();
  if (!state.vehicleManageSearchApplied) {
    vehicleAdminBody.innerHTML = '<tr><td colspan="5" class="empty-row">Use a busca para localizar o veiculo que deseja consultar ou excluir.</td></tr>';
    syncResponsiveTables();
    return;
  }

  if (!visibleVehicles.length) {
    vehicleAdminBody.innerHTML = '<tr><td colspan="5" class="empty-row">Nenhum veiculo encontrado para a busca informada.</td></tr>';
    syncResponsiveTables();
    return;
  }

  for (const vehicle of visibleVehicles) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${vehicle.plate}</td>
      <td>${vehicle.description || "-"}</td>
      <td>${vehicle.initialKm ?? 0}</td>
      <td>${vehicle.currentKm ?? 0}</td>
      <td>
        <div class="employee-actions">
          <button type="button" class="ghost table-action" data-delete-vehicle="${vehicle.id}">Excluir</button>
        </div>
      </td>
    `;
    vehicleAdminBody.appendChild(row);
  }

  syncResponsiveTables();
  renderEmployeeVehicleContext();
}

function updateExportLinks() {
  const queryString = buildQueryString(state.adminFilters);
  exportXlsxLink.href = `/api/admin/export.xlsx${queryString}`;
}

function renderRegisterForm() {
  const isAdmin = state.user?.role === "admin";

  if (!isAdmin) {
    state.showRegisterForm = false;
    registerForm.classList.add("hidden");
    return;
  }

  registerForm.classList.toggle("hidden", !state.showRegisterForm);
  toggleRegisterButton.textContent = state.showRegisterForm ? "Ocultar cadastro" : "Novo cadastro";
}

function renderSummary() {
  if (!summaryPanel || !summaryTitle || !summaryContent || !toggleSummaryButton) {
    return;
  }

  const showSummary = shouldShowAdminSummary();
  const hasFilters = hasActiveAdminFilters();
  summaryPanel.classList.toggle("hidden", !showSummary);
  summaryContent.classList.toggle("hidden", !showSummary || state.summaryCollapsed);

  if (!showSummary) {
    summaryBody.innerHTML = "";
    syncResponsiveTables();
    return;
  }

  summaryTitle.textContent = hasFilters
    ? "Resumo administrativo (filtros aplicados)"
    : "Resumo administrativo (ultimas 48h)";
  toggleSummaryButton.textContent = state.summaryCollapsed ? "Mostrar resumo" : "Ocultar resumo";

  if (state.summaryCollapsed) {
    syncResponsiveTables();
    return;
  }

  summaryBody.innerHTML = "";
  if (!state.summary.length) {
    summaryBody.innerHTML = hasFilters
      ? '<tr><td colspan="7" class="empty-row">Nenhum resumo encontrado para os filtros informados.</td></tr>'
      : '<tr><td colspan="7" class="empty-row">Nenhum resumo disponivel nas ultimas 48 horas.</td></tr>';
    syncResponsiveTables();
    return;
  }

  for (const item of state.summary) {
    const row = document.createElement("tr");
    const hasOvertime = item.overtimeHours && item.overtimeHours !== "00:00";
    const overtimeClass = hasOvertime ? "summary-badge overtime" : "summary-badge neutral";
    const intervalClass = item.intervalHours && item.intervalHours !== "00:00" ? "summary-badge interval" : "summary-badge neutral";
    const kmClass = item.dailyKm !== "" && item.dailyKm !== null ? "summary-badge km" : "summary-badge neutral";

    row.innerHTML = `
      <td>
        <div class="summary-main">${item.employeeName}</div>
      </td>
      <td>
        <span class="summary-date">${item.localDate}</span>
      </td>
      <td>
        <span class="summary-vehicle">${item.vehiclePlate || "-"}</span>
      </td>
      <td>
        <span class="${kmClass}">${item.dailyKm === "" ? "0" : item.dailyKm}</span>
      </td>
      <td>
        <span class="summary-total">${item.workedHours}</span>
      </td>
      <td>
        <span class="${overtimeClass}">${item.overtimeHours || "00:00"}</span>
      </td>
      <td>
        <span class="${intervalClass}">${item.intervalHours || "00:00"}</span>
      </td>
    `;
    if (hasOvertime) {
      row.classList.add("summary-row-overtime");
    }
    summaryBody.appendChild(row);
  }

  syncResponsiveTables();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildAlertsSubtitle() {
  const counts = state.alertCounts;
  if (!counts || !counts.total) {
    return "Nenhuma pendencia encontrada.";
  }

  const parts = [];
  if (counts.alta) {
    parts.push(`${counts.alta} urgente${counts.alta > 1 ? "s" : ""}`);
  }
  if (counts.media) {
    parts.push(`${counts.media} para conferir`);
  }
  if (counts.baixa) {
    parts.push(`${counts.baixa} de baixa prioridade`);
  }

  return parts.join(" | ");
}

function renderAlerts() {
  renderAdminTabs();

  if (!alertsPanel || !alertsContent || !alertsTitle || !toggleAlertsButton) {
    return;
  }

  const showAlerts = shouldShowAdminSummary();
  alertsPanel.classList.toggle("hidden", !showAlerts);
  alertsContent.classList.toggle("hidden", !showAlerts || state.alertsCollapsed);

  if (!showAlerts) {
    alertsContent.innerHTML = "";
    return;
  }

  const total = state.alertCounts?.total || 0;
  alertsTitle.textContent = total ? `Pendencias (${total})` : "Pendencias";
  alertsPanel.classList.toggle("alerts-panel-critical", Boolean(state.alertCounts?.alta));
  if (alertsSubtitle) {
    alertsSubtitle.textContent = buildAlertsSubtitle();
  }
  toggleAlertsButton.textContent = state.alertsCollapsed ? "Mostrar pendencias" : "Ocultar pendencias";

  if (state.alertsCollapsed) {
    return;
  }

  if (!state.alerts.length) {
    alertsContent.innerHTML = '<p class="alert-empty">Tudo certo. Nenhuma pendencia no periodo analisado.</p>';
    return;
  }

  alertsContent.innerHTML = state.alerts
    .map((alert) => {
      const elapsed = alert.elapsed ? `<span class="alert-elapsed">${escapeHtml(alert.elapsed)}</span>` : "";
      return `
        <article class="alert-card alert-${escapeHtml(alert.severity)}">
          <div class="alert-card-head">
            <span class="alert-title">${escapeHtml(alert.title)}</span>
            ${elapsed}
          </div>
          <p class="alert-employee">${escapeHtml(alert.employeeName)} - matricula ${escapeHtml(alert.employeeId)}</p>
          <p class="alert-detail">${escapeHtml(alert.detail)}</p>
        </article>
      `;
    })
    .join("");
}

function handleToggleAlerts() {
  if (state.user?.role !== "admin") {
    return;
  }

  state.alertsCollapsed = !state.alertsCollapsed;
  renderAlerts();
}

async function loadAlerts() {
  if (state.user?.role !== "admin") {
    state.alerts = [];
    state.alertCounts = null;
    renderAlerts();
    return;
  }

  // As pendencias so respeitam o filtro de matricula: periodo e veiculo cortariam
  // batidas do meio da jornada e criariam alerta falso.
  const data = await api(`/api/admin/alerts${buildQueryString({ employeeId: state.adminFilters.employeeId })}`);
  state.alerts = data.alerts || [];
  state.alertCounts = data.counts || null;
  renderAlerts();
}

function renderCompanyStatTiles() {
  if (!companyStatTiles || !statTileEmployeeCount || !statTileWorked || !statTileOvertime || !statTileKm) {
    return;
  }

  const showTiles = shouldShowAdminSummary() && Boolean(state.summaryCompanyTotals);
  companyStatTiles.classList.toggle("hidden", !showTiles);

  if (!showTiles) {
    return;
  }

  statTileEmployeeCount.textContent = state.summaryCompanyTotals.employeeCount;
  statTileWorked.textContent = state.summaryCompanyTotals.workedHours;
  statTileOvertime.textContent = state.summaryCompanyTotals.overtimeHours;
  statTileKm.textContent = state.summaryCompanyTotals.dailyKm;
}

function renderSummaryAggregates() {
  renderCompanyStatTiles();

  if (!employeeAggregatesPanel || !employeeAggregatesContent || !employeeAggregatesBody || !toggleAggregatesButton) {
    return;
  }

  const showAggregates = shouldShowAdminSummary();
  employeeAggregatesPanel.classList.toggle("hidden", !showAggregates);
  employeeAggregatesContent.classList.toggle("hidden", !showAggregates || state.aggregatesCollapsed);

  if (!showAggregates) {
    employeeAggregatesBody.innerHTML = "";
    return;
  }

  toggleAggregatesButton.textContent = state.aggregatesCollapsed ? "Mostrar totais" : "Ocultar totais";

  if (state.aggregatesCollapsed) {
    return;
  }

  employeeAggregatesBody.innerHTML = "";
  if (!state.summaryAggregates.length) {
    employeeAggregatesBody.innerHTML = '<tr><td colspan="5" class="empty-row">Nenhum dado carregado.</td></tr>';
    return;
  }

  for (const employee of state.summaryAggregates) {
    const row = document.createElement("tr");
    const hasOvertime = employee.overtimeHours && employee.overtimeHours !== "00:00";
    const overtimeClass = hasOvertime ? "summary-badge overtime" : "summary-badge neutral";

    row.innerHTML = `
      <td>
        <div class="summary-main">${employee.employeeName}</div>
      </td>
      <td>${employee.daysWorked}</td>
      <td><span class="summary-total">${employee.workedHours}</span></td>
      <td><span class="${overtimeClass}">${employee.overtimeHours || "00:00"}</span></td>
      <td><span class="summary-badge km">${employee.dailyKm}</span></td>
    `;
    employeeAggregatesBody.appendChild(row);
  }
}

function handleToggleAggregates() {
  if (state.user?.role !== "admin") {
    return;
  }

  state.aggregatesCollapsed = !state.aggregatesCollapsed;
  renderSummaryAggregates();
}

// O painel do admin virou 3 abas (Visao geral / Registros / Cadastros) para nao
// obrigar rolagem longa toda vez que o admin so quer ver pendencias. A secao de
// Registros e compartilhada com a tela do funcionario, entao ela fica fora do
// #adminPanel no DOM e e apenas escondida/mostrada aqui conforme a aba ativa.
function renderAdminTabs() {
  const isAdmin = state.user?.role === "admin";
  if (adminTabs) {
    adminTabs.classList.toggle("hidden", !isAdmin);
  }

  if (!isAdmin) {
    recordsSection?.classList.remove("hidden");
    return;
  }

  for (const button of adminTabButtons) {
    button.classList.toggle("active", button.dataset.adminTab === state.adminTab);
  }

  adminTabOverview?.classList.toggle("hidden", state.adminTab !== "overview");
  adminTabCadastros?.classList.toggle("hidden", state.adminTab !== "cadastros");
  recordsSection?.classList.toggle("hidden", state.adminTab !== "registros");

  if (adminOverviewDot) {
    adminOverviewDot.classList.toggle("hidden", !state.alertCounts?.total);
  }
}

function handleAdminTabClick(event) {
  const button = event.target.closest(".admin-tab");
  if (!button) {
    return;
  }

  state.adminTab = button.dataset.adminTab;
  renderAdminTabs();
}

function renderSession() {
  const user = state.user;
  const loggedIn = Boolean(user);

  authPanel.classList.toggle("hidden", loggedIn);
  appPanel.classList.toggle("hidden", !loggedIn);
  renderApkUpdateDialog();

  if (!loggedIn) {
    return;
  }

  sessionTitle.textContent = `${user.name}`;
  sessionSubtitle.textContent =
    user.role === "admin"
      ? ""
      : "";

  const isAdmin = user.role === "admin";
  employeePanel.classList.toggle("hidden", isAdmin);
  adminPanel.classList.toggle("hidden", !isAdmin);
  recordsTitle.textContent = isAdmin ? "Todos os registros" : "Meus registros";
  recordsSubtitle.textContent = isAdmin
    ? ""
    : "";

  renderEmployeeFilter();
  renderRegisterForm();
  renderManagedEmployees();
  renderVehicles();
  renderEmployeeVehicleContext();
  renderJourneyCard();
  renderWeekSummary();
  renderRecords();
  renderSummary();
  renderSummaryAggregates();
  renderAlerts();
  renderAdminTabs();
}

async function loadSession() {
  try {
    const data = await api("/api/auth/session");
    state.user = data.user;
    state.offlineSnapshotActive = false;
    state.offlineSnapshotCachedAt = "";
  } catch (error) {
    const snapshot = error.isNetworkError ? readOfflineSnapshot() : null;
    if (!snapshot?.user) {
      throw error;
    }

    state.user = snapshot.user;
    state.records = snapshot.records || [];
    state.vehicleContext = snapshot.vehicleContext || null;
    state.offlineSnapshotActive = true;
    state.offlineSnapshotCachedAt = snapshot.cachedAt || "";
  }

  renderSession();
  renderOfflineBanner();

  if (state.offlineSnapshotActive) {
    renderEmployeeFilter();
    renderRecords();
    renderEmployeeVehicleContext();
    return;
  }

  await checkForApkUpdate();

  if (state.user) {
    await loadVehicles();
    await loadRecords();
    if (state.user.role === "admin") {
      await loadEmployees();
      await loadAdminInsights();
    } else {
      await loadVehicleContext();
      await loadWeekSummary();
    }
  }
}

async function refreshSessionIfOffline() {
  if (!state.offlineSnapshotActive) {
    return;
  }

  await loadSession();
}

async function loadRecords() {
  if (state.user?.role === "admin" && !hasActiveAdminFilters()) {
    state.records = [];
    renderEmployeeFilter();
    renderRecords();
    return;
  }

  const path =
    state.user?.role === "admin"
      ? `/api/me/records${buildQueryString(state.adminFilters)}`
      : "/api/me/records";
  const data = await api(path);
  state.records = data.records;
  renderEmployeeFilter();
  renderRecords();
  persistOfflineSnapshot();
}

async function loadSummary() {
  if (state.user?.role !== "admin") {
    state.summary = [];
    state.summaryAggregates = [];
    state.summaryCompanyTotals = null;
    renderSummary();
    renderSummaryAggregates();
    return;
  }

  const data = await api(`/api/admin/summary${buildQueryString(state.adminFilters)}`);
  state.summary = data.summary;
  state.summaryAggregates = data.aggregates || [];
  state.summaryCompanyTotals = data.companyTotals || null;
  renderSummary();
  renderSummaryAggregates();
}

// Resumo e pendencias andam juntos: toda vez que os registros mudam, os dois
// precisam ser recalculados no painel do admin.
async function loadAdminInsights() {
  await loadSummary();
  await loadAlerts();
}

function handleToggleSummary() {
  if (state.user?.role !== "admin") {
    return;
  }

  state.summaryCollapsed = !state.summaryCollapsed;
  renderSummary();
}

async function loadEmployees() {
  if (state.user?.role !== "admin") {
    state.employees = [];
    state.managedEmployeeId = "";
    renderManagedEmployees();
    renderEmployeeFilter();
    return;
  }

  const data = await api("/api/admin/employees");
  state.employees = data.employees;
  renderManagedEmployees();
}

async function loadVehicleContext() {
  if (state.user?.role !== "employee") {
    state.vehicleContext = null;
    renderEmployeeVehicleContext();
    return;
  }

  const data = await api("/api/me/vehicle-context");
  state.vehicleContext = data.context || null;
  renderEmployeeVehicleContext();
  persistOfflineSnapshot();
}

function renderWeekSummary() {
  if (!weekSummaryCard || !weekSummaryDays || !weekSummaryWorked || !weekSummaryOvertime) {
    return;
  }

  const isEmployee = state.user?.role === "employee";
  weekSummaryCard.classList.toggle("hidden", !isEmployee);
  if (!isEmployee || !state.weekSummary) {
    return;
  }

  weekSummaryDays.textContent = String(state.weekSummary.daysWorked ?? 0);
  weekSummaryWorked.textContent = state.weekSummary.workedHours || "00:00";
  weekSummaryOvertime.textContent = state.weekSummary.overtimeHours || "00:00";
  // A tag de hora extra do card de jornada depende da carga horaria vinda
  // aqui, entao precisa recalcular assim que o resumo da semana chega.
  renderJourneyCard();
}

async function loadWeekSummary() {
  if (state.user?.role !== "employee") {
    state.weekSummary = null;
    renderWeekSummary();
    return;
  }

  const data = await api("/api/me/summary");
  state.weekSummary = data;
  renderWeekSummary();
}

async function loadVehicles() {
  if (!state.user) {
    state.vehicles = [];
    renderVehicles();
    return;
  }

  const data = await api("/api/vehicles");
  state.vehicles = data.vehicles;
  renderVehicles();
}

function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalizacao nao suportada neste dispositivo."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: options.timeout ?? 10000,
      maximumAge: options.maximumAge ?? 0,
    });
  });
}

async function getBestCurrentPosition() {
  const firstAttempt = await getCurrentPosition({ timeout: 10000, maximumAge: 0 });

  if (typeof firstAttempt.coords.accuracy === "number" && firstAttempt.coords.accuracy <= 30) {
    return firstAttempt;
  }

  try {
    const secondAttempt = await getCurrentPosition({ timeout: 15000, maximumAge: 0 });
    if (
      typeof secondAttempt.coords.accuracy === "number" &&
      typeof firstAttempt.coords.accuracy === "number" &&
      secondAttempt.coords.accuracy < firstAttempt.coords.accuracy
    ) {
      return secondAttempt;
    }
  } catch (_error) {
    return firstAttempt;
  }

  return firstAttempt;
}

function collectVehicleInfo() {
  const selectableVehicles = getSelectableVehiclesForPoint();
  if (!selectableVehicles.length) {
    return Promise.resolve(null);
  }

  vehicleForm.reset();
  vehicleFormMessage.textContent = "";
  renderVehicles();
  if (vehicleSelectInput) {
    vehicleSelectInput.value = state.vehicleContext?.currentVehicle?.plate || "";
  }
  if (vehicleKmInput) {
    vehicleKmInput.value = state.vehicleContext?.currentVehicle?.km ?? "";
  }
  if (!SHOW_EMPLOYEE_KM_FIELDS) {
    syncSelectedVehicleKm();
  }

  return new Promise((resolve) => {
    vehicleDialogResolver = resolve;
    vehicleDialog.showModal();
    vehicleSelectInput.focus();
  });
}

function actionRequiresVehiclePrompt(action) {
  return action === "Entrada" || action === "Saida";
}

function getVehicleInfoForAction(action) {
  if (actionRequiresVehiclePrompt(action)) {
    return collectVehicleInfo();
  }

  if (!state.vehicleContext?.activeJourney || !state.vehicleContext.currentVehicle?.plate) {
    return Promise.resolve(null);
  }

  return Promise.resolve({
    vehiclePlate: state.vehicleContext.currentVehicle.plate,
    vehicleKm: Number(state.vehicleContext.currentVehicle.km ?? 0),
  });
}

function collectVehicleTransferInfo() {
  if (!state.vehicleContext?.currentVehicle || !getSelectableVehiclesForTransfer().length) {
    return Promise.resolve(null);
  }

  vehicleTransferForm.reset();
  vehicleTransferMessage.textContent = "";
  renderVehicles();

  if (currentVehiclePlateInput) {
    currentVehiclePlateInput.value = state.vehicleContext.currentVehicle.plate;
  }

  if (currentVehicleKmInput) {
    currentVehicleKmInput.value = state.vehicleContext.currentVehicle.km ?? "";
  }

  if (nextVehicleSelectInput) {
    nextVehicleSelectInput.value = "";
  }

  if (nextVehicleKmInput) {
    nextVehicleKmInput.value = "";
  }
  if (!SHOW_EMPLOYEE_KM_FIELDS) {
    syncTransferVehicleKms();
  }

  return new Promise((resolve) => {
    vehicleTransferDialogResolver = resolve;
    vehicleTransferDialog.showModal();
    currentVehicleKmInput?.focus();
  });
}

async function handleRegister(event) {
  event.preventDefault();
  const payload = {
    name: document.querySelector("#registerName").value.trim(),
    employeeId: document.querySelector("#registerEmployeeId").value.trim(),
    password: document.querySelector("#registerPassword").value.trim(),
  };

  try {
    const data = await api("/api/admin/employees", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    locationStatus.textContent = `Funcionario ${data.user.name} cadastrado com sucesso.`;
    setMessage("");
    registerForm.reset();
    state.showRegisterForm = false;
    renderRegisterForm();
    await loadVehicles();
    await loadEmployees();
    await loadRecords();
    await loadAdminInsights();
  } catch (error) {
    locationStatus.textContent = formatActionLabel(error.message);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const payload = {
    employeeId: document.querySelector("#loginEmployeeId").value.trim(),
    password: document.querySelector("#loginPassword").value.trim(),
  };

  try {
    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setMessage("");
    loginForm.reset();
    await loadSession();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleLogout() {
  await api("/api/auth/logout", { method: "POST" });
  state.user = null;
  state.records = [];
  state.summary = [];
  state.employees = [];
  state.vehicles = [];
  state.vehicleContext = null;
  state.weekSummary = null;
  state.offlineSnapshotActive = false;
  state.offlineSnapshotCachedAt = "";
  clearOfflineSnapshot();
  renderOfflineBanner();
  state.summaryCollapsed = false;
  state.managedEmployeeId = "";
  state.showRegisterForm = false;
  state.showVehicleRegisterForm = false;
  state.employeeManageSearch = "";
  state.employeeManageSearchApplied = "";
  state.vehicleManageSearch = "";
  state.vehicleManageSearchApplied = "";
  state.adminTab = "overview";
  state.adminFilters = {
    employeeId: "",
    vehiclePlate: "",
    dateFrom: "",
    dateTo: "",
  };
  renderSession();
  setMessage("Sessao encerrada com sucesso.");
}

function syncAdminFiltersFromInputs() {
  state.adminFilters.employeeId = employeeFilter.value.trim();
  state.adminFilters.vehiclePlate = vehiclePlateFilter.value.trim().toUpperCase();
  state.adminFilters.dateFrom = dateFromFilter.value;
  state.adminFilters.dateTo = dateToFilter.value;
}

async function applyAdminFilters() {
  syncAdminFiltersFromInputs();
  setEmployeeManagerMessage("");
  renderEmployeeFilter();
  await loadRecords();
  await loadAdminInsights();
}

async function handleApplyAdminFilters() {
  try {
    await applyAdminFilters();
    locationStatus.textContent = "Filtros administrativos atualizados.";
  } catch (error) {
    locationStatus.textContent = error.message;
  }
}

async function handleClearAdminFilters() {
  state.adminFilters = {
    employeeId: "",
    vehiclePlate: "",
    dateFrom: "",
    dateTo: "",
  };
  renderEmployeeFilter();

  try {
    await loadRecords();
    await loadAdminInsights();
    locationStatus.textContent = "Filtros administrativos limpos.";
  } catch (error) {
    locationStatus.textContent = error.message;
  }
}

function handleApkUpdate() {
  if (!state.apkUpdate?.apkUrl) {
    return;
  }

  const absoluteApkUrl = getAbsoluteUrl(state.apkUpdate.apkUrl);
  apkUpdateButton.textContent = "Baixando atualizacao...";
  apkUpdateButton.setAttribute("aria-disabled", "true");
  apkUpdateMessage.textContent = `Abrindo instalacao da versao ${state.apkUpdate.versionName}. Se nao abrir sozinho, use o link logo abaixo.`;
  apkUpdateMeta.textContent = "O Android vai baixar o APK e abrir a instalacao automaticamente.";

  // APK 1.0 costuma lidar melhor com navegacao direta na mesma tela.
  openSameWindow(absoluteApkUrl);
  window.setTimeout(() => {
    openSameWindow(absoluteApkUrl);
  }, 250);

  window.setTimeout(() => {
    if (state.apkUpdate) {
      apkUpdateButton.textContent = "Atualizar agora";
      apkUpdateButton.removeAttribute("aria-disabled");
    }
  }, 2500);
}

function handleApkUpdateLink(event) {
  event.preventDefault();

  if (!apkUpdateLink?.href || apkUpdateLink.href === "#") {
    return;
  }

  openSameWindow(apkUpdateLink.href);
}

function handleApkUpdateDismiss() {
  if (!state.apkUpdate?.required) {
    setDismissedApkUpdateVersion(state.apkUpdate?.versionName || "");
  }

  closeApkUpdateDialog();
}

function handleApkUpdateDialogCancel(event) {
  if (state.apkUpdate?.required) {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  handleApkUpdateDismiss();
}

function handleAppVisible() {
  if (document.visibilityState !== "visible") {
    return;
  }

  refreshSessionIfOffline().catch(() => {});
  checkForApkUpdate().catch(() => {});
  trySyncQueue().catch(() => {});
  refreshAlertsInBackground();
}

// Atualizacao automatica das pendencias enquanto o admin esta com o painel aberto.
function refreshAlertsInBackground() {
  if (state.user?.role !== "admin" || state.offlineSnapshotActive || document.visibilityState !== "visible") {
    return;
  }

  loadAlerts().catch(() => {});
}

async function handleExportXlsx(event) {
  event.preventDefault();

  if (state.user?.role !== "admin") {
    return;
  }

  const queryString = buildQueryString(state.adminFilters);
  const exportUrl = `/api/admin/export.xlsx${queryString}`;
  const originalLabel = exportXlsxLink.textContent;

  exportXlsxLink.textContent = "Gerando planilha...";
  exportXlsxLink.setAttribute("aria-disabled", "true");
  locationStatus.textContent = "Preparando planilha para download...";

  try {
    if (isAndroidShell()) {
      const signedExportUrl = await getSignedExportXlsxUrl(state.adminFilters);
      locationStatus.textContent = "Enviando planilha para o Android...";
      openSameWindow(signedExportUrl);
      window.setTimeout(() => {
        openSameWindow(signedExportUrl);
      }, 250);
      locationStatus.textContent = "O Android esta preparando a planilha.";
      return;
    }

    const response = await fetch(exportUrl, { method: "GET" });
    if (!response.ok) {
      let message = "Falha ao baixar a planilha.";
      try {
        const data = await response.json();
        message = data.error || message;
      } catch (_error) {
        message = response.statusText || message;
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const fileName = getDownloadFileName(
      response.headers.get("content-disposition") || "",
      `planilha-cartao-ponto-lc-transportes-${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);

    locationStatus.textContent = "Download da planilha iniciado.";
  } catch (error) {
    locationStatus.textContent = error.message;
  } finally {
    exportXlsxLink.textContent = originalLabel;
    exportXlsxLink.removeAttribute("aria-disabled");
  }
}

function handleToggleRegisterForm() {
  if (state.user?.role !== "admin") {
    return;
  }

  state.showRegisterForm = !state.showRegisterForm;
  renderRegisterForm();
}

function handleEmployeeAdminClick(event) {
  const button = event.target.closest("[data-manage-employee]");
  if (!button) {
    return;
  }

  state.managedEmployeeId = button.dataset.manageEmployee;
  setEmployeeManagerMessage("");
  renderManagedEmployees();
}

function handleCancelEmployeeEdit() {
  state.managedEmployeeId = "";
  setEmployeeManagerMessage("");
  renderManagedEmployees();
}

function handleSearchEmployees() {
  state.employeeManageSearch = employeeManageSearchInput?.value.trim() || "";
  state.employeeManageSearchApplied = state.employeeManageSearch;
  if (!state.employeeManageSearchApplied) {
    setEmployeeManagerMessage("Digite nome ou matricula para pesquisar.", true);
  } else {
    setEmployeeManagerMessage("");
  }
  renderManagedEmployees();
}

function handleClearEmployeeSearch() {
  state.employeeManageSearch = "";
  state.employeeManageSearchApplied = "";
  state.managedEmployeeId = "";
  if (employeeManageSearchInput) {
    employeeManageSearchInput.value = "";
  }
  setEmployeeManagerMessage("");
  renderManagedEmployees();
}

async function handleVehicleRegister(event) {
  event.preventDefault();

  const payload = {
    plate: registerVehiclePlateInput.value.trim().toUpperCase(),
    description: registerVehicleDescriptionInput.value.trim(),
    initialKm: registerVehicleInitialKmInput.value.trim(),
  };

  try {
    const data = await api("/api/admin/vehicles", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    vehicleRegisterForm.reset();
    setVehicleManagerMessage(`Veiculo ${data.vehicle.plate} cadastrado com sucesso.`);
    state.showVehicleRegisterForm = false;
    await loadVehicles();
  } catch (error) {
    setVehicleManagerMessage(error.message, true);
  }
}

async function handleVehicleAdminClick(event) {
  const button = event.target.closest("[data-delete-vehicle]");
  if (!button) {
    return;
  }

  const vehicle = state.vehicles.find((item) => String(item.id) === button.dataset.deleteVehicle);
  if (!vehicle) {
    return;
  }

  const confirmed = window.confirm(`Excluir o veiculo ${vehicle.plate}?`);
  if (!confirmed) {
    return;
  }

  try {
    await api(`/api/admin/vehicles/${vehicle.id}`, { method: "DELETE" });
    setVehicleManagerMessage(`Veiculo ${vehicle.plate} excluido com sucesso.`);
    await loadVehicles();
  } catch (error) {
    setVehicleManagerMessage(error.message, true);
  }
}

function handleToggleVehicleRegisterForm() {
  if (state.user?.role !== "admin") {
    return;
  }

  state.showVehicleRegisterForm = !state.showVehicleRegisterForm;
  renderVehicles();
}

function handleSearchVehicles() {
  state.vehicleManageSearch = vehicleSearchInput?.value.trim() || "";
  state.vehicleManageSearchApplied = state.vehicleManageSearch;
  if (!state.vehicleManageSearchApplied) {
    setVehicleManagerMessage("Digite placa ou descricao para pesquisar.", true);
  } else {
    setVehicleManagerMessage("");
  }
  renderVehicles();
}

function handleClearVehicleSearch() {
  state.vehicleManageSearch = "";
  state.vehicleManageSearchApplied = "";
  if (vehicleSearchInput) {
    vehicleSearchInput.value = "";
  }
  setVehicleManagerMessage("");
  renderVehicles();
}

async function handleEmployeeEditSubmit(event) {
  event.preventDefault();

  const employeeId = manageEmployeeIdInput.value;
  const payload = {
    name: editEmployeeNameInput.value.trim(),
    employeeId: editEmployeeIdInput.value.trim(),
  };

  try {
    const data = await api(`/api/admin/employees/${employeeId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    state.managedEmployeeId = data.employee.id;
    setEmployeeManagerMessage(`Cadastro de ${data.employee.name} atualizado com sucesso.`);
    await loadEmployees();
    await loadRecords();
    await loadAdminInsights();
  } catch (error) {
    setEmployeeManagerMessage(error.message, true);
  }
}

async function handleEmployeePasswordSubmit(event) {
  event.preventDefault();

  const employee = getManagedEmployee();
  if (!employee) {
    return;
  }

  const password = employeePasswordInput.value.trim();
  if (!password) {
    setEmployeeManagerMessage("Informe a nova senha.", true);
    return;
  }

  try {
    await api(`/api/admin/employees/${employee.id}/password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    employeePasswordForm.reset();
    setEmployeeManagerMessage(`Senha de ${employee.name} redefinida com sucesso.`);
  } catch (error) {
    setEmployeeManagerMessage(error.message, true);
  }
}

async function handleDeleteEmployee() {
  const employee = getManagedEmployee();
  if (!employee) {
    return;
  }

  const confirmed = window.confirm(`Excluir o funcionario ${employee.name} (${employee.employeeId})?`);
  if (!confirmed) {
    return;
  }

  try {
    await api(`/api/admin/employees/${employee.id}`, { method: "DELETE" });
    state.managedEmployeeId = "";
    setEmployeeManagerMessage(`Funcionario ${employee.name} excluido com sucesso.`);
    await loadEmployees();
    await loadRecords();
    await loadAdminInsights();
  } catch (error) {
    setEmployeeManagerMessage(error.message, true);
  }
}

function openRecordEditDialog(record) {
  if (
    !recordEditDialog ||
    !recordEditForm ||
    !recordEditActionInput ||
    !recordEditDateTimeInput ||
    !recordEditKmInput ||
    !recordEditIdInput
  ) {
    return;
  }

  recordEditForm.reset();
  recordEditMessage.textContent = "";
  recordEditIdInput.value = String(record.id);
  recordEditTitle.textContent = `Corrigir registro de ${record.employee_name} (${record.employee_id})`;
  recordEditSubtitle.textContent = `Tipo atual: ${formatActionLabel(record.action)} | Horario atual: ${formatters.datetime.format(new Date(record.recorded_at))} | KM atual: ${record.vehicle_km ?? "-"}`;
  recordEditActionInput.value = ADMIN_RECORD_ACTIONS.includes(record.action) ? record.action : ADMIN_RECORD_ACTIONS[0];
  recordEditDateTimeInput.value = formatDateTimeLocalValue(record.recorded_at);
  recordEditKmInput.value = record.vehicle_km ?? "";
  recordEditDialog.showModal();
  recordEditDateTimeInput.focus();
}

function closeRecordEditDialog() {
  if (!recordEditDialog?.open) {
    return;
  }

  recordEditDialog.close();
}

function handleRecordsClick(event) {
  const editButton = event.target.closest("[data-edit-record]");
  if (!editButton || state.user?.role !== "admin") {
    return;
  }

  const record = state.records.find((item) => String(item.id) === editButton.dataset.editRecord);
  if (!record) {
    locationStatus.textContent = "Registro nao encontrado para edicao.";
    return;
  }

  openRecordEditDialog(record);
}

async function handleRecordEditSubmit(event) {
  event.preventDefault();

  const recordId = recordEditIdInput?.value?.trim();
  const actionValue = recordEditActionInput?.value?.trim();
  const dateTimeValue = recordEditDateTimeInput?.value?.trim();
  const kmValue = recordEditKmInput?.value?.trim();
  if (!recordId || !actionValue || !dateTimeValue || !kmValue) {
    if (recordEditMessage) {
      recordEditMessage.textContent = "Informe o tipo, a nova data, hora e KM do registro.";
    }
    return;
  }

  const payload = buildRecordDatePayload(dateTimeValue);
  if (!payload || !ADMIN_RECORD_ACTIONS.includes(actionValue) || Number.isNaN(Number(kmValue)) || Number(kmValue) < 0) {
    if (recordEditMessage) {
      recordEditMessage.textContent = "Informe tipo, data, hora e KM validos.";
    }
    return;
  }

  payload.action = actionValue;
  payload.vehicleKm = Number(kmValue);

  if (recordEditMessage) {
    recordEditMessage.textContent = "Salvando correcao...";
  }

  try {
    const data = await api(`/api/admin/records/${recordId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    closeRecordEditDialog();
    locationStatus.textContent = data.warning
      ? `Registro ${formatActionLabel(data.record.action)} atualizado com aviso. ${data.warning}`
      : `Registro ${formatActionLabel(data.record.action)} atualizado com sucesso.`;
    await loadRecords();
    await loadAdminInsights();
  } catch (error) {
    if (recordEditMessage) {
      recordEditMessage.textContent = error.message;
    }
  }
}

function handleRecordEditCancel() {
  closeRecordEditDialog();
}

async function handleRecordDelete() {
  if (state.user?.role !== "admin") {
    return;
  }

  const recordId = recordEditIdInput?.value?.trim();
  if (!recordId) {
    if (recordEditMessage) {
      recordEditMessage.textContent = "Registro nao encontrado para exclusao.";
    }
    return;
  }

  const record = state.records.find((item) => String(item.id) === recordId);
  if (!record) {
    if (recordEditMessage) {
      recordEditMessage.textContent = "Registro nao encontrado para exclusao.";
    }
    return;
  }

  const confirmed = window.confirm(
    `Excluir o registro ${formatActionLabel(record.action)} de ${record.employee_name} (${record.employee_id}) em ${formatters.datetime.format(new Date(record.recorded_at))}?`
  );
  if (!confirmed) {
    return;
  }

  if (recordEditMessage) {
    recordEditMessage.textContent = "Excluindo registro...";
  }

  try {
    const data = await api(`/api/admin/records/${recordId}`, { method: "DELETE" });
    closeRecordEditDialog();
    locationStatus.textContent = data.warning
      ? `Registro excluido com aviso. ${data.warning}`
      : "Registro excluido com sucesso.";
    await loadRecords();
    await loadAdminInsights();
  } catch (error) {
    if (recordEditMessage) {
      recordEditMessage.textContent = error.message;
    }
  }
}

async function handleChangeVehicle() {
  if (!state.vehicles.length) {
    locationStatus.textContent = "Nenhum veiculo cadastrado. Procure o administrador.";
    return;
  }

  if (!state.vehicleContext?.activeJourney || !state.vehicleContext.currentVehicle) {
    locationStatus.textContent = "Inicie a jornada antes de trocar de veiculo.";
    return;
  }

  if (!getSelectableVehiclesForTransfer().length) {
    locationStatus.textContent = "Nao existe outro veiculo livre para trocar agora.";
    return;
  }

  const transferInfo = await collectVehicleTransferInfo();
  if (!transferInfo) {
    locationStatus.textContent = "Troca de veiculo cancelada.";
    return;
  }

  locationStatus.textContent = "Capturando localizacao da troca...";

  let latitude = null;
  let longitude = null;
  let locationLabel = "Localizacao nao informada";

  try {
    const position = await getBestCurrentPosition();
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;
    const accuracy = typeof position.coords.accuracy === "number" ? Math.round(position.coords.accuracy) : null;
    locationLabel = accuracy
      ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)} (precisao aprox. ${accuracy} m)`
      : `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    locationStatus.textContent = "Localizacao capturada. Salvando troca de veiculo...";
  } catch (_error) {
    locationStatus.textContent = "Ative a localizacao do dispositivo para trocar o veiculo.";
    return;
  }

  const now = new Date();

  try {
    const data = await api("/api/me/vehicle-transfers", {
      method: "POST",
      body: JSON.stringify({
        ...transferInfo,
        recordedAt: now.toISOString(),
        localDate: formatters.date.format(now),
        localTime: formatters.time.format(now),
        latitude,
        longitude,
        locationLabel,
      }),
    });

    state.vehicleContext = data.context || null;
    locationStatus.textContent = `Troca concluida. Novo veiculo ativo: ${transferInfo.toVehiclePlate}.`;
    await loadVehicles();
    await loadVehicleContext();
  } catch (error) {
    locationStatus.textContent = error.message;
  }
}

function handleVehicleSubmit(event) {
  event.preventDefault();

  const vehiclePlate = vehicleSelectInput.value.trim().toUpperCase();
  let vehicleKm = vehicleKmInput.value.trim();
  if (!SHOW_EMPLOYEE_KM_FIELDS && !vehicleKm) {
    vehicleKm = getStoredVehicleKm(findVehicleByPlate(vehiclePlate));
  }

  if (!vehiclePlate || !vehicleKm) {
    vehicleFormMessage.textContent = SHOW_EMPLOYEE_KM_FIELDS
      ? "Selecione o veiculo e informe o KM atual."
      : "Selecione o veiculo para continuar.";
    return;
  }

  if (Number.isNaN(Number(vehicleKm)) || Number(vehicleKm) < 0) {
    vehicleFormMessage.textContent = SHOW_EMPLOYEE_KM_FIELDS ? "Informe um KM valido." : "Nao foi possivel identificar o KM do veiculo selecionado.";
    return;
  }

  const resolve = vehicleDialogResolver;
  vehicleDialogResolver = null;
  vehicleDialog.close();
  if (resolve) {
    resolve({
      vehiclePlate,
      vehicleKm: Number(vehicleKm),
    });
  }
}

function handleVehicleCancel() {
  const resolve = vehicleDialogResolver;
  vehicleDialogResolver = null;
  vehicleDialog.close();
  if (resolve) {
    resolve(null);
  }
}

function handleVehicleDialogClose() {
  if (!vehicleDialogResolver) {
    return;
  }

  const resolve = vehicleDialogResolver;
  vehicleDialogResolver = null;
  resolve(null);
}

function handleVehicleTransferSubmit(event) {
  event.preventDefault();

  const fromVehiclePlate = currentVehiclePlateInput.value.trim().toUpperCase();
  let fromVehicleKm = currentVehicleKmInput.value.trim();
  const toVehiclePlate = nextVehicleSelectInput.value.trim().toUpperCase();
  let toVehicleKm = nextVehicleKmInput.value.trim();
  if (!SHOW_EMPLOYEE_KM_FIELDS) {
    if (!fromVehicleKm) {
      fromVehicleKm = getStoredVehicleKm(state.vehicleContext?.currentVehicle);
    }
    if (!toVehicleKm) {
      toVehicleKm = getStoredVehicleKm(findVehicleByPlate(toVehiclePlate));
    }
  }

  if (!fromVehiclePlate || !fromVehicleKm || !toVehiclePlate || !toVehicleKm) {
    vehicleTransferMessage.textContent = SHOW_EMPLOYEE_KM_FIELDS
      ? "Preencha o veiculo atual, o KM final e os dados do novo veiculo."
      : "Confirme o veiculo atual e escolha o novo veiculo.";
    return;
  }

  if (fromVehiclePlate === toVehiclePlate) {
    vehicleTransferMessage.textContent = "Selecione um novo veiculo diferente do atual.";
    return;
  }

  if (Number.isNaN(Number(fromVehicleKm)) || Number(fromVehicleKm) < 0 || Number.isNaN(Number(toVehicleKm)) || Number(toVehicleKm) < 0) {
    vehicleTransferMessage.textContent = SHOW_EMPLOYEE_KM_FIELDS
      ? "Informe KMs validos para concluir a troca."
      : "Nao foi possivel identificar os dados do veiculo para concluir a troca.";
    return;
  }

  const resolve = vehicleTransferDialogResolver;
  vehicleTransferDialogResolver = null;
  vehicleTransferDialog.close();
  if (resolve) {
    resolve({
      fromVehiclePlate,
      fromVehicleKm: Number(fromVehicleKm),
      toVehiclePlate,
      toVehicleKm: Number(toVehicleKm),
    });
  }
}

function handleVehicleTransferCancel() {
  const resolve = vehicleTransferDialogResolver;
  vehicleTransferDialogResolver = null;
  vehicleTransferDialog.close();
  if (resolve) {
    resolve(null);
  }
}

function handleVehicleTransferDialogClose() {
  if (!vehicleTransferDialogResolver) {
    return;
  }

  const resolve = vehicleTransferDialogResolver;
  vehicleTransferDialogResolver = null;
  resolve(null);
}

function persistOfflineSnapshot() {
  if (state.user?.role !== "employee") {
    return;
  }

  try {
    const snapshot = {
      user: state.user,
      records: state.records,
      vehicleContext: state.vehicleContext,
      cachedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(OFFLINE_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (_error) {
    // localStorage indisponivel; sem cache offline nesta sessao.
  }
}

function readOfflineSnapshot() {
  try {
    const raw = window.localStorage.getItem(OFFLINE_SNAPSHOT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function clearOfflineSnapshot() {
  try {
    window.localStorage.removeItem(OFFLINE_SNAPSHOT_STORAGE_KEY);
  } catch (_error) {
    // localStorage indisponivel; nada para limpar.
  }
}

function renderOfflineBanner() {
  if (!offlineCacheBanner) {
    return;
  }

  if (!state.offlineSnapshotActive) {
    offlineCacheBanner.classList.add("hidden");
    return;
  }

  const cachedDate = state.offlineSnapshotCachedAt ? new Date(state.offlineSnapshotCachedAt) : null;
  const cachedLabel =
    cachedDate && !Number.isNaN(cachedDate.getTime()) ? formatters.datetime.format(cachedDate) : "desconhecido";
  offlineCacheBanner.textContent = `Sem conexao. Mostrando dados salvos de ${cachedLabel}.`;
  offlineCacheBanner.classList.remove("hidden");
}

function bindEvent(node, eventName, handler) {
  if (!node) {
    console.warn(`Elemento nao encontrado para evento ${eventName}.`);
    return;
  }

  node.addEventListener(eventName, handler);
}

function getPendingPunches() {
  try {
    const raw = window.localStorage.getItem(PENDING_PUNCH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function savePendingPunches(entries) {
  try {
    window.localStorage.setItem(PENDING_PUNCH_STORAGE_KEY, JSON.stringify(entries));
  } catch (_error) {
    // localStorage indisponivel; a fila so vive na memoria desta sessao.
  }
}

function enqueuePendingPunch(payload) {
  const entries = getPendingPunches();
  entries.push({
    clientRequestId: crypto.randomUUID(),
    payload,
    queuedAt: new Date().toISOString(),
    status: "pending",
    lastError: "",
  });
  savePendingPunches(entries);
  renderPendingPunchUI();
}

function discardPendingPunch(clientRequestId) {
  const entries = getPendingPunches().filter((entry) => entry.clientRequestId !== clientRequestId);
  savePendingPunches(entries);
  renderPendingPunchUI();
}

async function trySyncQueue() {
  if (pendingPunchSyncInFlight || !state.user || state.user.role !== "employee") {
    return;
  }

  const entries = getPendingPunches();
  if (!entries.length) {
    return;
  }

  pendingPunchSyncInFlight = true;
  let syncedAny = false;

  try {
    for (const entry of entries) {
      if (entry.status === "error") {
        break;
      }

      try {
        await api("/api/me/records", {
          method: "POST",
          body: JSON.stringify({ ...entry.payload, clientRequestId: entry.clientRequestId }),
        });
        discardPendingPunch(entry.clientRequestId);
        syncedAny = true;
      } catch (error) {
        if (error.isNetworkError) {
          break;
        }

        const updated = getPendingPunches().map((item) =>
          item.clientRequestId === entry.clientRequestId
            ? { ...item, status: "error", lastError: error.message }
            : item
        );
        savePendingPunches(updated);
        break;
      }
    }
  } finally {
    pendingPunchSyncInFlight = false;
    renderPendingPunchUI();
    if (syncedAny) {
      await loadRecords().catch(() => {});
      await loadVehicles().catch(() => {});
      await loadVehicleContext().catch(() => {});
      await loadWeekSummary().catch(() => {});
    }
  }
}

function renderPendingPunchUI() {
  if (!pendingPunchIndicator || !pendingPunchErrors) {
    return;
  }

  const entries = getPendingPunches();
  const pendingCount = entries.filter((entry) => entry.status !== "error").length;
  const errorEntries = entries.filter((entry) => entry.status === "error");

  if (pendingCount > 0) {
    pendingPunchIndicator.textContent =
      pendingCount === 1
        ? "1 ponto pendente de sincronizacao."
        : `${pendingCount} pontos pendentes de sincronizacao.`;
    pendingPunchIndicator.classList.remove("hidden");
  } else {
    pendingPunchIndicator.classList.add("hidden");
  }

  pendingPunchErrors.innerHTML = "";
  if (!errorEntries.length) {
    pendingPunchErrors.classList.add("hidden");
    return;
  }

  errorEntries.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "pending-punch-error-item";

    const message = document.createElement("span");
    message.textContent = `${formatActionLabel(entry.payload.action)}: ${entry.lastError}`;
    item.appendChild(message);

    const actions = document.createElement("div");
    actions.className = "pending-punch-error-actions";

    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "ghost";
    retryButton.textContent = "Tentar novamente";
    retryButton.addEventListener("click", () => {
      const updated = getPendingPunches().map((item2) =>
        item2.clientRequestId === entry.clientRequestId ? { ...item2, status: "pending", lastError: "" } : item2
      );
      savePendingPunches(updated);
      renderPendingPunchUI();
      trySyncQueue();
    });
    actions.appendChild(retryButton);

    const discardButton = document.createElement("button");
    discardButton.type = "button";
    discardButton.className = "danger";
    discardButton.textContent = "Descartar";
    discardButton.addEventListener("click", () => {
      discardPendingPunch(entry.clientRequestId);
      trySyncQueue();
    });
    actions.appendChild(discardButton);

    item.appendChild(actions);
    pendingPunchErrors.appendChild(item);
  });

  pendingPunchErrors.classList.remove("hidden");
}

async function registerPoint(action) {
  if (actionRequiresVehiclePrompt(action)) {
    if (!state.vehicles.length) {
      locationStatus.textContent = "Nenhum veiculo cadastrado. Procure o administrador.";
      return;
    }

    if (!getSelectableVehiclesForPoint().length) {
      locationStatus.textContent = "Nao ha veiculos livres no momento. Aguarde a liberacao de um veiculo.";
      return;
    }
  }

  const vehicleInfo = await getVehicleInfoForAction(action);
  if (!vehicleInfo) {
    locationStatus.textContent = actionRequiresVehiclePrompt(action)
      ? "Registro cancelado."
      : "Nao foi possivel identificar o veiculo atual. Atualize a tela e tente novamente.";
    return;
  }

  locationStatus.textContent = "Capturando horario e localizacao...";
  const now = new Date();
  let latitude = null;
  let longitude = null;
  let locationLabel = "Localizacao nao informada";

  try {
    const position = await getBestCurrentPosition();
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;
    const accuracy = typeof position.coords.accuracy === "number" ? Math.round(position.coords.accuracy) : null;
    locationLabel = accuracy
      ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)} (precisao aprox. ${accuracy} m)`
      : `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    locationStatus.textContent = "Localizacao capturada. Salvando registro...";
  } catch (_error) {
    locationStatus.textContent = "Ative a localizacao do dispositivo para registrar o ponto.";
    return;
  }

  const payload = {
    action,
    recordedAt: now.toISOString(),
    localDate: formatters.date.format(now),
    localTime: formatters.time.format(now),
    latitude,
    longitude,
    locationLabel,
    vehiclePlate: vehicleInfo.vehiclePlate,
    vehicleKm: vehicleInfo.vehicleKm,
  };

  try {
    await api("/api/me/records", {
      method: "POST",
      body: JSON.stringify({ ...payload, clientRequestId: crypto.randomUUID() }),
    });
    locationStatus.textContent = "Ponto registrado com sucesso.";
    await loadRecords();
    await loadVehicles();
    await loadVehicleContext();
    await loadWeekSummary();
  } catch (error) {
    if (error.isNetworkError) {
      enqueuePendingPunch(payload);
      locationStatus.textContent = "Sem conexao. Ponto salvo localmente e sera enviado quando a internet voltar.";
      return;
    }

    locationStatus.textContent = error.message;
  }
}

bindEvent(loginForm, "submit", handleLogin);
bindEvent(registerForm, "submit", handleRegister);
bindEvent(logoutButton, "click", handleLogout);
bindEvent(toggleRegisterButton, "click", handleToggleRegisterForm);
bindEvent(toggleVehicleRegisterButton, "click", handleToggleVehicleRegisterForm);
bindEvent(apkUpdateButton, "click", handleApkUpdate);
bindEvent(apkUpdateLink, "click", handleApkUpdateLink);
bindEvent(apkUpdateDismissButton, "click", handleApkUpdateDismiss);
bindEvent(apkUpdateDialog, "cancel", handleApkUpdateDialogCancel);
bindEvent(applyAdminFiltersButton, "click", handleApplyAdminFilters);
bindEvent(clearAdminFiltersButton, "click", handleClearAdminFilters);
bindEvent(exportXlsxLink, "click", handleExportXlsx);
bindEvent(toggleSummaryButton, "click", handleToggleSummary);
bindEvent(toggleAggregatesButton, "click", handleToggleAggregates);
bindEvent(toggleAlertsButton, "click", handleToggleAlerts);
bindEvent(adminTabs, "click", handleAdminTabClick);
bindEvent(employeeAdminBody, "click", handleEmployeeAdminClick);
bindEvent(employeeEditForm, "submit", handleEmployeeEditSubmit);
bindEvent(cancelEmployeeEditButton, "click", handleCancelEmployeeEdit);
bindEvent(employeePasswordForm, "submit", handleEmployeePasswordSubmit);
bindEvent(deleteEmployeeButton, "click", handleDeleteEmployee);
bindEvent(recordsList, "click", handleRecordsClick);
bindEvent(searchEmployeeButton, "click", handleSearchEmployees);
bindEvent(clearEmployeeSearchButton, "click", handleClearEmployeeSearch);
bindEvent(vehicleRegisterForm, "submit", handleVehicleRegister);
bindEvent(vehicleAdminBody, "click", handleVehicleAdminClick);
bindEvent(searchVehicleButton, "click", handleSearchVehicles);
bindEvent(clearVehicleSearchButton, "click", handleClearVehicleSearch);
bindEvent(changeVehicleButton, "click", handleChangeVehicle);
bindEvent(vehicleForm, "submit", handleVehicleSubmit);
bindEvent(vehicleSelectInput, "change", syncSelectedVehicleKm);
bindEvent(vehicleCancelButton, "click", handleVehicleCancel);
bindEvent(vehicleDialog, "cancel", handleVehicleCancel);
bindEvent(vehicleDialog, "close", handleVehicleDialogClose);
bindEvent(vehicleTransferForm, "submit", handleVehicleTransferSubmit);
bindEvent(nextVehicleSelectInput, "change", syncTransferVehicleKms);
bindEvent(vehicleTransferCancelButton, "click", handleVehicleTransferCancel);
bindEvent(vehicleTransferDialog, "cancel", handleVehicleTransferCancel);
bindEvent(vehicleTransferDialog, "close", handleVehicleTransferDialogClose);
bindEvent(recordEditForm, "submit", handleRecordEditSubmit);
bindEvent(recordEditCancelButton, "click", handleRecordEditCancel);
bindEvent(recordEditDeleteButton, "click", handleRecordDelete);
bindEvent(recordEditDialog, "cancel", handleRecordEditCancel);
bindEvent(employeeManageSearchInput, "keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleSearchEmployees();
  }
});
bindEvent(vehicleSearchInput, "keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleSearchVehicles();
  }
});
actionButtons.forEach((button) => {
  button.addEventListener("click", () => registerPoint(button.dataset.action));
});

updateClock();
setInterval(updateClock, 1000);
setInterval(() => {
  checkForApkUpdate().catch(() => {});
}, APK_UPDATE_CHECK_INTERVAL_MS);
setInterval(() => {
  trySyncQueue().catch(() => {});
}, PENDING_PUNCH_SYNC_INTERVAL_MS);
setInterval(refreshAlertsInBackground, ALERTS_REFRESH_INTERVAL_MS);
syncResponsiveTables();
syncEmployeeKmVisibility();
renderPendingPunchUI();
window.addEventListener("online", () => {
  refreshSessionIfOffline().catch(() => {});
  trySyncQueue().catch(() => {});
});
document.addEventListener("visibilitychange", handleAppVisible);

if (isUnconfiguredAndroidShell()) {
  showAndroidShellNotice();
} else {
  loadSession().catch((error) => {
    setMessage(error.message, true);
  });
}
