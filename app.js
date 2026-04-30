const HOURS = Array.from({ length: 12 }, (_, index) => index + 8);
const SINGLE_VM = "VM";
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
const startHourSelect = document.querySelector("#startHourSelect");
const endHourSelect = document.querySelector("#endHourSelect");
const fullDayCheckbox = document.querySelector("#fullDayCheckbox");
const reservationNote = document.querySelector("#reservationNote");
const cancelDialogButton = document.querySelector("#cancelDialogButton");

let authMode = window.RESERVA_VM_AUTH_MODE || "signin";
let activeUser = null;
let supabaseClient = null;
let reservationsChannel = null;
let reservationDate = null;
let currentGmtMinus3DateKey = null;
let gmtMinus3Timer = null;
let calendarRenderId = 0;
let calendarAbortController = null;

const RESERVATIONS_QUERY_TIMEOUT_MS = 10000;

function cleanUsername(username) {
  return username.trim().toLowerCase();
}

function usernameToAuthEmail(username) {
  return `${cleanUsername(username)}@reserva.local`;
}

function emailToUsername(email) {
  return email?.replace(/@reserva\.local$/i, "") ?? "Usuário";
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getGmtMinus3DateKey() {
  const now = new Date();
  const gmtMinus3Time = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return gmtMinus3Time.toISOString().slice(0, 10);
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

function isSupabaseConfigured() {
  const config = window.RESERVA_VM_SUPABASE;
  return Boolean(
    window.supabase &&
      config?.url &&
      config?.publishableKey &&
      !config.url.includes("SEU-PROJETO") &&
      !config.publishableKey.includes("SUA-CHAVE"),
  );
}

function createSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const rawUrl = window.RESERVA_VM_SUPABASE.url;
  const supabaseUrl = rawUrl.startsWith("//")
    ? `https:${rawUrl}`
    : rawUrl && !/^https?:\/\//i.test(rawUrl)
      ? `https://${rawUrl}`
      : rawUrl;

  return window.supabase.createClient(
    supabaseUrl,
    window.RESERVA_VM_SUPABASE.publishableKey,
  );
}

function setAuthMode(nextMode) {
  authMode = nextMode;
  if (window.setReservaVmAuthMode) {
    window.setReservaVmAuthMode(nextMode);
    return;
  }

  signInTab.classList.toggle("is-active", nextMode === "signin");
  createAccountTab.classList.toggle("is-active", nextMode === "create");
  authSubmit.textContent = nextMode === "signin" ? "Entrar" : "Criar conta";
  passwordInput.autocomplete = nextMode === "signin" ? "current-password" : "new-password";
  authMessage.textContent = "";
  authMessage.classList.remove("success");
}

function showMessage(element, message, isSuccess = false) {
  element.textContent = message;
  element.classList.toggle("success", isSuccess);
}

function formatAuthError(message) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("email not confirmed")) {
    return "A confirmação de e-mail está ativada no Supabase. Como o app usa usuário simples, desative em Authentication > Providers > Email > Confirm email.";
  }

  if (normalizedMessage.includes("email logins are disabled")) {
    return "O login por senha está desativado no Supabase. Ative Authentication > Providers > Email. O app continuará mostrando só Usuário e Senha.";
  }

  if (normalizedMessage.includes("invalid login credentials")) {
    return "Usuário ou senha inválidos.";
  }

  if (normalizedMessage.includes("user already registered") || normalizedMessage.includes("already registered")) {
    return "Esse usuário já existe. Use Entrar ou escolha outro usuário.";
  }

  return message;
}

function getDisplayName(user) {
  return emailToUsername(user?.email);
}

function showAuthScreen(message) {
  activeUser = null;
  appShell.classList.add("is-hidden");
  authScreen.classList.remove("is-hidden");
  signedInUser.textContent = "";

  if (message) {
    showMessage(authMessage, message);
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  authMode = window.RESERVA_VM_AUTH_MODE || authMode;

  if (!supabaseClient) {
    showMessage(authMessage, "Configure o Supabase antes de entrar.");
    return;
  }

  const username = cleanUsername(usernameInput.value);
  const email = usernameToAuthEmail(username);
  const password = passwordInput.value;

  if (!/^[a-z0-9_.-]{3,24}$/.test(username)) {
    showMessage(authMessage, "Use 3 a 24 letras, números, pontos, traços ou underscores.");
    return;
  }

  if (password.length < 6) {
    showMessage(authMessage, "A senha precisa ter pelo menos 6 caracteres.");
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = authMode === "signin" ? "Entrando..." : "Criando...";

  try {
    if (authMode === "create") {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });

      if (error) {
        showMessage(authMessage, formatAuthError(error.message));
        return;
      }

      if (!data.session) {
        // Email confirmation is required but @reserva.local addresses can't receive emails.
        // Try signing in immediately — works if auto-confirm is on, gives clear error otherwise.
        const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (!loginError && loginData.session) {
          await startSession(loginData.user);
          return;
        }
        setAuthMode("signin");
        showMessage(
          authMessage,
          "Conta criada, mas confirmação de e-mail está ativada no Supabase. Desative em Authentication → Providers → Email → Confirm email.",
        );
        return;
      }

      await startSession(data.user);
      return;
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      showMessage(authMessage, formatAuthError(error.message));
      return;
    }

    await startSession(data.user);
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = authMode === "signin" ? "Entrar" : "Criar conta";
  }
}

async function startSession(user) {
  activeUser = user;
  usernameInput.value = "";
  passwordInput.value = "";
  await renderApp();
}

async function logout() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }

  if (reservationsChannel) {
    await supabaseClient.removeChannel(reservationsChannel);
    reservationsChannel = null;
  }

  showAuthScreen();
  setAuthMode("signin");
}

async function renderApp() {
  authScreen.classList.add("is-hidden");
  appShell.classList.remove("is-hidden");
  signedInUser.textContent = getDisplayName(activeUser);

  if (!dateInput.value) {
    dateInput.value = getGmtMinus3DateKey();
  }

  renderWeekStrip();
  subscribeToReservationChanges();
  await renderCalendar();
}

function getWeekDates() {
  const selectedDate = parseDateKey(dateInput.value);
  const start = new Date(selectedDate);
  start.setDate(selectedDate.getDate() - selectedDate.getDay());

  return Array.from({ length: 7 }, (_, offset) => {
    const current = new Date(start);
    current.setDate(start.getDate() + offset);
    return {
      date: current,
      dateKey: formatDateKey(current),
      label: `${DAY_NAMES[current.getDay()]} ${current.getMonth() + 1}/${current.getDate()}`,
    };
  });
}

function renderWeekStrip() {
  const weekDates = getWeekDates();
  weekStrip.replaceChildren();

  weekDates.forEach(({ date, dateKey }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "week-day";
    button.classList.toggle("is-selected", dateKey === dateInput.value);
    const dayName = document.createElement("strong");
    dayName.textContent = DAY_NAMES[date.getDay()];
    const dayDate = document.createTextNode(`${date.getMonth() + 1}/${date.getDate()}`);
    button.append(dayName, dayDate);
    button.addEventListener("click", async () => {
      dateInput.value = dateKey;
      await renderApp();
    });
    weekStrip.append(button);
  });
}

async function fetchSelectedDayReservations(dateKey, signal) {
  const { data, error } = await supabaseClient
    .from("reservations")
    .select("id,reservation_group_id,vm,date,hour,user_id,user_email,note,created_at")
    .eq("date", dateKey)
    .order("hour", { ascending: true })
    .abortSignal(signal);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function renderCalendar() {
  const renderId = calendarRenderId + 1;
  calendarRenderId = renderId;
  const selectedDate = dateInput.value;

  if (calendarAbortController) {
    calendarAbortController.abort();
  }

  const abortController = new AbortController();
  calendarAbortController = abortController;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, RESERVATIONS_QUERY_TIMEOUT_MS);

  calendarGrid.style.gridTemplateColumns = "220px minmax(240px, 1fr)";
  calendarGrid.replaceChildren();
  calendarGrid.append(createHeaderCell("Carregando..."));

  let dayReservations = [];
  try {
    dayReservations = await fetchSelectedDayReservations(selectedDate, abortController.signal);
  } catch (error) {
    if (renderId !== calendarRenderId) {
      return;
    }

    calendarGrid.replaceChildren();
    calendarGrid.append(createErrorCell(formatCalendarError(error)));
    return;
  } finally {
    clearTimeout(timeoutId);
  }

  if (renderId !== calendarRenderId) {
    return;
  }

  calendarGrid.replaceChildren();
  calendarGrid.append(createHeaderCell("Horário"));
  calendarGrid.append(createHeaderCell("Reserva"));

  HOURS.forEach((hour) => {
    const timeCell = document.createElement("div");
    timeCell.className = "calendar-cell time-cell";
    timeCell.textContent = formatSlotRange(hour);
    calendarGrid.append(timeCell);

    const reservation = dayReservations.find((item) => item.hour === hour);
    calendarGrid.append(createSlotCell(selectedDate, hour, reservation));
  });
}

function createHeaderCell(text) {
  const cell = document.createElement("div");
  cell.className = "calendar-cell calendar-head";
  cell.textContent = text;
  return cell;
}

function createErrorCell(message) {
  const cell = document.createElement("div");
  cell.className = "calendar-cell error-cell";
  cell.textContent = `Erro ao carregar reservas: ${message}`;
  return cell;
}

function formatCalendarError(error) {
  const message = error?.message || String(error);
  const normalizedMessage = message.toLowerCase();

  if (error?.name === "AbortError" || normalizedMessage.includes("aborted")) {
    return "a consulta demorou demais. Verifique a conexão e tente atualizar o dia.";
  }

  if (normalizedMessage.includes("failed to fetch") || normalizedMessage.includes("network")) {
    return "falha de rede ao falar com o Supabase. Verifique a conexão e tente novamente.";
  }

  return message;
}

function createSlotCell(dateKey, hour, reservation) {
  const cell = document.createElement("div");
  cell.className = "calendar-cell";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "slot-button";

  if (!reservation) {
    button.textContent = "Disponível";
    button.addEventListener("click", () => openReservationDialog(dateKey, hour));
  } else {
    const isOwn = reservation.user_id === activeUser.id;
    const displayUser = emailToUsername(reservation.user_email);
    button.classList.add("is-booked");
    button.classList.toggle("is-own", isOwn);
    button.replaceChildren();
    const title = document.createElement("span");
    title.textContent = isOwn ? "Sua reserva" : "Reservado";
    const meta = document.createElement("span");
    meta.className = "slot-meta";
    meta.textContent = reservation.note ? `${displayUser} - ${reservation.note}` : displayUser;
    button.append(title, meta);
    button.setAttribute("aria-label", `${dateKey} ${formatSlotRange(hour)} reservado por ${displayUser}`);

    if (isOwn) {
      button.title = "Clique para cancelar esta reserva";
      button.addEventListener("click", () => cancelReservation(reservation));
    }
  }

  cell.append(button);
  return cell;
}

function fillReservationOptions() {
  startHourSelect.replaceChildren();
  HOURS.forEach((hour) => {
    const option = document.createElement("option");
    option.value = String(hour);
    option.textContent = formatSlotRange(hour);
    startHourSelect.append(option);
  });

  updateEndHourOptions();
}

function openReservationDialog(dateKey = dateInput.value, hour = HOURS[0]) {
  fillReservationOptions();
  reservationDate = dateKey;
  reservationMessage.textContent = "";
  reservationMessage.classList.remove("success");
  reservationNote.value = "";
  fullDayCheckbox.checked = false;
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

async function handleReservationSubmit(event) {
  event.preventDefault();
  const note = reservationNote.value.trim();
  const date = reservationDate ?? dateInput.value;
  const selectedHours = getSelectedHours();

  if (selectedHours.length === 0) {
    showMessage(reservationMessage, "Selecione pelo menos um horário.");
    return;
  }

  const { data: existingReservations, error: checkError } = await supabaseClient
    .from("reservations")
    .select("vm,hour,user_id")
    .eq("date", date)
    .in("hour", selectedHours);

  if (checkError) {
    showMessage(reservationMessage, checkError.message);
    return;
  }

  const busyHours = selectedHours.filter((hour) =>
    existingReservations.some((reservation) => reservation.hour === hour),
  );

  if (busyHours.length > 0) {
    showMessage(reservationMessage, `Essa VM já está reservada em: ${busyHours.map(formatHour).join(", ")}.`);
    await renderCalendar();
    return;
  }

  const userBusyHours = selectedHours.filter((hour) =>
    existingReservations.some((reservation) => reservation.user_id === activeUser.id && reservation.hour === hour),
  );

  if (userBusyHours.length > 0) {
    showMessage(reservationMessage, `Você já tem reserva em: ${userBusyHours.map(formatHour).join(", ")}.`);
    return;
  }

  const reservationGroupId = crypto.randomUUID();
  const rows = selectedHours.map((hour) => ({
    reservation_group_id: reservationGroupId,
    date,
    hour,
    vm: SINGLE_VM,
    user_id: activeUser.id,
    user_email: activeUser.email,
    note,
  }));

  const { error } = await supabaseClient.from("reservations").insert(rows);

  if (error) {
    if (error.code === "23505") {
      showMessage(reservationMessage, "Alguém acabou de reservar um desses horários. Atualize e tente outro intervalo.");
      await renderCalendar();
      return;
    }

    showMessage(reservationMessage, error.message);
    return;
  }

  reservationDialog.close();
  await renderCalendar();
}

async function cancelReservation(reservation) {
  if (reservation.user_id !== activeUser.id) {
    return;
  }

  const shouldCancel = confirm("Cancelar este bloco de reserva?");
  if (!shouldCancel) {
    return;
  }

  const { error } = await supabaseClient
    .from("reservations")
    .delete()
    .eq("reservation_group_id", reservation.reservation_group_id)
    .eq("user_id", activeUser.id);

  if (error) {
    alert(error.message);
    return;
  }

  await renderCalendar();
}

async function shiftSelectedDate(days) {
  const current = parseDateKey(dateInput.value);
  current.setDate(current.getDate() + days);
  dateInput.value = formatDateKey(current);
  await renderApp();
}

async function syncSelectedDateToGmtMinus3Today() {
  const nextDateKey = getGmtMinus3DateKey();
  if (nextDateKey === currentGmtMinus3DateKey) {
    return;
  }

  currentGmtMinus3DateKey = nextDateKey;
  dateInput.value = nextDateKey;
  if (activeUser) {
    await renderApp();
  } else {
    renderWeekStrip();
  }
}

function startGmtMinus3DateWatcher() {
  currentGmtMinus3DateKey = getGmtMinus3DateKey();
  if (gmtMinus3Timer) {
    clearInterval(gmtMinus3Timer);
  }

  gmtMinus3Timer = setInterval(syncSelectedDateToGmtMinus3Today, 30000);
}

function subscribeToReservationChanges() {
  if (reservationsChannel || !supabaseClient) {
    return;
  }

  reservationsChannel = supabaseClient
    .channel("reservations-calendar")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "reservations" },
      async (payload) => {
        const changedDate = payload.new?.date ?? payload.old?.date;
        if (!changedDate || changedDate === dateInput.value) {
          await renderCalendar();
        }
      },
    )
    .subscribe();
}

async function boot() {
  dateInput.value = getGmtMinus3DateKey();
  dateInput.required = true;
  startGmtMinus3DateWatcher();
  supabaseClient = createSupabaseClient();

  signInTab.addEventListener("click", () => setAuthMode("signin"));
  createAccountTab.addEventListener("click", () => setAuthMode("create"));
  authForm.addEventListener("submit", handleAuthSubmit);
  logoutButton.addEventListener("click", logout);
  dateInput.addEventListener("change", renderApp);
  prevDayButton.addEventListener("click", () => shiftSelectedDate(-1));
  nextDayButton.addEventListener("click", () => shiftSelectedDate(1));
  todayButton.addEventListener("click", async () => {
    dateInput.value = getGmtMinus3DateKey();
    await renderApp();
  });
  newReservationButton.addEventListener("click", () => openReservationDialog());
  startHourSelect.addEventListener("change", () => updateEndHourOptions());
  fullDayCheckbox.addEventListener("change", () => {
    setTimeFieldsEnabled(!fullDayCheckbox.checked);
  });
  reservationForm.addEventListener("submit", handleReservationSubmit);
  cancelDialogButton.addEventListener("click", () => reservationDialog.close());

  if (!supabaseClient) {
    showAuthScreen("Configure o Supabase para ativar login e reservas compartilhadas.");
    return;
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    activeUser = session?.user ?? null;
    if (activeUser) {
      await renderApp();
    } else {
      showAuthScreen();
    }
  });

  const { data } = await supabaseClient.auth.getSession();
  activeUser = data.session?.user ?? null;

  if (activeUser) {
    await renderApp();
  } else {
    showAuthScreen();
  }
}

boot();
