(function () {
  var S = ES.sup;
  var token = new URLSearchParams(location.search).get('t') || '';
  var $ = function (id) { return document.getElementById(id); };
  var session = null, serverRegs = [], outbox = null, scanner = null, online = true;

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

  function render() {
    var a = allRegs(), n = outbox.count();
    $('cnt').textContent = a.list.length;
    $('cntOf').textContent = S.of + ' ' + roomSize() + ' ' + S.registered;
    $('pend').classList.toggle('hidden', !n);
    $('pend').textContent = n + ' ' + S.pending;
    $('offline').classList.toggle('hidden', online);
    var recent = a.list.slice().sort(function (x, y) { return x.registered_at < y.registered_at ? 1 : -1; }).slice(0, 10);
    $('recent').innerHTML = '';
    if (!recent.length) $('recent').innerHTML = '<li class="tm"></li>', $('recent').firstChild.textContent = S.noRecent;
    recent.forEach(function (r) {
      var li = document.createElement('li'), st = r.pending ? 'pending' : r.status;
      li.innerHTML = '<span class="nm"></span><span class="tm"></span><span class="chip"></span>';
      li.children[0].textContent = r.name;
      li.children[1].textContent = hhmm(r.registered_at);
      li.children[2].textContent = S.chip[st]; li.children[2].className = 'chip ' + st;
      $('recent').appendChild(li);
    });
  }

  // ---- feedback ----
  function show(kind, title, sub) {
    var r = $('result'); r.className = 'banner pop ' + kind;
    r.innerHTML = '<span></span><small></small>';
    r.children[0].textContent = title; r.children[1].textContent = sub || '';
    r.children[1].classList.toggle('hidden', !sub);
  }
  function beep() {
    try {
      var c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain();
      o.frequency.value = 880; g.gain.value = .15; o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + .12); setTimeout(function () { c.close(); }, 300);
    } catch (e) {}
  }
  function confirmModal(msg, yes) {
    if (scanner) scanner.paused = true;
    return new Promise(function (resolve) {
      var d = $('dlg');
      $('dlgMsg').textContent = msg; $('dlgYes').textContent = yes; $('dlgNo').textContent = S.cancel;
      function done(v) { d.close(); $('dlgYes').onclick = $('dlgNo').onclick = null; if (scanner) scanner.paused = false; resolve(v); }
      $('dlgYes').onclick = function () { done(true); };
      $('dlgNo').onclick = function () { done(false); };
      d.oncancel = function (e) { e.preventDefault(); done(false); };
      d.showModal();
    });
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
    var msg = d.status === 'wrong_room' ? S.wrongRoomMsg(d.assigned_classroom) : S.unknownMsg(id);
    return confirmModal(msg, d.status === 'wrong_room' ? S.registerHere : S.registerAnyway).then(function (yes) {
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
  function loadCode() {
    clearTimeout(qrTimer);
    api('selfCode', { token: token }).then(function (res) {
      if ($('qrView').classList.contains('hidden')) return; // closed while in flight
      if (!res.ok) throw new Error(errText(res));
      var url = withMock(siteBase() + 'checkin.html?c=' + encodeURIComponent(res.classroom) + '&k=' + res.code);
      drawQr(url); $('qrMsg').classList.add('hidden'); $('qrBox').classList.remove('hidden');
      var left = res.expires_in + 1; // just past the minute bucket, so the next fetch gets the new code
      clearInterval(qrTick);
      qrTick = setInterval(function () { left--; $('qrCount').textContent = S.qrRenew(Math.max(left, 0)); }, 1000);
      $('qrCount').textContent = S.qrRenew(left);
      clearTimeout(qrTimer); qrTimer = setTimeout(loadCode, left * 1000);
    }).catch(function (e) {
      if ($('qrView').classList.contains('hidden')) return;
      $('qrBox').classList.add('hidden'); $('qrMsg').classList.remove('hidden');
      $('qrMsg').textContent = e && e.message && e.message !== 'offline' ? e.message : S.qrOffline;
      $('qrCount').textContent = '';
      clearInterval(qrTick);
      clearTimeout(qrTimer); qrTimer = setTimeout(loadCode, 5000);
    });
  }
  function closeQr() { clearTimeout(qrTimer); clearInterval(qrTick); $('qrView').classList.add('hidden'); }

  // ---- UI wiring ----
  function wire() {
    $('bScan').textContent = S.scan; $('bManual').textContent = S.manual; $('bQr').textContent = S.showQr;
    $('idLabel').textContent = S.idLabel; $('bGo').textContent = S.register;
    $('recentH').textContent = S.recent; $('offline').textContent = S.offline;
    $('qrHelp').textContent = S.qrHelp; $('qrClose').textContent = S.close;
    scanner = createScanner('reader', function (id) { handleId(id, 'scan'); });

    $('bScan').onclick = function () {
      if (scanner.isRunning()) {
        scanner.stop(); $('scanPanel').classList.add('hidden'); $('bScan').textContent = S.scan; return;
      }
      $('camErr').classList.add('hidden'); $('scanPanel').classList.remove('hidden');
      $('manualPanel').classList.add('hidden');
      scanner.start().then(function () { $('bScan').textContent = S.scanStop; }, function () {
        $('camErr').textContent = S.cameraError; $('camErr').classList.remove('hidden');
      });
    };
    $('bManual').onclick = function () {
      $('manualPanel').classList.toggle('hidden');
      if (!$('manualPanel').classList.contains('hidden')) $('idIn').focus();
    };
    $('idIn').oninput = function () { this.value = this.value.replace(/\D/g, '').slice(0, 9); };
    $('manualPanel').onsubmit = function (e) {
      e.preventDefault();
      var v = $('idIn').value;
      $('idErr').classList.toggle('hidden', /^\d{9}$/.test(v)); $('idErr').textContent = S.badId;
      if (!/^\d{9}$/.test(v)) return;
      handleId(v, 'manual').then(function () { $('idIn').value = ''; $('idIn').focus(); });
    };
    $('bQr').onclick = function () { $('qrView').classList.remove('hidden'); loadCode(); };
    $('qrClose').onclick = closeQr;
    window.addEventListener('online', function () { outbox.flush(); });
  }

  // ---- boot ----
  function start() {
    $('app').classList.remove('hidden');
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
