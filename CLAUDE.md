# TestRegister

Phone-based exam attendance for EPN (Física). Supervisors register students by scanning the QR on the student card (a 9-digit ID) or by typing the ID by hand. Students can also self-check-in by scanning a rotating QR on the supervisor's phone. A student in the wrong classroom triggers a warning but is still registered. The admin downloads a CSV with each student's status: ok / wrong_room / absent / unknown.

## Architecture
- `site/`: a static frontend on GitHub Pages. Vanilla JS, **no build step**, deployed by `.github/workflows/pages.yml`.
  - `admin.html`: used on the work PC. Uploads the two CSVs and validates them, generates links/QRs, emails supervisors, shows a live dashboard and downloads the CSV.
  - `supervisor.html?t=<token>`: the phone scanner. Supports manual entry and shows the rotating self-check-in QR.
  - `checkin.html?c=<classroom>&k=<code>`: student self-check-in.
  - `js/core.js`: pure business logic (CSV parse/validate, registration decision, report). Written as plain functions with no `import`/`export`, so the same file runs in the browser, in Node tests and in Apps Script.
  - `js/ui.js`: shared UI helpers (toast, bottom sheet, countUp, progress ring, segmented control, inline SVG icons). Styles live in `css/app.css` (iOS-style tokens, light and dark).
  - `js/api.js`: the backend client. Append `?api=mock` to any page to use the localStorage mock instead of Apps Script.
- `apps-script/`: the backend, a Google Apps Script web app bound to a Google Sheet (tabs: students, supervisors, registrations). `Core.gs` is a **copy** of `site/js/core.js`. Run `npm run sync-core` after editing core.js; a test fails if the copies drift.
- `tests/`: `node:test`. `tests/fixtures/make-fixtures.mjs` generates **synthetic** CSVs.

## Invariants (do not break)
1. **No PII in git.** The repo is public. Real CSVs live in `data/` or `_example-data/`, both git-ignored. Tests and the mock use synthetic data only. Never paste real names, emails or IDs into code, docs, tests or commit messages.
2. **Language.** Everything a supervisor or student sees is in **Spanish**: the supervisor and check-in pages, emails, the printable link sheet, and error and warning text. Code, comments, docs, commits and the admin page are in English. Spanish strings live in `site/js/i18n-es.js` (and in the email templates in `apps-script/`).
3. **Apps Script calls**: `fetch(url, {method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({action, ...})})`. Use text/plain so the request triggers no CORS preflight, which Apps Script can't answer.
4. **Classroom strings match exactly** between `assigned_classroom` in the students CSV and `classroom` in the supervisors CSV, for example `E26/P5/Auditorio 2`. Several supervisors on the same classroom are co-supervisors of one shared room.
5. **The wrong room never blocks.** Warn the supervisor in Spanish, then register anyway with `status=wrong_room`. An ID missing from the roster is registered as `unknown`. A duplicate ID is not re-registered; the first registration wins.
6. **Offline-tolerant supervisor app.** The roster is cached in localStorage and writes go through the outbox queue with retry. Don't make a scan wait on the network.
7. **Third-party libs are vendored and pinned** in `site/vendor/`, with the version in the filename. Don't load from a CDN at runtime.
8. **Security comes from tokens**, not from a hidden URL:
   - the admin key lives in Script Properties
   - each supervisor has a random token
   - the self-check-in code is HMAC(secret, classroom, minute bucket), and the current and previous buckets are accepted

   The Apps Script URL in `site/config.js` is public by design.

## Input schemas
- `assigned_classrooms.csv`: `id,name,email,assignment,class,faculty,career,assigned_classroom`, UTF-8, with `id` = 9 digits.
- `assigned_supervisors.csv`: `name,email,classroom,expected_students`.
- Output: `id,name,email,class,career,assigned_classroom,registered_classroom,registered_at,registered_by,method,status`. `method` is scan | manual | self.

## Commands
- One-time env setup: `micromamba create -f environment.yml` (Node.js only; no Python in this project).
- Tests: `micromamba run -n testregister node --test`.
- Sync the backend copy of core: `micromamba run -n testregister npm run sync-core`.
- Synthetic fixtures: `micromamba run -n testregister npm run fixtures`.
- Serve locally: `python3 -m http.server -d site 8000`, then open `http://localhost:8000/admin.html?api=mock`.
- End-to-end check: the `/e2e-smoke` skill. Its fast path is the scripted `tests/e2e/smoke.cjs` (mock backend, light and dark, must end with `errors: []`); update the script whenever the DOM changes.

## Workflow
- **Model roles:** the main session (Opus/Fable) plans, orchestrates and reviews. Code is written by the `implementer` agent (`.claude/agents/implementer.md`, Sonnet). Review its diff before accepting it, and make small edits directly.
- **Before claiming done:** the tests pass and, for UI changes, `/e2e-smoke` passes.
- **Review a phase:** `/code-review`, plus `ponytail-review` for over-engineering.
- **Two machines.** The project lives on a personal laptop and a work PC, and the **work PC is where real input CSVs arrive**. Keep everything needed to continue in the repo (Claude memory is per-machine and doesn't sync). Run `git pull` before working and push when done.
  - Remote: `git@github-work:TecnicoLabFisica/TestRegister.git`, using the work SSH key with host alias `github-work`.
  - Commits use the TecnicoLabFisica identity.
- **On a new machine:**
  1. Clone through `github-work`.
  2. Run `micromamba create -f environment.yml`.
  3. Install the plugins listed in `.claude/settings.json` with `/plugin`.
  4. Follow `docs/SETUP.md` if the backend isn't deployed yet.

## Status
See `docs/STATUS.md` for what's built, what's pending, and decisions taken. Update it at the end of each work session.

Steps only the user can do (GitHub settings, Google deploys, real-data tests) go in `TODO-USER.txt` as `[ ]` checkboxes. Add new ones there when work creates them.
