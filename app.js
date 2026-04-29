const STORAGE_KEYS = {
  users: "vm-reserve-users-v1",
  reservations: "vm-reserve-reservations-v1",
  session: "vm-reserve-session-v1",
};

const HOURS = Array.from({ length: 12 }, (_, index) => index + 8);
const VIRTUAL_MACHINES = ["VM-01", "VM-02", "VM-03", "VM-04", "VM-05", "VM-06"];
const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const authScreen = document.querySelector("#authScreen");
const appShell = document.querySelector("#appShell");
const authForm = document.querySelector("#authForm");
const authMessage = document.querySelector("#authMessage");
const authSubmit = document.querySelector("#authSubmit");
const signInTab = document.querySelector("#signInTab");
const createAccountTab = document.querySelector("#createAccountTab");
const usernameInput = document.querySelector("#usernameInput");
const passwordInput = document.querySelector("#passwordInput");
const signedInUser = document.querySelector("#signedInUser");
const logoutButton = document.querySelector("#logoutButton");
const dateInput = document.querySelector("#dateInput");
const prevDayButton = document.querySelector("#prevDayButton");
const nextDayButton = document.querySelector("#nextDayButton");
const todayButton = document.querySelector("#todayButton");
const newReservationButton = document.querySelector("#newReservationButton");
const weekStrip = document.querySelector("#weekStrip");
const calendarGrid = document.querySelector("#calendarGrid");
const reservationDialog = document.querySelector("#reservationDialog");
const reservationForm = document.querySelector("#reservationForm");
const reservationMessage = document.querySelector("#reservationMessage");
const vmSelect = document.querySelector("#vmSelect");
const startHourSelect = document.querySelector("#startHourSelect");
const endHourSelect = document.querySelector("#endHourSelect");
const fullDayCheckbox = document.querySelector("#fullDayCheckbox");
const reservationNote = document.querySelector("#reservationNote");
const cancelDialogButton = document.querySelector("#cancelDialogButton");

let authMode = "signin";
let activeUser = null;

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function cleanUsername(username) {
  return username.trim().toLowerCase();
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatSlotRange(hour) {
  return `${formatHour(hour)}-${formatHour(hour + 1)}`;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
  if (!crypto.subtle) {
    return fallbackHash(`${salt}:${password}`);
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${password}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

function fallbackHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fallback-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function setAuthMode(nextMode) {
  authMode = nextMode;
  signInTab.classList.toggle("is-active", authMode === "signin");
  createAccountTab.classList.toggle("is-active", authMode === "create");
  authSubmit.textContent = authMode === "signin" ? "Entrar" : "Criar conta";
  passwordInput.autocomplete = authMode === "signin" ? "current-password" : "new-password";
  authMessage.textContent = "";
  authMessage.classList.remove("success");
}

function showMessage(element, message, isSuccess = false) {
  element.textContent = message;
  element.classList.toggle("success", isSuccess);
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const username = cleanUsername(usernameInput.value);
  const password = passwordInput.value;
  const users = readJson(STORAGE_KEYS.users, []);

  if (!/^[a-z0-9_.-]{3,24}$/.test(username)) {
    showMessage(authMessage, "Use 3 a 24 letras, números, pontos, traços ou underscores.");
    return;
  }

  if (password.length < 6) {
    showMessage(authMessage, "A senha precisa ter pelo menos 6 caracteres.");
    return;
  }

  if (authMode === "create") {
    if (users.some((user) => user.username === username)) {
      showMessage(authMessage, "Esse usuário já existe.");
      return;
    }

    const salt = createSalt();
    const passwordHash = await hashPassword(password, salt);
    users.push({ username, salt, passwordHash, createdAt: new Date().toISOString() });
    writeJson(STORAGE_KEYS.users, users);
    startSession(username);
    return;
  }

  const user = users.find((candidate) => candidate.username === username);
  if (!user) {
    showMessage(authMessage, "Não existe conta para esse usuário.");
    return;
  }

  const passwordHash = await hashPassword(password, user.salt);
  if (passwordHash !== user.passwordHash) {
    showMessage(authMessage, "A senha não confere.");
    return;
  }

  startSession(username);
}

function startSession(username) {
  activeUser = username;
  writeJson(STORAGE_KEYS.session, { username });
  usernameInput.value = "";
  passwordInput.value = "";
  renderApp();
}

function logout() {
  activeUser = null;
  localStorage.removeItem(STORAGE_KEYS.session);
  appShell.classList.add("is-hidden");
  authScreen.classList.remove("is-hidden");
  setAuthMode("signin");
}

function renderApp() {
  authScreen.classList.add("is-hidden");
  appShell.classList.remove("is-hidden");
  signedInUser.textContent = activeUser;

  if (!dateInput.value) {
    dateInput.value = formatDateKey(new Date());
  }

  renderWeekStrip();
  renderCalendar();
}

function renderWeekStrip() {
  const selectedDate = parseDateKey(dateInput.value);
  const start = new Date(selectedDate);
  start.setDate(selectedDate.getDate() - selectedDate.getDay());
  weekStrip.replaceChildren();

  for (let offset = 0; offset < 7; offset += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + offset);
    const dateKey = formatDateKey(current);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "week-day";
    button.classList.toggle("is-selected", dateKey === dateInput.value);
    button.innerHTML = `<strong>${DAY_NAMES[current.getDay()]}</strong>${current.getMonth() + 1}/${current.getDate()}`;
    button.addEventListener("click", () => {
      dateInput.value = dateKey;
      renderApp();
    });
    weekStrip.append(button);
  }
}

function renderCalendar() {
  const reservations = readJson(STORAGE_KEYS.reservations, []);
  const dayReservations = reservations.filter((reservation) => reservation.date === dateInput.value);
  calendarGrid.style.gridTemplateColumns = `112px repeat(${VIRTUAL_MACHINES.length}, minmax(118px, 1fr))`;
  calendarGrid.replaceChildren();

  calendarGrid.append(createHeaderCell("Horário"));
  VIRTUAL_MACHINES.forEach((vm) => calendarGrid.append(createHeaderCell(vm)));

  HOURS.forEach((hour) => {
    const timeCell = document.createElement("div");
    timeCell.className = "calendar-cell time-cell";
    timeCell.textContent = formatSlotRange(hour);
    calendarGrid.append(timeCell);

    VIRTUAL_MACHINES.forEach((vm) => {
      const reservation = dayReservations.find((item) => item.hour === hour && item.vm === vm);
      calendarGrid.append(createSlotCell(vm, hour, reservation));
    });
  });
}

function createHeaderCell(text) {
  const cell = document.createElement("div");
  cell.className = "calendar-cell calendar-head";
  cell.textContent = text;
  return cell;
}

function createSlotCell(vm, hour, reservation) {
  const cell = document.createElement("div");
  cell.className = "calendar-cell";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "slot-button";

  if (!reservation) {
    button.textContent = "Disponível";
    button.addEventListener("click", () => openReservationDialog(vm, hour));
  } else {
    const isOwn = reservation.username === activeUser;
    button.classList.add("is-booked");
    button.classList.toggle("is-own", isOwn);
    button.innerHTML = "";
    const title = document.createElement("span");
    title.textContent = isOwn ? "Sua reserva" : "Reservado";
    const meta = document.createElement("span");
    meta.className = "slot-meta";
    meta.textContent = reservation.note
      ? `${reservation.username} - ${reservation.note}`
      : reservation.username;
    button.append(title, meta);
    button.setAttribute("aria-label", `${vm} ${formatSlotRange(hour)} reservado por ${reservation.username}`);

    if (isOwn) {
      button.title = "Clique para cancelar esta reserva";
      button.addEventListener("click", () => cancelReservation(reservation.id));
    }
  }

  cell.append(button);
  return cell;
}

function fillReservationOptions() {
  vmSelect.replaceChildren();
  VIRTUAL_MACHINES.forEach((vm) => {
    const option = document.createElement("option");
    option.value = vm;
    option.textContent = vm;
    vmSelect.append(option);
  });

  startHourSelect.replaceChildren();
  HOURS.forEach((hour) => {
    const option = document.createElement("option");
    option.value = String(hour);
    option.textContent = formatSlotRange(hour);
    startHourSelect.append(option);
  });

  updateEndHourOptions();
}

function openReservationDialog(vm = VIRTUAL_MACHINES[0], hour = HOURS[0]) {
  fillReservationOptions();
  reservationMessage.textContent = "";
  reservationMessage.classList.remove("success");
  reservationNote.value = "";
  fullDayCheckbox.checked = false;
  vmSelect.value = vm;
  startHourSelect.value = String(hour);
  updateEndHourOptions(hour + 1);
  setTimeFieldsEnabled(true);
  reservationDialog.showModal();
}

function updateEndHourOptions(preferredEndHour) {
  const startHour = Number(startHourSelect.value || HOURS[0]);
  const selectedEndHour = preferredEndHour ?? Number(endHourSelect.value || startHour + 1);
  endHourSelect.replaceChildren();

  for (let hour = startHour + 1; hour <= 20; hour += 1) {
    const option = document.createElement("option");
    option.value = String(hour);
    option.textContent = formatHour(hour);
    endHourSelect.append(option);
  }

  endHourSelect.value = String(Math.max(startHour + 1, selectedEndHour));
}

function setTimeFieldsEnabled(isEnabled) {
  startHourSelect.disabled = !isEnabled;
  endHourSelect.disabled = !isEnabled;
}

function getSelectedHours() {
  if (fullDayCheckbox.checked) {
    return HOURS;
  }

  const startHour = Number(startHourSelect.value);
  const endHour = Number(endHourSelect.value);
  return HOURS.filter((hour) => hour >= startHour && hour < endHour);
}

function handleReservationSubmit(event) {
  event.preventDefault();
  const reservations = readJson(STORAGE_KEYS.reservations, []);
  const vm = vmSelect.value;
  const note = reservationNote.value.trim();
  const date = dateInput.value;
  const selectedHours = getSelectedHours();

  if (selectedHours.length === 0) {
    showMessage(reservationMessage, "Selecione pelo menos um horário.");
    return;
  }

  const busyHours = selectedHours.filter((hour) =>
    reservations.some((reservation) => reservation.date === date && reservation.vm === vm && reservation.hour === hour),
  );

  if (busyHours.length > 0) {
    showMessage(reservationMessage, `Essa VM já está reservada em: ${busyHours.map(formatHour).join(", ")}.`);
    renderCalendar();
    return;
  }

  const userBusyHours = selectedHours.filter((hour) =>
    reservations.some((reservation) => reservation.date === date && reservation.hour === hour && reservation.username === activeUser),
  );

  if (userBusyHours.length > 0) {
    showMessage(reservationMessage, `Você já tem reserva em: ${userBusyHours.map(formatHour).join(", ")}.`);
    return;
  }

  const groupId = crypto.randomUUID();
  selectedHours.forEach((hour) => {
    reservations.push({
      id: crypto.randomUUID(),
      groupId,
      date,
      hour,
      vm,
      username: activeUser,
      note,
      createdAt: new Date().toISOString(),
    });
  });

  writeJson(STORAGE_KEYS.reservations, reservations);
  reservationDialog.close();
  renderCalendar();
}

function getReservationGroupIds(reservation) {
  return {
    groupId: reservation.groupId ?? reservation.id,
    id: reservation.id,
  };
}

function cancelReservation(reservationId) {
  const reservations = readJson(STORAGE_KEYS.reservations, []);
  const reservation = reservations.find((item) => item.id === reservationId);
  if (!reservation || reservation.username !== activeUser) {
    return;
  }

  const { groupId } = getReservationGroupIds(reservation);
  const groupReservations = reservations.filter((item) => (item.groupId ?? item.id) === groupId);
  const shouldCancel = confirm(`Cancelar esta reserva de ${groupReservations.length} horário(s)?`);
  if (!shouldCancel) {
    return;
  }

  writeJson(
    STORAGE_KEYS.reservations,
    reservations.filter((item) => (item.groupId ?? item.id) !== groupId),
  );
  renderCalendar();
}

function shiftSelectedDate(days) {
  const current = parseDateKey(dateInput.value);
  current.setDate(current.getDate() + days);
  dateInput.value = formatDateKey(current);
  renderApp();
}

function boot() {
  dateInput.value = formatDateKey(new Date());
  dateInput.required = true;
  const session = readJson(STORAGE_KEYS.session, null);
  activeUser = session?.username ?? null;

  signInTab.addEventListener("click", () => setAuthMode("signin"));
  createAccountTab.addEventListener("click", () => setAuthMode("create"));
  authForm.addEventListener("submit", handleAuthSubmit);
  logoutButton.addEventListener("click", logout);
  dateInput.addEventListener("change", renderApp);
  prevDayButton.addEventListener("click", () => shiftSelectedDate(-1));
  nextDayButton.addEventListener("click", () => shiftSelectedDate(1));
  todayButton.addEventListener("click", () => {
    dateInput.value = formatDateKey(new Date());
    renderApp();
  });
  newReservationButton.addEventListener("click", () => openReservationDialog());
  startHourSelect.addEventListener("change", () => updateEndHourOptions());
  fullDayCheckbox.addEventListener("change", () => {
    setTimeFieldsEnabled(!fullDayCheckbox.checked);
  });
  reservationForm.addEventListener("submit", handleReservationSubmit);
  cancelDialogButton.addEventListener("click", () => reservationDialog.close());

  if (activeUser) {
    renderApp();
  }
}

boot();
