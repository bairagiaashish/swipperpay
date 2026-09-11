/* ============================================================
   SwipperPay — attendance & pay tracker
   All data lives in this browser's localStorage. No server.
   ============================================================ */
'use strict';

const STORE_KEY   = 'swipperpay.v2';
const THEME_KEY   = 'swipperpay.theme';
const DEFAULT_RATE = 24;
const STATUSES = ['present', 'absent', 'holiday'];

/** @type {{id:string,name:string,rate:number}[]} */
let swippers = [];
/** @type {Record<string,{status:string,pay:number}>} keyed `${id}|${YYYY-MM-DD}` */
let attendance = {};
let currentDate = todayISO();

/* ------------------------------------------------------------
   Date helpers — always local time, never UTC.
   `new Date('2026-09-11')` parses as UTC midnight, which shifts
   the day backwards in negative-offset zones. We avoid it.
   ------------------------------------------------------------ */
function todayISO() {
  return toISO(new Date());
}

function toISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shiftDate(iso, days) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

function formatLong(iso) {
  return fromISO(iso).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Compact enough to fit the date bar on a narrow phone. */
function formatMedium(iso) {
  return fromISO(iso).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatShort(iso) {
  return fromISO(iso).toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short',
  });
}

function money(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function uid() {
  return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function key(id, date) {
  return `${id}|${date}`;
}

/* ------------------------------------------------------------
   Storage (+ one-time migration off index-based keys)
   ------------------------------------------------------------ */
function saveData() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 2, swippers, attendance }));
  } catch (err) {
    toast('Could not save — storage may be full or blocked');
    console.error(err);
  }
}

function loadData() {
  // Current format
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      swippers = Array.isArray(data.swippers) ? data.swippers : [];
      attendance = data.attendance && typeof data.attendance === 'object' ? data.attendance : {};
      normalise();
      return;
    }
  } catch (err) {
    console.error('Could not read saved data', err);
  }

  // Legacy format: swippers had no ids and attendance was keyed by ARRAY INDEX
  // (`0-2026-09-11`), so deleting anyone silently reassigned their history.
  // Convert to stable ids once, then keep the old keys as a safety copy.
  try {
    const legacyWorkers = JSON.parse(localStorage.getItem('swippers') || '[]');
    const legacyAtt = JSON.parse(localStorage.getItem('attendance') || '{}');
    if (!Array.isArray(legacyWorkers) || legacyWorkers.length === 0) return;

    const idByIndex = legacyWorkers.map(() => uid());
    swippers = legacyWorkers.map((w, i) => ({
      id: idByIndex[i],
      name: String(w.name || `Swipper ${i + 1}`),
      rate: Number(w.daily_rate ?? w.rate ?? DEFAULT_RATE),
    }));

    attendance = {};
    for (const [k, rec] of Object.entries(legacyAtt || {})) {
      const m = /^(\d+)-(\d{4}-\d{2}-\d{2})$/.exec(k);
      if (!m) continue;
      const id = idByIndex[Number(m[1])];
      if (!id) continue;
      attendance[key(id, m[2])] = {
        status: STATUSES.includes(rec?.status) ? rec.status : 'absent',
        pay: Number(rec?.pay) || 0,
      };
    }

    normalise();
    saveData();
    toast('Existing data upgraded');
  } catch (err) {
    console.error('Migration failed', err);
  }
}

/** Guarantee every worker has an id, a name and a numeric rate. */
function normalise() {
  const seen = new Set();
  swippers = swippers
    .filter(w => w && typeof w === 'object')
    .map((w, i) => {
      let id = typeof w.id === 'string' && w.id && !seen.has(w.id) ? w.id : uid();
      seen.add(id);
      return {
        id,
        name: String(w.name ?? `Swipper ${i + 1}`).trim() || `Swipper ${i + 1}`,
        rate: Math.max(0, Number(w.rate ?? w.daily_rate ?? DEFAULT_RATE) || 0),
      };
    });
}

function getWorker(id) {
  return swippers.find(w => w.id === id);
}

function getRecord(id, date) {
  return attendance[key(id, date)] || { status: 'absent', pay: 0 };
}

/* ------------------------------------------------------------
   Toast + confirm
   ------------------------------------------------------------ */
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}

function confirmAction(title, body, okLabel = 'Confirm') {
  return new Promise(resolve => {
    const modal = document.getElementById('confirmModal');
    const ok = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmBody').textContent = body;
    ok.textContent = okLabel;
    modal.hidden = false;
    ok.focus();

    const close = result => {
      modal.hidden = true;
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onBackdrop = e => { if (e.target === modal) close(false); };
    const onKey = e => { if (e.key === 'Escape') close(false); };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

/* ------------------------------------------------------------
   Avatars
   ------------------------------------------------------------ */
const AVATAR_HUES = [248, 200, 160, 24, 330, 280, 96, 8];

function avatar(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length];
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return `<span class="avatar" style="--av:hsl(${hue} 62% 48%)" aria-hidden="true">${escapeHtml(initials)}</span>`;
}

/* ------------------------------------------------------------
   Workers
   ------------------------------------------------------------ */
function addSwipper() {
  const nameInput = document.getElementById('swipperName');
  const rateInput = document.getElementById('swipperRate');
  const name = nameInput.value.trim();
  const rate = Math.max(0, Number(rateInput.value) || 0);

  if (!name) { toast('Enter a name first'); nameInput.focus(); return; }
  if (swippers.some(w => w.name.toLowerCase() === name.toLowerCase())) {
    toast(`${name} is already on the list`); nameInput.select(); return;
  }

  swippers.push({ id: uid(), name, rate });
  saveData();
  nameInput.value = '';
  rateInput.value = rate || DEFAULT_RATE;
  nameInput.focus();
  renderAll();
  toast(`${name} added`);
}

async function deleteSwipper(id) {
  const worker = getWorker(id);
  if (!worker) return;
  const ok = await confirmAction(
    `Remove ${worker.name}?`,
    'Their attendance history will be deleted too. This cannot be undone.',
    'Remove',
  );
  if (!ok) return;

  swippers = swippers.filter(w => w.id !== id);
  // Attendance is keyed by worker id, so only this worker's rows go.
  for (const k of Object.keys(attendance)) {
    if (k.startsWith(id + '|')) delete attendance[k];
  }
  saveData();
  renderAll();
  toast(`${worker.name} removed`);
}

function setRate(id, value) {
  const worker = getWorker(id);
  if (!worker) return;
  worker.rate = Math.max(0, Number(value) || 0);
  saveData();
  renderToday();
  toast(`${worker.name}: ${money(worker.rate)}/day`);
}

function renderWorkerList() {
  const list = document.getElementById('swipperList');
  document.getElementById('workerCount').textContent = swippers.length;

  if (swippers.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <span class="empty-icon" aria-hidden="true">👥</span>
        <strong>No swippers yet</strong>
        <span class="small">Add your first one using the form above.</span>
      </div>`;
    return;
  }

  list.innerHTML = swippers.map(w => `
    <div class="worker-row">
      <div class="att-person">
        ${avatar(w.name)}
        <div class="att-meta">
          <div class="att-name">${escapeHtml(w.name)}</div>
          <div class="att-sub">${countPresent(w.id)} days marked present</div>
        </div>
      </div>
      <label class="worker-rate">
        ₹
        <input type="number" min="0" step="1" inputmode="numeric" value="${w.rate}"
               data-rate-for="${w.id}" aria-label="Daily rate for ${escapeHtml(w.name)}">
        /day
      </label>
      <button class="worker-del" type="button" data-delete="${w.id}"
              aria-label="Remove ${escapeHtml(w.name)}">✕</button>
    </div>`).join('');
}

function countPresent(id) {
  let n = 0;
  for (const [k, rec] of Object.entries(attendance)) {
    if (k.startsWith(id + '|') && rec.status === 'present') n++;
  }
  return n;
}

/* ------------------------------------------------------------
   Today view
   ------------------------------------------------------------ */
const STATUS_LABEL = { present: '✓ Present', absent: '✗ Absent', holiday: '🏖 Holiday' };

function renderToday() {
  updateDateDisplay();
  renderTodayStats();

  const list = document.getElementById('attendanceList');
  if (swippers.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <span class="empty-icon" aria-hidden="true">📋</span>
        <strong>No swippers to mark</strong>
        <span class="small">Add people on the <b>Workers</b> tab first.</span>
      </div>`;
    return;
  }

  list.innerHTML = swippers.map(w => {
    const rec = getRecord(w.id, currentDate);
    return `
      <div class="att-row" data-status="${rec.status}">
        <div class="att-person">
          ${avatar(w.name)}
          <div class="att-meta">
            <div class="att-name">${escapeHtml(w.name)}</div>
            <div class="att-sub">
              ${money(w.rate)}/day ·
              ${rec.pay > 0
                ? `<span class="pay-today">earned ${money(rec.pay)}</span>`
                : 'no pay today'}
            </div>
          </div>
        </div>
        <div class="seg" role="group" aria-label="Status for ${escapeHtml(w.name)}">
          ${STATUSES.map(s => `
            <button type="button" data-status="${s}" data-mark="${w.id}"
                    aria-pressed="${rec.status === s}">${STATUS_LABEL[s]}</button>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function renderTodayStats() {
  const counts = { present: 0, absent: 0, holiday: 0 };
  let total = 0;
  for (const w of swippers) {
    const rec = getRecord(w.id, currentDate);
    counts[rec.status] = (counts[rec.status] || 0) + 1;
    total += rec.pay;
  }
  document.getElementById('todayStats').innerHTML = `
    ${statTile('Present', counts.present, 'var(--ok)')}
    ${statTile('Absent', counts.absent, 'var(--bad)')}
    ${statTile('Holiday', counts.holiday, 'var(--warn)')}
    ${statTile("Today's pay", money(total), 'var(--accent)')}`;
}

function statTile(label, value, tone) {
  return `<div class="stat" style="--tone:${tone}">
      <h4>${label}</h4>
      <div class="stat-value">${value}</div>
    </div>`;
}

function markAttendance(id, status) {
  const worker = getWorker(id);
  if (!worker || !STATUSES.includes(status)) return;
  attendance[key(id, currentDate)] = {
    status,
    pay: status === 'present' ? worker.rate : 0,
  };
  saveData();
  renderToday();
}

function markAll(status) {
  if (swippers.length === 0) { toast('Add swippers first'); return; }
  for (const w of swippers) {
    attendance[key(w.id, currentDate)] = { status, pay: status === 'present' ? w.rate : 0 };
  }
  saveData();
  renderToday();
  toast(`Everyone marked ${status}`);
}

function updateDateDisplay() {
  // Long form has room on a desktop; a phone gets the compact one.
  const wide = window.innerWidth >= 560;
  const pretty = wide ? formatLong(currentDate) : formatMedium(currentDate);
  document.getElementById('selectedDate').textContent =
    currentDate === todayISO() ? `Today · ${pretty}` : pretty;
  document.getElementById('attendanceDate').value = currentDate;
  // Don't let anyone mark attendance for the future.
  document.getElementById('nextDay').disabled = currentDate >= todayISO();
}

function goToDate(iso) {
  if (!iso || iso > todayISO()) return;
  currentDate = iso;
  renderToday();
}

/* ------------------------------------------------------------
   Reports
   ------------------------------------------------------------ */
function updateSwipperSelect() {
  const select = document.getElementById('swipperSelect');
  const previous = select.value;
  select.innerHTML =
    '<option value="__all">All swippers (totals)</option>' +
    swippers.map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');
  select.value = swippers.some(w => w.id === previous) || previous === '__all' ? previous : '__all';
}

function monthDays(month) {
  const [year, mon] = month.split('-').map(Number);
  const count = new Date(year, mon, 0).getDate();
  return Array.from({ length: count }, (_, i) =>
    `${month}-${String(i + 1).padStart(2, '0')}`);
}

function tally(id, dates) {
  const out = { present: 0, absent: 0, holiday: 0, total: 0, rows: [] };
  for (const date of dates) {
    const rec = getRecord(id, date);
    out[rec.status] = (out[rec.status] || 0) + 1;
    out.total += rec.pay;
    out.rows.push({ date, ...rec });
  }
  return out;
}

function loadMonthlySummary() {
  const month = document.getElementById('summaryMonth').value;
  const selection = document.getElementById('swipperSelect').value;
  const host = document.getElementById('summaryContent');

  if (!month) { host.innerHTML = ''; return; }

  if (swippers.length === 0) {
    host.innerHTML = `<div class="card"><div class="empty">
        <span class="empty-icon" aria-hidden="true">📊</span>
        <strong>Nothing to report yet</strong>
        <span class="small">Add swippers and mark some attendance first.</span>
      </div></div>`;
    return;
  }

  const dates = monthDays(month);
  const monthLabel = fromISO(dates[0]).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  host.innerHTML = selection === '__all'
    ? renderAllSummary(dates, monthLabel)
    : renderOneSummary(selection, dates, monthLabel);
}

function renderAllSummary(dates, monthLabel) {
  const rows = swippers.map(w => ({ worker: w, t: tally(w.id, dates) }));
  const grandTotal = rows.reduce((sum, r) => sum + r.t.total, 0);
  const grandPresent = rows.reduce((sum, r) => sum + r.t.present, 0);

  return `
    <div class="stat-row">
      ${statTile('Swippers', swippers.length, 'var(--accent)')}
      ${statTile('Total present days', grandPresent, 'var(--ok)')}
      ${statTile('Payroll for month', money(grandTotal), 'var(--accent)')}
      ${statTile('Avg per swipper', money(Math.round(grandTotal / swippers.length)), 'var(--warn)')}
    </div>
    <div class="card">
      <div class="card-head"><h2>${monthLabel} — all swippers</h2></div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th>Swipper</th><th>Present</th><th>Absent</th><th>Holiday</th><th>Total pay</th>
          </tr></thead>
          <tbody>
            ${rows.map(({ worker, t }) => `
              <tr>
                <td>${escapeHtml(worker.name)}</td>
                <td class="num">${t.present}</td>
                <td class="num">${t.absent}</td>
                <td class="num">${t.holiday}</td>
                <td class="num">${money(t.total)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot><tr>
            <th>Total</th><th class="num">${grandPresent}</th><th></th><th></th>
            <th class="num">${money(grandTotal)}</th>
          </tr></tfoot>
        </table>
      </div>
    </div>`;
}

function renderOneSummary(id, dates, monthLabel) {
  const worker = getWorker(id);
  if (!worker) return '';
  const t = tally(id, dates);

  return `
    <div class="stat-row">
      ${statTile('Days present', t.present, 'var(--ok)')}
      ${statTile('Days absent', t.absent, 'var(--bad)')}
      ${statTile('Holidays', t.holiday, 'var(--warn)')}
      ${statTile('Total pay', money(t.total), 'var(--accent)')}
    </div>
    <div class="card">
      <div class="card-head">
        <h2>${escapeHtml(worker.name)} — ${monthLabel}</h2>
        <span class="count-pill">${money(worker.rate)}/day</span>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Date</th><th>Status</th><th>Pay</th></tr></thead>
          <tbody>
            ${t.rows.map(r => {
              const dow = fromISO(r.date).getDay();
              return `<tr class="${dow === 0 ? 'is-weekend' : ''}">
                <td>${formatShort(r.date)}</td>
                <td><span class="status-badge ${r.status}">${STATUS_LABEL[r.status]}</span></td>
                <td class="num">${money(r.pay)}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr>
            <th>Total</th><th></th><th class="num">${money(t.total)}</th>
          </tr></tfoot>
        </table>
      </div>
    </div>`;
}

/* ------------------------------------------------------------
   Export / import
   ------------------------------------------------------------ */
function download(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  if (swippers.length === 0) { toast('Nothing to export yet'); return; }
  download(
    `swipperpay-backup-${todayISO()}.json`,
    JSON.stringify({ v: 2, exportedAt: new Date().toISOString(), swippers, attendance }, null, 2),
    'application/json',
  );
  toast('Backup downloaded');
}

function exportCsv() {
  const keys = Object.keys(attendance).sort();
  if (keys.length === 0) { toast('No attendance marked yet'); return; }

  const cell = v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [['Date', 'Swipper', 'Status', 'Daily rate', 'Pay'].join(',')];
  for (const k of keys) {
    const [id, date] = k.split('|');
    const worker = getWorker(id);
    if (!worker) continue; // orphaned row from a deleted worker
    const rec = attendance[k];
    lines.push([date, worker.name, rec.status, worker.rate, rec.pay].map(cell).join(','));
  }
  // Leading BOM so Excel reads it as UTF-8 (₹ and Indian names render correctly)
  download(`swipperpay-${todayISO()}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('CSV downloaded');
}

async function importJson(file) {
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data.swippers) ? data.swippers : null;
    if (!incoming) { toast("That file doesn't look like a SwipperPay backup"); return; }

    const ok = await confirmAction(
      'Restore this backup?',
      `It contains ${incoming.length} swipper(s). Your current data on this device will be replaced.`,
      'Restore',
    );
    if (!ok) return;

    swippers = incoming;
    attendance = data.attendance && typeof data.attendance === 'object' ? data.attendance : {};
    normalise();
    saveData();
    renderAll();
    toast('Backup restored');
  } catch (err) {
    console.error(err);
    toast('Could not read that file');
  }
}

async function clearAllData() {
  const ok = await confirmAction(
    'Delete everything?',
    'All swippers and their attendance history will be permanently erased from this device.',
    'Delete all',
  );
  if (!ok) return;
  swippers = [];
  attendance = {};
  saveData();
  localStorage.removeItem('swippers');
  localStorage.removeItem('attendance');
  renderAll();
  toast('All data cleared');
}

/* ------------------------------------------------------------
   Theme
   ------------------------------------------------------------ */
function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
}

/* ------------------------------------------------------------
   Tabs
   ------------------------------------------------------------ */
function showView(name) {
  for (const tab of document.querySelectorAll('.tab')) {
    const on = tab.dataset.view === name;
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', String(on));
  }
  for (const view of document.querySelectorAll('.view')) {
    const on = view.id === `view-${name}`;
    view.classList.toggle('is-active', on);
    view.hidden = !on;
  }
  if (name === 'reports') loadMonthlySummary();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------------------
   Render everything
   ------------------------------------------------------------ */
function renderAll() {
  renderWorkerList();
  updateSwipperSelect();
  renderToday();
  if (!document.getElementById('view-reports').hidden) loadMonthlySummary();
}

/* ------------------------------------------------------------
   Wire up
   ------------------------------------------------------------ */
function init() {
  try { applyTheme(localStorage.getItem(THEME_KEY)); } catch { /* private mode */ }

  loadData();

  const dateInput = document.getElementById('attendanceDate');
  dateInput.max = todayISO();
  dateInput.value = currentDate;
  document.getElementById('summaryMonth').value = currentDate.slice(0, 7);
  document.getElementById('swipperRate').value = DEFAULT_RATE;

  renderAll();

  /* --- tabs (manifest shortcuts arrive as ?view=reports) --- */
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  }
  const requested = new URLSearchParams(location.search).get('view');
  if (['today', 'workers', 'reports'].includes(requested)) showView(requested);

  /* --- theme + install --- */
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  /* --- date bar --- */
  dateInput.addEventListener('change', e => goToDate(e.target.value));
  document.getElementById('prevDay').addEventListener('click', () => goToDate(shiftDate(currentDate, -1)));
  document.getElementById('nextDay').addEventListener('click', () => goToDate(shiftDate(currentDate, 1)));

  /* --- bulk --- */
  document.getElementById('markAllPresent').addEventListener('click', () => markAll('present'));
  document.getElementById('markAllHoliday').addEventListener('click', () => markAll('holiday'));

  /* --- attendance rows (delegated) --- */
  document.getElementById('attendanceList').addEventListener('click', e => {
    const btn = e.target.closest('[data-mark]');
    if (btn) markAttendance(btn.dataset.mark, btn.dataset.status);
  });

  /* --- workers --- */
  document.getElementById('addSwipperBtn').addEventListener('click', addSwipper);
  for (const id of ['swipperName', 'swipperRate']) {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') addSwipper();
    });
  }
  const workerList = document.getElementById('swipperList');
  workerList.addEventListener('click', e => {
    const del = e.target.closest('[data-delete]');
    if (del) deleteSwipper(del.dataset.delete);
  });
  workerList.addEventListener('change', e => {
    const rate = e.target.closest('[data-rate-for]');
    if (rate) setRate(rate.dataset.rateFor, rate.value);
  });

  /* --- data --- */
  document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.getElementById('clearDataBtn').addEventListener('click', clearAllData);
  document.getElementById('importFile').addEventListener('change', e => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = '';
  });

  /* --- reports --- */
  document.getElementById('summaryMonth').addEventListener('change', loadMonthlySummary);
  document.getElementById('swipperSelect').addEventListener('change', loadMonthlySummary);

  /* --- the date label switches between long and compact on resize --- */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateDateDisplay, 150);
  });

  /* --- keep "today" honest if the app is left open past midnight --- */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      dateInput.max = todayISO();
      updateDateDisplay();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

/* ------------------------------------------------------------
   PWA: service worker + install prompt
   ------------------------------------------------------------ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err =>
      console.warn('Service worker registration failed', err));
  });
}

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  const btn = document.getElementById('installBtn');
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    btn.hidden = true;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
  }, { once: true });
});

window.addEventListener('appinstalled', () => {
  document.getElementById('installBtn').hidden = true;
  toast('Installed — open it from your home screen');
});
