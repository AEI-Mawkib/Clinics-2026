-- Mawkib Clinic — SQLite schema
-- One database file (clinic.db) lives on the server tablet.
-- All three tablets read/write through the app; SQLite handles the locking safely.

CREATE TABLE IF NOT EXISTS patients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token       INTEGER NOT NULL,              -- daily queue number shown to the patient
  visit_date  TEXT    NOT NULL,              -- YYYY-MM-DD (server local date)
  name        TEXT    NOT NULL,
  age         INTEGER,
  gender      TEXT    CHECK (gender IN ('M','F','Other')),
  complaint   TEXT,                          -- chief complaint from intake
  allergies   TEXT,                          -- optional, from intake
  vitals      TEXT,                          -- optional free text, doctor fills (BP / temp / pulse)
  status      TEXT    NOT NULL DEFAULT 'waiting'
              CHECK (status IN ('waiting','prescribed','dispensed')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  prescribed_at TEXT,
  dispensed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_patients_date_status ON patients (visit_date, status);

CREATE TABLE IF NOT EXISTS medicines (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL UNIQUE,
  active  INTEGER NOT NULL DEFAULT 1          -- 1 = shown on doctor's checklist
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id  INTEGER NOT NULL REFERENCES patients(id),
  notes       TEXT,                           -- doctor's notes
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id),
  medicine_id     INTEGER NOT NULL REFERENCES medicines(id),
  dosage          TEXT                        -- e.g. "500 mg, 1 tab x 3 days"
);

-- Seed the 15-medicine list. EDIT THESE NAMES on the Admin page (or here before first run).
INSERT OR IGNORE INTO medicines (name) VALUES
  ('Paracetamol 500 mg'),
  ('Ibuprofen 400 mg'),
  ('ORS sachet'),
  ('Loperamide 2 mg'),
  ('Metronidazole 400 mg'),
  ('Omeprazole 20 mg'),
  ('Antacid suspension'),
  ('Cetirizine 10 mg'),
  ('Amoxicillin 500 mg'),
  ('Azithromycin 250 mg'),
  ('Diclofenac gel'),
  ('Antiseptic cream'),
  ('Bandage / dressing kit'),
  ('Eye drops (lubricant)'),
  ('Muscle relaxant');
