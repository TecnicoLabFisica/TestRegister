# Backend API contract

This is the single contract shared by `apps-script/Code.gs` (the real backend) and the mock in `site/js/api.js`. Change both together.

## Request and response format
Every call is `POST <APPS_SCRIPT_URL>` with `Content-Type: text/plain` and body `JSON.stringify({action, ...params})`.
- Success: `{ ok: true, ...data }`.
- Failure: `{ ok: false, error: "<code>", message: "<Spanish, user-displayable>" }`. Error codes:
  - `bad_admin_key`
  - `bad_token`
  - `bad_code` (the self-check-in code has expired or is invalid)
  - `bad_request`
  - `not_setup`
  - `busy` (lock timeout: the client should retry)
  - `server_error`

## Data
- Student: `{id, name, email, assignment, class, faculty, career, assigned_classroom}`, with `id` a 9-digit string.
- Supervisor: `{name, email, classroom, expected_students, token}`.
- Registration:

  | Field | Value |
  |---|---|
  | `id` | |
  | `classroom` | where the student was registered |
  | `registered_at` | ISO; the client timestamp |
  | `received_at` | ISO; server time |
  | `registered_by` | supervisor name, or `"autoregistro"` |
  | `method` | `scan` \| `manual` \| `self` |
  | `status` | `ok` \| `wrong_room` \| `unknown` |
  | `client_id` | |

## Admin actions (each needs `adminKey`)
| action | params | returns |
|---|---|---|
| `setup` | `students[]`, `supervisors[]` (without tokens) | `{supervisors[]}` with tokens. **Replaces** all data and clears registrations. |
| `listSupervisors` | | `{supervisors[]}` |
| `emailLinks` | `baseUrl` (the Pages site root, ending in `/`) | `{sent}`. Emails each supervisor their link `baseUrl + "supervisor.html?t=" + token`, in Spanish. |
| `dashboard` | | `{classrooms:[{classroom, expected, registered, wrong_room, unknown, supervisors:[names]}], totals:{students, registered, wrong_room, unknown, absent}}` |
| `report` | | `{rows}`: the output of `buildReport(students, registrations)` from core.js |

## Supervisor actions (each needs `token`)
| action | params | returns |
|---|---|---|
| `session` | | `{supervisor:{name, classroom, expected_students}, coSupervisors:[names], directory:{ "<id>": [name, assigned_classroom], ... }}`. The directory covers **all** students and is cached on the phone for offline checks. |
| `register` | `items:[{id, method, client_ts, client_id}]` | `{results:[{client_id, id, status, duplicate, existing?}]}`. `status` comes from `decideRegistration`. `duplicate: true` means the ID was already registered and nothing was written; `existing` is that earlier registration. The batch is idempotent by `client_id`. |
| `classroomStatus` | | `{registrations[]}`: everything registered in this supervisor's classroom, from any co-supervisor or self-check-in. |
| `selfCode` | | `{code, classroom, expires_in}`. The supervisor page shows a QR for `baseUrl + "checkin.html?c=" + encodeURIComponent(classroom) + "&k=" + code` and refreshes it before it expires. |

## Public action
| action | params | returns |
|---|---|---|
| `selfRegister` | `classroom`, `code`, `id` | `{status, duplicate, assigned_classroom}`, where `assigned_classroom` is filled only when `status=wrong_room` so the student can be warned. It never returns names. |

## Self-check-in code
- `bucket = floor(now_ms / 60000)`.
- `code = first 10 hex chars of HMAC_SHA256(SELF_SECRET, classroom + "|" + bucket)`.
- The server accepts `bucket` and `bucket-1`.
- `SELF_SECRET` and `ADMIN_KEY` live in Script Properties.
