/*
 * Mawkib Clinic server — runs on ONE Android tablet inside Termux.
 * ZERO npm dependencies: uses only Node.js built-ins (http + node:sqlite).
 * The other two tablets connect over the tablet's WiFi hotspot in a browser.
 *
 * Start:  ./start.sh   (or: node --experimental-sqlite server.js)
 * Then open on any tablet on the same hotspot:  http://<server-ip>:8080
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const PORT = 8080;
const ADMIN_PIN = process.env.CLINIC_PIN || '1234'; // change via:  CLINIC_PIN=9876 ./start.sh
const DB_FILE = path.join(__dirname, 'clinic.db');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- database ----------
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;'); // safe concurrent reads while writing
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- helpers ----------
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ---------- queries ----------
function listPatients(date, status) {
  let sql = `SELECT p.*,
      (SELECT group_concat(m.name || CASE WHEN pi.dosage IS NOT NULL AND pi.dosage != '' THEN ' — ' || pi.dosage ELSE '' END, ' | ')
         FROM prescriptions pr
         JOIN prescription_items pi ON pi.prescription_id = pr.id
         JOIN medicines m ON m.id = pi.medicine_id
        WHERE pr.patient_id = p.id) AS meds,
      (SELECT pr.notes FROM prescriptions pr WHERE pr.patient_id = p.id ORDER BY pr.id DESC LIMIT 1) AS notes
    FROM patients p WHERE p.visit_date = ?`;
  const args = [date];
  if (status && status !== 'all') { sql += ' AND p.status = ?'; args.push(status); }
  sql += ' ORDER BY p.token ASC';
  return db.prepare(sql).all(...args);
}

function getPatient(id) {
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  if (!p) return null;
  const pr = db.prepare('SELECT * FROM prescriptions WHERE patient_id = ? ORDER BY id DESC LIMIT 1').get(id);
  let items = [];
  if (pr) {
    items = db.prepare(
      `SELECT pi.medicine_id, pi.dosage, m.name FROM prescription_items pi
       JOIN medicines m ON m.id = pi.medicine_id WHERE pi.prescription_id = ?`
    ).all(pr.id);
  }
  return { ...p, notes: pr ? pr.notes : '', items };
}

// ---------- router ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    // ---- API ----
    if (p === '/api/medicines' && req.method === 'GET') {
      const all = url.searchParams.get('all') === '1';
      const rows = all
        ? db.prepare('SELECT * FROM medicines ORDER BY id').all()
        : db.prepare('SELECT * FROM medicines WHERE active = 1 ORDER BY id').all();
      return json(res, 200, rows);
    }

    if (p === '/api/medicines' && req.method === 'POST') {
      const b = await readBody(req);
      if ((req.headers['x-pin'] || '') !== ADMIN_PIN) return json(res, 403, { error: 'Wrong PIN' });
      if (b.id) {
        db.prepare('UPDATE medicines SET name = ?, active = ? WHERE id = ?')
          .run(String(b.name || '').trim(), b.active ? 1 : 0, b.id);
      } else if (b.name) {
        db.prepare('INSERT OR IGNORE INTO medicines (name) VALUES (?)').run(String(b.name).trim());
      }
      return json(res, 200, { ok: true });
    }

    if (p === '/api/patients' && req.method === 'GET') {
      const date = url.searchParams.get('date') || today();
      const status = url.searchParams.get('status') || 'all';
      return json(res, 200, listPatients(date, status));
    }

    if (p === '/api/patients' && req.method === 'POST') {
      const b = await readBody(req);
      const name = String(b.name || '').trim();
      if (!name) return json(res, 400, { error: 'Name is required' });
      const t = db.prepare('SELECT COALESCE(MAX(token),0)+1 AS t FROM patients WHERE visit_date = ?').get(today()).t;
      const info = db.prepare(
        `INSERT INTO patients (token, visit_date, name, age, gender, complaint, allergies)
         VALUES (?,?,?,?,?,?,?)`
      ).run(t, today(), name, b.age || null, b.gender || null,
            String(b.complaint || '').trim(), String(b.allergies || '').trim());
      return json(res, 200, { ok: true, token: t, id: Number(info.lastInsertRowid) });
    }

    const onePatient = p.match(/^\/api\/patients\/(\d+)$/);
    if (onePatient && req.method === 'GET') {
      const pat = getPatient(Number(onePatient[1]));
      return pat ? json(res, 200, pat) : json(res, 404, { error: 'Not found' });
    }

    const rx = p.match(/^\/api\/patients\/(\d+)\/prescription$/);
    if (rx && req.method === 'POST') {
      const id = Number(rx[1]);
      const b = await readBody(req);
      const pat = db.prepare('SELECT id FROM patients WHERE id = ?').get(id);
      if (!pat) return json(res, 404, { error: 'Not found' });

      db.exec('BEGIN');
      try {
        // replace any previous prescription (doctor re-opened the patient)
        const old = db.prepare('SELECT id FROM prescriptions WHERE patient_id = ?').all(id);
        for (const o of old) {
          db.prepare('DELETE FROM prescription_items WHERE prescription_id = ?').run(o.id);
          db.prepare('DELETE FROM prescriptions WHERE id = ?').run(o.id);
        }
        const prId = Number(db.prepare('INSERT INTO prescriptions (patient_id, notes) VALUES (?,?)')
          .run(id, String(b.notes || '').trim()).lastInsertRowid);
        for (const it of (b.items || [])) {
          if (!it.medicine_id) continue;
          db.prepare('INSERT INTO prescription_items (prescription_id, medicine_id, dosage) VALUES (?,?,?)')
            .run(prId, it.medicine_id, String(it.dosage || '').trim());
        }
        db.prepare(`UPDATE patients SET status='prescribed', vitals=?, prescribed_at=datetime('now','localtime') WHERE id=?`)
          .run(String(b.vitals || '').trim(), id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return json(res, 200, { ok: true });
    }

    const disp = p.match(/^\/api\/patients\/(\d+)\/dispense$/);
    if (disp && req.method === 'POST') {
      db.prepare(`UPDATE patients SET status='dispensed', dispensed_at=datetime('now','localtime') WHERE id=?`)
        .run(Number(disp[1]));
      return json(res, 200, { ok: true });
    }

    if (p === '/api/stats' && req.method === 'GET') {
      const date = url.searchParams.get('date') || today();
      const row = db.prepare(
        `SELECT COUNT(*) AS total,
                SUM(status='waiting')    AS waiting,
                SUM(status='prescribed') AS prescribed,
                SUM(status='dispensed')  AS dispensed
         FROM patients WHERE visit_date = ?`).get(date);
      return json(res, 200, { date, ...row });
    }

    // ---- shift export: CSV that opens directly in Excel ----
    if (p === '/api/export.csv' && req.method === 'GET') {
      const date = url.searchParams.get('date') || today();
      const rows = listPatients(date, 'all');
      const header = ['Token', 'Date', 'Registered at', 'Name', 'Age', 'Gender', 'Complaint',
        'Allergies', 'Vitals', 'Doctor notes', 'Medicines prescribed', 'Status',
        'Prescribed at', 'Dispensed at'];
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push([r.token, r.visit_date, r.created_at, r.name, r.age, r.gender, r.complaint,
          r.allergies, r.vitals, r.notes, r.meds, r.status, r.prescribed_at, r.dispensed_at]
          .map(csvCell).join(','));
      }
      const csv = '\uFEFF' + lines.join('\r\n'); // BOM so Excel opens Urdu/Arabic text correctly
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mawkib-clinic-${date}.csv"`,
      });
      return res.end(csv);
    }

    // ---- raw database backup (for the US team / safekeeping) ----
    if (p === '/api/backup.db' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="clinic-backup-${today()}.db"`,
      });
      return fs.createReadStream(DB_FILE).pipe(res);
    }

    if (p === '/api/pin-check' && req.method === 'POST') {
      const b = await readBody(req);
      return json(res, 200, { ok: String(b.pin || '') === ADMIN_PIN });
    }

    // ---- static files ----
    let file = p === '/' ? '/index.html' : p;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(PUBLIC_DIR, file);
    if (full.startsWith(PUBLIC_DIR) && fs.existsSync(full) && fs.statSync(full).isFile()) {
      const ext = path.extname(full);
      const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': (types[ext] || 'application/octet-stream') + '; charset=utf-8' });
      return fs.createReadStream(full).pipe(res);
    }

    json(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'Server error: ' + e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  }
  console.log('==========================================');
  console.log('  Mawkib Clinic is running.');
  console.log('  Open on the other tablets (same hotspot):');
  for (const ip of ips) console.log(`    http://${ip}:${PORT}`);
  console.log('  On THIS tablet:  http://localhost:' + PORT);
  console.log('==========================================');
});
