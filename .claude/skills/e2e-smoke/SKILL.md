---
name: e2e-smoke
description: End-to-end smoke test of TestRegister in a phone-sized browser against the mock backend, using the Playwright MCP. Use after UI or flow changes, before claiming a frontend task is done.
---

# E2E smoke (mock backend)

Fast path: the scripted run `tests/e2e/smoke.cjs` covers the whole flow below, light and dark. Start the server (step 2), then run `node tests/e2e/smoke.cjs <screenshot-dir>`. It needs `playwright-core` and a Chromium: either `npm i --no-save playwright-core && npx playwright-core install chromium`, or set `PLAYWRIGHT_CORE`/`CHROMIUM_PATH` to existing copies. It must end with `errors: []`. Update the script whenever the DOM changes. Use the Playwright MCP steps below for exploratory checks.

1. Generate fixtures: `micromamba run -n testregister npm run fixtures` (writes synthetic CSVs to `tests/fixtures/`).
2. Serve: run `python3 -m http.server -d site 8000` in the background.
3. Playwright MCP: `browser_resize` to 390×844. Every URL gets `?api=mock` (or `&api=mock`).
4. Walk the flow and check each step (snapshot plus console messages; there must be no errors):
   1. `admin.html?api=mock`: upload `tests/fixtures/students.csv` and `tests/fixtures/supervisors.csv` with `browser_file_upload`. The validation report shows, then setup succeeds and the supervisor links are listed.
   2. Open a supervisor link (keep `api=mock`). The classroom name and the counter 0/N show, in Spanish.
   3. Manual entry of an ID from that classroom → success; the counter goes to 1/N.
   4. Manual entry of an ID from another classroom → the Spanish wrong-room warning shows. Confirm → registered, flagged.
   5. The same ID again → "ya registrado".
   6. An unknown 9-digit ID → registered as unknown, with a warning.
   7. "Mostrar QR": the QR renders. Read its URL (from the DOM or a data attribute), open `checkin.html` with it, enter an ID → success.
   8. Offline: `browser_evaluate` sets `window.__forceOffline = true`, register an ID → the pending badge shows 1. Clear the flag → the badge goes to 0.
   9. `admin.html?api=mock`: the dashboard counts match. Download the CSV and check the statuses ok / wrong_room / unknown / absent.
5. Stop the server. Report pass or fail for each step, with screenshots of any failure.

The camera can't be tested headless. The scan path shares the same code as manual entry after ID extraction (`extractId` in core.js, unit-tested).
