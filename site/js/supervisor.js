(function () {
  var S = ES.sup;
  var token = new URLSearchParams(location.search).get('t') || '';
  var $ = function (id) { return document.getElementById(id); };
  var session = null, serverRegs = [], outbox = null, scanner = null, online = true;

  var tab = 'scan', filter = 'all';
  function fail(title, text) {
    $('app').classList.add('hidden'); $('err').classList.remove('hidden');
    $('err').querySelector('h1').textContent = title; $('err').querySelector('p').textContent = text;
  }
  function errText(res) { return ES.errors[res.error] || res.message || ES.errors.server_error; }
  function hhmm(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); }

  // ---- state ----
  function localRegs() {
    var me = session.supervisor.name, out = [];
    outbox.items().forEach(function (it) {
      var d = decideRegistration(it.id, session.supervisor.classroom, session.directory, {});
      out.push({ id: it.id, status: d.status, registered_at: it.client_ts, registered_by: me, pending: true });
    });
    return out;
  }
  function allRegs() { // server first so it wins over local duplicates
    var byId = {}, list = [];
    serverRegs.concat(localRegs()).forEach(function (r) {
      if (byId[r.id]) return;
      var e = session.directory[r.id];
      byId[r.id] = Object.assign({ name: e ? e[0] : r.id }, r);
      list.push(byId[r.id]);
    });
    return { byId: byId, list: list };
  }

  function roomSize() {
    var room = session.supervisor.classroom;
    return Object.keys(session.directory).filter(function (id) { return session.directory[id][1] === room; }).length;
  }

  function chipEl(st) { var c = document.createElement('span'); c.className = 'chip ' + st; c.textContent = S.chip[st] || S.missing; return c; }

  function render() {
    var a = allRegs(), n = outbox.count(), size = roomSize();
    UI.countUp($('cnt'), a.list.length);
    UI.ring($('ring'), size ? a.list.length / size : 0);
    $('cntOf').textContent = S.of + ' ' + size; $('ring').setAttribute('aria-label', a.list.length + ' ' + S.of + ' ' + size + ' ' + S.registered);
    var sync = $('sync');
    sync.className = 'pill ' + (!online ? '' : n ? 'warn' : 'ok');
    sync.textContent = !online ? S.sync.offline + (n ? ' · ' + n : '') : n ? S.pendingN(n) : S.sync.online;
    var recent = a.list.slice().sort(function (x, y) { return x.registered_at < y.registered_at ? 1 : -1; }).slice(0, 10);
    $('recent').innerHTML = '';
    if (!recent.length) $('recent').innerHTML = '<li class="empty-row"></li>', $('recent').firstChild.textContent = S.noRecent;
    recent.forEach(function (r) {
      var li = document.createElement('li'), st = r.pending ? 'pending' : r.status;
      li.className = 'row';
      li.innerHTML = '<span class="rn"><span class="nm"></span></span><span class="rs"><span class="tm"></span></span>';
      li.querySelector('.nm').textContent = r.name;
      li.querySelector('.tm').textContent = hhmm(r.registered_at);
      li.querySelector('.rs').appendChild(chipEl(st));
      $('recent').appendChild(li);
    });
    renderList(a);
  }

  // ---- roster tab ----
  function rowEl(name, id, missing) {
    var el = document.createElement(missing ? 'button' : 'div'); el.className = 'row';
    el.innerHTML = '<span class="rn"><span class="nm"></span><span class="id"></span></span><span class="rs"></span>';
    el.querySelector('.nm').textContent = name; el.querySelector('.id').textContent = id;
    return el;
  }
  function renderList(a) {
    a = a || allRegs();
    var room = session.supervisor.classroom, q = UI.norm($('q').value.trim()), ro = $('roster'), ot = $('others');
    function match(name, id) { return !q || UI.norm(name).indexOf(q) >= 0 || id.indexOf(q) >= 0; }
    function byName(x, y) { return x[0].localeCompare(y[0], 'es'); }
    ro.innerHTML = ''; ot.innerHTML = '';
    Object.keys(session.directory).filter(function (id) { return session.directory[id][1] === room; })
      .map(function (id) { return [session.directory[id][0], id]; }).sort(byName).forEach(function (p) {
        var r = a.byId[p[1]], missing = !r;
        if (!match(p[0], p[1]) || (filter === 'missing' && !missing) || (filter === 'done' && missing)) return;
        var el = rowEl(p[0], p[1], missing), rs = el.querySelector('.rs');
        if (missing) {
          rs.appendChild(chipEl('missing'));
          el.onclick = function () { askRegister(p[0], p[1]); };
        } else if (r.pending) rs.appendChild(chipEl('pending'));
        else { var tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = hhmm(r.registered_at); rs.appendChild(tm); rs.appendChild(chipEl(r.status)); }
        var li = document.createElement('li'); li.appendChild(el); ro.appendChild(li);
      });
    if (!ro.children.length) ro.innerHTML = '<li class="empty-row"></li>', ro.firstChild.textContent = S.emptyList;
    var extra = filter === 'missing' ? [] : a.list.filter(function (r) { return !session.directory[r.id] || session.directory[r.id][1] !== room; })
      .filter(function (r) { return match(r.name, r.id); });
    $('othersH').textContent = S.others;
    $('othersH').classList.toggle('hidden', !extra.length); ot.classList.toggle('hidden', !extra.length);
    extra.forEach(function (r) {
      var el = rowEl(r.name, r.id, false), li = document.createElement('li');
      var tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = hhmm(r.registered_at);
      el.querySelector('.rs').appendChild(tm); el.querySelector('.rs').appendChild(chipEl(r.pending ? 'pending' : r.status));
      li.appendChild(el); ot.appendChild(li);
    });
  }
  function askRegister(name, id) {
    ask({ icon: 'check', kind: 'info', title: S.registerWho(name), msg: S.registerWhoMsg(id), yes: S.register, yesKind: 'primary' })
      .then(function (yes) { if (yes) handleId(id, 'manual'); });
  }

  // ---- feedback ----
  function flash(kind) {
    var f = $('flash'); f.className = 'flash ' + kind; void f.offsetWidth; f.classList.add('go');
  }
  function show(kind, title, sub) {
    UI.toast(kind, title, sub);
    if (kind === 'ok' || kind === 'warn') flash(kind);
  }
  function beep() {
    try {
      var c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain();
      o.frequency.value = 880; g.gain.value = .15; o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + .12); setTimeout(function () { c.close(); }, 300);
    } catch (e) {}
  }
  function ask(o) { // bottom sheet; the scanner stays paused while it is open
    if (scanner) scanner.paused = true;
    o.no = S.cancel;
    return UI.sheet(o).then(function (v) { if (scanner) scanner.paused = false; return v; });
  }

  function queue(id, method, d, kind) {
    outbox.enqueue({ id: id, method: method });
    render();
    if (kind === 'ok') {
      show('ok', d.name, S.okTitle);
      if (navigator.vibrate) navigator.vibrate(80);
      beep();
    } else if (kind === 'wrong_room') show('warn', d.name, S.okTitle + ' (' + d.assigned_classroom + ')');
    else show('warn', id, S.okTitle + ' (' + S.chip.unknown + ')');
  }

  function handleId(id, method) {
    var a = allRegs(), d = decideRegistration(id, session.supervisor.classroom, session.directory, a.byId);
    if (d.duplicate) {
      var ex = d.existing;
      show('warn', (d.name || id) + ': ' + S.dupe, S.dupeAt(hhmm(ex.registered_at), ex.registered_by));
      return Promise.resolve();
    }
    if (d.status === 'ok') { queue(id, method, d, 'ok'); return Promise.resolve(); }
    var wr = d.status === 'wrong_room';
    return ask({ icon: 'warn', kind: wr ? 'warn' : 'bad', title: wr ? S.wrongRoomTitle : S.unknownTitle,
      msg: wr ? S.wrongRoomMsg(d.assigned_classroom) : S.unknownMsg(id),
      yes: wr ? S.registerHere : S.registerAnyway, yesKind: wr ? 'warn' : 'primary' }).then(function (yes) {
      if (yes) queue(id, method, d, d.status);
    });
  }

  // ---- outbox results: duplicates from co-supervisors ----
  function onResults(results) {
    results.forEach(function (r) {
      if (r.duplicate && r.existing) {
        var e = session.directory[r.id];
        show('warn', S.dupeServer(e ? e[0] : r.id, r.existing.registered_by), hhmm(r.existing.registered_at));
      }
    });
    refreshStatus();
  }

  // ---- network ----
  function refreshStatus() {
    return api('classroomStatus', { token: token }).then(function (res) {
      online = true;
      if (res.ok) serverRegs = res.registrations; else if (res.error === 'bad_token') fail(S.title, errText(res));
      render();
    }, function () { online = false; render(); });
  }

  // ---- self check-in QR ----
  var qrTimer = null, qrTick = null;
  function drawQr(url) {
    var q = qrcode(0, 'M'); q.addData(url); q.make();
    $('qrBox').innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    $('qrBox').setAttribute('data-checkin-url', url);
  }
  function qrOff(msg) {
    $('qrBox').parentNode.classList.toggle('hidden', !!msg); $('qrOff').classList.toggle('hidden', !msg);
    if (msg) $('qrMsg').textContent = msg;
  }
  function loadCode() {
    clearTimeout(qrTimer);
    api('selfCode', { token: token }).then(function (res) {
      if (tab !== 'qr') return; // left the tab while in flight
      if (!res.ok) throw new Error(errText(res));
      var url = withMock(siteBase() + 'checkin.html?c=' + encodeURIComponent(res.classroom) + '&k=' + res.code);
      drawQr(url); qrOff('');
      var left = res.expires_in + 1; // just past the minute bucket, so the next fetch gets the new code
      clearInterval(qrTick);
      function paint() { $('qrCount').textContent = S.qrRenew(Math.max(left, 0)); UI.ring($('qrRing'), Math.max(left, 0) / 60); }
      qrTick = setInterval(function () { left--; paint(); }, 1000);
      paint();
      clearTimeout(qrTimer); qrTimer = setTimeout(loadCode, left * 1000);
    }).catch(function (e) {
      if (tab !== 'qr') return;
      qrOff(e && e.message && e.message !== 'offline' ? e.message : S.qrOffline);
      $('qrCount').textContent = ''; UI.ring($('qrRing'), 0);
      clearInterval(qrTick);
      clearTimeout(qrTimer); qrTimer = setTimeout(loadCode, 5000);
    });
  }
  function stopQr() { clearTimeout(qrTimer); clearInterval(qrTick); }

  // ---- tabs + UI wiring ----
  var TKEY = 'tr_sup_tab';
  function stopCam() { scanner.stop(); $('cam').classList.remove('live'); $('bScan').textContent = S.scan; }
  function showTab(t) {
    tab = t;
    ['scan', 'list', 'qr'].forEach(function (n) { $('tab-' + n).classList.toggle('hidden', n !== t); });
    try { localStorage.setItem(TKEY, t); } catch (e) {}
    if (t !== 'scan') stopCam();
    if (t === 'qr') loadCode(); else stopQr();
    if (t === 'list') renderList();
  }
  function wire() {
    $('bScan').textContent = S.scan; $('camHint').textContent = S.camHint;
    $('idLabel').textContent = S.idLabel; $('bGo').textContent = S.register;
    $('recentH').textContent = S.recent; $('qrHelp').textContent = S.qrHelp;
    $('tScan').textContent = S.tabs.scan; $('tList').textContent = S.tabs.list; $('tQr').textContent = S.tabs.qr;
    $('q').placeholder = S.search;
    var fb = $('flt').querySelectorAll('button'), fk = ['all', 'missing', 'done'];
    fb.forEach(function (b, i) { b.textContent = S.filter[fk[i]]; });
    UI.seg($('flt'), function (v) { filter = v; renderList(); });
    $('q').oninput = function () { renderList(); };
    scanner = createScanner('reader', function (id) { handleId(id, 'scan'); });

    $('bScan').onclick = function () {
      if (scanner.isRunning()) return stopCam();
      $('camErr').classList.add('hidden');
      scanner.start().then(function () { $('cam').classList.add('live'); $('bScan').textContent = S.scanStop; }, function () {
        $('camErr').textContent = S.cameraError; $('camErr').classList.remove('hidden');
      });
    };
    $('idIn').oninput = function () { this.value = this.value.replace(/\D/g, '').slice(0, 9); };
    $('manualPanel').onsubmit = function (e) {
      e.preventDefault();
      var v = $('idIn').value;
      $('idErr').classList.toggle('hidden', /^\d{9}$/.test(v)); $('idErr').textContent = S.badId;
      if (!/^\d{9}$/.test(v)) return;
      handleId(v, 'manual').then(function () { $('idIn').value = ''; $('idIn').focus(); });
    };
    var saved = 'scan'; try { saved = localStorage.getItem(TKEY) || 'scan'; } catch (e) {}
    if (['scan', 'list', 'qr'].indexOf(saved) < 0) saved = 'scan';
    var tabs = UI.seg($('tabs'), showTab, saved);
    showTab(saved);
    window.addEventListener('online', function () { outbox.flush(); });
  }

  // ---- boot ----
  function start() {
    $('app').classList.remove('hidden');
    UI.ring($('ring'), 0);
    $('room').textContent = session.supervisor.classroom;
    $('who').textContent = S.supervisor + ': ' + session.supervisor.name +
      (session.coSupervisors.length ? ' · ' + S.with + ' ' + session.coSupervisors.join(', ') : '');
    document.title = session.supervisor.classroom;
    outbox = createOutbox(token, { onChange: function () { if (session && outbox) render(); }, onResults: onResults,
      onError: function (res) {
        if (res.error === 'bad_token') fail(S.title, errText(res));
        else if (res.error === 'bad_request') { show('bad', errText(res)); refreshStatus(); } // outbox dropped the batch
      } });
    wire(); render(); refreshStatus();
    setInterval(refreshStatus, 15000);
  }

  if (!token) return fail(S.title, S.noToken);
  var CKEY = 'tr_session_' + token;
  api('session', { token: token }).then(function (res) {
    if (!res.ok) return fail(S.title, errText(res));
    session = res; try { localStorage.setItem(CKEY, JSON.stringify(res)); } catch (e) {}
    start();
  }, function () {
    try { session = JSON.parse(localStorage.getItem(CKEY)); } catch (e) {}
    if (!session) return fail(S.title, S.noCache);
    online = false; start();
  });
})();
