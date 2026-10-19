/**
 * חלקים משותפים למסך השחקן ולמסך המנהל, בלי תלות בדף עצמו (כדי שאפשר לבדוק אותם ב-Node):
 * חיבור לשרת עם ניסיון חוזר, "ביטול" של כמה שניות, ועיצוב תאריכים בשעון ישראל.
 */
(function (root) {
  'use strict';
  var TZ = 'Asia/Jerusalem';
  var DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function parts(iso) {
    var p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(iso)).forEach(function (x) { p[x.type] = x.value; });
    var dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    return { d: +p.day, m: +p.month, y: +p.year, hh: p.hour, mm: p.minute, dow: dow };
  }
  /** "21:00" */
  function hhmm(iso) { var p = parts(iso); return p.hh + ':' + p.mm; }
  /** "19.10" */
  function dm(iso) { var p = parts(iso); return p.d + '.' + p.m; }
  /** "שבת 24.10 ב-21:00", ובשבת בערב: "מוצאי שבת 24.10 ב-21:00" */
  function dayAt(iso) {
    var p = parts(iso);
    var day = p.dow === 6 && +p.hh >= 18 ? 'מוצאי שבת' : DAYS[p.dow];
    return day + ' ' + p.d + '.' + p.m + ' ב-' + p.hh + ':' + p.mm;
  }
  /** "19.10 21:05" */
  function stamp(iso) { var p = parts(iso); return p.d + '.' + p.m + ' ' + p.hh + ':' + p.mm; }
  function ymdLabel(ymd) { var a = ymd.split('-').map(Number); return a[2] + '.' + a[1]; }
  function nis(n) { return (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('he-IL') + ' ₪'; }

  function uuid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  /**
   * חיבור לשרת. POST עם Content-Type: text/plain כדי שהדפדפן לא ישלח בקשת preflight,
   * ו-fetch עוקב אחרי ההפניה ש-Apps Script מחזיר.
   * פעולת כתיבה מקבלת מזהה בקשה אחד לכל הניסיונות, כך שניסיון חוזר לא יבצע אותה פעמיים.
   * בעומס (busy) או תקלת רשת: ניסיון חוזר עם המתנה שגדלה, עד ~45 שניות.
   */
  function createApi(opts) {
    var fetchImpl = opts.fetch || root.fetch.bind(root);
    var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var maxTries = opts.maxTries || 8;
    return function call(action, args, o) {
      o = o || {};
      var body = { action: action, args: args || {} };
      var auth = opts.auth ? opts.auth() : {};
      Object.keys(auth).forEach(function (k) { body[k] = auth[k]; });
      if (o.write) body.requestId = uuid();
      var delay = 700;
      var attempt = 0;
      function once() {
        attempt++;
        return fetchImpl(opts.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
          .then(function (r) { return r.json(); })
          .then(function (j) { return j; }, function () { return { ok: false, retry: true, offline: true, error: 'אין חיבור לאינטרנט. מנסה שוב...' }; })
          .then(function (j) {
            if (!j.retry || attempt >= maxTries) {
              if (opts.onBusy) opts.onBusy(null);
              if (j.retry) return { ok: false, code: 'unavailable', error: j.offline ? 'אין חיבור לאינטרנט. בדוק את החיבור ונסה שוב.' : 'השרת עמוס מדי כרגע. נסה שוב בעוד דקה.' };
              return j;
            }
            if (opts.onBusy) opts.onBusy(j.offline ? 'אין חיבור. מנסה שוב...' : 'יש עומס כרגע, מנסה שוב...');
            var wait = delay + Math.floor(Math.random() * 400);
            delay = Math.min(Math.round(delay * 1.7), 6000);
            return sleep(wait).then(once);
          });
      }
      return once();
    };
  }

  /**
   * פעולה שמתבצעת רק אחרי כמה שניות, וניתנת לביטול עד אז (אישור/דחיית תשלום: 6 שניות).
   * מחזיר { cancel(), promise }. promise מתממש בתוצאת הפעולה, או ב-null אם בוטלה.
   */
  function delayed(fn, ms, timers) {
    // עטיפה: בדפדפן setTimeout שנקרא כמתודה של אובייקט אחר זורק "Illegal invocation"
    var t = timers || { set: function (f, n) { return setTimeout(f, n); }, clear: function (h) { clearTimeout(h); } };
    var done = false, handle, resolve;
    var promise = new Promise(function (r) { resolve = r; });
    handle = t.set(function () { done = true; resolve(fn()); }, ms);
    return {
      promise: promise,
      cancel: function () { if (done) return false; done = true; t.clear(handle); resolve(null); return true; }
    };
  }

  var api = { esc: esc, hhmm: hhmm, dm: dm, dayAt: dayAt, stamp: stamp, ymdLabel: ymdLabel, nis: nis, createApi: createApi, delayed: delayed, uuid: uuid };
  root.KSWeb = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
