/* Shared helpers for all pages. No frameworks, no internet needed. */

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    method: opts.method || 'GET',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

function toast(msg, kind = 'ok') {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = 'toast show ' + kind;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Poll a function every few seconds, pause while a form/dialog is open. */
function poll(fn, ms = 4000) {
  fn().catch(() => {});
  return setInterval(() => { if (!window._pausePoll) fn().catch(() => {}); }, ms);
}

function patientRow(p, extra = '') {
  const meta = [p.age ? p.age + ' yrs' : null, p.gender || null].filter(Boolean).join(' · ');
  return `
    <div class="row" data-id="${p.id}">
      <div class="token">${p.token}</div>
      <div class="who">
        <div class="name">${esc(p.name)}</div>
        <div class="meta">${esc(meta)}${meta && p.complaint ? ' · ' : ''}<span class="complaint">${esc(p.complaint || '')}</span></div>
        ${extra}
      </div>
      <span class="badge ${p.status}">${p.status.toUpperCase()}</span>
    </div>`;
}

/* v2: show the active site name in an element, refreshed with each poll cycle. */
async function showSite(elId) {
  try {
    const s = await api('/api/settings');
    const el = document.getElementById(elId);
    if (el) el.textContent = s.active_site ? '📍 ' + s.active_site : '';
  } catch (e) {}
}

/* v3: stock color class — >=50% green, 30-50% yellow, <30% red */
function stockClass(stock, full) {
  const pct = full > 0 ? (100 * stock / full) : 0;
  return pct >= 50 ? 'stk-green' : (pct >= 30 ? 'stk-yellow' : 'stk-red');
}

/* v5/v7: shift clock — colors the staff card, shows elapsed time, and at 12 hours
   locks the whole page (with a 1-minute blink) until a DIFFERENT person is selected.
   <8h normal, 8-12h yellow, >=12h red + page locked. */
window._shiftExpired = {};
window._blinkShown = {};
async function updateShiftBadge(role, cardSel, badgeId) {
  try {
    const rec = await api('/api/shift?role=' + role);
    const card = document.querySelector(cardSel);
    const badge = document.getElementById(badgeId);
    card.classList.remove('shift-warn', 'shift-over');
    let expired = false;
    if (rec && rec.started_at) {
      const mins = Math.floor((Date.now() - rec.started_at) / 60000);
      const h = Math.floor(mins / 60), m = mins % 60;
      if (badge) badge.textContent = `⏱ ${esc(rec.name)} on shift: ${h}h ${String(m).padStart(2,'0')}m`;
      if (h >= 12) { card.classList.add('shift-over'); expired = true; }
      else if (h >= 8) card.classList.add('shift-warn');
      // blink the page for 1 minute, once per expired shift
      const key = role + ':' + rec.started_at;
      if (expired && !window._blinkShown[key]) {
        window._blinkShown[key] = true;
        document.body.classList.add('blink');
        setTimeout(() => document.body.classList.remove('blink'), 60 * 1000);
      }
    } else if (badge) badge.textContent = '';
    window._shiftExpired[role] = expired;
    if (typeof window._gate === 'function') window._gate();
  } catch (e) {}
}

/* v7: live clock — DD/MM/YYYY and 12-hour HH:MM:SS with a.m./p.m. */
function startHeaderClock() {
  const el = document.getElementById('liveClock');
  if (!el) return;
  const z = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const d = new Date();
    let h = d.getHours();
    const suffix = h < 12 ? 'a.m.' : 'p.m.';
    h = h % 12 || 12;
    el.innerHTML = `<div class="cdate">${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()}</div>`
      + `<div class="ctime">${z(h)}:${z(d.getMinutes())}:${z(d.getSeconds())} ${suffix}</div>`;
  };
  tick();
  setInterval(tick, 1000);
}
document.addEventListener('DOMContentLoaded', startHeaderClock);
