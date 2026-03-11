const state = {
  user: null,
  records: [],
  summary: [],
  selectedEmployeeId: "",
  showEmployeeFilter: false,
  showRegisterForm: false,
};

const formatters = {
  datetime: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }),
  date: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }),
  time: new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" }),
};

const authPanel = document.querySelector("#authPanel");
const appPanel = document.querySelector("#appPanel");
const employeePanel = document.querySelector("#employeePanel");
const adminPanel = document.querySelector("#adminPanel");
const authMessage = document.querySelector("#authMessage");
const clockStatus = document.querySelector("#clockStatus");
const sessionTitle = document.querySelector("#sessionTitle");
const sessionSubtitle = document.querySelector("#sessionSubtitle");
const recordsTitle = document.querySelector("#recordsTitle");
const recordsSubtitle = document.querySelector("#recordsSubtitle");
const locationStatus = document.querySelector("#locationStatus");
const recordsList = document.querySelector("#recordsList");
const summaryBody = document.querySelector("#summaryBody");
const exportActions = document.querySelector("#exportActions");
const toggleFilterButton = document.querySelector("#toggleFilterButton");
const recordsFilterPanel = document.querySelector("#recordsFilterPanel");
const employeeFilter = document.querySelector("#employeeFilter");
const recordTemplate = document.querySelector("#recordTemplate");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const toggleRegisterButton = document.querySelector("#toggleRegisterButton");
const logoutButton = document.querySelector("#logoutButton");
const vehicleDialog = document.querySelector("#vehicleDialog");
const vehicleForm = document.querySelector("#vehicleForm");
const vehiclePlateInput = document.querySelector("#vehiclePlateInput");
const vehicleKmInput = document.querySelector("#vehicleKmInput");
const vehicleFormMessage = document.querySelector("#vehicleFormMessage");
const vehicleCancelButton = document.querySelector("#vehicleCancelButton");
const actionButtons = [...document.querySelectorAll(".action-button")];
let vehicleDialogResolver = null;
const MAX_ACTION_SLOTS = 5;

function setMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.style.color = isError ? "#a33f33" : "";
}

function updateClock() {
  clockStatus.textContent = `Agora: ${formatters.datetime.format(new Date())}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

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

function formatLocation(record) {
  if (typeof record.latitude === "number" && typeof record.longitude === "number") {
    return `Lat ${record.latitude.toFixed(5)}, Long ${record.longitude.toFixed(5)}`;
  }
  return "Localizacao nao informada";
}

function formatVehicle(record) {
  const vehiclePlate = record.vehicle_plate ? String(record.vehicle_plate).toUpperCase() : "Nao informado";
  const vehicleKm = record.vehicle_km ?? "Nao informado";
  return `Veiculo: ${vehiclePlate} - KM: ${vehicleKm}`;
}

function createMapsUrl(record) {
  if (typeof record.latitude !== "number" || typeof record.longitude !== "number") {
    return "";
  }

  return `https://www.google.com/maps/search/?api=1&query=${record.latitude},${record.longitude}`;
}

function renderRecords() {
  recordsList.innerHTML = "";
  if (state.user?.role === "admin" && !state.showEmployeeFilter) {
    recordsList.innerHTML = '<p class="muted">Clique em "Mostrar filtro" para visualizar registros por matricula.</p>';
    return;
  }

  const visibleRecords =
    state.user?.role === "admin" && state.selectedEmployeeId
      ? state.records.filter((record) => record.employee_id === state.selectedEmployeeId)
      : state.records;

  if (!visibleRecords.length) {
    recordsList.innerHTML = '<p class="muted">Nenhum registro encontrado.</p>';
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
    node.querySelector(".record-meta").textContent =
      `${formatters.datetime.format(new Date(record.recorded_at))} - ${formatLocation(record)}`;
    node.querySelector(".record-vehicle").textContent = formatVehicle(record);
    if (mapsUrl) {
      const mapLink = node.querySelector(".record-map-link");
      mapLink.href = mapsUrl;
      mapLink.classList.remove("hidden");
    }
    node.querySelector(".record-action").textContent = record.action;
    recordsList.appendChild(node);
  }
}

function renderEmployeeFilter() {
  const isAdmin = state.user?.role === "admin";
  exportActions.classList.toggle("hidden", !isAdmin);

  if (!isAdmin) {
    state.selectedEmployeeId = "";
    state.showEmployeeFilter = false;
    recordsFilterPanel.classList.add("hidden");
    return;
  }

  toggleFilterButton.textContent = state.showEmployeeFilter ? "Ocultar filtro" : "Mostrar filtro";
  recordsFilterPanel.classList.toggle("hidden", !state.showEmployeeFilter);

  const currentValue = state.selectedEmployeeId;
  const options = [...new Set(state.records.map((record) => record.employee_id).filter(Boolean))].sort();
  employeeFilter.innerHTML = '<option value="">Todas as matriculas</option>';

  for (const employeeId of options) {
    const option = document.createElement("option");
    option.value = employeeId;
    option.textContent = employeeId;
    employeeFilter.appendChild(option);
  }

  employeeFilter.value = options.includes(currentValue) ? currentValue : "";
  state.selectedEmployeeId = employeeFilter.value;
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
  summaryBody.innerHTML = "";
  if (!state.summary.length) {
    summaryBody.innerHTML = '<tr><td colspan="7" class="empty-row">Nenhum resumo disponivel.</td></tr>';
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
}

function renderSession() {
  const user = state.user;
  const loggedIn = Boolean(user);

  authPanel.classList.toggle("hidden", loggedIn);
  appPanel.classList.toggle("hidden", !loggedIn);

  if (!loggedIn) {
    return;
  }

  sessionTitle.textContent = `${user.name}`;
  sessionSubtitle.textContent =
    user.role === "admin"
      ? "Administrador com acesso completo a funcionarios, cadastros, registros e exportacao."
      : `Funcionario autenticado. Matricula ${user.employeeId}.`;

  const isAdmin = user.role === "admin";
  employeePanel.classList.toggle("hidden", isAdmin);
  adminPanel.classList.toggle("hidden", !isAdmin);
  recordsTitle.textContent = isAdmin ? "Todos os registros" : "Meus registros";
  recordsSubtitle.textContent = isAdmin
    ? "Visao completa do sistema em ordem cronologica."
    : "Somente os registros da sua conta aparecem aqui.";

  renderEmployeeFilter();
  renderRegisterForm();
  renderRecords();
  renderSummary();
}

async function loadSession() {
  const data = await api("/api/auth/session");
  state.user = data.user;
  renderSession();

  if (state.user) {
    await loadRecords();
    if (state.user.role === "admin") {
      await loadSummary();
    }
  }
}

async function loadRecords() {
  const data = await api("/api/me/records");
  state.records = data.records;
  renderEmployeeFilter();
  renderRecords();
}

async function loadSummary() {
  if (state.user?.role !== "admin") {
    state.summary = [];
    renderSummary();
    return;
  }

  const data = await api("/api/admin/summary");
  state.summary = data.summary;
  renderSummary();
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
  vehicleForm.reset();
  vehicleFormMessage.textContent = "";

  return new Promise((resolve) => {
    vehicleDialogResolver = resolve;
    vehicleDialog.showModal();
    vehiclePlateInput.focus();
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
    await loadRecords();
    await loadSummary();
  } catch (error) {
    locationStatus.textContent = error.message;
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
  state.selectedEmployeeId = "";
  state.showEmployeeFilter = false;
  state.showRegisterForm = false;
  renderSession();
  setMessage("Sessao encerrada com sucesso.");
}

function handleToggleFilter() {
  if (state.user?.role !== "admin") {
    return;
  }

  state.showEmployeeFilter = !state.showEmployeeFilter;
  if (!state.showEmployeeFilter) {
    state.selectedEmployeeId = "";
  }
  renderEmployeeFilter();
  renderRecords();
}

function handleEmployeeFilterChange() {
  state.selectedEmployeeId = employeeFilter.value;
  renderRecords();
}

function handleToggleRegisterForm() {
  if (state.user?.role !== "admin") {
    return;
  }

  state.showRegisterForm = !state.showRegisterForm;
  renderRegisterForm();
}

function handleVehicleSubmit(event) {
  event.preventDefault();

  const vehiclePlate = vehiclePlateInput.value.trim().toUpperCase();
  const vehicleKm = vehicleKmInput.value.trim();

  if (!vehiclePlate || !vehicleKm) {
    vehicleFormMessage.textContent = "Informe a placa e o KM do veiculo.";
    return;
  }

  if (Number.isNaN(Number(vehicleKm)) || Number(vehicleKm) < 0) {
    vehicleFormMessage.textContent = "Informe um KM valido.";
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

async function registerPoint(action) {
  const vehicleInfo = await collectVehicleInfo();
  if (!vehicleInfo) {
    locationStatus.textContent = "Registro cancelado.";
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
    locationStatus.textContent = "Registro sera salvo sem localizacao.";
  }

  try {
    await api("/api/me/records", {
      method: "POST",
      body: JSON.stringify({
        action,
        recordedAt: now.toISOString(),
        localDate: formatters.date.format(now),
        localTime: formatters.time.format(now),
        latitude,
        longitude,
        locationLabel,
        vehiclePlate: vehicleInfo.vehiclePlate,
        vehicleKm: vehicleInfo.vehicleKm,
      }),
    });
    locationStatus.textContent = "Ponto registrado com sucesso.";
    await loadRecords();
  } catch (error) {
    locationStatus.textContent = error.message;
  }
}

loginForm.addEventListener("submit", handleLogin);
registerForm.addEventListener("submit", handleRegister);
logoutButton.addEventListener("click", handleLogout);
toggleFilterButton.addEventListener("click", handleToggleFilter);
toggleRegisterButton.addEventListener("click", handleToggleRegisterForm);
employeeFilter.addEventListener("change", handleEmployeeFilterChange);
vehicleForm.addEventListener("submit", handleVehicleSubmit);
vehicleCancelButton.addEventListener("click", handleVehicleCancel);
vehicleDialog.addEventListener("cancel", handleVehicleCancel);
vehicleDialog.addEventListener("close", handleVehicleDialogClose);
actionButtons.forEach((button) => {
  button.addEventListener("click", () => registerPoint(button.dataset.action));
});

updateClock();
setInterval(updateClock, 1000);
loadSession().catch((error) => {
  setMessage(error.message, true);
});
