# TestRegister

Phone-based exam attendance registration (EPN · Física). Supervisors scan student-card QRs, type IDs, or let students self-check-in via a rotating QR. Wrong-classroom students are warned but still registered. The admin downloads a CSV of attendance and statuses.

- Static frontend on GitHub Pages (`site/`), backend in Google Apps Script + Google Sheet (`apps-script/`).
- One-time setup: [docs/SETUP.md](docs/SETUP.md) · API contract: [docs/API.md](docs/API.md) · Status: [docs/STATUS.md](docs/STATUS.md)
- Dev: `micromamba create -f environment.yml`, then `micromamba run -n testregister node --test tests/`.

**Student data is never committed.** Put real CSVs in `data/` (git-ignored).
