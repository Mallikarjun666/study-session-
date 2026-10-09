/* =========================================================
   Focus page (focus.html)
   Two views: setup (choose session length) and timer (running session).
   The timer is computed from a saved start timestamp, not by counting ticks,
   so it stays correct when the tab is in the background or the page is reloaded.
   Shared helpers (storage, formatting) live in storage.js.
   ========================================================= */

/* ---------- Constants ---------- */
const EXTEND_MINUTES = 10;                          // how much "Add 10 min" adds
const MAX_CUSTOM_MINUTES = 480;                     // longest custom session (8 hours)
const RING_CIRCUMFERENCE = 2 * Math.PI * 100;       // matches r="100" on the SVG circles

/* ---------- State ---------- */
const params = new URLSearchParams(window.location.search);
const tasks = loadTasks();
let session = loadSession();    // { taskId, startedAt, plannedMinutes } or null
let currentTask = null;         // the task this page is about
let tickInterval = null;        // setInterval id for the display refresh
let timeUpHandled = false;      // makes sure the "time's up" alert fires once per countdown

/* ---------- DOM references ---------- */
const titleEl = document.getElementById('task-title');
const setupView = document.getElementById('setup-view');
const setupInfo = document.getElementById('setup-info');
const customForm = document.getElementById('custom-form');
const customInput = document.getElementById('custom-minutes');
const customError = document.getElementById('custom-error');
const openEndedBtn = document.getElementById('open-ended-btn');

const timerView = document.getElementById('timer-view');
const sessionNote = document.getElementById('session-note');
const ringEl = document.getElementById('ring');
const ringArc = document.getElementById('ring-arc');
const timeDisplay = document.getElementById('time-display');
const timeCaption = document.getElementById('time-caption');
const extendBtn = document.getElementById('extend-btn');
const finishBtn = document.getElementById('finish-btn');
const liveStatus = document.getElementById('live-status');

/* =========================================================
   Setup view
   ========================================================= */

/** Shows the "choose a session length" view for the given task. */
function showSetup(task) {
  currentTask = task;
  titleEl.textContent = task.title;
  document.title = 'Plan session - ' + task.title;

  setupInfo.textContent = task.estimate
    ? formatMinutes(task.minutes) + ' of ' + formatMinutes(task.estimate) + ' done'
    : 'No estimate set for this task';

  setupView.hidden = false;
  timerView.hidden = true;
}

/**
 * Starts a session for the current task and switches to the timer view.
 * plannedMinutes is a number for a countdown, or null for an open-ended session.
 */
function startSession(plannedMinutes) {
  session = {
    taskId: currentTask.id,
    startedAt: Date.now(),
    plannedMinutes: plannedMinutes
  };
  saveSession(session);
  timeUpHandled = false;
  showTimer(currentTask);
}

/* =========================================================
   Timer view
   ========================================================= */

/** Shows the running timer for the given task and starts refreshing the display. */
function showTimer(task) {
  currentTask = task;
  titleEl.textContent = task.title;

  setupView.hidden = true;
  timerView.hidden = false;

  ringArc.style.strokeDasharray = RING_CIRCUMFERENCE;
  updateNote();

  clearInterval(tickInterval);
  tick();
  tickInterval = setInterval(tick, 500);
}

/** Updates the line under the title and shows "Add 10 min" only for countdown sessions. */
function updateNote() {
  if (session.plannedMinutes === null) {
    sessionNote.textContent = 'Open-ended session. It counts up until you finish.';
    extendBtn.hidden = true;
  } else {
    sessionNote.textContent = formatMinutes(session.plannedMinutes) + ' session';
    extendBtn.hidden = false;
  }
}

/**
 * Redraws the clock and ring from the saved start time.
 * Countdown: shows time remaining and a ring that empties.
 * Open-ended: shows time elapsed and a full, faded ring.
 */
function tick() {
  if (!session || !currentTask) return;

  const elapsedMs = Date.now() - session.startedAt;
  let display;
  let caption;
  let fraction;           // how full the ring is, from 0 to 1
  let isOpen = false;
  let isUp = false;

  if (session.plannedMinutes === null) {
    display = formatClock(elapsedMs);
    caption = 'elapsed';
    fraction = 1;
    isOpen = true;
  } else {
    const plannedMs = session.plannedMinutes * 60000;
    const remainingMs = plannedMs - elapsedMs;

    if (remainingMs > 0) {
      // Round up so the clock reads 25:00 at the start and hits 00:00 exactly at the end
      display = formatClock(Math.ceil(remainingMs / 1000) * 1000);
      caption = 'remaining';
      fraction = remainingMs / plannedMs;
    } else {
      display = '00:00';
      caption = "Time's up";
      fraction = 1;
      isUp = true;
      handleTimeUp();
    }
  }

  timeDisplay.textContent = display;
  timeCaption.textContent = caption;
  ringArc.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - fraction);
  ringEl.classList.toggle('is-open', isOpen);
  ringEl.classList.toggle('is-up', isUp);
  document.title = display + ' - ' + currentTask.title;
}

/** Runs once when a countdown reaches zero: announces it, beeps and vibrates. */
function handleTimeUp() {
  if (timeUpHandled) return;
  timeUpHandled = true;

  liveStatus.textContent = "Time's up. Finish the session or add " + EXTEND_MINUTES + ' more minutes.';
  playBeep();
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

/** Plays a short soft beep. Wrapped in try/catch because browsers may block audio. */
function playBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);

    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.85);
    osc.onended = () => ctx.close();
  } catch {
    // Audio is a bonus; the visual "Time's up" state still shows.
  }
}

/**
 * Adds time to a countdown.
 *  - Still counting down: just makes the session 10 minutes longer.
 *  - Time was already up: saves the planned minutes, then starts a fresh 10-minute block from
 *    now, so minutes where nobody was studying never get counted.
 */
function extendSession() {
  if (!session || session.plannedMinutes === null) return;

  const elapsedMinutes = (Date.now() - session.startedAt) / 60000;

  if (elapsedMinutes >= session.plannedMinutes) {
    creditMinutes(session.taskId, session.plannedMinutes);
    session = { ...session, startedAt: Date.now(), plannedMinutes: EXTEND_MINUTES };
  } else {
    session = { ...session, plannedMinutes: session.plannedMinutes + EXTEND_MINUTES };
  }

  saveSession(session);
  timeUpHandled = false;
  liveStatus.textContent = '';
  updateNote();
  tick();
}

/**
 * Ends the session, adds the focused minutes to the task and today's total, and returns to the
 * task list. For countdowns the credit is capped at the planned time, so leaving the timer
 * running unattended doesn't inflate your minutes.
 */
function finishSession() {
  if (!session) return;

  const elapsedMinutes = (Date.now() - session.startedAt) / 60000;
  const credited =
    session.plannedMinutes === null
      ? elapsedMinutes
      : Math.min(elapsedMinutes, session.plannedMinutes);

  creditMinutes(session.taskId, credited);

  clearInterval(tickInterval);
  clearSession();
  session = null;
  window.location.href = 'index.html';
}

/* =========================================================
   Event listeners
   ========================================================= */

/** Each preset button starts a countdown of its data-minutes value. */
setupView.querySelectorAll('button[data-minutes]').forEach((button) => {
  button.addEventListener('click', () => startSession(Number(button.dataset.minutes)));
});

/** Custom length form: checks the number, then starts a countdown. */
customForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const minutes = Math.round(Number(customInput.value));

  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_CUSTOM_MINUTES) {
    customError.textContent = 'Enter a length between 1 and ' + MAX_CUSTOM_MINUTES + ' minutes.';
    return;
  }

  customError.textContent = '';
  startSession(minutes);
});

/** "No time limit" starts an open-ended session that counts up. */
openEndedBtn.addEventListener('click', () => startSession(null));

extendBtn.addEventListener('click', extendSession);
finishBtn.addEventListener('click', finishSession);

/** Browsers slow timers in background tabs, so refresh the clock the moment the tab is visible. */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick();
});

/* =========================================================
   Start-up: decide which view to show
   ========================================================= */

/**
 * - A session is already running -> show its timer (even if the URL names another task).
 * - Otherwise the URL must name a task (?task=ID) -> show setup for it.
 * - Anything else -> go back to the task list.
 */
function init() {
  if (session) {
    const task = tasks.find((t) => t.id === session.taskId);
    if (task) {
      showTimer(task);
      return;
    }
    clearSession();   // orphaned session: its task no longer exists
    session = null;
  }

  const task = tasks.find((t) => t.id === params.get('task'));
  if (!task) {
    window.location.replace('index.html');
    return;
  }
  showSetup(task);
}

init();