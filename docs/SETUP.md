# One-time setup

## 1. GitHub
1. Create the empty **public** repo `TecnicoLabFisica/TestRegister`, then run `git push -u origin main`.
2. Settings → Pages → Source: **GitHub Actions**.

## 2. Google Sheet and Apps Script
1. Create a new Google Sheet (any name). The script creates the tabs `students`, `supervisors` and `registrations` itself.
2. Extensions → Apps Script. Create two files, `Code.gs` and `Core.gs`, and paste in the contents of `apps-script/Code.gs` and `apps-script/Core.gs`. In Project Settings, tick "Show appsscript.json" and paste `apps-script/appsscript.json` too.
   - Alternative with clasp: enable the Apps Script API at <https://script.google.com/home/usersettings>, then `npx @google/clasp login`, `clasp clone <scriptId>` inside `apps-script/` (the script ID is under Project Settings), and `clasp push` after each change.
3. In the editor, select the function `initSecrets` and click Run. Authorize when asked. Open the execution log (View → Logs) and copy the `ADMIN_KEY`. This is the key you type in the admin page. It lives in Script Properties; running `initSecrets` again keeps the existing values.
4. Deploy → New deployment → type **Web app**. Execute as: **Me**. Who has access: **Anyone**. Authorize, then copy the `/exec` URL.
5. Put the URL in `site/config.js`:
   ```js
   window.TR_CONFIG = { apiUrl: 'https://script.google.com/macros/s/.../exec' };
   ```
   Commit and push; the Pages workflow publishes the site.

## 3. After changing backend code
Paste or `clasp push` the new code, then Deploy → Manage deployments → edit (pencil) → Version: **New version** → Deploy. The `/exec` URL stays the same. Re-running "New deployment" creates a different URL, so avoid it.

## 4. Email quota
`emailLinks` uses MailApp: about 100 recipients/day on a consumer Gmail account and about 1500/day on Google Workspace. Check the quota before sending to many supervisors.

## 5. Notes
- The Sheet holds personal data: do not share it beyond the admins.
- `setup` (the admin page "Upload") replaces all students and supervisors, regenerates every token and clears all registrations. Do not run it after the exam starts.
