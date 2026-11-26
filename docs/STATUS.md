# Status

Update at the end of every work session (either machine).

## Decisions
- Backend: Google Apps Script + Sheet (work Google account). Self-check-in: rotating HMAC QR (60 s). Supervisor links: email + printable sheet. Public repo, PII git-ignored. Supervisor/student UI in Spanish.
- `assigned_supervisors.csv` schema defined by us: `name,email,classroom,expected_students` (no real example yet).

## Done
- Phase 1: scaffold (repo, CLAUDE.md, env, agent, e2e skill, API contract).

## Next
- Phase 2: core.js + tests + fixtures → Phase 3: Apps Script → Phase 4: frontend → Phase 5: Pages CI → Phase 6: review.
