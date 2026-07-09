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
