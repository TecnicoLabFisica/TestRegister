// Shared pure logic. Plain function declarations only: no import/export, no DOM,
// no Node or Apps Script APIs. Copied to apps-script/Core.gs by `npm run sync-core`.

var REPORT_COLUMNS = ['id', 'name', 'email', 'class', 'career', 'assigned_classroom',
  'registered_classroom', 'registered_at', 'registered_by', 'method', 'status'];

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  var rows = [], row = [], field = '', quoted = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  if (!rows.length) return [];
  var header = rows[0].map(function (h) { return h.trim(); });
  return rows.slice(1).map(function (r) {
    var o = {};
    header.forEach(function (h, j) { o[h] = r[j] === undefined ? '' : r[j]; });
    return o;
  });
}

function toCsv(rows, columns) {
  function q(v) {
    v = v === undefined || v === null ? '' : String(v);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  var lines = [columns.map(q).join(',')];
  rows.forEach(function (r) { lines.push(columns.map(function (c) { return q(r[c]); }).join(',')); });
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function extractId(text) {
  var m = /(?:^|\D)(\d{9})(?!\d)/.exec(String(text));
  return m ? m[1] : null;
}

function validateInputs(students, supervisors) {
  var errors = [], warnings = [], classrooms = [];
  var sCols = ['id', 'name', 'email', 'assignment', 'class', 'faculty', 'career', 'assigned_classroom'];
  var pCols = ['name', 'email', 'classroom', 'expected_students'];
  function missing(rows, cols, label) {
    var have = rows.length ? Object.keys(rows[0]) : [];
    var m = cols.filter(function (c) { return have.indexOf(c) < 0; });
    if (m.length) errors.push('The ' + label + ' file is missing columns: ' + m.join(', '));
    return m.length > 0;
  }
  var sBad = missing(students, sCols, 'students');
  var pBad = missing(supervisors, pCols, 'supervisors');

  var counts = {}, order = [];
  if (!sBad) {
    var seen = {};
    students.forEach(function (s, i) {
      var line = i + 2;
      if (!/^\d{9}$/.test(s.id)) errors.push('Students line ' + line + ': malformed id "' + s.id + '" (need 9 digits)');
      else if (seen[s.id]) errors.push('Students line ' + line + ': duplicate id ' + s.id);
      seen[s.id] = true;
      if (s.assigned_classroom === '') errors.push('Students line ' + line + ': empty assigned_classroom');
      else {
        if (!(s.assigned_classroom in counts)) { counts[s.assigned_classroom] = 0; order.push(s.assigned_classroom); }
        counts[s.assigned_classroom]++;
      }
    });
  }
  var byRoom = {};
  if (!pBad) {
    var emails = {};
    supervisors.forEach(function (p, i) {
      var line = i + 2;
      if (!sBad && !(p.classroom in counts)) errors.push('Supervisors line ' + line + ': classroom "' + p.classroom + '" has no students');
      var n = /^\d+$/.test(p.expected_students) ? Number(p.expected_students) : null;
      if (n === null) errors.push('Supervisors line ' + line + ': expected_students "' + p.expected_students + '" is not a non-negative integer');
      (byRoom[p.classroom] = byRoom[p.classroom] || []).push({ name: p.name, n: n });
      if (p.email !== '') {
        if (emails[p.email]) warnings.push('Supervisor email used more than once: ' + p.email);
        emails[p.email] = true;
      }
    });
  }
  order.forEach(function (room) {
    var sups = byRoom[room] || [], total = counts[room];
    var sum = sups.reduce(function (a, s) { return a + (s.n || 0); }, 0);
    classrooms.push({ classroom: room, students: total, expected: sum, supervisors: sups.map(function (s) { return s.name; }) });
    if (pBad) return;
    if (!sups.length) warnings.push('Classroom "' + room + '" has ' + total + ' students but no supervisor');
    else if (sum !== total && !sups.every(function (s) { return s.n === total; })) {
      warnings.push('Classroom "' + room + '": expected_students (' + sups.map(function (s) { return s.n; }).join(' + ') + ') does not match ' + total + ' students');
    }
  });
  return { errors: errors, warnings: warnings, classrooms: classrooms };
}

function buildDirectory(students) {
  var d = {};
  students.forEach(function (s) { d[s.id] = [s.name, s.assigned_classroom]; });
  return d;
}

function decideRegistration(id, classroom, directory, registrationsById) {
  var e = directory[id], existing = registrationsById[id] || null;
  return {
    status: !e ? 'unknown' : e[1] === classroom ? 'ok' : 'wrong_room',
    duplicate: !!existing,
    existing: existing,
    name: e ? e[0] : '',
    assigned_classroom: e ? e[1] : ''
  };
}

function buildReport(students, registrations) {
  var first = {};
  registrations.forEach(function (r) {
    if (!first[r.id] || r.registered_at < first[r.id].registered_at) first[r.id] = r;
  });
  function row(s, r) {
    return {
      id: s ? s.id : r.id, name: s ? s.name : '', email: s ? s.email : '', class: s ? s.class : '',
      career: s ? s.career : '', assigned_classroom: s ? s.assigned_classroom : '',
      registered_classroom: r ? r.classroom : '', registered_at: r ? r.registered_at : '',
      registered_by: r ? r.registered_by : '', method: r ? r.method : '',
      status: r ? r.status : 'absent'
    };
  }
  var known = {};
  var rows = students.map(function (s) { known[s.id] = true; return row(s, first[s.id]); });
  Object.keys(first).forEach(function (id) { if (!known[id]) rows.push(row(null, first[id])); });
  return rows;
}

function selfCodeBucket(nowMs) {
  return Math.floor(nowMs / 60000);
}
