/*
 * Mawkib Clinic v2 — runs on ONE Android tablet inside Termux.
 * ZERO npm dependencies: Node.js built-ins only (http + node:sqlite).
 * v2 changes: nationality on intake, doctor/pharmacist shift
 * dropdowns, split vitals (BP/height/weight/temperature), active-site banner,
 * and editable lists (nationalities, doctors, pharmacists, sites) in Admin.
 *
 * Start:  ./start.sh
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
const LIST_TYPES = ['nationality', 'doctor', 'pharmacist', 'site'];

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
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

const getSetting = (k) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) || {}).value || '';
const setSetting = (k, v) => db.prepare(
  'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    // ---- medicines ----
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

    // ---- editable lists: /api/list/nationality|doctor|pharmacist|site ----
    const listMatch = p.match(/^\/api\/list\/(\w+)$/);
    if (listMatch && LIST_TYPES.includes(listMatch[1])) {
      const type = listMatch[1];
      if (req.method === 'GET') {
        const all = url.searchParams.get('all') === '1';
        const rows = all
          ? db.prepare('SELECT * FROM list_items WHERE type = ? ORDER BY id').all(type)
          : db.prepare('SELECT * FROM list_items WHERE type = ? AND active = 1 ORDER BY id').all(type);
        return json(res, 200, rows);
      }
      if (req.method === 'POST') {
        const b = await readBody(req);
        if ((req.headers['x-pin'] || '') !== ADMIN_PIN) return json(res, 403, { error: 'Wrong PIN' });
        if (b.delete && b.id) {
          db.prepare('DELETE FROM list_items WHERE id = ? AND type = ?').run(b.id, type);
        } else if (b.id) {
          db.prepare('UPDATE list_items SET name = ?, active = ? WHERE id = ? AND type = ?')
            .run(String(b.name || '').trim(), b.active ? 1 : 0, b.id, type);
        } else if (b.name) {
          db.prepare('INSERT OR IGNORE INTO list_items (type, name) VALUES (?,?)').run(type, String(b.name).trim());
        }
        return json(res, 200, { ok: true });
      }
    }

    // ---- settings (active site) ----
    if (p === '/api/settings' && req.method === 'GET') {
      return json(res, 200, { active_site: getSetting('active_site') });
    }
    if (p === '/api/settings' && req.method === 'POST') {
      const b = await readBody(req);
      if ((req.headers['x-pin'] || '') !== ADMIN_PIN) return json(res, 403, { error: 'Wrong PIN' });
      if ('active_site' in b) setSetting('active_site', String(b.active_site || '').trim());
      return json(res, 200, { ok: true });
    }

    // ---- patients ----
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
        `INSERT INTO patients (token, visit_date, name, age, gender, nationality, site, complaint, allergies)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).run(t, today(), name, b.age || null, b.gender || null,
            String(b.nationality || '').trim(), getSetting('active_site'),
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
        db.prepare(
          `UPDATE patients SET status='prescribed',
             bp=?, height=?, weight=?, temperature=?, doctor_name=?,
             prescribed_at=datetime('now','localtime') WHERE id=?`
        ).run(String(b.bp || '').trim(), String(b.height || '').trim(),
              String(b.weight || '').trim(), String(b.temperature || '').trim(),
              String(b.doctor_name || '').trim(), id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      return json(res, 200, { ok: true });
    }

    const disp = p.match(/^\/api\/patients\/(\d+)\/dispense$/);
    if (disp && req.method === 'POST') {
      const b = await readBody(req);
      db.prepare(
        `UPDATE patients SET status='dispensed', pharmacist_name=?,
           dispensed_at=datetime('now','localtime') WHERE id=?`
      ).run(String(b.pharmacist_name || '').trim(), Number(disp[1]));
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

    // ---- shift export ----
    if (p === '/api/export.csv' && req.method === 'GET') {
      const date = url.searchParams.get('date') || today();
      const rows = listPatients(date, 'all');
      const header = ['Token', 'Date', 'Site', 'Registered at', 'Name', 'Age', 'Gender', 'Nationality',
        'Complaint', 'Allergies', 'BP', 'Height', 'Weight', 'Temperature', 'Doctor', 'Doctor notes',
        'Medicines prescribed', 'Pharmacist', 'Status', 'Prescribed at', 'Dispensed at'];
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push([r.token, r.visit_date, r.site, r.created_at, r.name, r.age, r.gender, r.nationality,
          r.complaint, r.allergies, r.bp, r.height, r.weight, r.temperature, r.doctor_name, r.notes,
          r.meds, r.pharmacist_name, r.status, r.prescribed_at, r.dispensed_at]
          .map(csvCell).join(','));
      }
      const csv = '\uFEFF' + lines.join('\r\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mawkib-clinic-${date}.csv"`,
      });
      return res.end(csv);
    }

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
  console.log('  Mawkib Clinic v2 is running.');
  console.log('  Open on the other tablets (same hotspot):');
  for (const ip of ips) console.log(`    http://${ip}:${PORT}`);
  console.log('  On THIS tablet:  http://localhost:' + PORT);
  console.log('==========================================');
});
