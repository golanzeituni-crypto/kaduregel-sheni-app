/**
 * מסך השחקן. נפתח מהקישור האישי (?k=קוד). הקוד נשמר בטלפון, כדי שגם האייקון במסך הבית יעבוד.
 * כל הכללים בשרת: המסך רק מציג את מה שהשרת החזיר ושולח פעולות.
 * הטקסטים והמבנה לפי PROTOTYPE.html.
 */
(function () {
  'use strict';
  var W = window.KSWeb, U = window.KSUI, esc = W.esc;
  var CFG = window.KS_CONFIG;
  var CODE_KEY = 'ks_code';
  var app = document.getElementById('app');
  var V = null;           // התצוגה האחרונה מהשרת
  var code = readCode();

  function readCode() {
    var k = new URLSearchParams(location.search).get('k');
    try {
      if (k) localStorage.setItem(CODE_KEY, k);
      else k = localStorage.getItem(CODE_KEY);
    } catch (e) { /* פרטיות: בלי אחסון */ }
    return k;
  }

  var call = W.createApi({ url: CFG.apiUrl, auth: function () { return { code: code }; }, onBusy: U.busy });

  // ---------- תצוגה ----------

  function noAccess() {
    app.innerHTML = '<header class="head"><div><div class="brand">כדורגל שני</div></div></header><div class="main"><section class="card" aria-label="אין גישה"><h1 class="h">אין גישה</h1>'
      + '<div class="note">הקישור הזה לא תקין או שכבר לא בתוקף. כדי להצטרף למשחקים, פנה לגולן ובקש קישור אישי.</div></section></div>';
  }

  function loading() {
    app.innerHTML = '<header class="head"><div><div class="brand">כדורגל שני</div></div></header><div class="main" aria-busy="true"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
  }

  function failed(msg) {
    app.innerHTML = '<header class="head"><div><div class="brand">כדורגל שני</div></div></header><div class="center"><div class="note bad">' + esc(msg) + '</div><button class="pri" data-a="reload">נסה שוב</button></div>';
  }

  function phasePill(ph) {
    return {
      closed: ['pill', 'הרישום טרם נפתח'], open: ['pill ok', 'הרישום פתוח'], locked: ['pill warn', 'אחרי הדד-ליין'],
      started: ['pill', 'המשחק התחיל'], ended: ['pill', 'המשחק הסתיים'], cancelled: ['pill bad', 'המשחק בוטל']
    }[ph] || ['pill', ''];
  }

  // טווח השעות בכיוון שמאל-לימין, אחרת בשורה עברית הוא מתהפך ל-"23:00–21:00"
  function gameTitle(g) { return esc(g.label) + ' · <span dir="ltr" style="white-space:nowrap">' + W.hhmm(g.times.start) + '–' + W.hhmm(g.times.end) + '</span>'; }

  function nextCard(n, isNext) {
    if (!n) return '';
    var skipped = n.skippedBefore && n.skippedBefore.length ? '<div class="sub">אין משחק ב-' + n.skippedBefore.map(W.ymdLabel).join(', ') + ' (חג או צום)</div>' : '';
    return '<section class="card" aria-label="המשחק הבא"><div class="lbl">' + (isNext ? 'המשחק הבא' : 'המשחק שאחריו') + '</div><div class="h">' + esc(n.label) + '</div>'
      + skipped + '<div class="note ok">הרישום ייפתח אוטומטית ב' + esc(W.dayAt(n.opensAt)) + '.</div></section>';
  }

  function render() {
    var v = V, me = v.me, g = v.game, s = v.settings;
    var mine = v.myRegs, meReg = mine.filter(function (r) { return !r.guest; })[0];
    var html = '<header class="head"><div><div class="brand">כדורגל שני</div><div class="hello">שלום ' + esc(me.name) + '</div></div><span class="tag">שחקן</span></header><div class="main">';

    // הודעות
    if (v.cancelled) html += '<div class="note bad">משחק ' + esc(v.cancelled.label) + ' בוטל. הקרדיט של כל הנרשמים חזר לכרטיסייה.</div>';
    if (me.cardStatus === 'pending') html += '<div class="note warn">התשלום שלך ממתין לאישור המנהל.' + (me.balance < 1 ? ' תוכל להירשם אחרי האישור.' : '') + '</div>';
    else if (me.balance === 0) html += '<div class="note bad">אין לך קרדיט. העבר ' + s.cardPrice + ' ₪ בפייבוקס ולחץ "שילמתי".</div>';
    else if (me.lowCredit) html += '<div class="note warn">נשארו לך ' + me.balance + ' כניסות. כדאי לחדש מראש, כדי לא לפספס רישום.</div>';
    if (me.gear.length) html += '<div class="note ok">אצלך: ' + esc(me.gear.join(', ')) + '. אל תשכח להביא למשחק.</div>';
    if (v.shirt.isNext) html += '<div class="note split"><span>אתה הבא בתור לקחת את הגופיות לכיבוס אחרי המשחק.</span><button class="sm" data-a="shirtSkip">לא יכול השבוע</button></div>';
    if (v.shirt.skipping) html += '<div class="note split"><span>סימנת שאתה לא יכול לקחת את הגופיות השבוע. התור עבר לבא אחריך, ובפעם הבאה תהיה שוב ראשון בתור.</span><button class="sm" data-a="shirtUnskip">בעצם אני יכול</button></div>';

    // יתרה
    html += '<section class="card" aria-label="יתרת קרדיט"><div class="row"><span class="lbl">יתרת כרטיסייה</span><span class="lbl">כרטיסייה של ' + s.cardEntries + '</span></div>'
      + '<div class="row" style="justify-content:flex-start;align-items:baseline;gap:6px"><span class="big">' + me.balance + '</span><span class="mid">כניסות</span></div>'
      + U.bars(me.balance, s.cardEntries) + '</section>';

    if (!g) {
      html += '<section class="card"><div class="note warn">אין משחקים מתוכננים בחודשים הקרובים.</div></section>';
    } else {
      var ph = g.phase, pp = phasePill(ph);
      var status = meReg ? (meReg.status === 'in' ? '<span class="pill ok">אתה רשום</span>' : '<span class="pill warn">ממתין #' + meReg.waitPos + '</span>') : '<span class="' + pp[0] + '">' + pp[1] + '</span>';
      var info = '', actions = '';
      var canSelf = !v.selfRegister.error || v.selfRegister.code === 'noCredit';
      var regLabel = g.free > 0 ? 'הירשם למשחק' : 'הירשם לרשימת ההמתנה';
      if (ph === 'closed') {
        info = '<div class="note">הרישום ייפתח ב' + esc(W.dayAt(g.times.open)) + '.</div>';
      } else if (ph === 'open') {
        info = '<div class="note">ביטול חופשי עד ' + esc(W.dayAt(g.times.deadline)) + '. אחרי זה הקרדיט חוזר רק אם מישהו תופס את המקום.</div>';
        if (!meReg && canSelf) actions += '<button class="pri" data-a="reg">' + regLabel + '</button>';
        if (mine.length) actions += '<button data-a="cancel">בטל רישום</button>';
        actions += '<button class="' + (meReg ? 'pri' : '') + '" data-a="guest">צרף אורח</button>';
      } else if (ph === 'locked') {
        info = '<div class="note warn">הדד-ליין עבר. אפשר עדיין להירשם עד ' + W.hhmm(g.times.start) + ' אם יש מקום, אבל ביטול כבר לא חינם: הקרדיט חוזר רק אם מישהו עולה במקום המבטל.</div>';
        var myWait = mine.filter(function (r) { return r.status === 'wait'; });
        if (myWait.length) info += '<div class="note">אתה ברשימת ההמתנה. אם מישהו יבטל, תעלה אוטומטית ותקבל מייל. המקום מחייב.</div>';
        if (!meReg && canSelf) actions += '<button class="pri" data-a="reg">' + regLabel + '</button>';
        actions += '<button data-a="guest">צרף אורח</button>';
        if (mine.some(function (r) { return r.status === 'in'; })) actions += '<button class="dng" data-a="cancel">בטל הגעה</button>';
        else if (myWait.length) actions += '<button data-a="cancel">צא מרשימת ההמתנה</button>';
      } else if (ph === 'started') {
        info = '<div class="note">המשחק התחיל. הרישום והביטולים סגורים.</div>';
      }
      var guests = mine.filter(function (r) { return r.guest; });
      var guestLine = guests.length ? '<div class="sub">האורחים שלך: ' + guests.map(function (r) { return esc(r.guest) + (r.status === 'wait' ? ' (בהמתנה)' : ''); }).join(', ') + '</div>' : '';
      html += '<section class="card" aria-label="המשחק הקרוב"><div class="row" style="align-items:flex-start"><div><div class="lbl">המשחק הקרוב</div><div class="h">' + gameTitle(g) + '</div></div>' + status + '</div>'
        + '<div class="row" style="font-size:14px"><span class="mid">' + g.counts.total + ' מתוך ' + g.capacity + ' רשומים</span><span class="sub">' + (g.free > 0 ? g.free + ' מקומות פנויים' : 'מלא · ' + g.counts.wait + ' בהמתנה') + '</span></div>'
        + '<div class="prog"><b style="width:' + Math.round(g.counts.total / g.capacity * 100) + '%"></b></div>'
        + guestLine + info + (actions ? '<div class="btns">' + actions + '</div>' : '') + '</section>';

      var chips = g.in.map(function (r) { return '<span class="' + (r.hostId === me.id ? 'me' : '') + '">' + esc(r.label) + '</span>'; }).join('')
        + g.released.map(function (r) { return '<span class="rel">' + esc(r.label) + '</span>'; }).join('');
      var waitList = g.wait.length ? '<div class="sub">בהמתנה: ' + g.wait.map(function (r, i) { return (i + 1) + '. ' + esc(r.label); }).join(' · ') + '</div>' : '';
      html += '<section class="card" aria-label="מי משחק"><div class="strong" style="font-size:14px">מי משחק</div><div class="chips">' + (chips || '<span>עדיין אין נרשמים</span>') + '</div>' + waitList + '</section>';
      html += nextCard(v.next, ph === 'started');
    }
    html += '</div><nav class="foot" aria-label="פעולות"><button class="quiet" data-a="pay">שילמתי</button><button class="quiet" data-a="transfer">העבר קרדיט</button><button class="quiet" data-a="history">היסטוריה</button></nav>';
    app.innerHTML = html;
  }

  // ---------- פעולות ----------

  function cacheKey() { return 'ks_view_' + String(code).slice(0, 12); }

  function load() {
    if (!code) { noAccess(); return; }
    if (!V) {
      var cached = U.cacheGet(cacheKey());
      if (cached) { V = cached; render(); U.stale(true); } else loading();
    }
    call('me').then(function (r) {
      U.stale(false);
      if (r.ok) { V = r.view; U.cacheSet(cacheKey(), V); render(); return; }
      if (r.code === 'noAccess') { U.cacheDrop(cacheKey()); V = null; noAccess(); return; }
      if (!V) failed(r.error); else U.toast(r.error);
    });
  }

  /** שולח פעולה, נועל כפתורים בזמן השמירה, ומעדכן את המסך מהתשובה. */
  function act(action, args, onOk) {
    var unlock = U.lock();
    return call(action, args, { write: true }).then(function (r) {
      unlock();
      if (!r.ok) {
        if (r.code === 'noAccess') { noAccess(); return r; }
        if (document.querySelector('#sheet-layer .err')) U.sheetError(r.error); else U.toast(r.error);
        return r;
      }
      U.closeSheet();
      V = r.view;
      U.cacheSet(cacheKey(), V);
      render();
      if (onOk) onOk(r.result);
      return r;
    });
  }

  function register() {
    var pv = V.selfRegister;
    if (pv.error) { U.toast(pv.error); return; }
    var go = function () { act('register', {}, function (res) { U.toast(res.status === 'wait' ? 'נכנסת לרשימת ההמתנה. הקרדיט ירד רק אם יתפנה מקום.' : 'נרשמת למשחק'); }); };
    if (pv.confirm === 'late') {
      U.confirmSheet({ title: 'להירשם אחרי הדד-ליין?', text: 'ירד לך קרדיט אחד. מכיוון שהדד-ליין עבר, ביטול יחזיר את הקרדיט רק אם מישהו יעלה במקומך.', ok: 'כן, אני מגיע', danger: true }).then(function (y) { if (y) go(); });
    } else if (pv.confirm === 'waitlist') {
      U.confirmSheet({ title: 'להיכנס לרשימת ההמתנה?', text: 'אם יתפנה מקום תעלה אוטומטית וירד לך קרדיט אחד. כניסה לרשימה היא התחייבות להגיע, גם אם תעלה סמוך לדד-ליין.', ok: 'כן, הכנס אותי' }).then(function (y) { if (y) go(); });
    } else go();
  }

  function guestSheet() {
    var late = V.game && V.game.phase === 'locked';
    var full = V.game && V.game.free === 0;
    var box = U.openSheet('<h2 class="h">צרף אורח</h2><label class="field">שם האורח<input id="gname" type="text" autocomplete="off" placeholder="דני" maxlength="40"></label>'
      + '<div class="note">ירד קרדיט אחד מהכרטיסייה שלך. אתה אחראי על האורח, וגם הביטול שלו עובר דרכך.</div>'
      + (full ? '<div class="note warn">המגרש מלא: האורח ייכנס לרשימת ההמתנה. אם יתפנה מקום הוא יעלה אוטומטית, וירד לך קרדיט.</div>' : '')
      + (late ? '<div class="note warn">הדד-ליין עבר: ביטול האורח יחזיר קרדיט רק אם מישהו יעלה במקומו.</div>' : '')
      + '<div class="err" role="alert" style="display:none"></div><div class="btns"><button data-x>חזרה</button><button class="pri" data-ok>צרף</button></div>');
    box.querySelector('[data-x]').onclick = U.closeSheet;
    box.querySelector('[data-ok]').onclick = function () {
      var n = box.querySelector('#gname').value.trim();
      if (!n) { U.sheetError('כתוב את שם האורח'); return; }
      act('register', { guest: n }, function (res) { U.toast(res.status === 'wait' ? n + ' נכנס לרשימת ההמתנה. הקרדיט ירד רק אם יתפנה מקום.' : n + ' נרשם על חשבונך'); });
    };
  }

  function cancelSheet() {
    var mine = V.myRegs, ph = V.game.phase;
    var anyIn = mine.some(function (r) { return r.status === 'in'; }), anyWait = mine.some(function (r) { return r.status === 'wait'; });
    var box = U.openSheet('<h2 class="h">מה לבטל?</h2>'
      + mine.map(function (r) {
        return '<label class="chk"><input type="checkbox" name="cx" value="' + r.regId + '" ' + (r.guest ? '' : 'checked') + '><span>'
          + (r.guest ? esc(r.guest) + ' <span class="sub">(האורח שלך)</span>' : 'אני (' + esc(V.me.name) + ')') + (r.status === 'wait' ? ' <span class="sub">· בהמתנה</span>' : '') + '</span></label>';
      }).join('')
      + (ph === 'open' ? '<div class="note ok">לפני הדד-ליין: הקרדיט חוזר אליך, והראשון ברשימת ההמתנה יקבל את המקום.</div>'
        : (anyIn ? '<div class="note warn">אחרי הדד-ליין: אם יש מישהו ברשימת ההמתנה, הוא עולה אוטומטית והקרדיט חוזר אליך. אם אין, הקרדיט לא חוזר.</div>' : '')
          + (anyWait ? '<div class="note ok">יציאה מרשימת ההמתנה מותרת תמיד ולא עולה כלום.</div>' : ''))
      + '<div class="err" role="alert" style="display:none"></div><div class="btns"><button data-x>חזרה</button><button class="dngfill" data-ok>אשר</button></div>');
    box.querySelector('[data-x]').onclick = U.closeSheet;
    box.querySelector('[data-ok]').onclick = function () {
      var ids = Array.prototype.map.call(box.querySelectorAll('input[name=cx]:checked'), function (i) { return +i.value; });
      if (!ids.length) { U.sheetError('בחר לפחות אחד'); return; }
      var phase = V.game.phase;
      act('cancel', { regIds: ids }, function (res) {
        if (phase === 'open') U.toast(res.refunded ? 'בוטל. הקרדיט חזר אליך.' : 'יצאת מרשימת ההמתנה.');
        else if (res.released.length) U.toast(res.caught ? 'מישהו מרשימת ההמתנה עלה במקומך, והקרדיט חזר אליך.' : 'המקום שוחרר. אין ממתינים, אז הקרדיט לא חוזר.');
        else U.toast('יצאת מרשימת ההמתנה.');
      });
    };
  }

  function paySheet() {
    var s = V.settings, pending = V.me.cardStatus === 'pending';
    var box = U.openSheet('<h2 class="h">חידוש כרטיסייה</h2><div class="note">התשלום בפייבוקס בלבד. העבר ' + s.cardPrice + ' ₪ לפייבוקס של הקבוצה, וכתוב את השם שלך בהערה. אחרי האישור של המנהל יתווספו ' + s.cardEntries + ' כניסות.</div>'
      + (pending ? '<div class="note warn">כבר יש לך תשלום שממתין לאישור.</div><div class="btns"><button data-x>סגור</button></div>'
        : '<div class="err" role="alert" style="display:none"></div><div class="btns"><button data-x>חזרה</button><button class="pri" data-ok>שילמתי ' + s.cardPrice + ' ₪</button></div>'));
    box.querySelector('[data-x]').onclick = U.closeSheet;
    if (!pending) box.querySelector('[data-ok]').onclick = function () { act('reportPaid', {}, function () { U.toast('נשלח למנהל לאישור'); }); };
  }

  function transferSheet() {
    var me = V.me;
    if (me.available < 1) { U.toast(me.reserved ? 'אין לך קרדיט פנוי להעברה (' + me.reserved + ' שמורות לרשימת ההמתנה)' : 'אין לך קרדיט להעביר'); return; }
    var opts = V.transferTargets.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
    var box = U.openSheet('<h2 class="h">העברת קרדיט</h2><label class="field">למי<select id="tto">' + opts + '</select></label>'
      + '<label class="field">כמה כניסות (אפשר להעביר עד ' + me.available + ')<input id="tamt" type="number" inputmode="numeric" min="1" max="' + me.available + '" step="1" value="1"></label>'
      + (me.reserved ? '<div class="sub">' + me.reserved + ' כניסות שמורות לרשימת ההמתנה ואי אפשר להעביר אותן.</div>' : '')
      + '<div class="note warn">הפעולה סופית. ההתחשבנות הכספית ביניכם.</div>'
      + '<div class="err" role="alert" style="display:none"></div><div class="btns"><button data-x>חזרה</button><button class="pri" data-ok>העבר</button></div>');
    box.querySelector('[data-x]').onclick = U.closeSheet;
    box.querySelector('[data-ok]').onclick = function () {
      var to = +box.querySelector('#tto').value, amt = Math.floor(+box.querySelector('#tamt').value);
      if (!(amt >= 1) || amt > me.available) { U.sheetError('אפשר להעביר בין 1 ל-' + me.available + ' כניסות'); return; }
      var name = V.transferTargets.filter(function (p) { return p.id === to; })[0].name;
      act('transfer', { to: to, amount: amt }, function () { U.toast('הועברו ' + amt + ' כניסות ל' + name); });
    };
  }

  function historySheet() {
    var rows = V.history;
    var box = U.openSheet('<h2 class="h">ההיסטוריה שלי</h2><div class="note">יתרה נוכחית: ' + V.me.balance + ' כניסות</div>'
      + '<div class="list" style="max-height:360px;overflow:auto">' + (rows.length ? rows.map(function (h) {
        return '<div class="it"><div><div>' + esc(h.text) + '</div><div class="sub">' + esc(W.stamp(h.at)) + '</div></div><b style="color:' + (h.delta < 0 ? 'var(--danger)' : 'var(--pitch-ink)') + '">' + (h.delta > 0 ? '+' : '−') + Math.abs(h.delta) + '</b></div>';
      }).join('') : '<div class="sub">עדיין אין פעולות.</div>') + '</div><div class="btns"><button data-x>סגור</button></div>');
    box.querySelector('[data-x]').onclick = U.closeSheet;
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-a');
    if (a === 'reload') { V = null; load(); }
    if (!V) return;
    if (a === 'reg') register();
    if (a === 'guest') guestSheet();
    if (a === 'cancel') cancelSheet();
    if (a === 'pay') paySheet();
    if (a === 'transfer') transferSheet();
    if (a === 'history') historySheet();
    if (a === 'shirtSkip') act('shirtSkip', {}, function (res) { U.toast('התור עבר לבא אחריך'); });
    if (a === 'shirtUnskip') act('shirtUnskip', {}, function () { U.toast('חזרת לתור הגופיות'); });
  });

  // כשחוזרים לאפליקציה (למשל במוצ"ש לפני 21:00), מרעננים את המצב
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && V && !document.querySelector('.scrim')) load(); });

  load();
})();
