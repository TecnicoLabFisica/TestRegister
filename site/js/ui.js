// Shared UI helpers: icons, toast, bottom sheet, count-up, progress ring, segmented control.
// Plain globals, no dependencies. Icons are hand-written strokes on a 24px grid.
var UI = (function () {
  var P = {
    check: 'M5 12.5l4.5 4.5L19 7.5',
    x: 'M6 6l12 12M18 6L6 18',
    warn: 'M12 4l9.5 16h-19z M12 10v4.5 M12 17.4v.1',
    info: 'M12 21a9 9 0 100-18 9 9 0 000 18z M12 11v5.5 M12 7.6v.1',
    camera: 'M3.5 8.5h3l1.5-2.5h8l1.5 2.5h3v11h-17z M12 16.5a3.3 3.3 0 100-6.6 3.3 3.3 0 000 6.6z',
    list: 'M9 7h11 M9 12h11 M9 17h11 M4.5 7h.1 M4.5 12h.1 M4.5 17h.1',
    qr: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2.5v2.5H14z M19 14h1 M14 19h1 M17 18.5h3v1.5h-3z',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 100-6 3 3 0 000 6z',
    eyeoff: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 100-6 3 3 0 000 6z M4 4l16 16',
    chevron: 'M9 6l6 6-6 6',
    search: 'M11 18a7 7 0 100-14 7 7 0 000 14z M20 20l-4-4',
    copy: 'M9 9h11v11H9z M5 15V4h10',
    upload: 'M12 16V5 M7.5 9.5L12 5l4.5 4.5 M5 19h14',
    print: 'M7 9V4h10v5 M7 17H4v-7h16v7h-3 M7 14h10v6H7z',
    mail: 'M3 6h18v12H3z M3.5 7l8.5 6.5L20.5 7',
    download: 'M12 4v11 M7.5 10.5L12 15l4.5-4.5 M5 20h14',
    linkoff: 'M10 14l4-4 M8.5 11.5l-2 2a3.5 3.5 0 005 5l2-2 M15.5 12.5l2-2a3.5 3.5 0 00-5-5l-2 2 M4 4l16 16',
    chart: 'M5 20v-9 M12 20V4 M19 20v-6'
  };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function icon(n, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + P[n] + '"/></svg>';
  }
  function ringSvg() {
    return '<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="rt" cx="22" cy="22" r="19"/><circle class="rf" cx="22" cy="22" r="19" pathLength="100"/></svg>';
  }
  // Fill [data-icon] and [data-ring] placeholders.
  function hydrate(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(function (e) { e.innerHTML = icon(e.getAttribute('data-icon')); });
    (root || document).querySelectorAll('[data-ring]').forEach(function (e) { e.innerHTML = ringSvg(); });
  }
  function ring(box, frac) { // box: any element holding a ring svg
    var f = box.querySelector('.rf');
    if (f) f.style.strokeDashoffset = 100 * (1 - Math.max(0, Math.min(1, frac || 0)));
  }

  function countUp(el, to, ms) {
    var from = el._n || 0; el._n = to;
    if (el._raf) cancelAnimationFrame(el._raf);
    if (reduce || from === to) { el.textContent = to; return; }
    ms = ms || 700;
    var t0 = performance.now();
    (function step(t) {
      var k = Math.min(1, (t - t0) / ms);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) el._raf = requestAnimationFrame(step);
    })(t0);
    setTimeout(function () { if (el._n === to) el.textContent = to; }, ms + 150); // rAF is paused in background tabs
  }

  function toast(kind, title, sub) {
    var box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    while (box.children.length >= 3) box.firstChild.remove();
    var t = document.createElement('div'); t.className = 'toast ' + kind;
    t.innerHTML = '<span class="ti">' + icon({ ok: 'check', warn: 'warn', bad: 'x', info: 'info' }[kind] || 'info') + '</span><div class="tx"><b></b><small></small></div>';
    t.querySelector('b').textContent = title;
    var sm = t.querySelector('small'); sm.textContent = sub || ''; if (!sub) sm.remove();
    box.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('in'); });
    function gone() { t.classList.remove('in'); setTimeout(function () { t.remove(); }, 320); }
    t.onclick = gone; setTimeout(gone, kind === 'bad' ? 5000 : 3400);
  }

  // Bottom sheet. o: {icon, kind, title, msg, yes, yesKind, no}. Resolves true (yes) / false (no, backdrop, Esc).
  function sheet(o) {
    return new Promise(function (resolve) {
      var back = document.createElement('div'); back.className = 'sheet-back';
      var s = document.createElement('div'); s.className = 'sheet'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true');
      s.innerHTML = '<div class="grab"></div><div class="sh-ic ' + (o.kind || 'info') + '">' + icon(o.icon || 'info') + '</div><h2></h2><p></p><div class="sh-btns"><button type="button" class="btn big yes"></button></div>';
      s.querySelector('h2').textContent = o.title; s.querySelector('p').textContent = o.msg || '';
      var yes = s.querySelector('.yes'); yes.textContent = o.yes; yes.classList.add(o.yesKind || 'primary');
      if (o.no) { var no = document.createElement('button'); no.type = 'button'; no.className = 'btn big gray no'; no.textContent = o.no; s.querySelector('.sh-btns').appendChild(no); no.onclick = function () { done(false); }; }
      back.appendChild(s); document.body.appendChild(back);
      var prev = document.activeElement, closed = false;
      function done(v) {
        if (closed) return; closed = true;
        document.removeEventListener('keydown', key);
        back.classList.remove('open');
        setTimeout(function () { back.remove(); if (prev && prev.focus) prev.focus(); }, 280);
        resolve(v);
      }
      function key(e) { if (e.key === 'Escape') done(false); }
      document.addEventListener('keydown', key);
      yes.onclick = function () { done(true); };
      back.onclick = function (e) { if (e.target === back) done(false); };
      requestAnimationFrame(function () { back.classList.add('open'); yes.focus(); });
    });
  }

  // Segmented control / tab bar: buttons with data-v. Returns {set(v)}.
  function seg(root, cb, initial) {
    var btns = Array.prototype.slice.call(root.querySelectorAll('button'));
    function set(v, fire) {
      btns.forEach(function (b) { var on = b.getAttribute('data-v') === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      if (fire && cb) cb(v);
    }
    btns.forEach(function (b) { b.onclick = function () { set(b.getAttribute('data-v'), true); }; });
    set(initial || btns[0].getAttribute('data-v'), false);
    return { set: function (v) { set(v, true); } };
  }

  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  var api_ = { icon: icon, hydrate: hydrate, ring: ring, countUp: countUp, toast: toast, sheet: sheet, seg: seg, norm: norm };
  hydrate();
  return api_;
})();
