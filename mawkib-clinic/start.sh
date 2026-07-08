#!/data/data/com.termux/files/usr/bin/sh
# Start the Mawkib Clinic server. Works on Termux (Android) and normal Linux.
# On Node 22 the built-in SQLite needs a flag; on Node 23+ it doesn't.
cd "$(dirname "$0")"
node server.js 2>/dev/null || node --experimental-sqlite server.js
