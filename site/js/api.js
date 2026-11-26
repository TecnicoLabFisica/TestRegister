// Backend client (real Apps Script or in-browser mock). Contract: docs/API.md.
// Resolves with the response object (ok true/false); rejects only on network failure.
var IS_MOCK = new URLSearchParams(location.search).get('api') === 'mock';

function siteBase() { return new URL('.', location.href).href; }
function withMock(url) {
  return IS_MOCK ? url + (url.indexOf('?') < 0 ? '?' : '&') + 'api=mock' : url;
}

function api(action, params) {
  if (window.__forceOffline === true) return Promise.reject(new Error('offline'));
  var body = Object.assign({ action: action }, params || {});
  if (IS_MOCK) return Promise.resolve().then(function () { return mockHandle(body); });
  var url = (window.TR_CONFIG || {}).apiUrl;
  if (!url) return Promise.resolve(mockErr('not_configured', 'La dirección del servidor no está configurada.'));
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
    .then(function (r) { return r.json(); });
}

// ---- mock backend (localStorage) ----
var MOCK_KEY = 'tr_mock_db';
function mockErr(error, message) { return { ok: false, error: error, message: message }; }
function mockLoad() {
  try { return JSON.parse(localStorage.getItem(MOCK_KEY)) || null; } catch (e) { return null; }
}
function mockSave(db) { localStorage.setItem(MOCK_KEY, JSON.stringify(db)); }
function mockRand(n) {
  var s = '';
  while (s.length < n) s += Math.random().toString(36).slice(2);
  return s.slice(0, n);
}
// Deterministic non-cryptographic hash (mock only), 10 hex chars.
function mockHash(str) {
  var h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (var i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + str.charCodeAt(i), 2246822519) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 10);
}
function mockCode(classroom, bucket) { return mockHash(classroom + '|' + bucket); }

function mockHandle(req) {
  var db = mockLoad();
  var A = req.action;
  var adminActions = ['setup', 'listSupervisors', 'emailLinks', 'dashboard', 'report'];
  var supActions = ['session', 'register', 'classroomStatus', 'selfCode'];

  if (adminActions.indexOf(A) >= 0) {
    if (typeof req.adminKey !== 'string' || !req.adminKey) return mockErr('bad_admin_key', 'Clave de administrador incorrecta.');
    if (A === 'setup') {
      if (!Array.isArray(req.students) || !Array.isArray(req.supervisors)) return mockErr('bad_request', 'Solicitud inválida.');
      var sups = req.supervisors.map(function (p) {
        return { name: p.name, email: p.email, classroom: p.classroom, expected_students: Number(p.expected_students), token: mockRand(24) };
      });
      mockSave({ students: req.students, supervisors: sups, registrations: [] });
      return { ok: true, supervisors: sups };
    }
    if (!db) return mockErr('not_setup', 'El sistema no está configurado.');
    if (A === 'listSupervisors') return { ok: true, supervisors: db.supervisors };
    if (A === 'emailLinks') {
      if (!req.baseUrl) return mockErr('bad_request', 'Falta baseUrl.');
      return { ok: true, sent: db.supervisors.filter(function (s) { return s.email; }).length };
    }
    if (A === 'dashboard') return { ok: true, classrooms: mockDash(db).classrooms, totals: mockDash(db).totals };
    return { ok: true, rows: buildReport(db.students, db.registrations) };
  }

  if (supActions.indexOf(A) >= 0) {
    if (!db) return mockErr('not_setup', 'El sistema no está configurado.');
    var sup = db.supervisors.filter(function (s) { return s.token === req.token; })[0];
    if (!req.token || !sup) return mockErr('bad_token', 'Enlace de supervisor inválido.');
    var room = sup.classroom;
    if (A === 'session') {
      return { ok: true,
        supervisor: { name: sup.name, classroom: room, expected_students: sup.expected_students },
        coSupervisors: db.supervisors.filter(function (s) { return s.classroom === room && s.token !== sup.token; }).map(function (s) { return s.name; }),
        directory: buildDirectory(db.students) };
    }
    if (A === 'classroomStatus') {
      return { ok: true, registrations: db.registrations.filter(function (r) { return r.classroom === room; }) };
    }
    if (A === 'selfCode') {
      var now = Date.now(), b = selfCodeBucket(now);
      return { ok: true, code: mockCode(room, b), classroom: room, expires_in: Math.max(1, Math.round(((b + 1) * 60000 - now) / 1000)) };
    }
    // register
    if (!Array.isArray(req.items)) return mockErr('bad_request', 'Solicitud inválida.');
    for (var k = 0; k < req.items.length; k++) {
      var it = req.items[k];
      if (!it || !/^\d{9}$/.test(it.id) || ['scan', 'manual'].indexOf(it.method) < 0 || !it.client_id) return mockErr('bad_request', 'Elemento inválido en el lote.');
    }
    var results = req.items.map(function (it) { return mockRegister(db, it, room, sup.name, it.method); });
    mockSave(db);
    return { ok: true, results: results };
  }

  if (A === 'selfRegister') {
    if (!db) return mockErr('not_setup', 'El sistema no está configurado.');
    if (typeof req.classroom !== 'string' || !/^\d{9}$/.test(req.id || '')) return mockErr('bad_request', 'Solicitud inválida.');
    var b0 = selfCodeBucket(Date.now());
    if (req.code !== mockCode(req.classroom, b0) && req.code !== mockCode(req.classroom, b0 - 1)) return mockErr('bad_code', 'El código QR expiró. Vuelve a escanear el QR del supervisor.');
    var r = mockRegister(db, { id: req.id, client_ts: new Date().toISOString(), client_id: 'self-' + mockRand(12) }, req.classroom, 'autoregistro', 'self');
    mockSave(db);
    return { ok: true, status: r.status, duplicate: r.duplicate, assigned_classroom: r.status === 'wrong_room' ? (db.students.filter(function (s) { return s.id === req.id; })[0] || {}).assigned_classroom : '' };
  }
  return mockErr('bad_request', 'Acción desconocida.');
}

// Writes the registration unless duplicate; idempotent by client_id.
function mockRegister(db, it, room, by, method) {
  var prev = db.registrations.filter(function (r) { return r.client_id === it.client_id; })[0];
  if (prev) return { client_id: it.client_id, id: it.id, status: prev.status, duplicate: false };
  var byId = {};
  db.registrations.forEach(function (r) { if (!byId[r.id]) byId[r.id] = r; });
  var d = decideRegistration(it.id, room, buildDirectory(db.students), byId);
  if (d.duplicate) return { client_id: it.client_id, id: it.id, status: d.status, duplicate: true, existing: d.existing };
  db.registrations.push({ id: it.id, classroom: room, registered_at: it.client_ts, received_at: new Date().toISOString(),
    registered_by: by, method: method, status: d.status, client_id: it.client_id });
  return { client_id: it.client_id, id: it.id, status: d.status, duplicate: false };
}

function mockDash(db) {
  var rooms = {}, order = [];
  db.students.forEach(function (s) {
    if (!rooms[s.assigned_classroom]) { rooms[s.assigned_classroom] = { classroom: s.assigned_classroom, expected: 0, registered: 0, wrong_room: 0, unknown: 0, supervisors: [] }; order.push(s.assigned_classroom); }
    rooms[s.assigned_classroom].expected++;
  });
  db.supervisors.forEach(function (p) {
    var r = rooms[p.classroom];
    if (r) r.supervisors.push(p.name);
  });
  var t = { students: db.students.length, registered: 0, wrong_room: 0, unknown: 0, absent: 0 };
  db.registrations.forEach(function (g) {
    t.registered++;
    if (g.status === 'wrong_room') t.wrong_room++;
    if (g.status === 'unknown') t.unknown++;
    var r = rooms[g.classroom];
    if (r) { r.registered++; if (g.status === 'wrong_room') r.wrong_room++; if (g.status === 'unknown') r.unknown++; }
  });
  var known = {}; db.students.forEach(function (s) { known[s.id] = true; });
  var seen = {}; db.registrations.forEach(function (g) { if (known[g.id]) seen[g.id] = true; });
  t.absent = t.students - Object.keys(seen).length;
  return { classrooms: order.map(function (k) { return rooms[k]; }), totals: t };
}
