// Html5Qrcode wrapper: back camera, continuous scan, same id ignored until out of view for 3 s.
function createScanner(elId, onId) {
  var qr = null, last = {}, running = false;
  var api_ = {
    paused: false,
    start: function () {
      if (running) return Promise.resolve();
      qr = qr || new Html5Qrcode(elId);
      running = true;
      return qr.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, function (text) {
        var id = extractId(text), now = Date.now();
        if (!id) return;
        var seen = last[id]; last[id] = now; // sliding: a card held in view (e.g. during a modal) never re-fires
        if (api_.paused || (seen && now - seen < 3000)) return;
        onId(id);
      }, function () {}).catch(function (e) { running = false; throw e; });
    },
    stop: function () {
      if (!running) return Promise.resolve();
      running = false;
      return qr.stop().then(function () { qr.clear(); }, function () {});
    },
    isRunning: function () { return running; }
  };
  return api_;
}
