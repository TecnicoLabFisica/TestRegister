(function () {
  var C = ES.checkin, $ = function (id) { return document.getElementById(id); };
  var q = new URLSearchParams(location.search), room = q.get('c') || '', code = q.get('k') || '';
  var LAST = 'tr_last_id';
  $('title').textContent = C.title; $('lbl').textContent = C.idLabel; $('go').textContent = C.submit;
  $('again').textContent = C.again;
  if (room) $('room').textContent = room; else $('room').classList.add('hidden');
  try { $('idIn').value = localStorage.getItem(LAST) || ''; } catch (e) {}

  var MARK = { ok: 'M6 12.5l4 4 8-9', warn: 'M12 6v7 M12 17.4v.1', bad: 'M7 7l10 10M17 7L7 17', info: 'M12 11v6 M12 7.4v.1' };
  // kind: ok | warn | bad | info. `drawn` adds the stroke-drawn icon; a plain line is used for transient messages.
  function show(kind, title, sub, extra) {
    var r = $('result'); r.className = 'state ' + kind;
    r.innerHTML = '<div class="big"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + MARK[kind] + '"/></svg></div><h2></h2><p></p>';
    r.querySelector('h2').textContent = title; r.querySelector('p').textContent = sub || '';
    if (!sub) r.querySelector('p').remove();
    if (extra) { var s = document.createElement('div'); s.className = 'steps'; s.textContent = extra; r.appendChild(s); }
  }
  function errText(res) { return ES.errors[res.error] || res.message || ES.errors.server_error; }
  function busy(on) { $('go').disabled = on; }

  function attempt(id, n) {
    return api('selfRegister', { classroom: room, code: code, id: id }).then(function (res) { return res; }, function () { return { ok: false, error: 'network' }; })
      .then(function (res) {
        if (res.ok || (res.error !== 'busy' && res.error !== 'network' && res.error !== 'server_error')) return res;
        if (n >= 5) return res;
        show('info', C.retrying(n + 1));
        return new Promise(function (r) { setTimeout(r, 800 * Math.pow(2, n)); }).then(function () { return attempt(id, n + 1); });
      });
  }

  if (!room || !code) { $('form').classList.add('hidden'); show('bad', C.badLink); return; }

  $('idIn').oninput = function () { this.value = this.value.replace(/\D/g, '').slice(0, 9); };
  $('form').onsubmit = function (e) {
    e.preventDefault();
    var id = $('idIn').value;
    if (!/^\d{9}$/.test(id)) return show('bad', C.badId);
    try { localStorage.setItem(LAST, id); } catch (e2) {}
    busy(true); show('info', C.sending);
    attempt(id, 0).then(function (res) {
      busy(false);
      if (!res.ok) {
        if (res.error === 'bad_code') { $('form').classList.add('hidden'); return show('bad', C.expiredTitle, ES.errors.bad_code, C.expiredHelp); }
        var net = res.error === 'network' || res.error === 'busy';
        return show('bad', C.errorTitle, res.error === 'network' ? ES.errors.network : errText(res), net ? C.failed : '');
      }
      $('form').classList.add('hidden'); $('again').classList.remove('hidden');
      if (res.duplicate) show('info', C.dupe, C.room + ': ' + room);
      else if (res.status === 'wrong_room') show('warn', C.wrongRoomTitle, C.wrongRoom(res.assigned_classroom), C.room + ': ' + room);
      else show('ok', C.ok, C.room + ': ' + room);
    });
  };
  $('again').onclick = function () {
    $('form').classList.remove('hidden'); $('again').classList.add('hidden'); $('result').classList.add('hidden'); $('idIn').value = ''; $('idIn').focus();
  };
})();
