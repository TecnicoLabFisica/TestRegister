(function () {
  var $ = function (id) { return document.getElementById(id); };
  var students = null, supervisors = null, links = [], dashLoaded = false;
  var KEY = 'tr_admin_key';

  $('mode').textContent = IS_MOCK ? 'Mock backend (localStorage)' : '';
  try { $('key').value = localStorage.getItem(KEY) || ''; } catch (e) {}
  $('key').onchange = function () { try { localStorage.setItem(KEY, $('key').value); } catch (e) {} };
  function key() { return $('key').value.trim(); }
  function text(el, s) { el.textContent = s; return el; }
  function td(tr, s, cls) { var c = document.createElement('td'); c.textContent = s; if (cls) c.className = cls; tr.appendChild(c); return c; }
  function fail(el, res) { text(el, 'Error: ' + (res.message || res.error)); }
  function netFail(el) { text(el, 'Network error: could not reach the backend.'); }

  // ---- CSV validation ----
  function readFile(input) {
    return new Promise(function (ok) {
      var f = input.files[0];
      if (!f) return ok(null);
      var r = new FileReader(); r.onload = function () { ok(parseCsv(r.result)); }; r.readAsText(f, 'utf-8');
    });
  }
  function revalidate() {
    Promise.all([readFile($('fStudents')), readFile($('fSups'))]).then(function (v) {
      students = v[0]; supervisors = v[1];
      var box = $('msgs'); box.innerHTML = '';
      $('roomsT').classList.add('hidden'); $('bSetup').disabled = true;
      if (!students || !supervisors) return;
      var r = validateInputs(students, supervisors);
      r.errors.forEach(function (m) { box.appendChild(text(Object.assign(document.createElement('div'), { className: 'msg-err' }), m)); });
      r.warnings.forEach(function (m) { box.appendChild(text(Object.assign(document.createElement('div'), { className: 'msg-warn' }), m)); });
      var tb = $('roomsT').tBodies[0]; tb.innerHTML = '';
      r.classrooms.forEach(function (c) {
        var tr = tb.insertRow(); td(tr, c.classroom); td(tr, c.students, 'num'); td(tr, c.expected, 'num'); td(tr, c.supervisors.join(', '));
      });
      $('roomsT').classList.remove('hidden');
      $('bSetup').disabled = r.errors.length > 0;
    });
  }
  $('fStudents').onchange = $('fSups').onchange = revalidate;

  // ---- setup ----
  $('bSetup').onclick = function () {
    if (!key()) return text($('setupSt'), 'Enter the admin key first.');
    if (!confirm('Setup REPLACES all data and clears every registration. Continue?')) return;
    text($('setupSt'), 'Running setup…');
    api('setup', { adminKey: key(), students: students, supervisors: supervisors }).then(function (res) {
      if (!res.ok) return fail($('setupSt'), res);
      text($('setupSt'), 'Setup done: ' + students.length + ' students, ' + res.supervisors.length + ' supervisors.');
      showLinks(res.supervisors);
    }, function () { netFail($('setupSt')); });
  };

  // ---- supervisor links ----
  function qrSvg(url, cell) {
    var q = qrcode(0, 'M'); q.addData(url); q.make();
    return q.createSvgTag({ cellSize: cell || 4, margin: 2, scalable: true });
  }
  function linkFor(s) { return withMock(siteBase() + 'supervisor.html?t=' + s.token); }
  function showLinks(list) {
    links = list;
    var tb = $('supT').tBodies[0]; tb.innerHTML = '';
    list.forEach(function (s) {
      var tr = tb.insertRow(), url = linkFor(s);
      td(tr, s.name); td(tr, s.classroom);
      var c = td(tr, ''); var a = document.createElement('a'); a.href = url; a.textContent = url; a.className = 'linktxt'; a.target = '_blank';
      c.appendChild(a); c.appendChild(document.createElement('br'));
      var b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Copy';
      b.onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { b.textContent = 'Copied'; }, function () { prompt('Copy this link', url); }); };
      c.appendChild(b);
      var q = td(tr, '', 'qr-sm'); q.innerHTML = qrSvg(url);
    });
    $('supT').classList.toggle('hidden', !list.length);
    $('bPrint').disabled = $('bEmail').disabled = !list.length;
  }
  $('bLoad').onclick = function () {
    if (!key()) return text($('linkSt'), 'Enter the admin key first.');
    api('listSupervisors', { adminKey: key() }).then(function (res) {
      if (!res.ok) return fail($('linkSt'), res);
      text($('linkSt'), res.supervisors.length + ' supervisors.'); showLinks(res.supervisors);
    }, function () { netFail($('linkSt')); });
  };
  $('bEmail').onclick = function () {
    if (!confirm('Email every supervisor their link?')) return;
    api('emailLinks', { adminKey: key(), baseUrl: siteBase() }).then(function (res) {
      if (!res.ok) return fail($('linkSt'), res);
      text($('linkSt'), 'Emails sent: ' + res.sent);
    }, function () { netFail($('linkSt')); });
  };
  $('bPrint').onclick = function () {
    var P = ES.print, box = $('print'); box.innerHTML = '';
    links.forEach(function (s) {
      var url = linkFor(s), d = document.createElement('div'); d.className = 'card';
      d.innerHTML = '<div class="qr"></div><div><h3></h3><div class="room"></div><ol></ol><div class="url"></div></div>';
      d.querySelector('.qr').innerHTML = qrSvg(url, 6);
      d.querySelector('h3').textContent = s.name;
      d.querySelector('.room').textContent = P.room + ': ' + s.classroom;
      P.steps.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; d.querySelector('ol').appendChild(li); });
      d.querySelector('.url').textContent = url;
      box.appendChild(d);
    });
    window.print();
  };

  // ---- dashboard ----
  function loadDash() {
    if (!key()) return text($('dashSt'), 'Enter the admin key first.');
    return api('dashboard', { adminKey: key() }).then(function (res) {
      if (!res.ok) return fail($('dashSt'), res);
      dashLoaded = true;
      var tb = $('dashT').tBodies[0]; tb.innerHTML = '';
      res.classrooms.forEach(function (c) {
        var tr = tb.insertRow(); td(tr, c.classroom); td(tr, c.supervisors.join(', '));
        var cell = td(tr, c.registered + ' / ' + c.expected);
        var bar = document.createElement('div'); bar.className = 'bar'; bar.innerHTML = '<i></i>';
        bar.firstChild.style.width = Math.min(100, c.expected ? 100 * c.registered / c.expected : 0) + '%';
        cell.appendChild(bar); td(tr, c.wrong_room, 'num'); td(tr, c.unknown, 'num');
      });
      $('dashT').classList.remove('hidden');
      var t = res.totals;
      text($('totals'), 'Totals: ' + t.students + ' students, ' + t.registered + ' registered, ' + t.wrong_room + ' wrong room, ' + t.unknown + ' unknown, ' + t.absent + ' absent.');
      text($('dashSt'), 'Updated ' + new Date().toLocaleTimeString());
    }, function () { netFail($('dashSt')); });
  }
  $('bDash').onclick = loadDash;
  setInterval(function () { if ($('auto').checked && dashLoaded) loadDash(); }, 20000);

  $('bCsv').onclick = function () {
    if (!key()) return text($('dashSt'), 'Enter the admin key first.');
    api('report', { adminKey: key() }).then(function (res) {
      if (!res.ok) return fail($('dashSt'), res);
      var blob = new Blob([toCsv(res.rows, REPORT_COLUMNS)], { type: 'text/csv;charset=utf-8' });
      var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'asistencia-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.csv';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }, function () { netFail($('dashSt')); });
  };
})();
