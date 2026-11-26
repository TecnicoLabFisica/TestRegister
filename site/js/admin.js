(function () {
  var $ = function (id) { return document.getElementById(id); };
  var students = null, supervisors = null, links = [], dash = null, rows = [], dashLoaded = false, lastAt = 0, open = {};
  var KEY = 'tr_admin_key', TKEY = 'tr_admin_tab';

  $('mode').classList.toggle('hidden', !IS_MOCK);
  try { $('key').value = localStorage.getItem(KEY) || ''; } catch (e) {}
  $('key').onchange = function () { try { localStorage.setItem(KEY, $('key').value); } catch (e) {} };
  $('eye').innerHTML = UI.icon('eye');
  $('eye').onclick = function () {
    var show = $('key').type === 'password';
    $('key').type = show ? 'text' : 'password'; $('eye').innerHTML = UI.icon(show ? 'eyeoff' : 'eye');
    $('eye').setAttribute('aria-label', show ? 'Hide admin key' : 'Show admin key');
  };
  function key() { return $('key').value.trim(); }
  function needKey() { if (key()) return false; UI.toast('bad', 'Enter the admin key first.'); $('key').focus(); return true; }
  function fail(res) { UI.toast('bad', 'Error: ' + res.error); } // backend messages are Spanish; the admin page is English
  function netFail() { UI.toast('bad', 'Network error', 'Could not reach the backend.'); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function td(tr, s, cls) { var c = tr.insertCell(); c.textContent = s; if (cls) c.className = cls; return c; }
  function hhmm(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

  // ---- tabs ----
  var T = ['setup', 'links', 'dash'];
  function showTab(t) {
    T.forEach(function (n) { $('sec-' + n).classList.toggle('hidden', n !== t); });
    try { localStorage.setItem(TKEY, t); } catch (e) {}
    if (t === 'dash' && !dashLoaded && key()) loadDash();
  }
  var saved = 'setup'; try { saved = localStorage.getItem(TKEY) || 'setup'; } catch (e) {}
  if (T.indexOf(saved) < 0) saved = 'setup';
  var tabs = UI.seg($('tabs'), showTab, saved); showTab(saved);

  // ---- CSV upload + validation ----
  function readFile(input) {
    return new Promise(function (ok) {
      var f = input.files[0];
      if (!f) return ok(null);
      var r = new FileReader(); r.onload = function () { ok({ name: f.name, rows: parseCsv(r.result) }); }; r.readAsText(f, 'utf-8');
    });
  }
  function zone(z, info, label) {
    z.classList.toggle('done', !!info);
    z.querySelector('[data-icon]').innerHTML = UI.icon(info ? 'check' : 'upload');
    z.querySelector('.dn').textContent = info ? info.name : label;
    z.querySelector('.dm').textContent = info ? info.rows.length + ' rows loaded' : 'Drop here or click';
  }
  function group(kind, label, items, openIt) {
    var d = el('details', 'vgroup ' + kind); d.open = openIt;
    var s = el('summary', '', items.length + ' ' + label); d.appendChild(s);
    var ul = el('ul'); items.forEach(function (m) { ul.appendChild(el('li', '', m)); }); d.appendChild(ul);
    return d;
  }
  function revalidate() {
    Promise.all([readFile($('fStudents')), readFile($('fSups'))]).then(function (v) {
      zone($('dz1'), v[0], 'Students CSV'); zone($('dz2'), v[1], 'Supervisors CSV');
      students = v[0] && v[0].rows; supervisors = v[1] && v[1].rows;
      var box = $('msgs'); box.innerHTML = '';
      ['roomsH', 'roomsW'].forEach(function (i) { $(i).classList.add('hidden'); }); $('bSetup').disabled = true;
      if (!students || !supervisors) return;
      var r = validateInputs(students, supervisors);
      if (r.errors.length) box.appendChild(group('err', r.errors.length === 1 ? 'error' : 'errors', r.errors, true));
      if (r.warnings.length) box.appendChild(group('warn', r.warnings.length === 1 ? 'warning' : 'warnings', r.warnings, !r.errors.length));
      if (!r.errors.length && !r.warnings.length) { var p = el('details', 'vgroup pass'); p.appendChild(el('summary', '', 'All checks passed')); box.appendChild(p); }
      var tb = $('roomsT').tBodies[0]; tb.innerHTML = '';
      r.classrooms.forEach(function (c) {
        var tr = tb.insertRow(); td(tr, c.classroom); td(tr, c.students, 'num'); td(tr, c.expected, 'num'); td(tr, c.supervisors.join(', '));
      });
      ['roomsH', 'roomsW'].forEach(function (i) { $(i).classList.remove('hidden'); });
      $('bSetup').disabled = r.errors.length > 0;
    });
  }
  $('fStudents').onchange = $('fSups').onchange = revalidate;
  ['dz1', 'dz2'].forEach(function (id) {
    var z = $(id);
    ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function () { z.classList.remove('over'); }); });
    z.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer.files.length) { z.querySelector('input').files = e.dataTransfer.files; revalidate(); }
    });
  });

  // ---- setup ----
  $('bSetup').onclick = function () {
    if (needKey()) return;
    UI.sheet({ icon: 'warn', kind: 'bad', title: 'Replace all data?', msg: 'Setup replaces every student and supervisor and clears all registrations. This cannot be undone.',
      yes: 'Replace data', yesKind: 'bad', no: 'Cancel' }).then(function (yes) {
      if (!yes) return;
      UI.toast('info', 'Running setup…');
      api('setup', { adminKey: key(), students: students, supervisors: supervisors }).then(function (res) {
        if (!res.ok) return fail(res);
        UI.toast('ok', 'Setup done', students.length + ' students, ' + res.supervisors.length + ' supervisors.');
        dashLoaded = false; showLinks(res.supervisors); tabs.set('links');
      }, netFail);
    });
  };

  // ---- supervisor links ----
  function qrSvg(url, cell) {
    var q = qrcode(0, 'M'); q.addData(url); q.make();
    return q.createSvgTag({ cellSize: cell || 4, margin: 2, scalable: true });
  }
  function linkFor(s) { return withMock(siteBase() + 'supervisor.html?t=' + s.token); }
  function showLinks(list) {
    links = list;
    var g = $('supGrid'); g.innerHTML = '';
    list.forEach(function (s) {
      var url = linkFor(s), c = el('div', 'group sup-card');
      c.setAttribute('data-q', UI.norm(s.name + ' ' + s.classroom));
      c.innerHTML = '<div class="qr-sm"></div><div class="meta"><b></b><div class="rm"></div><a class="linktxt" target="_blank"></a></div>';
      c.querySelector('.qr-sm').innerHTML = qrSvg(url);
      c.querySelector('b').textContent = s.name; c.querySelector('.rm').textContent = s.classroom;
      var a = c.querySelector('a'); a.href = url; a.textContent = url;
      var b = el('button', 'btn'); b.innerHTML = UI.icon('copy'); b.appendChild(document.createTextNode('Copy'));
      b.onclick = function () {
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () {
          b.className = 'btn ok'; b.textContent = 'Copied ✓';
          setTimeout(function () { b.className = 'btn'; b.innerHTML = UI.icon('copy'); b.appendChild(document.createTextNode('Copy')); }, 1600);
        }, function () { prompt('Copy this link', url); });
      };
      c.querySelector('.meta').appendChild(b);
      g.appendChild(c);
    });
    $('bPrint').disabled = $('bEmail').disabled = !list.length;
    filterLinks();
  }
  function filterLinks() {
    var q = UI.norm($('lf').value.trim());
    Array.prototype.forEach.call($('supGrid').children, function (c) { c.classList.toggle('hidden', !!q && c.getAttribute('data-q').indexOf(q) < 0); });
  }
  $('lf').oninput = filterLinks;
  $('bLoad').onclick = function () {
    if (needKey()) return;
    api('listSupervisors', { adminKey: key() }).then(function (res) {
      if (!res.ok) return fail(res);
      UI.toast('ok', res.supervisors.length + ' supervisors loaded'); showLinks(res.supervisors);
    }, netFail);
  };
  $('bEmail').onclick = function () {
    UI.sheet({ icon: 'mail', kind: 'info', title: 'Email every supervisor their link?', msg: links.length + ' supervisors will receive an email in Spanish.', yes: 'Send emails', no: 'Cancel' }).then(function (yes) {
      if (!yes) return;
      api('emailLinks', { adminKey: key(), baseUrl: siteBase() }).then(function (res) {
        if (!res.ok) return fail(res);
        var f = res.failed && res.failed.length;
        UI.toast(f ? 'warn' : 'ok', 'Emails sent: ' + res.sent, f ? 'Failed: ' + res.failed.join(', ') : '');
      }, netFail);
    });
  };
  $('bPrint').onclick = function () {
    var P = ES.print, box = $('print'); box.innerHTML = '';
    links.forEach(function (s) {
      var url = linkFor(s), d = el('div', 'pcard');
      d.innerHTML = '<div class="qr"></div><div><h3></h3><div class="room"></div><ol></ol><div class="url"></div></div>';
      d.querySelector('.qr').innerHTML = qrSvg(url, 6);
      d.querySelector('h3').textContent = s.name;
      d.querySelector('.room').textContent = P.room + ': ' + s.classroom;
      P.steps.forEach(function (t) { d.querySelector('ol').appendChild(el('li', '', t)); });
      d.querySelector('.url').textContent = url;
      box.appendChild(d);
    });
    window.print();
  };

  // ---- dashboard ----
  var KPI = [['students', 'Students', 'var(--blue)'], ['registered', 'Registered', 'var(--green)'], ['absent', 'Absent', 'var(--muted)'], ['wrong_room', 'Wrong room', 'var(--orange)'], ['unknown', 'Unknown', 'var(--red)']];
  KPI.forEach(function (k) {
    var t = el('div', 'group kpi'); t.style.setProperty('--c', k[2]);
    t.innerHTML = '<span class="n" id="k-' + k[0] + '">0</span><span class="l">' + k[1] + '</span>';
    $('kpis').appendChild(t);
  });

  function absentOf(room) { return rows.filter(function (r) { return r.assigned_classroom === room && r.status === 'absent'; }); }
  function sorted() {
    var by = dash.sort || 'name', list = dash.classrooms.slice();
    var pct = function (c) { return c.expected ? c.registered / c.expected : 1; };
    list.sort(function (a, b) {
      if (by === 'pct') return pct(a) - pct(b) || a.classroom.localeCompare(b.classroom);
      if (by === 'absent') return absentOf(b.classroom).length - absentOf(a.classroom).length || a.classroom.localeCompare(b.classroom);
      return a.classroom.localeCompare(b.classroom);
    });
    return list;
  }
  function listBlock(title, items, fmt) {
    var d = el('div'), h = el('h4', '', title + ' (' + items.length + ')'); d.appendChild(h);
    if (!items.length) { d.appendChild(el('div', 'none', 'None')); return d; }
    var ul = el('ul'); items.forEach(function (r) { var li = el('li'); li.appendChild(el('span', '', fmt(r)[0])); li.appendChild(el('code', '', fmt(r)[1])); ul.appendChild(li); });
    d.appendChild(ul); return d;
  }
  function renderRooms() {
    var box = $('clist'); box.innerHTML = '';
    sorted().forEach(function (c) {
      var row = el('div', 'crow' + (open[c.classroom] ? ' open' : ''));
      var pct = c.expected ? Math.min(100, 100 * c.registered / c.expected) : 0;
      row.innerHTML = '<button class="chead" aria-expanded="false"><span class="cn"></span><span class="cc"></span>' + UI.icon('chevron') + '<span class="cs"></span><div class="bar"><i></i></div></button><div class="cdet"><div><div class="in"></div></div></div>';
      var head = row.firstChild;
      head.querySelector('.cn').textContent = c.classroom;
      head.querySelector('.cc').textContent = c.registered + ' / ' + c.expected;
      head.querySelector('.cs').textContent = c.supervisors.join(', ');
      head.setAttribute('aria-expanded', !!open[c.classroom]);
      var inn = row.querySelector('.in');
      inn.appendChild(listBlock('Absent', absentOf(c.classroom), function (r) { return [r.name, r.id]; }));
      inn.appendChild(listBlock('Wrong room (registered here)', rows.filter(function (r) { return r.registered_classroom === c.classroom && r.status === 'wrong_room'; }),
        function (r) { return [r.name || r.id, 'from ' + r.assigned_classroom]; }));
      inn.appendChild(listBlock('Assigned here, registered elsewhere', rows.filter(function (r) { return r.assigned_classroom === c.classroom && r.status === 'wrong_room'; }),
        function (r) { return [r.name, r.registered_classroom]; }));
      inn.appendChild(listBlock('Unknown IDs registered here', rows.filter(function (r) { return r.registered_classroom === c.classroom && r.status === 'unknown'; }),
        function (r) { return [r.id, hhmm(r.registered_at)]; }));
      head.onclick = function () { open[c.classroom] = !open[c.classroom]; row.classList.toggle('open', !!open[c.classroom]); head.setAttribute('aria-expanded', !!open[c.classroom]); };
      box.appendChild(row);
      var bar = row.querySelector('.bar > i');
      requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = pct + '%'; }); });
    });
  }
  UI.seg($('sort'), function (v) { if (dash) { dash.sort = v; renderRooms(); } }, 'name');

  var STAT = { ok: 'ok', wrong_room: 'wrong_room', unknown: 'unknown', absent: '' };
  function renderSearch() {
    var q = UI.norm($('sq').value.trim()), box = $('sres'); box.innerHTML = '';
    box.classList.toggle('hidden', !q);
    if (!q) return;
    var m = rows.filter(function (r) { return UI.norm(r.name).indexOf(q) >= 0 || r.id.indexOf(q) >= 0; });
    if (!m.length) { box.appendChild(el('div', 'empty-row', 'No student matches.')); return; }
    m.slice(0, 8).forEach(function (r) {
      var c = el('div', 'scard'), t = el('div', 'top1');
      t.appendChild(el('b', '', r.name || '(not on roster)')); t.appendChild(el('code', 'chip', r.id));
      t.appendChild(el('span', 'chip ' + STAT[r.status], r.status === 'wrong_room' ? 'wrong room' : r.status));
      c.appendChild(t);
      c.appendChild(el('div', 'dl', 'Assigned: ' + (r.assigned_classroom || 'none')));
      if (r.status !== 'absent') c.appendChild(el('div', 'dl', 'Registered in ' + r.registered_classroom + ' at ' + hhmm(r.registered_at) + ' by ' + r.registered_by + ' (' + r.method + ')'));
      box.appendChild(c);
    });
    if (m.length > 8) box.appendChild(el('div', 'empty-row', '+' + (m.length - 8) + ' more. Refine the search.'));
  }
  $('sq').oninput = renderSearch;

  function loadDash() {
    if (needKey()) return Promise.resolve();
    return Promise.all([api('dashboard', { adminKey: key() }), api('report', { adminKey: key() })]).then(function (v) {
      if (!v[0].ok) return fail(v[0]);
      if (!v[1].ok) return fail(v[1]);
      dashLoaded = true; lastAt = Date.now();
      dash = { classrooms: v[0].classrooms, sort: dash ? dash.sort : 'name' }; rows = v[1].rows;
      KPI.forEach(function (k) { UI.countUp($('k-' + k[0]), v[0].totals[k[0]]); });
      renderRooms(); renderSearch(); tickUpd();
    }, netFail);
  }
  function tickUpd() {
    if (!lastAt) return;
    var s = Math.max(0, Math.round((Date.now() - lastAt) / 1000));
    $('upd').textContent = 'Last updated ' + (s < 60 ? s + ' s' : s < 3600 ? Math.floor(s / 60) + ' min' : Math.floor(s / 3600) + ' h') + ' ago';
  }
  $('bDash').onclick = loadDash;
  setInterval(tickUpd, 1000);
  setInterval(function () { if ($('auto').checked && dashLoaded && !$('sec-dash').classList.contains('hidden')) loadDash(); }, 20000);

  $('bCsv').onclick = function () {
    if (needKey()) return;
    api('report', { adminKey: key() }).then(function (res) {
      if (!res.ok) return fail(res);
      var blob = new Blob([toCsv(res.rows, REPORT_COLUMNS)], { type: 'text/csv;charset=utf-8' });
      var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'asistencia-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.csv';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      UI.toast('ok', 'CSV downloaded');
    }, netFail);
  };
})();
