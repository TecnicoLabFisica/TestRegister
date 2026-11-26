(function () {
  var C = ES.checkin, $ = function (id) { return document.getElementById(id); };
  var q = new URLSearchParams(location.search), room = q.get('c') || '', code = q.get('k') || '';
  var LAST = 'tr_last_id';
  $('room').textContent = room || C.title; $('lbl').textContent = C.idLabel; $('go').textContent = C.submit;
  $('again').textContent = C.again;
  try { $('idIn').value = localStorage.getItem(LAST) || ''; } catch (e) {}

  function show(kind, title, sub) {
    var r = $('result'); r.className = 'banner pop ' + kind;
    r.innerHTML = '<span></span><small></small>';
    r.children[0].textContent = title; r.children[1].textContent = sub || '';
  }
  function errText(res) { return res.message || ES.errors[res.error] || ES.errors.server_error; }
  function busy(on) { $('go').disabled = on; }

  function attempt(id, n) {
    return api('selfRegister', { classroom: room, code: code, id: id }).then(function (res) { return res; }, function () { return { ok: false, error: 'network' }; })
      .then(function (res) {
        if (res.ok || (res.error !== 'busy' && res.error !== 'network' && res.error !== 'server_error')) return res;
        if (n >= 5) return res;
        show('warn', C.retrying(n + 1));
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
    busy(true); show('warn', C.sending);
    attempt(id, 0).then(function (res) {
      busy(false);
      if (!res.ok) return show('bad', res.error === 'network' ? ES.errors.network : errText(res), res.error === 'network' || res.error === 'busy' ? C.failed : '');
      $('form').classList.add('hidden'); $('again').classList.remove('hidden');
      if (res.duplicate) show('warn', C.dupe, C.room + ': ' + room);
      else if (res.status === 'wrong_room') show('bad', C.wrongRoom(res.assigned_classroom), C.room + ': ' + room);
      else show('ok', C.ok, C.room + ': ' + room);
    });
  };
  $('again').onclick = function () {
    $('form').classList.remove('hidden'); $('again').classList.add('hidden'); $('result').classList.add('hidden'); $('idIn').focus();
  };
})();
