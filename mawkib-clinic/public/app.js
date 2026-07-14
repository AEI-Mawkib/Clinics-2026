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

/* v9: live clock — DD/MM/YYYY and 12-hour HH:MM with am/pm (no dots).
   am = daytime = bright clock; pm = nighttime = dark-but-visible clock. */
function startHeaderClock() {
  const el = document.getElementById('liveClock');
  if (!el) return;
  const z = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const d = new Date();
    const isDay = d.getHours() < 12;
    const suffix = isDay ? 'am' : 'pm';
    const h = d.getHours() % 12 || 12;
    el.classList.toggle('daytime', isDay);
    el.classList.toggle('nighttime', !isDay);
    el.innerHTML = `<div class="cdate">${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()}</div>`
      + `<div class="ctime">${isDay ? '☀️' : '🌙'} ${z(h)}:${z(d.getMinutes())} ${suffix}</div>`;
  };
  tick();
  setInterval(tick, 15 * 1000);
}
document.addEventListener('DOMContentLoaded', startHeaderClock);

/* v9/v11: leaving a station screen requires a PIN (kiosk deterrent).
   PINs live in config.json on the server tablet — pass 'intake_exit_pin' or 'station_exit_pin'. */
function guardNav(pinKey) {
  const a = document.querySelector('header a.home');
  if (!a) return;
  a.addEventListener('click', async (e) => {
    e.preventDefault();
    const v = prompt('Enter PIN to leave this screen');
    if (v === null) return;
    try {
      const cfg = await api('/api/config');
      if (v === cfg[pinKey]) location.href = a.getAttribute('href');
      else toast('Wrong PIN', 'err');
    } catch (err) { toast('Could not verify PIN', 'err'); }
  });
}

/* v10: mini "today at a glance" for the station pages */
async function renderStatsBar(elId) {
  try {
    const s = await api('/api/stats');
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = `
      <div class="stat"><div class="n">${s.total || 0}</div><div class="l">Intake</div></div>
      <div class="stat"><div class="n">${s.waiting || 0}</div><div class="l">Waiting</div></div>
      <div class="stat"><div class="n">${s.prescribed || 0}</div><div class="l">At pharmacy</div></div>
      <div class="stat"><div class="n">${s.dispensed || 0}</div><div class="l">Dispensed</div></div>`;
  } catch (e) {}
}

async function renderStageGraph(elId) {
  try {
    const d = await api('/api/stage-times');
    const el = document.getElementById(elId);
    if (!el) return;
    const s = d.series;
    const fmt = (x) => x == null ? '—' : (x < 1 ? '<1' : Math.round(x)) + ' min';
    const c1 = stageColor(d.avg.intake_to_doctor, false);
    const c2 = stageColor(d.avg.doctor_to_pharmacy, false);
    const ct = stageColor(d.avg.total, true);
    const legend = `
      <div class="chips" style="margin:0 0 6px">
        <span class="chip" style="background:none;border:2px solid ${c1};color:${c1}">Intake → Doctor: ${fmt(d.avg.intake_to_doctor)}</span>
        <span class="chip" style="background:none;border:2px dashed ${c2};color:${c2}">Doctor → Pharmacy: ${fmt(d.avg.doctor_to_pharmacy)}</span>
        <span class="chip" style="background:none;border:2px dotted ${ct};color:${ct}">Total: ${fmt(d.avg.total)}</span>
      </div>`;
    if (s.length < 2) {
      el.innerHTML = legend + '<div class="note">Line graph appears after a couple of patients complete the journey.</div>';
      return;
    }
    const W = 640, H = 120, PAD = 6;
    const maxY = Math.max(5, ...s.map(p => p.mt));
    const x = (i) => PAD + i * (W - 2 * PAD) / (s.length - 1);
    const y = (v) => H - PAD - (v / maxY) * (H - 2 * PAD);
    const line = (key) => s.map((p, i) => `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
    el.innerHTML = legend + `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;background:#fff;border:1px solid var(--line);border-radius:10px">
        <polyline points="${line('m1')}" fill="none" stroke="${c1}" stroke-width="3"/>
        <polyline points="${line('m2')}" fill="none" stroke="${c2}" stroke-width="3" stroke-dasharray="8 5"/>
        <polyline points="${line('mt')}" fill="none" stroke="${ct}" stroke-width="3" stroke-dasharray="2 5"/>
        <text x="${PAD + 2}" y="14" font-size="11" fill="#5c6370">last ${s.length} patients · top = ${Math.ceil(maxY)} min</text>
      </svg>`;
  } catch (e) {}
}

/* v11: originating-country prefix chip for medicine names */
const COUNTRY_CODE = { pakistan: 'P', india: 'IN', iran: 'IR', iraq: 'IQ',
  us: 'US', usa: 'US', 'united states': 'US', uk: 'UK', 'united kingdom': 'UK', canada: 'CA' };
const COUNTRY_COLOR = { P: '#1d4ed8', IN: '#7c3aed', IR: '#0e7490', IQ: '#9d174d',
  US: '#b45309', UK: '#334155', CA: '#b3261e' };
function countryChip(country) {
  if (!country) return '';
  const code = COUNTRY_CODE[String(country).trim().toLowerCase()]
    || String(country).trim().slice(0, 2).toUpperCase();
  const col = COUNTRY_COLOR[code] || '#334155';
  return `<span class="cchip" style="color:${col};border-color:${col}" title="${esc(country)}">${code}</span>`;
}
