/* =========================================================
   Tasks page (index.html)
   Structure: state -> render() -> event listeners
   Shared helpers (storage, formatting) live in storage.js.
   ========================================================= */

/* ---------- State ---------- */
let tasks = loadTasks();   // [{ id, title, minutes, done, estimate }]

/* ---------- DOM references ---------- */
const form = document.getElementById('task-form');
const titleInput = document.getElementById('task-title');
const estimateSelect = document.getElementById('task-estimate');
const list = document.getElementById('task-list');
const emptyMessage = document.getElementById('empty-message');
const todayTotalEl = document.getElementById('today-total');
const banner = document.getElementById('session-banner');

/* =========================================================
   Actions
   ========================================================= */

/**
 * Creates a new task and saves it.
 * estimateValue is the <select> value in minutes ("" means no estimate).
 */
function addTask(title, estimateValue) {
  const cleanTitle = title.trim();
  if (!cleanTitle) return;

  tasks.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: cleanTitle,
    minutes: 0,
    done: false,
    estimate: estimateValue ? Number(estimateValue) : null
  });

  saveTasks(tasks);
  render();
}

/* =========================================================
   Rendering
   ========================================================= */

/**
 * Builds the right action control for a task:
 *  - the running task gets an "Open timer" link,
 *  - other tasks are disabled while a session is running,
 *  - otherwise a "Start" link opens the focus page for this task.
 */
function createAction(task, session) {
  const isActive = session && session.taskId === task.id;

  if (isActive) {
    const link = document.createElement('a');
    link.className = 'btn btn-primary';
    link.href = 'focus.html';
    link.textContent = 'Open timer';
    link.setAttribute('aria-label', 'Open timer for ' + task.title);
    return link;
  }

  if (session) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary';
    button.disabled = true;
    button.textContent = 'Start';
    button.title = 'Finish your current session first';
    return button;
  }

  const link = document.createElement('a');
  link.className = 'btn btn-primary';
  link.href = 'focus.html?task=' + encodeURIComponent(task.id);
  link.textContent = 'Start';
  link.setAttribute('aria-label', 'Start a session for ' + task.title);
  return link;
}

/** Builds one <li> for a task: title, progress text, optional progress bar, and action. */
function createTaskElement(task, session) {
  const isActive = session && session.taskId === task.id;

  const li = document.createElement('li');
  li.className = 'task' + (isActive ? ' is-active' : '');

  // textContent (not innerHTML) keeps user-typed titles safe from HTML injection
  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;

  const meta = document.createElement('p');
  meta.className = 'task-meta';
  if (task.estimate) {
    const reached = task.minutes >= task.estimate ? ' (estimate reached)' : '';
    meta.textContent =
      formatMinutes(task.minutes) + ' of ' + formatMinutes(task.estimate) + reached;
  } else {
    meta.textContent = formatMinutes(task.minutes) + ' focused';
  }

  li.append(title, meta, createAction(task, session));

  // Progress bar only for tasks that have an estimate
  if (task.estimate) {
    const progress = document.createElement('progress');
    progress.className = 'task-progress';
    progress.max = task.estimate;
    progress.value = Math.min(task.minutes, task.estimate);
    progress.setAttribute('aria-label', 'Progress on ' + task.title);
    li.append(progress);
  }

  return li;
}

/** Shows or hides the "session in progress" banner at the top of the page. */
function renderBanner(session) {
  const task = session && tasks.find((t) => t.id === session.taskId);
  if (!task) {
    banner.hidden = true;
    return;
  }

  const link = document.createElement('a');
  link.href = 'focus.html';
  link.textContent = 'Open timer';

  banner.replaceChildren('Session in progress on "' + task.title + '". ', link);
  banner.hidden = false;
}

/** Redraws the whole page from saved state. Every change ends by calling this. */
function render() {
  let session = loadSession();

  // A saved session whose task no longer exists would lock every Start button, so clear it.
  if (session && !tasks.some((t) => t.id === session.taskId)) {
    clearSession();
    session = null;
  }

  list.replaceChildren(...tasks.map((task) => createTaskElement(task, session)));
  emptyMessage.hidden = tasks.length > 0;
  todayTotalEl.textContent = formatMinutes(loadToday().minutes);
  renderBanner(session);
}

/* =========================================================
   Event listeners
   ========================================================= */

/** Handles the add-task form: creates the task, resets the fields, keeps focus for fast entry. */
form.addEventListener('submit', (event) => {
  event.preventDefault();
  addTask(titleInput.value, estimateSelect.value);
  titleInput.value = '';
  estimateSelect.value = '';
  titleInput.focus();
});

/**
 * When the browser restores this page from its back/forward cache (e.g. after pressing Back
 * from the focus page), scripts don't re-run, so reload the saved data and redraw.
 */
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    tasks = loadTasks();
    render();
  }
});

/* ---------- Initial draw ---------- */
render();