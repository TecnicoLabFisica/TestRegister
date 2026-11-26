# Status

Update at the end of every work session (either machine).

## Decisions
- Backend: Google Apps Script + Sheet (work Google account). Self-check-in: rotating HMAC QR (60 s). Supervisor links: email + printable sheet. Public repo, PII git-ignored. Supervisor/student UI in Spanish.
- `assigned_supervisors.csv` schema defined by us: `name,email,classroom,expected_students` (no real example yet).

## Done (2026-11-25, laptop)
- Phase 1: scaffold (repo, CLAUDE.md, env, agent, e2e skill, API contract).
- Phase 2: `site/js/core.js` + node tests + synthetic fixtures.
- Phase 3: Apps Script backend (`apps-script/Code.gs`), tested against in-memory Sheets fakes only.
- Phase 4: frontend (admin / supervisor / checkin pages, mock backend, outbox). The E2E walkthrough passes in mock mode at 390×844.
- Phase 5: `.github/workflows/pages.yml` (tests, then deploy `site/`).
- Dashboard and supervisor counter use the room's roster count as the denominator (not the supervisors' summed expected_students).

- Phase 6: `/code-review` (medium) fixed 10 findings, including sheets with more than 1000 rows (the real roster has 1284).
- Repo pushed. Pages is live at https://tecnicolabfisica.github.io/TestRegister/ and CI is green.

## Next
- Work PC: deploy Apps Script per `docs/SETUP.md`, set `site/config.js`, then do a real-backend smoke test (own email as supervisor, scan own card).
- Untested so far: real camera scanning, the print layout, real Apps Script behaviour (setNumberFormat, display values, quotas, lock contention under a burst of self check-ins).
- Optional: ponytail-review (over-engineering pass).

## Gotchas
- `node --test tests/` fails on Node 22; use plain `node --test`.
- The Playwright MCP needs Chrome (`npx playwright install chrome`). Without it, drive playwright-core with the cached chromium.
