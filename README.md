# 🚗 SwipperPay — Attendance & Pay

A small offline-first web app to track car swipper (washer) attendance and work out
what each person is owed. No server, no accounts — everything is stored in the
browser on the device it's used on.

## Features

- **Daily attendance** — Present / Absent / Holiday per person, one tap each
- **Mark all present** for the whole crew in one go
- **Per-person daily rate**, editable any time (defaults to ₹24)
- **Live totals** for the day: present, absent, holiday, and pay owed
- **Monthly reports** — per person day-by-day, or a payroll total for everyone
- **Export** a JSON backup or a CSV sheet that opens in Excel, and **restore** a backup
- **Dark mode**, and a layout that works on a phone
- **Installable** on Android/iPhone, and **works with no internet** after the first load

## Running it locally

### Windows

Double-click `start-server.bat`, then open <http://localhost:8000>.

Or from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File start-server.ps1
```

> Open it through the server, not by double-clicking `public/index.html`.
> Service workers and the manifest don't load from `file://` URLs.

## Putting it online

See **[DEPLOY.md](DEPLOY.md)** for step-by-step GitHub Pages instructions
(including a route that needs no software installed), plus how to install it
on an Android phone.

## Project layout

```
public/                    the entire website — this is what gets deployed
  index.html               markup and app shell
  style.css                design tokens, light + dark themes, responsive layout
  script.js                all app logic and localStorage persistence
  sw.js                    service worker (offline caching)
  manifest.json            PWA metadata so Android can install it
  icon*.png / icon.svg     app icons, including a maskable one for Android
.github/workflows/         auto-deploys public/ to GitHub Pages on push
start-server.ps1 / .bat    local dev server
```

## Where the data lives

Under the `swipperpay.v2` key in the browser's `localStorage`:

```js
swippers   = [{ id, name, rate }]
attendance = { "<worker id>|YYYY-MM-DD": { status, pay } }
```

Attendance is keyed by a **stable worker id**, not by list position. Earlier
versions keyed it by array index, which meant deleting someone handed their
history to whoever came after them. Old data is migrated automatically the first
time the new version runs.

`pay` is recorded when attendance is marked, so changing someone's rate today
never rewrites what they already earned.
