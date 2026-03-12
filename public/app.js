const state = {
  user: null,
  records: [],
  summary: [],
  employees: [],
  vehicles: [],
  managedEmployeeId: "",
  showRegisterForm: false,
  showVehicleRegisterForm: false,
  hasAutoOpenedVehicleRegister: false,
  adminFilters: {
    employeeId: "",
    vehiclePlate: "",
    dateFrom: "",
    dateTo: "",
  },
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
const registerForm = document.querySelector("#registerForm");
const toggleRegisterButton = document.querySelector("#toggleRegisterButton");
const logoutButton = document.querySelector("#logoutButton");
const employeeAdminBody = document.querySelector("#employeeAdminBody");
const employeeManagerMessage = document.querySelector("#employeeManagerMessage");
const employeeEditorPanel = document.querySelector("#employeeEditorPanel");
const employeeEditorTitle = document.querySelector("#employeeEditorTitle");
const employeeEditForm = document.querySelector("#employeeEditForm");
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
const vehicleAdminBody = document.querySelector("#vehicleAdminBody");
const vehicleDialog = document.querySelector("#vehicleDialog");
const vehicleForm = document.querySelector("#vehicleForm");
const vehicleSelectInput = document.querySelector("#vehicleSelectInput");
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

function hasActiveAdminFilters() {
  return Boolean(
    state.adminFilters.employeeId ||
    state.adminFilters.vehiclePlate ||
    state.adminFilters.dateFrom ||
    state.adminFilters.dateTo
  );
}

function renderRecords() {
  recordsList.innerHTML = "";

  if (state.user?.role === "admin" && !hasActiveAdminFilters()) {
    return;
  }

  const visibleRecords =
    state.user?.role === "employee"
      ? state.records.filter((record) => record.local_date === formatters.date.format(new Date()))
      : state.records;

  if (!visibleRecords.length) {
    recordsList.innerHTML =
      state.user?.role === "employee"
        ? '<p class="muted">Nenhum registro encontrado para hoje.</p>'
        : '<p class="muted">Nenhum registro encontrado para os filtros informados.</p>';
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
    recordsFilterPanel.classList.add("hidden");
    return;
  }

  recordsFilterPanel.classList.remove("hidden");

  const currentValue = state.adminFilters.employeeId;
  const options = [...new Set(state.employees.map((employee) => employee.employeeId).filter(Boolean))].sort();
  employeeFilter.innerHTML = '<option value="">Todas as matriculas</option>';

  for (const employeeId of options) {
    const option = document.createElement("option");
    option.value = employeeId;
    option.textContent = employeeId;
    employeeFilter.appendChild(option);
  }

  employeeFilter.value = options.includes(currentValue) ? currentValue : "";
  state.adminFilters.employeeId = employeeFilter.value;
  vehiclePlateFilter.value = state.adminFilters.vehiclePlate;
  dateFromFilter.value = state.adminFilters.dateFrom;
  dateToFilter.value = state.adminFilters.dateTo;
  updateExportLinks();
}

function getManagedEmployee() {
  return state.employees.find((employee) => employee.id === state.managedEmployeeId) || null;
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
    employeeAdminBody.innerHTML = "";
    setEmployeeManagerMessage("");
    renderEmployeeEditor();
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
    return;
  }

  for (const employee of state.employees) {
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
}

function renderVehicles() {
  if (vehicleSelectInput) {
    vehicleSelectInput.innerHTML = '<option value="">Digite manualmente</option>';
    for (const vehicle of state.vehicles) {
      const option = document.createElement("option");
      option.value = vehicle.plate;
      option.textContent = vehicle.description ? `${vehicle.plate} - ${vehicle.description}` : vehicle.plate;
      vehicleSelectInput.appendChild(option);
    }
  }

  if (!vehicleAdminBody) {
    return;
  }

  if (state.user?.role !== "admin") {
    vehicleAdminBody.innerHTML = "";
    state.showVehicleRegisterForm = false;
    vehicleRegisterForm.classList.add("hidden");
    return;
  }

  if (!state.vehicles.length && !state.hasAutoOpenedVehicleRegister) {
    state.showVehicleRegisterForm = true;
    state.hasAutoOpenedVehicleRegister = true;
  }

  vehicleRegisterForm.classList.toggle("hidden", !state.showVehicleRegisterForm);
  toggleVehicleRegisterButton.textContent = state.showVehicleRegisterForm ? "Ocultar cadastro" : "Novo veiculo";

  vehicleAdminBody.innerHTML = "";

  if (!state.vehicles.length) {
    vehicleAdminBody.innerHTML = '<tr><td colspan="5" class="empty-row">Nenhum veiculo cadastrado.</td></tr>';
    return;
  }

  for (const vehicle of state.vehicles) {
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
  const today = formatters.date.format(new Date());
  const visibleSummary = state.summary.filter((item) => item.localDate === today);

  summaryBody.innerHTML = "";
  if (!visibleSummary.length) {
    summaryBody.innerHTML = '<tr><td colspan="7" class="empty-row">Nenhum resumo disponivel para hoje.</td></tr>';
    return;
  }

  for (const item of visibleSummary) {
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
  renderRecords();
  renderSummary();
}

async function loadSession() {
  const data = await api("/api/auth/session");
  state.user = data.user;
  renderSession();

  if (state.user) {
    await loadVehicles();
    await loadRecords();
    if (state.user.role === "admin") {
      await loadEmployees();
      await loadSummary();
    }
  }
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
}

async function loadSummary() {
  if (state.user?.role !== "admin") {
    state.summary = [];
    renderSummary();
    return;
  }

  const data = await api(`/api/admin/summary${buildQueryString(state.adminFilters)}`);
  state.summary = data.summary;
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
  vehicleForm.reset();
  vehicleFormMessage.textContent = "";
  if (vehicleSelectInput) {
    vehicleSelectInput.value = "";
  }
  vehiclePlateInput.readOnly = false;
  renderVehicles();

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
    await loadVehicles();
    await loadEmployees();
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
  state.employees = [];
  state.vehicles = [];
  state.managedEmployeeId = "";
  state.showRegisterForm = false;
  state.showVehicleRegisterForm = false;
  state.hasAutoOpenedVehicleRegister = false;
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
  await loadSummary();
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
    await loadSummary();
    locationStatus.textContent = "Filtros administrativos limpos.";
  } catch (error) {
    locationStatus.textContent = error.message;
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

function handleVehicleSelectionChange() {
  const selectedPlate = vehicleSelectInput.value.trim().toUpperCase();
  vehiclePlateInput.value = selectedPlate;
  vehiclePlateInput.readOnly = Boolean(selectedPlate);
}

function handleToggleVehicleRegisterForm() {
  if (state.user?.role !== "admin") {
    return;
  }

  state.showVehicleRegisterForm = !state.showVehicleRegisterForm;
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
    await loadSummary();
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
    await loadSummary();
  } catch (error) {
    setEmployeeManagerMessage(error.message, true);
  }
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

function bindEvent(node, eventName, handler) {
  if (!node) {
    console.warn(`Elemento nao encontrado para evento ${eventName}.`);
    return;
  }

  node.addEventListener(eventName, handler);
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

bindEvent(loginForm, "submit", handleLogin);
bindEvent(registerForm, "submit", handleRegister);
bindEvent(logoutButton, "click", handleLogout);
bindEvent(toggleRegisterButton, "click", handleToggleRegisterForm);
bindEvent(toggleVehicleRegisterButton, "click", handleToggleVehicleRegisterForm);
bindEvent(applyAdminFiltersButton, "click", handleApplyAdminFilters);
bindEvent(clearAdminFiltersButton, "click", handleClearAdminFilters);
bindEvent(employeeAdminBody, "click", handleEmployeeAdminClick);
bindEvent(employeeEditForm, "submit", handleEmployeeEditSubmit);
bindEvent(cancelEmployeeEditButton, "click", handleCancelEmployeeEdit);
bindEvent(employeePasswordForm, "submit", handleEmployeePasswordSubmit);
bindEvent(deleteEmployeeButton, "click", handleDeleteEmployee);
bindEvent(vehicleRegisterForm, "submit", handleVehicleRegister);
bindEvent(vehicleAdminBody, "click", handleVehicleAdminClick);
bindEvent(vehicleForm, "submit", handleVehicleSubmit);
bindEvent(vehicleSelectInput, "change", handleVehicleSelectionChange);
bindEvent(vehicleCancelButton, "click", handleVehicleCancel);
bindEvent(vehicleDialog, "cancel", handleVehicleCancel);
bindEvent(vehicleDialog, "close", handleVehicleDialogClose);
actionButtons.forEach((button) => {
  button.addEventListener("click", () => registerPoint(button.dataset.action));
});

updateClock();
setInterval(updateClock, 1000);
loadSession().catch((error) => {
  setMessage(error.message, true);
});
