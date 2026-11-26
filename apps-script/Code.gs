// TestRegister backend (container-bound web app). Contract: docs/API.md. Needs Core.gs.

var STUDENT_COLS = ['id', 'name', 'email', 'assignment', 'class', 'faculty', 'career', 'assigned_classroom'];
var SUPERVISOR_COLS = ['name', 'email', 'classroom', 'expected_students', 'token'];
var REGISTRATION_COLS = ['id', 'classroom', 'registered_at', 'received_at', 'registered_by', 'method', 'status', 'client_id'];

function doGet() {
  return ContentService.createTextOutput('TestRegister OK');
}

function doPost(e) {
  var res;
  try {
    res = dispatch(JSON.parse(e.postData.contents));
  } catch (err) {
    console.error(err && err.stack || err);
    res = fail('server_error', 'Error del servidor. Intente de nuevo.');
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

// Run once from the editor.
function initSecrets() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('ADMIN_KEY')) p.setProperty('ADMIN_KEY', randomHex(20));
  if (!p.getProperty('SELF_SECRET')) p.setProperty('SELF_SECRET', randomHex(32));
  Logger.log('ADMIN_KEY: ' + p.getProperty('ADMIN_KEY'));
}

function randomHex(n) {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, n);
}

function fail(error, message) {
  return { ok: false, error: error, message: message };
}

function dispatch(req) {
  var a = req && req.action;
  var admin = { setup: setup, listSupervisors: listSupervisors, emailLinks: emailLinks, dashboard: dashboard, report: report };
  var sup = { session: session, register: register, classroomStatus: classroomStatus, selfCode: selfCode };
  var has = function (o) { return Object.prototype.hasOwnProperty.call(o, a); };
  if (has(admin)) {
    var key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
    if (!key || req.adminKey !== key) return fail('bad_admin_key', 'Clave de administrador incorrecta.');
    return a === 'setup' ? withLock(function () { return setup(req); }) : admin[a](req);
  }
  if (has(sup)) {
    var s = readTab('supervisors').filter(function (x) { return x.token && x.token === req.token; })[0];
    if (!s) return fail('bad_token', 'Enlace no válido. Pida un enlace nuevo al administrador.');
    return sup[a](req, s);
  }
  if (a === 'selfRegister') return selfRegister(req);
  return fail('bad_request', 'Solicitud no válida.');
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return fail('busy', 'Servidor ocupado, reintentando…');
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---- sheet helpers ----

function getTab(name, columns) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@'); // plain text: keep 9-digit ids as text
    sh.getRange(1, 1, 1, columns.length).setValues([columns]);
  }
  return sh;
}

var TAB_COLS = { students: STUDENT_COLS, supervisors: SUPERVISOR_COLS, registrations: REGISTRATION_COLS };

function readTab(name) {
  var cols = TAB_COLS[name], sh = getTab(name, cols), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, cols.length).getDisplayValues().map(function (r) {
    var o = {};
    cols.forEach(function (c, i) { o[c] = String(r[i]); });
    return o;
  });
}

// Replaces the tab's data rows.
function writeTab(name, rows) {
  var cols = TAB_COLS[name], sh = getTab(name, cols), last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, cols.length).clearContent();
  appendRows(sh, cols, rows);
}

function appendRows(sh, cols, rows) {
  if (!rows.length) return;
  var start = Math.max(sh.getLastRow(), 1) + 1, need = start + rows.length - 1 - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need); // getRange past the sheet's last row throws
  sh.getRange(start, 1, rows.length, cols.length).setNumberFormat('@').setValues(rows.map(function (r) {
    return cols.map(function (c) { return r[c] === undefined || r[c] === null ? '' : String(r[c]); });
  }));
}

function firstById(regs) {
  var m = {};
  regs.forEach(function (r) { if (!m[r.id]) m[r.id] = r; });
  return m;
}

function publicSupervisor(s) {
  return { name: s.name, email: s.email, classroom: s.classroom, expected_students: Number(s.expected_students) || 0, token: s.token };
}

// ---- admin ----

function newToken() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function setup(req) {
  var students = req.students, sups = req.supervisors;
  if (!Array.isArray(students) || !Array.isArray(sups) ||
      !students.every(function (s) { return s && /^\d{9}$/.test(String(s.id)); })) {
    return fail('bad_request', 'Datos de configuración no válidos.');
  }
  sups = sups.map(function (p) {
    return { name: p.name, email: p.email || '', classroom: p.classroom, expected_students: p.expected_students, token: newToken() };
  });
  writeTab('students', students);
  writeTab('supervisors', sups);
  writeTab('registrations', []);
  return { ok: true, supervisors: sups.map(publicSupervisor) };
}

function listSupervisors() {
  return { ok: true, supervisors: readTab('supervisors').map(publicSupervisor) };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function emailLinks(req) {
  if (typeof req.baseUrl !== 'string' || !/^https?:\/\//.test(req.baseUrl)) {
    return fail('bad_request', 'Falta la dirección base del sitio.');
  }
  var sent = 0, failed = [];
  readTab('supervisors').forEach(function (s) {
    if (!s.email) return;
    var link = req.baseUrl + 'supervisor.html?t=' + s.token;
    try { MailApp.sendEmail({
      to: s.email,
      subject: 'Registro de asistencia – Aula ' + s.classroom,
      htmlBody:
        '<p>Hola ' + esc(s.name) + ',</p>' +
        '<p>Usted es supervisor del aula <b>' + esc(s.classroom) + '</b>. Su enlace personal para registrar la asistencia es:</p>' +
        '<p><a href="' + esc(link) + '">' + esc(link) + '</a></p>' +
        '<p>No comparta este enlace.</p>' +
        '<ul>' +
        '<li>Ábralo en su teléfono y permita el acceso a la cámara.</li>' +
        '<li>Escanee el código QR de la credencial de cada estudiante.</li>' +
        '<li>Si un estudiante no tiene credencial, use «Ingresar ID».</li>' +
        '<li>Use «Mostrar QR» para que los estudiantes se registren ellos mismos.</li>' +
        '<li>Si un estudiante pertenece a otra aula, la aplicación se lo advertirá; aun así puede registrarlo.</li>' +
        '</ul><p>Gracias.</p>'
    }); } catch (err) { console.error(err); failed.push(s.email); return; } // e.g. daily quota hit
    sent++;
  });
  return { ok: true, sent: sent, failed: failed };
}

function dashboard() {
  var students = readTab('students'), sups = readTab('supervisors');
  var first = firstById(readTab('registrations'));
  var rooms = {}, order = [];
  function room(c) {
    if (!rooms[c]) { rooms[c] = { classroom: c, expected: 0, registered: 0, wrong_room: 0, unknown: 0, supervisors: [] }; order.push(c); }
    return rooms[c];
  }
  students.forEach(function (s) { room(s.assigned_classroom).expected++; }); // roster count, not supervisors' sum
  sups.forEach(function (p) {
    var r = room(p.classroom);
    r.supervisors.push(p.name);
  });
  var t = { students: students.length, registered: 0, wrong_room: 0, unknown: 0, absent: 0 };
  var known = {};
  students.forEach(function (s) { known[s.id] = true; });
  Object.keys(first).forEach(function (id) {
    var r = first[id], c = room(r.classroom);
    c.registered++; t.registered++;
    if (r.status === 'wrong_room') { c.wrong_room++; t.wrong_room++; }
    if (r.status === 'unknown') { c.unknown++; t.unknown++; }
  });
  t.absent = students.filter(function (s) { return !first[s.id]; }).length;
  return { ok: true, classrooms: order.map(function (c) { return rooms[c]; }), totals: t };
}

function report() {
  return { ok: true, rows: buildReport(readTab('students'), readTab('registrations')) };
}

// ---- supervisor ----

function session(req, s) {
  var students = readTab('students');
  return {
    ok: true,
    supervisor: { name: s.name, classroom: s.classroom, expected_students: Number(s.expected_students) || 0 },
    coSupervisors: readTab('supervisors')
      .filter(function (p) { return p.classroom === s.classroom && p.token !== s.token; })
      .map(function (p) { return p.name; }),
    directory: buildDirectory(students)
  };
}

function classroomStatus(req, s) {
  return { ok: true, registrations: readTab('registrations').filter(function (r) { return r.classroom === s.classroom; }) };
}

function register(req, s) {
  if (!Array.isArray(req.items)) return fail('bad_request', 'Solicitud no válida.');
  var dir = buildDirectory(readTab('students'));
  // Lock only the read-dedupe-append window on the registrations tab.
  return withLock(function () { return registerLocked(req, s, dir); });
}

function registerLocked(req, s, dir) {
  var sh = getTab('registrations', REGISTRATION_COLS);
  var regs = readTab('registrations');
  var byId = firstById(regs), byClient = {};
  regs.forEach(function (r) { if (r.client_id) byClient[r.client_id] = r; });
  var now = new Date().toISOString(), rows = [], results = [];
  req.items.forEach(function (it) {
    var id = String(it && it.id), cid = String(it && it.client_id || '');
    if (cid && byClient[cid]) {
      results.push({ client_id: cid, id: byClient[cid].id, status: byClient[cid].status, duplicate: false });
      return;
    }
    if (!/^\d{9}$/.test(id)) { results.push({ client_id: cid, id: id, status: 'invalid', duplicate: false }); return; }
    var d = decideRegistration(id, s.classroom, dir, byId);
    var res = { client_id: cid, id: id, status: d.status, duplicate: d.duplicate };
    if (d.duplicate) res.existing = d.existing;
    results.push(res);
    if (d.duplicate) return;
    var row = {
      id: id, classroom: s.classroom, received_at: now,
      registered_at: typeof it.client_ts === 'string' && !isNaN(Date.parse(it.client_ts)) ? it.client_ts : now,
      registered_by: s.name, method: it.method === 'manual' ? 'manual' : 'scan', status: d.status, client_id: cid
    };
    rows.push(row);
    byId[id] = row;
    if (cid) byClient[cid] = row;
  });
  appendRows(sh, REGISTRATION_COLS, rows);
  return { ok: true, results: results };
}

// ---- self check-in ----

function selfHmac(classroom, bucket) {
  var secret = PropertiesService.getScriptProperties().getProperty('SELF_SECRET');
  var sig = Utilities.computeHmacSha256Signature(classroom + '|' + bucket, secret);
  return sig.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 10);
}

function selfCode(req, s) {
  var now = Date.now();
  return { ok: true, code: selfHmac(s.classroom, selfCodeBucket(now)), classroom: s.classroom,
           expires_in: 60 - Math.floor(now / 1000) % 60 };
}

function selfRegister(req) {
  var id = String(req.id), classroom = String(req.classroom || ''), code = String(req.code || '');
  if (!/^\d{9}$/.test(id)) return fail('bad_request', 'El ID debe tener 9 dígitos.');
  var sups = readTab('supervisors');
  var b = selfCodeBucket(Date.now());
  var inRoom = sups.some(function (p) { return p.classroom === classroom; });
  if (!inRoom || (code !== selfHmac(classroom, b) && code !== selfHmac(classroom, b - 1))) {
    return fail('bad_code', 'El código ha expirado. Escanee de nuevo el QR del supervisor.');
  }
  var dir = buildDirectory(readTab('students'));
  return withLock(function () {
    var sh = getTab('registrations', REGISTRATION_COLS);
    var d = decideRegistration(id, classroom, dir, firstById(readTab('registrations')));
    if (!d.duplicate) {
      var now = new Date().toISOString();
      appendRows(sh, REGISTRATION_COLS, [{ id: id, classroom: classroom, registered_at: now, received_at: now,
        registered_by: 'autoregistro', method: 'self', status: d.status, client_id: Utilities.getUuid() }]);
    }
    return { ok: true, status: d.status, duplicate: d.duplicate,
             assigned_classroom: d.status === 'wrong_room' ? d.assigned_classroom : '' };
  });
}
