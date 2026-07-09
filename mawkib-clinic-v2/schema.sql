-- Mawkib Clinic v2 — SQLite schema

CREATE TABLE IF NOT EXISTS patients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token       INTEGER NOT NULL,
  visit_date  TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  age         INTEGER,
  gender      TEXT    CHECK (gender IN ('M','F','Other')),
  nationality TEXT,
  site        TEXT,                            -- which mawkib site served this patient
  complaint   TEXT,
  allergies   TEXT,
  bp          TEXT,                            -- vitals, doctor fills
  height      TEXT,
  weight      TEXT,
  temperature TEXT,
  doctor_name     TEXT,                        -- who was on shift
  pharmacist_name TEXT,
  status      TEXT NOT NULL DEFAULT 'waiting'
              CHECK (status IN ('waiting','prescribed','dispensed')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  prescribed_at TEXT,
  dispensed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_patients_date_status ON patients (visit_date, status);

CREATE TABLE IF NOT EXISTS medicines (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL UNIQUE,
  active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id  INTEGER NOT NULL REFERENCES patients(id),
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id),
  medicine_id     INTEGER NOT NULL REFERENCES medicines(id),
  dosage          TEXT
);

-- Generic editable lists: nationalities, doctors, pharmacists, sites.
CREATE TABLE IF NOT EXISTS list_items (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  type    TEXT NOT NULL CHECK (type IN ('nationality','doctor','pharmacist','site')),
  name    TEXT NOT NULL,
  active  INTEGER NOT NULL DEFAULT 1,
  UNIQUE (type, name)
);

-- Simple key/value settings (e.g. which site is currently being served).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Seed the 15-medicine list. Edit on the Admin page.
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

-- Seed nationalities (add/remove on the Admin page).
INSERT OR IGNORE INTO list_items (type, name) VALUES
  ('nationality','Pakistan'),
  ('nationality','India'),
  ('nationality','Iran'),
  ('nationality','Iraq'),
  ('nationality','US'),
  ('nationality','UK'),
  ('nationality','Canada');

-- Seed one example site so the banner is never blank; rename/add in Admin.
INSERT OR IGNORE INTO list_items (type, name) VALUES ('site','Main mawkib');
INSERT OR IGNORE INTO settings (key, value) VALUES ('active_site','Main mawkib');
