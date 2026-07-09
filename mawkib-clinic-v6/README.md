# Mawkib Clinic v6 (Azadar e Imam Clinic) — offline patient system for the Arbaeen walk

A tiny, fully offline clinic system for a mawkib medical camp on the Najaf–Karbala route.
Three Android tablets, **no internet needed at any point during the shift**, everything free
and open source, and one button at the end of the shift to export the Excel file for OneDrive.

```
 ┌────────────┐        WiFi hotspot (no internet)        ┌────────────┐
 │  Tablet 1  │  ───────────────┐        ┌─────────────  │  Tablet 3  │
 │   INTAKE   │                 ▼        ▼               │  PHARMACY  │
 └────────────┘          ┌──────────────────┐            └────────────┘
                         │     Tablet 2     │
                         │ DOCTOR + SERVER  │  ← runs the app + database
                         └──────────────────┘
```

Why not a shared Excel file? Three people writing the same .xlsx at the same time will
corrupt it or silently lose rows — Excel has no multi-writer support. Instead this app keeps
one SQLite database on the server tablet (SQLite handles simultaneous access safely) and the
**export button produces the Excel-compatible shift file** you wanted, ready to upload.

Everything used is free/open source: Node.js (MIT), SQLite (public domain), Termux (GPL),
RustDesk for remote access (AGPL). No accounts, no subscriptions, no API keys.

---

## One-time setup (do this in the US, before travel)

You only need to do the technical part once, on **one** tablet (the server tablet —
give it to the doctor since the doctor's room is central).

### 1. Install Termux (a free Linux terminal for Android)

Install **Termux from F-Droid** (not the Play Store copy — it's outdated):
https://f-droid.org/en/packages/com.termux/

### 2. Install Node.js and the app (inside Termux)

Open Termux and type these lines one at a time:

```sh
pkg update -y
pkg install -y nodejs git
git clone https://github.com/YOUR-ORG/mawkib-clinic-v6.git
cd mawkib-clinic-v6
chmod +x start.sh
./start.sh
```

You'll see: `Mawkib Clinic is running` with an address like `http://192.168.43.1:8080`.
That's it. There is **no `npm install`** — the app has zero dependencies on purpose,
so nothing can fail to download in the field.

### 3. Stop Android from killing the server

- In Termux, run `termux-wake-lock` once per shift (keeps it alive), or
- Android Settings → Apps → Termux → Battery → **Unrestricted**.

### 4. Test with the other two tablets

1. On the server tablet: turn on **WiFi hotspot** (Settings → Hotspot). No SIM/internet needed.
2. Connect tablets 1 and 3 to that hotspot.
3. Open Chrome on each and go to the address Termux printed (e.g. `http://192.168.43.1:8080`).
4. Tablet 1 opens **Intake**, server tablet opens **Doctor** (`http://localhost:8080`),
   tablet 3 opens **Pharmacy**. Add each page to the home screen
   (Chrome menu → *Add to Home screen*) so volunteers just tap one icon.

---

## Daily use (what the volunteers do — nothing technical)

- **Intake volunteer:** types name, taps age/gender/complaint buttons, presses
  *Register patient*. A big **token number** appears — tell it to the pilgrim.
- **Doctor:** sees the waiting list update by itself. Taps a patient, writes notes,
  **ticks medicines from the 15-item list, types dosage**, presses *Save & send to Pharmacy*.
- **Pharmacist:** the patient appears automatically with the ticked medicines and dosages.
  Hands them over, presses *Medicines handed over ✓*.

Token numbers reset every day. Lists refresh themselves every 4 seconds.

## End of each 12-hour shift

1. Open **Admin** on any tablet and enter the admin PIN (default `1234`).
2. Tap **Download shift file (Excel/CSV)** — a file like `mawkib-clinic-2026-08-14.csv`
   lands in the tablet's Downloads. It opens directly in Excel.
3. Whenever internet appears (SIM, another mawkib's WiFi, Karbala), open the **OneDrive app**
   and upload the file. Also tap **Download full database backup** once a day and upload
   that too — it's the complete raw database, your disaster-recovery copy.


Change the admin PIN by starting the server with: `CLINIC_PIN=9876 ./start.sh`
**Change it from the default before travel** — the PIN protects the export, backup and all lists.

## Remote access from the US

Install **RustDesk** (free, open source) on the server tablet: https://rustdesk.com
and on your PC in the US. Note the tablet's RustDesk ID + password before travel.
Whenever the tablet has internet, you can see and control its screen from the US —
restart the server, pull files, fix anything, without asking the volunteers to do it.

## If something goes wrong in the field (give this to volunteers)

| Problem | Fix |
|---|---|
| Page says "can't connect" | Check the hotspot is on and tablets are connected to it |
| Server tablet restarted | Open Termux, type `cd mawkib-clinic` then `./start.sh` |
| Termux was closed | Same as above — **no data is lost**, it's all saved in `clinic.db` |
| Forgot the address | It's printed in Termux every time the server starts |

Data survives restarts, crashes, and battery deaths — every tap is written to disk instantly.

## What's in this repo

```
server.js      – the whole backend (Node.js built-ins only, ~300 lines)
schema.sql     – database schema + the seeded 15-medicine list (edit names here or in Admin)
start.sh       – start script
public/        – the four pages: intake, doctor, pharmacy, admin
clinic.db      – created automatically on first run (git-ignored)
```

## Privacy note

The shift file contains patient names and medical details. Keep the exported files in a
private OneDrive folder, change the default PIN, and don't reuse the hotspot password
from previous years.

## What's new in v2

- **Nationality** buttons on Intake (Pakistan, India, Iran, Iraq, US, UK, Canada by default) —
  add/remove/rename on the Admin page.
- **Doctor on shift** dropdown on the Doctor page, **Pharmacist on shift** dropdown on the
  Pharmacy page — names managed in Admin, choice remembered per tablet, stamped on every record.
- Vitals split into **Blood pressure, Temperature, Height, Weight** fields.
- **Site being served**: pick the active site in Admin; it appears in the header of the
  Intake, Doctor and Pharmacy pages within a few seconds and is stamped on each patient record.
- The shift export now includes Site, Nationality, Doctor, Pharmacist and the four vitals columns.

## What's new in v3 — medicine stock tracking

- **Pharmacy:** each prescribed medicine now has its own checkbox and a "units given" box.
  Everything is ticked by default; the pharmacist unticks anything that could not be given
  (e.g. out of stock) and adjusts the unit count. Unticked items show as **NOT GIVEN** on the
  patient record and feed the stock-out report.
- **Live stock:** set the starting count for each medicine on the Admin page (e.g. Paracetamol
  500 mg = 1000). The count goes down automatically with every dispense, and the pharmacist
  sees "in stock: N" / "OUT OF STOCK" next to each item while dispensing.
- **Admin stock table:** dispensed today, times not given, units remaining, and a status badge
  per medicine — IN STOCK / LOW — REORDER / OUT — ORDER NOW.
- **Medicine report:** one button downloads an Excel-compatible CSV per day: units dispensed,
  patients served, times not given, units remaining, starting units, and an order recommendation —
  exactly what you need to decide what to restock overnight.

## v3 update pack (mawkib-clinic-v3)

- **Azadar e Imam Clinic logo** ships in the repo (`public/logo.png`) and shows on the top of
  every page, with azadareimam.org underneath — no download step needed.
- Intake page renamed to **Patient Intake Form**.
- **Stock color bars everywhere:** each medicine line is green at 50%+ of its counted stock,
  yellow at 30–50%, red under 30% — on the Doctor page, the Pharmacy page, and both the Admin
  stock table and the Admin medicine list. The 100% baseline is whatever count Admin last saved.
- **Doctor sees availability:** "available: N" under every medicine on the prescription list.
- **New prescribing controls:** the doctor picks a quantity per dose and a frequency
  (once a day / twice a day / thrice a day / hourly). The system multiplies them and shows the
  pharmacist the total units (e.g. 2 × thrice a day = total 6), pre-filled in the units-given box.
- **Smarter file names:** the shift export, the medicine report, and the database backup are all
  named with the site + date + timestamp, e.g. `shift-Pole-512-2026-08-14-183502.csv`, and the
  medicine report includes a Site column.
- **One-tap saving:** the Admin medicine list now has a single **Save all medicines** button.

### Later v3 additions

- **Pharmacist sees the prescription at a glance:** a summary bar on each patient —
  "3 medications · 34 units total to dispense" — above the itemized list.
- **Shift name gates:** the Doctor page is locked (grayed out) until the doctor on shift is
  selected in the highlighted card at the top; the Pharmacy page works the same way for the
  pharmacist. No selection = no charting or dispensing.
- **Wound care at the pharmacy station:** tap-to-record procedures — wound cleaned,
  bandage/dressing applied, blister drained (popped), blister padded — with a "performed by"
  name for the pharmacist or nursing assistant. Recorded on the patient and in the shift export
  (new "Wound care" and "Wound care by" columns).


## What's new in v5

- **Shortage warnings at the pharmacy:** if the shelf has fewer units than the doctor
  prescribed, that medicine line turns red and shows "only N in stock — prescribed M",
  with the units-given box pre-filled to what is actually available.
- **Zero-stock hard block:** if a prescribed medicine has 0 units left, its line is red and
  disabled — it cannot be ticked or dispensed. The server enforces this too, so stock can
  never go negative even if two tablets race.
- **Shift clocks:** selecting the doctor or pharmacist on shift starts a clock (kept on the
  server, shared across tablets). At 8 hours the name card turns yellow, at 12 hours it turns
  red, with a live "on shift: Xh Ym" readout — a visible nudge that it's time for relief.
  Picking a different name starts a fresh clock for the new person.
- **Official logo + web address:** the Azadar e Imam Clinic logo and azadareimam.org appear
  in the header of every page.

## What's new in v6

- **Wound care "Performed by" is now a dropdown** on the Pharmacy page, listing every
  pharmacist and every nursing assistant, each labeled with their role. It pre-selects the
  pharmacist on shift; switch it to the nursing assistant when they did the bandaging or
  drained the blister.
- **New Admin section — Nursing assistants:** add, rename, hide, or remove the nursing
  assistants who appear in that dropdown, exactly like the doctors and pharmacists lists.
- Older databases migrate automatically on first start — no data loss.
