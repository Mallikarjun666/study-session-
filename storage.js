/* =========================================================
   Shared helpers: storage + formatting
   Loaded by BOTH pages (index.html and focus.html) before their own script.
   Plain <script> tags are used instead of ES modules so the site also works
   when you open the files directly from disk.
   ========================================================= */

/* ---------- localStorage keys ---------- */
const TASKS_KEY = 'sst.tasks';       // [{ id, title, minutes, done, estimate }]
const TODAY_KEY = 'sst.today';       // { date: 'YYYY-MM-DD', minutes }
const SESSION_KEY = 'sst.session';   // { taskId, startedAt, plannedMinutes } or missing

/* =========================================================
   Low-level storage
   ========================================================= */

/** Reads and parses one JSON value from localStorage. Returns null if missing or corrupted. */
function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

/** Writes one value to localStorage as JSON. Silently ignores errors (storage full or blocked). */
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The app keeps working in memory for this page view.
  }
}

/* =========================================================
   Date and number helpers
   ========================================================= */

/** Returns today's local date as 'YYYY-MM-DD' (used to reset the daily total). */
function todayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Rounds to 2 decimals so fractional minutes don't build up long floating-point tails. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Turns minutes into a friendly string: "45 min", "3 h" or "1 h 25 min". */
function formatMinutes(minutes) {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Turns milliseconds into a clock string: "03:07", or "1:03:07" once past an hour. */
function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/* =========================================================
   Tasks
   ========================================================= */

/**
 * Makes sure a stored task has every field the app expects.
 * Tasks saved by the earlier version have no `estimate`, so they become "no estimate" (null).
 */
function normalizeTask(t) {
  const estimate = Number(t.estimate);
  return {
    id: String(t.id),
    title: String(t.title),
    minutes: Number(t.minutes) || 0,
    done: Boolean(t.done),
    estimate: estimate > 0 ? estimate : null
  };
}

/** Reads all tasks from localStorage (always returns an array). */
function loadTasks() {
  const data = readJSON(TASKS_KEY);
  if (!Array.isArray(data)) return [];
  return data.filter((t) => t && t.id && t.title).map(normalizeTask);
}

/** Saves the full tasks array. */
function saveTasks(tasks) {
  writeJSON(TASKS_KEY, tasks);
}

/* =========================================================
   Today's total
   ========================================================= */

/** Reads today's focused minutes. If the saved date isn't today, a fresh day starts at 0. */
function loadToday() {
  const data = readJSON(TODAY_KEY);
  if (data && data.date === todayString() && typeof data.minutes === 'number') {
    return data;
  }
  return { date: todayString(), minutes: 0 };
}

/** Saves today's total. */
function saveToday(today) {
  writeJSON(TODAY_KEY, today);
}

/** Adds focused minutes to one task AND to today's total, then saves both. */
function creditMinutes(taskId, minutes) {
  const tasks = loadTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (task) {
    task.minutes = round2(task.minutes + minutes);
    saveTasks(tasks);
  }

  const today = loadToday();
  today.minutes = round2(today.minutes + minutes);
  saveToday(today);
}

/* =========================================================
   Running session (shared between the two pages)
   ========================================================= */

/**
 * Reads the running session, or null if none.
 * plannedMinutes is a number for a countdown, or null for an open-ended session.
 */
function loadSession() {
  const s = readJSON(SESSION_KEY);
  if (!s || typeof s.taskId !== 'string' || typeof s.startedAt !== 'number') return null;
  const planned = Number(s.plannedMinutes);
  return {
    taskId: s.taskId,
    startedAt: s.startedAt,
    plannedMinutes: planned > 0 ? planned : null
  };
}

/** Saves the running session. */
function saveSession(session) {
  writeJSON(SESSION_KEY, session);
}

/** Removes the running session. */
function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage errors.
  }
}