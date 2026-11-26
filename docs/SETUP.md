# One-time setup

_To be completed in phase 3 (backend) and phase 5 (Pages)._

1. GitHub: create the empty **public** repo `TecnicoLabFisica/TestRegister`, then from the laptop run `git push -u origin main`. In Settings → Pages, set Source to **GitHub Actions**.
2. Google: create a Sheet, then Extensions → Apps Script, and paste in or `clasp push` the files from `apps-script/`. Set the Script Properties `ADMIN_KEY` and `SELF_SECRET`. Deploy as a web app (Execute as: me, Access: Anyone) and copy the `/exec` URL.
3. Put that URL in `site/config.js`, then commit and push.
