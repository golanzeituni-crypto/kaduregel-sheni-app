/**
 * רכיבי מסך משותפים: חלון תחתון (sheet), חלון אישור, הודעה קצרה (toast) עם "ביטול",
 * פס "יש עומס", ונעילת כפתורים בזמן שמירה (כדי שלא ילחצו פעמיים).
 */
(function (root) {
  'use strict';
  var esc = root.KSWeb.esc;
  var toastTimer = null;

  function el(id) { return document.getElementById(id); }

  function layer(id) {
    var n = el(id);
    if (!n) { n = document.createElement('div'); n.id = id; document.body.appendChild(n); }
    return n;
  }

  /** חלון תחתון. מחזיר את האלמנט. סגירה בלחיצה על הרקע או ב-close(). */
  function openSheet(html, onClose) {
    var host = layer('sheet-layer');
    host.innerHTML = '<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-modal="true"><div class="grip" aria-hidden="true"></div>' + html + '</div></div>';
    var scrim = host.firstChild;
    scrim.addEventListener('click', function (e) { if (e.target === scrim) closeSheet(); });
    host._onClose = onClose || null;
    var first = scrim.querySelector('input,select,textarea');
    if (first) setTimeout(function () { first.focus(); }, 50);
    return scrim.firstChild;
  }
  function closeSheet() {
    var host = layer('sheet-layer');
    var cb = host._onClose;
    host.innerHTML = '';
    host._onClose = null;
    if (cb) cb();
  }
  function sheetError(msg) {
    var e = document.querySelector('#sheet-layer .err');
    if (e) { e.textContent = msg || ''; e.style.display = msg ? '' : 'none'; }
  }

  /** חלון אישור. מחזיר Promise<boolean>. */
  function confirmSheet(c) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (v) { if (done) return; done = true; resolve(v); };
      var box = openSheet('<h2 class="h">' + esc(c.title) + '</h2><div class="note ' + (c.danger ? 'warn' : '') + '">' + esc(c.text) + '</div>'
        + '<div class="btns"><button data-no>חזרה</button><button class="' + (c.danger ? 'dngfill' : 'pri') + '" data-yes>' + esc(c.ok) + '</button></div>',
        function () { finish(false); });
      box.querySelector('[data-no]').onclick = function () { closeSheet(); };
      box.querySelector('[data-yes]').onclick = function () { finish(true); var h = layer('sheet-layer'); h._onClose = null; h.innerHTML = ''; };
    });
  }

  /** הודעה קצרה בתחתית. עם undo: כפתור "ביטול" (ברירת מחדל 6 שניות). */
  function toast(msg, undo, ms) {
    var host = layer('toast-layer');
    clearTimeout(toastTimer);
    host.innerHTML = '<div class="toast" role="status"><span>' + esc(msg) + '</span>' + (undo ? '<button class="sm undo">ביטול</button>' : '') + '</div>';
    if (undo) host.querySelector('.undo').onclick = function () { host.innerHTML = ''; undo(); };
    toastTimer = setTimeout(function () { host.innerHTML = ''; }, ms || (undo ? 6000 : 2800));
  }

  function busy(msg) {
    var host = layer('busy-layer');
    host.innerHTML = msg ? '<div class="busy" role="status">' + esc(msg) + '</div>' : '';
  }

  // הכפתור האחרון שנלחץ: עליו מופיע "שומר..." בזמן השמירה
  var pressed = null;
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button'); if (b) pressed = b; }, true);

  /** נועל את כל הכפתורים בזמן שמירה, ומציג "שומר..." על הכפתור שנלחץ. מחזיר פונקציה לשחרור. */
  function lock() {
    var bs = Array.prototype.slice.call(document.querySelectorAll('button:not([disabled])'));
    bs.forEach(function (b) { b.disabled = true; });
    var p = pressed && document.body.contains(pressed) ? pressed : null, label = p ? p.innerHTML : null;
    if (p) p.textContent = 'שומר...';
    return function () {
      bs.forEach(function (b) { b.disabled = false; });
      if (p && document.body.contains(p)) p.innerHTML = label;
    };
  }

  // ---------- המצב האחרון שנשמר בטלפון: פתיחה מיידית, ורענון ברקע ----------
  var CACHE_DAYS = 7;
  function cacheGet(key) {
    try {
      var c = JSON.parse(localStorage.getItem(key) || 'null');
      return c && Date.now() - c.t < CACHE_DAYS * 864e5 ? c.v : null;
    } catch (e) { return null; }
  }
  function cacheSet(key, v) { try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: v })); } catch (e) { /* מקום מלא / פרטיות */ } }
  function cacheDrop(key) { try { localStorage.removeItem(key); } catch (e) { /* */ } }
  /** פס עדין "מתעדכן..." בזמן שמוצג המצב השמור ומחכים לשרת. */
  function stale(on) {
    var host = layer('stale-layer');
    host.innerHTML = on ? '<div class="busy soft" role="status">מתעדכן...</div>' : '';
  }

  function bars(n, max) {
    var s = '';
    for (var i = 0; i < max; i++) s += '<i class="' + (i < Math.min(n, max) ? 'on' : '') + '"></i>';
    return '<div class="bars" aria-hidden="true">' + s + '</div>';
  }

  /** מעתיק טקסט. אם הדפדפן לא מאפשר, מציג אותו לסימון ידני. */
  function copyText(text, okMsg) {
    var fallback = function () {
      var box = openSheet('<label class="field">סמן והעתק<textarea readonly>' + esc(text) + '</textarea></label><div class="btns"><button data-c>סגור</button></div>');
      box.querySelector('[data-c]').onclick = closeSheet;
      var ta = box.querySelector('textarea'); ta.focus(); ta.select();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    else fallback();
  }

  root.KSUI = { openSheet: openSheet, closeSheet: closeSheet, sheetError: sheetError, confirmSheet: confirmSheet, toast: toast, busy: busy, lock: lock, bars: bars, copyText: copyText,
    cacheGet: cacheGet, cacheSet: cacheSet, cacheDrop: cacheDrop, stale: stale };
})(window);
