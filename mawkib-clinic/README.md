# Mawkib Clinic — Azadar e Imam Clinic (azadareimam.org)

**A fully offline, three-tablet clinic management system for the Arbaeen walk (Najaf → Karbala).**
Built for a mawkib medical camp where internet is scarce, power cuts are routine, and the
volunteers on the ground are not technical. Everything is free and open source, with **zero
runtime dependencies** — nothing to download in the field, nothing that can fail to install.

```
 ┌────────────┐      WiFi hotspot from the server tablet       ┌────────────┐
 │  Tablet 1  │  ──────────────────┐        ┌───────────────   │  Tablet 3  │
 │   INTAKE   │                    ▼        ▼                  │  PHARMACY  │
 └────────────┘             ┌──────────────────┐               └────────────┘
                            │     Tablet 2     │
                            │ DOCTOR + SERVER  │  ← Node.js in Termux + SQLite
                            └──────────────────┘
```

No router needed: the server tablet's own hotspot **is** the network, so a power outage
changes nothing — the whole clinic runs on tablet batteries.

## The workflow

1. **Patient Intake Form** — the coordinator registers the pilgrim: name, age, gender
   (M/F), nationality, language spoken, complaints (tap buttons), allergies. The patient
   gets a big **token number**.
2. **Doctor's Review & Prescription** — the doctor sees the live queue, taps a patient,
   records vitals (BP, temperature, height, weight), writes notes, and prescribes from the
   medicine checklist: **quantity per dose × frequency (once/twice/thrice a day, hourly) ×
   days (1–10)**, with a live prescription total.
3. **Pharmacy, Wound Care & Dispatch** — the pharmacist sees the exact totals to dispense,
   per-item checkboxes (with hard blocks on zero-stock items), records wound care
   (cleaning, dressing, blister care) by pharmacist or nursing assistant, and hands over
   the medicines. A **QR code + printable instruction sheet** in English, Urdu, Farsi and
   Arabic is generated for every patient — reopenable all day for returning patients.
4. **Admin** (PIN-protected) — live analytics, stock control, staff lists, and one-button
   Excel exports.

## Feature highlights

**Clinical flow**
- Live queues on every station, refreshing every few seconds over the hotspot
- Daily token numbers; full traceability: intake coordinator, doctor and pharmacist
  stamped on every patient record
- Vitals, doctor's notes, allergies (highlighted red), complaint history
- Wound care recording with performed-by attribution (pharmacist or nursing assistant)

**Medicine & stock control**
- Editable medicine list with per-medicine stock counts and **originating country**
  — a colored (PK)/(IN)/(IR)/(IQ)/(US)/(UK)/(CA) prefix shows on the doctor and
  pharmacist screens, since the same drug carries different names per country
- Stock color bars everywhere: **green ≥ 50%, yellow 30–50%, red < 30%**
- Shortage warnings ("only 4 in stock — prescribed 6") and a **server-enforced hard block**
  on dispensing zero-stock items (stock can never go negative, even with simultaneous tablets)
- Automatic deduction of exactly what was handed over; "NOT GIVEN" tracking as a
  stock-out signal

**Patient instructions**
- QR code per patient linking to a phone-friendly page (over the clinic hotspot)
- Fully translated into **English, اردو, فارسی, العربية** with correct RTL, defaulting to
  the language recorded at intake
- **Thermal-receipt print layout** (58/80mm rolls) — pairs with the free RawBT Android app
  for generic Bluetooth ESC/POS printers

**Operations & safety**
- Per-station shift clocks: yellow at 8 hours, red at 12 — at 12 the page blinks for a
  minute and locks until a *different* relief person is selected
- Station pages stay locked (red) until the person on shift is selected
- Screen-leave PINs on intake and on doctor/pharmacy, and a PIN-protected Admin page —
  all three PINs live in one simple **config.json** file (see Configuration below)
- Day/night clock on every header: bright ☀️ during am, dark-but-visible 🌙 during pm
- **Automatic daily backups**: a consistent database snapshot + Excel-compatible CSV,
  named `db-<site>-<date>.db` / `shift-<site>-<date>.csv`, written to `backups/` every
  24 hours and at every server start

**Analytics (Admin)**
- Today at a glance: total / waiting / at pharmacy / dispensed (also mirrored on every
  station page)
- Patients by nationality and by language spoken
- Male / Female / Children (<13) bar graph
- Intake→medicines throughput histogram (0–1, 1–3, 3–5, 5–8, 8–10, 10–15, 15–20,
  20–30, 30–60, 60+ minutes) with the day's average

**Exports (all named site + date + timestamp, Excel-ready with Urdu/Arabic-safe encoding)**
- **Shift report**: every patient with intake info, vitals, prescriptions, what was
  actually given, wound care, staff names, timestamps. Date picker lists only dates that
  actually contain data, plus an **All days** option.
- **Medicine report**: per medicine — country, units dispensed, patients served, times
  not given, units remaining, starting units, and an order recommendation
  (IN STOCK / LOW — REORDER / OUT — ORDER NOW)
- **Raw database backup** download for disaster recovery

## Technology — everything free, nothing to install in the field

| Piece | What | License / cost |
|---|---|---|
| Runtime | Node.js (built-ins only — no npm packages) | MIT, free |
| Database | SQLite via `node:sqlite`, WAL mode | Public domain, free |
| Host | Termux on Android | GPL, free (F-Droid) |
| Frontend | Vanilla HTML/CSS/JS, no frameworks | — |
| QR codes | qrcode-generator (bundled, offline) | MIT, free |
| Printing | Android print services / RawBT | free |
| Remote access | RustDesk | AGPL, free |
| Cloud sync | Manual upload of exports to OneDrive when internet appears | your account |

## Setup (one-time, before travel)

On the server tablet (give it to the doctor):

```sh
# 1. Install Termux from F-Droid (not Play Store): https://f-droid.org/en/packages/com.termux/
# 2. Inside Termux:
pkg update -y && pkg install -y nodejs git
git clone https://github.com/YOUR-ORG/mawkib-clinic.git
cd mawkib-clinic
chmod +x start.sh
./start.sh
```

There is **no `npm install`** — the app has zero dependencies on purpose.

## Configuration — one simple file

All PINs live in **`config.json`** in the project folder. Open it, change the values,
save, restart the server (`./start.sh`). That's the entire configuration system:

```json
{
  "admin_pin": "60175",         ← Admin page (exports, stock, staff lists)
  "intake_exit_pin": "786110",  ← asked when leaving the Patient Intake screen
  "station_exit_pin": "110786", ← asked when leaving the Doctor or Pharmacy screens
  "port": 8080,
  "timezone": ""                ← blank = auto-detect the tablet's timezone (e.g. Asia/Baghdad)
}
```

**Change the PINs before go-live** — the defaults above are public in this repository.
To edit on the tablet: `cd mawkib-clinic && nano config.json`. If the file is missing or
broken, the app still starts with the defaults, so a typo can never take the clinic down.
The admin PIN can also be overridden per-launch with `CLINIC_PIN=... ./start.sh`.

3. Turn on the tablet's **WiFi hotspot** (no SIM/internet needed). Connect the other two
   tablets to it and open the address Termux prints (usually `http://192.168.43.1:8080`)
   in Chrome. Add each station page to the home screen.
4. Keep the server alive: run `termux-wake-lock`, and set Termux's battery usage to
   Unrestricted. Attach a power bank to the server tablet.
5. Optional: `termux-setup-storage` once, then start with
   `BACKUP_DIR=~/storage/shared/MawkibBackups ./start.sh` to make daily backups visible
   in the Android Files app for easy OneDrive upload.
6. Optional: install RustDesk on the server tablet and note its ID/password — whenever the
   tablet touches internet, the US team can remotely assist.

## Daily use

- Each station selects the person on shift (the page unlocks and their shift clock starts).
- Intake registers → doctor prescribes → pharmacist dispenses, records wound care, and
  hands the patient their QR/printed instructions.
- End of shift: Admin → pick the date → **Download shift file** and **medicine report**;
  upload to OneDrive whenever internet appears. Daily backups are also written
  automatically to `backups/`.

## Field troubleshooting (for volunteers)

| Problem | Fix |
|---|---|
| Page says "can't connect" | Check the server tablet's hotspot is ON and this tablet is connected to it |
| Server tablet restarted | Open Termux: `cd mawkib-clinic` then `./start.sh` — no data is lost |
| Forgot the address | Termux prints it every time the server starts |
| Page is red / locked | Select the person on shift at the top; after 12 hours, select the relief person |
| Export looks empty | Use the date dropdown — pick the date that shows patients, or "All days" |

Every tap is written to disk instantly; the database survives restarts, crashes and dead
batteries.

## Privacy

Shift files contain patient names and medical details. Keep exports in a private OneDrive
folder, don't reuse hotspot passwords across years, and keep the admin PIN with the site
lead only.
