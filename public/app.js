const state = {
  user: null,
  records: [],
  summary: [],
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
const recordTemplate = document.querySelector("#recordTemplate");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const logoutButton = document.querySelector("#logoutButton");
const actionButtons = [...document.querySelectorAll(".action-button")];

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

function renderRecords() {
  recordsList.innerHTML = "";
  if (!state.records.length) {
    recordsList.innerHTML = '<p class="muted">Nenhum registro encontrado.</p>';
    return;
  }

  for (const record of state.records) {
    const node = recordTemplate.content.cloneNode(true);
    const title =
      state.user.role === "admin"
        ? `${record.employee_name} (${record.employee_id})`
        : `${state.user.name} (${state.user.employeeId})`;
    node.querySelector(".record-title").textContent = title;
    node.querySelector(".record-meta").textContent =
      `${formatters.datetime.format(new Date(record.recorded_at))} - ${formatLocation(record)}`;
    node.querySelector(".record-action").textContent = record.action;
    recordsList.appendChild(node);
  }
}

function renderSummary() {
  summaryBody.innerHTML = "";
  if (!state.summary.length) {
    summaryBody.innerHTML = '<tr><td colspan="8" class="empty-row">Nenhum resumo disponivel.</td></tr>';
    return;
  }

  for (const item of state.summary) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.employeeName}</td>
      <td>${item.employeeId}</td>
      <td>${item.localDate}</td>
      <td>${item.entry || "-"}</td>
      <td>${item.lunchStart || "-"}</td>
      <td>${item.lunchEnd || "-"}</td>
      <td>${item.exit || "-"}</td>
      <td>${item.workedHours}</td>
    `;
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
      ? "Administrador com acesso completo a funcionarios, registros e exportacao."
      : `Funcionario autenticado. Matricula ${user.employeeId}.`;

  const isAdmin = user.role === "admin";
  employeePanel.classList.toggle("hidden", isAdmin);
  adminPanel.classList.toggle("hidden", !isAdmin);
  exportActions.classList.toggle("hidden", !isAdmin);
  recordsTitle.textContent = isAdmin ? "Todos os registros" : "Meus registros";
  recordsSubtitle.textContent = isAdmin
    ? "Visao completa do sistema em ordem cronologica."
    : "Somente os registros da sua conta aparecem aqui.";

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

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalizacao nao suportada neste dispositivo."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
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
    await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setMessage("Funcionario cadastrado e autenticado com sucesso.");
    registerForm.reset();
    await loadSession();
  } catch (error) {
    setMessage(error.message, true);
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
  renderSession();
  setMessage("Sessao encerrada com sucesso.");
}

async function registerPoint(action) {
  locationStatus.textContent = "Capturando horario e localizacao...";
  const now = new Date();
  let latitude = null;
  let longitude = null;
  let locationLabel = "Localizacao nao informada";

  try {
    const position = await getCurrentPosition();
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;
    locationLabel = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
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
actionButtons.forEach((button) => {
  button.addEventListener("click", () => registerPoint(button.dataset.action));
});

updateClock();
setInterval(updateClock, 1000);
loadSession().catch((error) => {
  setMessage(error.message, true);
});
