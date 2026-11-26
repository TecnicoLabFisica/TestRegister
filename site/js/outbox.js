// Per-token localStorage queue; flushes to `register` in batches with exponential backoff.
function createOutbox(token, hooks) {
  var KEY = 'tr_outbox_' + token, BATCH = 25, BASE = 3000, MAX = 60000;
  var fails = 0, timer = null, flushing = false;

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(q) { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch (e) {} }
  function changed() { if (hooks.onChange) hooks.onChange(load().length); }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, Math.min(MAX, BASE * Math.pow(2, fails)));
  }

  function enqueue(item) {
    var q = load();
    q.push({ id: item.id, method: item.method, client_ts: item.client_ts || new Date().toISOString(),
      client_id: item.client_id || Math.random().toString(36).slice(2) + Date.now().toString(36) });
    save(q); changed();
    fails = 0; flush();
  }

  function flush() {
    clearTimeout(timer);
    var batch = load().slice(0, BATCH);
    if (flushing || !batch.length) { schedule(); return Promise.resolve(); }
    flushing = true;
    return api('register', { token: token, items: batch }).then(function (res) {
      var sent = {}; batch.forEach(function (b) { sent[b.client_id] = true; });
      if (res.ok || res.error === 'bad_request') {
        // bad_request would never succeed on retry: drop the batch rather than block the queue.
        save(load().filter(function (x) { return !sent[x.client_id]; }));
        fails = 0;
        if (res.ok && hooks.onResults) hooks.onResults(res.results, batch);
        if (!res.ok && hooks.onError) hooks.onError(res);
      } else {
        fails++;
        if (res.error !== 'busy' && hooks.onError) hooks.onError(res);
      }
    }).catch(function () { fails++; }).then(function () {
      flushing = false; changed(); schedule();
    });
  }

  schedule(); changed();
  return { enqueue: enqueue, flush: flush, items: load, count: function () { return load().length; } };
}
