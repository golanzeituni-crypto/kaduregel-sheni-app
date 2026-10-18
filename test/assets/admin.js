/**
 * מסך המנהל. כניסה עם "התחבר עם Google". השרת בודק את התעודה בכל בקשה.
 * לשוניות: ראשי · שחקנים · תאריכים · קופה · יומן. הטקסטים והמבנה לפי PROTOTYPE.html.
 */
(function () {
  'use strict';
  var W = window.KSWeb, U = window.KSUI, esc = W.esc;
  var CFG = window.KS_CONFIG;
  var TOKEN_KEY = 'ks_admin_token', TAB_KEY = 'ks_admin_tab';
  var app = document.getElementById('app');
  var V = null, token = readToken(), tab = readTab();
  var hiddenPayments = {};   // תשלומים שאושרו/נדחו ומחכים 6 שניות לשליחה

  function readToken() {
    try {
      var t = sessionStorage.getItem(TOKEN_KEY);
      if (t && tokenExp(t) > Date.now() / 1000 + 60) return t;
    } catch (e) { /* בלי אחסון */ }
    return null;
  }
  function tokenExp(t) {
    try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0; } catch (e) { return 0; }
  }
  function readTab() { try { return sessionStorage.getItem(TAB_KEY) || 'home'; } catch (e) { return 'home'; } }
  function setTab(t) { tab = t; try { sessionStorage.setItem(TAB_KEY, t); } catch (e) { /* */ } }

  var call = W.createApi({ url: CFG.apiUrl, auth: function () { return { idToken: token }; }, onBusy: U.busy });

  // ---------- התחברות ----------

  function loginScreen(msg) {
    app.innerHTML = '<header class="head"><div><div class="brand">ניהול</div><div class="hello">כדורגל שני</div></div><span class="tag">מנהל</span></header>'
      + '<div class="center"><h1 class="h">כניסת מנהל</h1><div class="sub">כניסה עם חשבון הגוגל של המנהל בלבד.</div>'
      + (msg ? '<div class="note bad">' + esc(msg) + '</div>' : '') + '<div id="gbtn"></div></div>';
    whenGoogle(function () {
      google.accounts.id.renderButton(document.getElementById('gbtn'), { theme: 'filled_blue', size: 'large', text: 'signin_with', locale: 'he', shape: 'pill' });
      if (!msg) google.accounts.id.prompt();
    });
  }

  function whenGoogle(fn) {
    if (window.google && google.accounts && google.accounts.id) {
      if (!whenGoogle.ready) {
        google.accounts.id.initialize({ client_id: CFG.googleClientId, callback: onCredential, auto_select: true, cancel_on_tap_outside: false });
        whenGoogle.ready = true;
      }
      fn();
    } else setTimeout(function () { whenGoogle(fn); }, 150);
  }

  function onCredential(resp) {
    token = resp.credential;
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch (e) { /* */ }
    load();
  }

  function loggedOut(msg) {
    token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* */ }
    V = null;
    loginScreen(msg);
  }

  // ---------- טעינה ופעולות ----------

  function loading() {
    app.innerHTML = '<header class="head"><div><div class="brand">ניהול</div></div><span class="tag">מנהל</span></header><div class="main" aria-busy="true"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
  }

  function load() {
    if (!token) { loginScreen(); return; }
    if (!V) loading();
    call('admin').then(function (r) {
      if (r.ok) { V = r.view; render(); return; }
      if (r.code === 'login') { loggedOut(r.error === 'צריך להתחבר עם Google' ? null : r.error); return; }
      if (!V) app.innerHTML = '<div class="center"><div class="note bad">' + esc(r.error) + '</div><button class="pri" data-a="reload">נסה שוב</button></div>';
      else U.toast(r.error);
    });
  }

  function act(action, args, onOk) {
    var unlock = U.lock();
    return call(action, args, { write: true }).then(function (r) {
      unlock();
      if (!r.ok) {
        if (r.code === 'login') { loggedOut('פג תוקף ההתחברות. התחבר שוב'); return r; }
        if (document.querySelector('#sheet-layer .err')) U.sheetError(r.error); else U.toast(r.error);
        return r;
      }
      U.closeSheet();
      V = r.view;
      render();
      if (onOk) onOk(r.result);
      return r;
    });
  }

  // ---------- תצוגה ----------

  var TABS = [['home', 'ראשי'], ['players', 'שחקנים'], ['dates', 'תאריכים'], ['cash', 'קופה'], ['log', 'יומן']];
  var TITLES = { home: 'ראשי', players: 'שחקנים', dates: 'תאריכי משחק', cash: 'קופה', log: 'יומן' };

  function pendingList() { return V.pendingPayments.filter(function (p) { return !hiddenPayments[p.id]; }); }

  function render() {
    var pend = pendingList();
    var head = '<header class="head"><div><div class="brand">ניהול</div><div class="hello">' + TITLES[tab] + '</div></div><span class="tag">מנהל</span></header>';
    var nav = '<nav class="atabs" aria-label="ניווט מנהל">' + TABS.map(function (t) {
      return '<button class="quiet' + (tab === t[0] ? ' on' : '') + '" data-a="tab" data-t="' + t[0] + '" aria-current="' + (tab === t[0] ? 'page' : 'false') + '">' + t[1] + (t[0] === 'home' && pend.length ? ' (' + pend.length + ')' : '') + '</button>';
    }).join('') + '</nav>';
    var body = { home: homeTab, players: playersTab, dates: datesTab, cash: cashTab, log: logTab }[tab]();
    app.innerHTML = head + '<div class="main">' + body + '</div>' + nav;
  }

  function nextCard(n) {
    if (!n) return '';
    return '<section class="card" aria-label="המשחק הבא"><div class="lbl">המשחק שאחריו</div><div class="h">' + esc(n.label) + '</div>'
      + (n.skippedBefore.length ? '<div class="sub">אין משחק ב-' + n.skippedBefore.map(W.ymdLabel).join(', ') + ' (דילוג)</div>' : '')
      + '<div class="note ok">הרישום ייפתח אוטומטית ב' + esc(W.dayAt(n.opensAt)) + '.</div></section>';
  }

  function homeTab() {
    var pend = pendingList(), g = V.game;
    var html = '<section class="card" aria-label="תשלומים לאישור"><div class="row"><div class="strong">תשלומים לאישור</div>' + (pend.length ? '<span class="pill warn">' + pend.length + '</span>' : '') + '</div><div class="list">'
      + (pend.length ? pend.map(function (p) {
        return '<div class="it"><div><div class="mid">' + esc(p.name) + '</div><div class="sub">' + p.amount + ' ₪ · כרטיסייה של ' + p.entries + ' · ' + esc(W.stamp(p.at)) + '</div></div>'
          + '<div style="display:flex;gap:6px"><button class="sm dng" data-a="reject" data-i="' + p.id + '" aria-label="דחה את התשלום של ' + esc(p.name) + '">דחה</button><button class="sm pri" data-a="approve" data-i="' + p.id + '">אשר</button></div></div>';
      }).join('') : '<div class="sub">אין תשלומים ממתינים</div>') + '</div></section>';
    html += meCard();
    if (V.cancelled) html += '<div class="note bad">משחק ' + esc(V.cancelled.label) + ' בוטל. הקרדיטים הוחזרו לכל הנרשמים.</div>';
    if (g) {
      var live = g.phase === 'closed' || g.phase === 'open' || g.phase === 'locked';
      html += '<section class="card" aria-label="המשחק הקרוב"><div class="row"><div class="strong">' + esc(g.label) + ' · ' + g.counts.total + '/' + g.capacity + ' במגרש</div><span class="sub">דד-ליין ' + W.hhmm(g.times.deadline) + '</span></div>'
        + '<div class="stats"><div><b>' + g.counts.players + '</b><span class="sub">שחקנים</span></div><div><b>' + g.counts.guests + '</b><span class="sub">אורחים</span></div><div><b>' + g.counts.wait + '</b><span class="sub">בהמתנה</span></div></div>'
        + '<div class="chips">' + (g.in.map(function (r) { return '<span>' + esc(r.label) + '</span>'; }).join('') + g.released.map(function (r) { return '<span class="rel">' + esc(r.label) + '</span>'; }).join('') || '<span>עדיין אין נרשמים</span>') + '</div>'
        + (g.wait.length ? '<div class="sub">בהמתנה: ' + g.wait.map(function (r, i) { return (i + 1) + '. ' + esc(r.label); }).join(' · ') + '</div>' : '')
        + '<div class="btns"><button class="pri" data-a="wa">העתק לווטסאפ</button>' + (live ? '<button class="dng" data-a="cancelGame">בטל משחק</button>' : '') + '</div></section>';
    }
    html += nextCard(V.next) + gearCard()
      + '<section class="card" aria-label="קופה"><div class="row"><div class="strong">קופה</div><button class="sm quiet" data-a="tab" data-t="cash">לפירוט</button></div><div class="big">' + W.nis(V.cash.balance) + '</div></section>';
    return html;
  }

  function meCard() {
    var pv = V.me;
    if (!pv) return '';
    var me = pv.me, g = pv.game, mine = pv.myRegs, meReg = mine.filter(function (r) { return !r.guest; })[0];
    var open = g && (g.phase === 'open' || g.phase === 'locked');
    var st = meReg ? (meReg.status === 'in' ? '<span class="pill ok">אתה רשום</span>' : '<span class="pill warn">בהמתנה</span>') : '<span class="pill">לא רשום</span>';
    var guests = mine.filter(function (r) { return r.guest; }).map(function (r) { return esc(r.guest); });
    var acts = '';
    if (open) {
      if (!meReg) acts += '<button class="pri" data-a="meReg">' + (g.free > 0 ? 'הירשם' : 'הירשם להמתנה') + '</button>';
      acts += '<button data-a="meGuest">צרף אורח</button>';
      if (mine.length) acts += '<button data-a="meCancel">בטל</button>';
    }
    return '<section class="card" aria-label="אני כשחקן"><div class="row"><div class="strong">אני כשחקן</div>' + st + '</div>'
      + '<div class="sub">יתרה: ' + me.balance + ' כניסות' + (guests.length ? ' · האורחים שלך: ' + guests.join(', ') : '') + '</div>'
      + (me.balance === 0 ? '<div class="note bad">אין לך קרדיט. העבר ' + V.settings.cardPrice + ' ₪ מהחשבון הפרטי לפייבוקס של הקבוצה, ואז "פתח לעצמי כרטיסייה".</div>'
        : me.lowCredit ? '<div class="note warn">נשארו לך ' + me.balance + ' כניסות.</div>' : '')
      + (acts ? '<div class="btns">' + acts + '</div>' : '')
      + '<div class="btns"><button class="sm quiet" data-a="manual" data-p="' + me.id + '">פתח לעצמי כרטיסייה</button><button class="sm quiet" data-a="meHistory">ההיסטוריה שלי</button></div></section>';
  }

  function gearCard() {
    var gr = V.gear;
    return '<section class="card" aria-label="ציוד"><div class="row"><div class="strong">ציוד</div><button class="sm quiet" data-a="gear">עדכן</button></div><div class="list">'
      + gr.items.map(function (x) { return '<div class="it"><span>' + esc(x.label) + '</span><span>' + (x.holderName ? esc(x.holderName) : 'לא משויך') + '</span></div>'; }).join('')
      + '</div>' + (gr.shirtSuggestion ? '<div class="sub">התור הבא לגופיות: ' + esc(gr.shirtSuggestion.name) + '</div>' : '') + '</section>';
  }

  function playersTab() {
    var row = function (p) {
      return '<div class="it"><div><div class="mid">' + esc(p.name) + (p.isAdmin ? ' <span class="pill">אתה</span>' : '') + '</div><div class="sub">' + p.balance + ' כניסות' + (p.pending ? ' · ממתין לאישור' : '') + '</div></div><button class="sm quiet" data-a="player" data-p="' + p.id + '">ניהול</button></div>';
    };
    return '<div class="btns"><button class="pri" data-a="addPlayer">הוסף שחקן</button></div>'
      + '<section class="card" aria-label="שחקנים"><div class="row"><div class="strong">כל השחקנים בקבוצה</div><span class="sub">' + V.players.length + '</span></div>'
      + '<div class="sub">כרטיסיות, קישורים אישיים והסרה. זו לא רשימת הנרשמים למשחק.</div><div class="list">' + V.players.map(row).join('') + '</div></section>'
      + (V.removed.length ? '<section class="card" aria-label="הוסרו מהקבוצה"><div class="strong">הוסרו מהקבוצה</div><div class="list">' + V.removed.map(function (p) {
        return '<div class="it"><div><div class="mid">' + esc(p.name) + '</div><div class="sub">' + p.balance + ' כניסות שמורות · הקישור לא פעיל</div></div><button class="sm quiet" data-a="restore" data-p="' + p.id + '">החזר לקבוצה</button></div>';
      }).join('') + '</div></section>' : '');
  }

  var MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  function datesTab() {
    var g = V.game, html = '';
    if (g) {
      var pills = { closed: ['pill', 'הרישום טרם נפתח'], open: ['pill ok', 'הרישום פתוח'], locked: ['pill warn', 'אחרי הדד-ליין'], started: ['pill', 'המשחק התחיל'] }[g.phase] || ['pill', ''];
      var live = g.phase === 'open' || g.phase === 'locked';
      html += '<section class="card" aria-label="המשחק הנוכחי"><div class="lbl">המשחק הנוכחי</div><div class="row"><div class="h">' + esc(g.label) + '</div><span class="' + pills[0] + '">' + pills[1] + '</span></div>'
        + (live ? '<div class="sub">הרישום אליו כבר נפתח, ולכן אי אפשר לדלג עליו. כדי לבטל אותו, החזר את הקרדיטים לנרשמים.</div><div class="btns"><button class="dng" data-a="cancelGame">בטל את המשחק הזה</button></div>' : '')
        + '</section>';
    }
    html += '<section class="card" aria-label="תאריכים עתידיים"><div class="strong">חצי השנה הקרובה</div><div class="sub">כל יום משחק הוא משחק כברירת מחדל. סמן "אין משחק" בחגים ובצומות, והרישום לא ייפתח באותו שבוע. השחקנים יראו אוטומטית את התאריך הבא שלא סומן.</div>';
    var month = -1;
    V.days.forEach(function (d) {
      var m = +d.date.split('-')[1] - 1;
      if (m !== month) { if (month !== -1) html += '</div>'; month = m; html += '<div class="lbl strong" style="margin-top:6px">' + MONTHS[m] + ' ' + d.date.slice(0, 4) + '</div><div class="list">'; }
      var btn = d.canSkip || d.skipped
        ? '<button class="sm ' + (d.skipped ? 'dng' : 'quiet') + '" data-a="skip" data-d="' + d.date + '" data-s="' + (d.skipped ? '0' : '1') + '" aria-pressed="' + d.skipped + '">' + (d.skipped ? 'החזר משחק' : 'אין משחק') + '</button>'
        : '<span class="sub">הרישום נפתח</span>';
      html += '<div class="it"><div><div class="mid">' + esc(d.label) + (d.isNext ? ' <span class="pill ok">המשחק הבא</span>' : '') + '</div><div class="sub">' + (d.skipped ? 'אין משחק' : 'משחק רגיל') + '</div></div>' + btn + '</div>';
    });
    return html + '</div></section>';
  }

  var KIND = { open: 'יתרת פתיחה', card: 'כרטיסייה', matnas: 'כרטיסיית מתנ"ס', ball: 'כדורים', shirts: 'גופיות', other: 'אחר', adjust: 'התאמה' };
  var DELETABLE = { matnas: 1, ball: 1, shirts: 1, other: 1, adjust: 1 };

  function cashTab() {
    var c = V.cash, hasOpen = c.entries.some(function (e) { return e.kind === 'open'; });
    return '<section class="card" aria-label="יתרה"><div class="lbl">יתרה בקופה</div><div class="big">' + W.nis(c.balance) + '</div>'
      + '<div class="sub">אמורה להיות זהה ליתרה בפייבוקס. אם יש פער, עדכן לפי פייבוקס.</div>'
      + (hasOpen ? '' : '<div class="note warn">עוד לא הוזנה יתרת פתיחה. ביום ההשקה, הזן את היתרה שבפייבוקס.</div>')
      + '<div class="btns">' + (hasOpen ? '' : '<button class="pri" data-a="opening">הזן יתרת פתיחה</button>') + '<button class="' + (hasOpen ? 'pri' : '') + '" data-a="expense">רשום הוצאה</button><button data-a="recon">התאם מול פייבוקס</button></div></section>'
      + '<section class="card" aria-label="תנועות"><div class="strong">תנועות</div><div class="list">' + (c.entries.length ? c.entries.map(function (e) {
        return '<div class="it"><div style="min-width:0"><div>' + esc(e.note || KIND[e.kind]) + '</div><div class="sub">' + esc(W.stamp(e.at)) + '</div></div><div style="display:flex;gap:8px;align-items:center;flex:none">'
          + '<b style="font-variant-numeric:tabular-nums;color:' + (e.amount < 0 ? 'var(--danger)' : 'var(--pitch-ink)') + '">' + (e.amount > 0 ? '+' : '') + W.nis(e.amount) + '</b>'
          + (DELETABLE[e.kind] ? '<button class="sm quiet" data-a="delCash" data-i="' + e.id + '">מחק</button>' : '') + '</div></div>';
      }).join('') : '<div class="sub">אין תנועות עדיין.</div>') + '</div></section>';
  }

  function transferRow(x) {
    return '<div class="it"><div><div class="mid">' + esc(x.fromName) + ' ל' + esc(x.toName) + ' · ' + x.amount + ' כניסות</div><div class="sub">' + esc(W.stamp(x.at)) + '</div></div>'
      + (x.undone ? '<span class="pill">בוטלה</span>' : '<button class="sm quiet" data-a="undoTr" data-i="' + x.id + '">בטל העברה</button>') + '</div>';
  }

  function logTab() {
    return '<section class="card" aria-label="העברות קרדיט"><div class="strong">העברות קרדיט</div><div class="sub">העברה שנעשתה בטעות אפשר לבטל, כל עוד למקבל נשארו מספיק כניסות.</div><div class="list">'
      + (V.transfers.length ? V.transfers.map(transferRow).join('') : '<div class="sub">עדיין לא היו העברות.</div>') + '</div></section>'
      + '<section class="card" aria-label="היסטוריית אורחים"><div class="strong">אורחים</div><div class="sub">אורח שמגיע שוב ושוב הוא בעצם שחקן קבוע. שקול להוסיף אותו כשחקן רשום.</div><div class="list">'
      + (V.guestHistory.length ? V.guestHistory.map(function (g) {
        return '<div class="it"><div><div class="mid">' + esc(g.guest) + '</div><div class="sub">אורח של ' + esc(g.hostName) + ' · ' + g.count + ' פעמים</div></div>' + (g.count >= 3 ? '<span class="pill warn">מגיע קבוע</span>' : '') + '</div>';
      }).join('') : '<div class="sub">אין אורחים.</div>') + '</div></section>'
      + '<section class="card" aria-label="יומן פעולות"><div class="strong">יומן פעולות</div><div class="sub">כל פעולה במערכת, מהחדשה לישנה. משמש לבירור מחלוקות.</div><div class="list">'
      + V.log.map(function (e) { return '<div class="it"><div><div>' + esc(e.text) + '</div><div class="sub">' + esc(W.stamp(e.at)) + ' · ' + esc(e.actorName) + '</div></div></div>'; }).join('') + '</div></section>';
  }

  // ---------- חלונות ופעולות ----------

  function findPlayer(id) { return V.players.concat(V.removed).filter(function (p) { return p.id === id; })[0]; }

  /** אישור/דחיית תשלום: נשלח לשרת רק אחרי 6 שניות. "ביטול" עד אז = שום דבר לא קרה, ושום מייל לא יצא. */
  function decidePayment(id, approve) {
    var p = V.pendingPayments.filter(function (x) { return x.id === id; })[0];
    hiddenPayments[id] = true;
    render();
    var job = W.delayed(function () {
      return call(approve ? 'approve' : 'reject', { paymentId: id }, { write: true }).then(function (r) {
        delete hiddenPayments[id];
        if (!r.ok) { U.toast(r.error); load(); return; }
        V = r.view;
        render();
      });
    }, 6000);
    U.toast(approve ? 'אושר. ל' + p.name + ' יתווספו ' + p.entries + ' כניסות' : 'נדחה. ' + p.name + ' יקבל מייל', function () {
      if (job.cancel()) { delete hiddenPayments[id]; render(); U.toast(approve ? 'האישור בוטל. המייל לא נשלח.' : 'הדחייה בוטלה. המייל לא נשלח.'); }
    });
  }

  function manualCard(pid) {
    var p = findPlayer(pid), s = V.settings;
    var c = p.isAdmin
      ? { title: 'לפתוח לעצמך כרטיסייה?', text: 'יתווספו לך ' + s.cardEntries + ' כניסות, ו-' + s.cardPrice + ' ₪ יירשמו בקופה. קודם העבר ' + s.cardPrice + ' ₪ מהחשבון הפרטי שלך לפייבוקס של הקבוצה, אחרת הקופה לא תתאים לפייבוקס.', ok: 'העברתי, פתח כרטיסייה' }
      : { title: 'לפתוח כרטיסייה ל' + p.name + '?', text: 'יתווספו לו ' + s.cardEntries + ' כניסות, ו-' + s.cardPrice + ' ₪ יירשמו בקופה. השתמש בזה אם ' + p.name + ' העביר ' + s.cardPrice + ' ₪ בפייבוקס אבל לא לחץ "שילמתי". בדוק בפייבוקס שהתשלום אכן נכנס.', ok: 'כן, פתח כרטיסייה' };
    U.confirmSheet(c).then(function (y) { if (y) act('manualCard', { playerId: pid }, function () { U.toast('נפתחה כרטיסייה ל' + p.name); }); });
  }

  function meRegister() {
    var pv = V.me.selfRegister;
    if (pv.error) { U.toast(pv.error); return; }
    var go = function () { act('register', {}, function (res) { U.toast(res.status === 'wait' ? 'נכנסת לרשימת ההמתנה' : 'נרשמת למשחק'); }); };
    if (pv.confirm === 'late') U.confirmSheet({ title: 'להירשם אחרי הדד-ליין?', text: 'ירד לך קרדיט אחד. מכיוון שהדד-ליין עבר, ביטול יחזיר את הקרדיט רק אם מישהו יעלה במקומך.', ok: 'כן, אני מגיע', danger: true }).then(function (y) { if (y) go(); });
    else if (pv.confirm === 'waitlist') U.confirmSheet({ title: 'להיכנס לרשימת ההמתנה?', text: 'אם יתפנה מקום תעלה אוטומטית וירד לך קרדיט אחד. כניסה לרשימה היא התחייבות להגיע, גם אם תעלה סמוך לדד-ליין.', ok: 'כן, הכנס אותי' }).then(function (y) { if (y) go(); });
    else go();
  }

  function meGuest() {
    var late = V.me.game && V.me.game.phase === 'locked';
    var box = U.openSheet('<h2 class="h">צרף אורח</h2><label class="field">שם האורח<input id="gname" type="text" autocomplete="off" placeholder="דני" maxlength="40"></label>'
      + '<div class="note">ירד קרדיט אחד מהכרטיסייה שלך. אתה אחראי על האורח, וגם הביטול שלו עובר דרכך.</div>'
      + (late ? '<div class="note warn">הדד-ליין עבר: ביטול האורח יחזיר קרדיט רק אם מישהו יעלה במקומו.</div>' : '')
      + '<div class="err" role="alert" style="display:none"></div><div class="btns"><button data-x>חזרה</button><button class="pri" data-ok>צרף</button></div>');
    box.querySelector('[data-x]').onclick = U.closeSheet;
    box.querySelector('[data-ok]').onclick = function () {
      var n = box.querySelector('#gname').value.trim();
      if (!n) { U.sheetError('כתוב את שם האורח'); return; }
      act('register', { guest: n }, function (res) { U.toast(res.status === 'wait' ? n + ' נכנס לרשימת ההמתנה' : n + ' נרשם על חשבונך'); });
    };
  }

  function meCancel() {
    var pv = V.me, mine = pv.myRegs, ph = pv.game.phase;
    var box = U.openSheet('<h2 class="h">מה לבטל?</h2>' + mine.map(function (r) {
      return '<label class="chk"><input type="checkbox" name="cx" value="' + r.regId + '" ' + (r.guest ? '' : 'checked') + '><span>' + (r.guest ? esc(r.guest) + ' <span class="sub">(האורח שלך)</span>' : 'אני (' + esc(pv.me.name) + ')') + (r.status === 'wait' ? ' <span class="sub">· בהמתנה</span>' : '') + '</span></label>';
    }).join('') + (ph === 'open' ? '<div class="note ok">לפני הדד-ליין: הקרדיט חוזר אליך, והראשון ברשימת ההמתנה יקבל את המקום.</div>' : '<div class="note warn">אחרי הדד-ליין: אם יש מישהו ברשימת ההמתנה, הוא עולה אוטומטית והקרדיט חוזר אליך. אם אין, הקרדיט לא חוזר.</div>')
      + '<div class="err" role="alert" style="display:none"></div><div class="btns"><button data-x>חזרה</button><button class="dngfill" data-ok>אשר</button></div>');
    box.querySelector('[data-x]').onclick = U.closeSheet;
    box.querySelector('[data-ok]').onclick = function () {
      var ids = Array.prototype.map.call(box.querySelectorAll('input[name=cx]:checked'), function (i) { return +i.value; });
      if (!ids.length) { U.sheetError('בחר לפחות אחד'); return; }
      act('cancel', { regIds: ids }, function () { U.toast('בוטל'); });
    };
  }

  function meHistory() {
    var pv = V.me;
    var box = U.openSheet('<h2 class="h">ההיסטוריה שלי</h2><div class="note">יתרה נוכחית: ' + pv.me.balance + ' כניסות</div><div class="list" style="max-height:360px;overflow:auto">'
      + (pv.history.length ? pv.history.map(function (h) { return '<div class="it"><div><div>' + esc(h.text) + '</div><div class="sub">' + esc(W.stamp(h.at)) + '</div></div><b>' + (h.delta > 0 ? '+' : '−') + Math.abs(h.delta) + '</b></div>'; }).join('') : '<div class="sub">עדיין אין פעולות.</div>')
      + '</div><div class="btns"><button data-x>סגור</button></div>');
    box.querySelector('[data-x]').onclick = U.closeSheet;
  }

  function linkSheet(pid) {
    var p = findPlayer(pid);
    call('linkMessage', { playerId: pid }).then(function (r) {
      if (!r.ok) { U.toast(r.error); return; }
      var m = r.result;
      var box = U.openSheet('<h2 class="h">קישור אישי ל' + esc(p.name) + '</h2><label class="field">ההודעה שתישלח<textarea readonly>' + esc(m.text) + '</textarea></label>'
        + (CFG.target === 'prod' ? '' : '<div class="note warn">זו גרסת בדיקה: הקישור מוביל לעותק הבדיקות.</div>')
        + '<div class="btns"><button data-copy>העתק הודעה</button><a class="btnlink" href="' + esc(m.whatsappUrl) + '" target="_blank" rel="noopener">שלח בווטסאפ</a></div><div class="btns"><button data-x>סגור</button></div>');
      box.querySelector('[data-x]').onclick = U.closeSheet;
      box.querySelector('[data-copy]').onclick = function () { U.copyText(m.text, 'ההודעה הועתקה'); };
    });
  }

  function playerSheet(pid) {
    var p = findPlayer(pid);
    var tr = V.transfers.filter(function (x) { return x.from === pid || x.to === pid; });
    var box = U.openSheet('<h2 class="h">' + esc(p.name) + '</h2><div class="list"><div class="it"><span class="sub">טלפון</span><span dir="ltr">' + esc(p.phone || 'לא הוזן') + '</span></div><div class="it"><span class="sub">מייל</span><span dir="ltr">' + esc(p.email || 'לא הוזן') + '</span></div><div class="it"><span class="sub">יתרה</span><b>' + p.balance + ' כניסות</b></div><div class="it"><span class="sub">לקח גופיות</span><span>' + p.shirtCount + ' פעמים</span></div></div>'
      + (tr.length ? '<div class="strong">העברות קרדיט</div><div class="list">' + tr.map(transferRow).join('') + '</div>' : '')
      + '<div class="btns">' + (p.isAdmin ? '' : '<button class="pri" data-a="link" data-p="' + pid + '">שלח קישור בווטסאפ</button>') + '<button data-a="manual" data-p="' + pid + '">פתח כרטיסייה</button></div>'
      + (p.isAdmin ? '' : '<div class="btns"><button class="quiet" data-a="newLink" data-p="' + pid + '">צור קישור חדש</button><button class="dng" data-a="remove" data-p="' + pid + '">הסר מהקבוצה</button></div>')
      + '<div class="btns"><button data-x>סגור</button></div>');
    box.querySelector('[data-x]').onclick = U.closeSheet;
  }

  function addPlayerSheet() {
    var box = U.openSheet('<h2 class="h">הוספת שחקן</h2><label class="field">שם<input id="pname" type="text" autocomplete="off" placeholder="אלי"></label>'
      + '<label class="field">טלפון<input id="pphone" type="tel" inputmode="tel" autocomplete="off" placeholder="0501234567" dir="ltr"></label>'
      + '<label class="field">מייל, להתראות<input id="pemail" type="email" inputmode="email" autocomplete="off" placeholder="eli@gmail.com" dir="ltr"></label>'
      + '<div class="err" role="alert" style="display:none"></div><div class="btns"><button data-x>חזרה</button><button class="pri" data-ok>הוסף וצור קישור</button></div>');
    box.querySelector('[data-x]').onclick = U.closeSheet;
    box.querySelector('[data-ok]').onclick = function () {
      var name = box.querySelector('#pname').value.trim();
      act('addPlayer', { name: name, phone: box.querySelector('#pphone').value, email: box.querySelector('#pemail').value.trim() }, function (res) {
        U.toast(name + ' נוסף. שלח לו את הקישור.');
        linkSheet(res.playerId);
      });
    };
  }

  function gearSheet() {
    var gr = V.gear, players = V.players;
    var opt = function (sel) { return '<option value=""' + (sel ? '' : ' selected') + '>לא משויך</option>' + players.map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join(''); };
    var shirts = gr.items.filter(function (x) { return x.id === 'shirts'; })[0];
    var rot = players.slice().sort(function (a, b) { return a.shirtCount - b.shirtCount || a.name.localeCompare(b.name, 'he'); });
    var sug = gr.shirtSuggestion;
    var box = U.openSheet('<h2 class="h">עדכון ציוד</h2>'
      + gr.items.map(function (x) {
        return '<div class="row" style="align-items:flex-end"><label class="field" style="flex:1">' + esc(x.label) + (x.id === 'shirts' ? '' : '') + ' אצל<select data-item="' + esc(x.id) + '">' + opt(x.holder) + '</select></label>'
          + (x.id === 'shirts' ? '' : '<button class="sm quiet" data-rm="' + esc(x.id) + '" aria-label="הסר את ' + esc(x.label) + '">הסר</button>') + '</div>';
      }).join('')
      + (sug ? '<div class="note ok split"><span>התור הבא לגופיות: <b>' + esc(sug.name) + '</b>, לקח ' + sug.count + ' פעמים</span><button class="sm" data-pick="' + sug.id + '">בחר אותו</button></div>' : '')
      + '<div class="row" style="align-items:flex-end"><label class="field" style="flex:1">פריט חדש<input id="newItem" type="text" placeholder="כדור 4 / קונוסים" maxlength="30"></label><button class="sm" data-add>הוסף</button></div>'
      + '<div class="strong">תור הגופיות</div><div class="sub">מי שלקח הכי מעט פעמים מוצע ראשון, מבין הרשומים למשחק. אפשר לבחור כל שחקן אחר ברשימה.</div>'
      + '<div class="list" style="max-height:200px;overflow:auto">' + rot.map(function (p) {
        return '<div class="it"><span>' + esc(p.name) + (shirts && p.id === shirts.holder ? ' <span class="pill">אצלו עכשיו</span>' : '') + (sug && p.id === sug.id ? ' <span class="pill ok">התור הבא</span>' : '') + (gr.shirtSkips.indexOf(p.id) >= 0 ? ' <span class="pill warn">לא יכול השבוע</span>' : '') + '</span><span class="sub">' + p.shirtCount + ' פעמים</span></div>';
      }).join('') + '</div>'
      + '<div class="err" role="alert" style="display:none"></div><div class="btns"><button data-x>חזרה</button><button class="pri" data-ok>שמור</button></div>');
    box.querySelector('[data-x]').onclick = U.closeSheet;
    var pick = box.querySelector('[data-pick]');
    if (pick) pick.onclick = function () { box.querySelector('select[data-item="shirts"]').value = pick.getAttribute('data-pick'); };
    box.querySelector('[data-add]').onclick = function () {
      var label = box.querySelector('#newItem').value.trim();
      if (!label) { U.sheetError('כתוב שם לפריט'); return; }
      act('addGearItem', { label: label }, function () { U.toast('נוסף: ' + label); gearSheet(); });
    };
    Array.prototype.forEach.call(box.querySelectorAll('[data-rm]'), function (b) {
      b.onclick = function () { act('removeGearItem', { itemId: b.getAttribute('data-rm') }, function () { U.toast('הפריט הוסר'); gearSheet(); }); };
    });
    box.querySelector('[data-ok]').onclick = function () {
      var holders = {};
      Array.prototype.forEach.call(box.querySelectorAll('select[data-item]'), function (s) {
        var id = s.getAttribute('data-item'), cur = gr.items.filter(function (x) { return x.id === id; })[0].holder;
        var v = s.value ? +s.value : null;
        if (v !== cur) holders[id] = v;
      });
      if (!Object.keys(holders).length) { U.closeSheet(); U.toast('לא היה שינוי'); return; }
      act('setGear', { holders: holders }, function () { U.toast('הציוד עודכן'); });
    };
  }

  function expenseSheet() {
    var box = U.openSheet('<h2 class="h">רישום הוצאה מהפייבוקס</h2>'
      + '<label class="field">על מה<select id="xkind"><option value="matnas">כרטיסיית מתנ"ס</option><option value="ball">כדורים</option><option value="shirts">גופיות</option><option value="other">אחר</option></select></label>'
      + '<label class="field">סכום ב-₪<input id="xamt" type="number" min="1" step="1" inputmode="numeric" placeholder="' + V.settings.matnasDefault + '"></label>'
      + '<label class="field">הערה, למשל למי הועבר הכסף<input id="xnote" type="text" autocomplete="off" placeholder="החזר לעומר על 2 כדורים"></label>'
      + '<div class="note">בכרטיסיית מתנ"ס, סכום ריק נרשם כ-' + W.nis(V.settings.matnasDefault) + '.</div>'
      + '<div class="err" role="alert" style="display:none"></div><div class="btns"><button data-x>חזרה</button><button class="pri" data-ok>רשום</button></div>');
    box.querySelector('[data-x]').onclick = U.closeSheet;
    box.querySelector('[data-ok]').onclick = function () {
      var raw = box.querySelector('#xamt').value;
      act('addExpense', { kind: box.querySelector('#xkind').value, amount: raw === '' ? '' : Math.round(+raw), note: box.querySelector('#xnote').value }, function (res) {
        U.toast('ההוצאה נרשמה', function () { act('deleteCash', { cashId: res.cashId }, function () { U.toast('ההוצאה נמחקה'); }); });
      });
    };
  }

  function amountSheet(title, note, label, action, done) {
    var box = U.openSheet('<h2 class="h">' + esc(title) + '</h2><div class="note">' + esc(note) + '</div><label class="field">' + esc(label) + '<input id="amt" type="number" step="1" inputmode="numeric"></label>'
      + '<div class="err" role="alert" style="display:none"></div><div class="btns"><button data-x>חזרה</button><button class="pri" data-ok>עדכן</button></div>');
    box.querySelector('[data-x]').onclick = U.closeSheet;
    box.querySelector('[data-ok]').onclick = function () {
      var v = box.querySelector('#amt').value;
      if (v === '') { U.sheetError('הקלד סכום'); return; }
      act(action, action === 'reconcile' ? { actual: Math.round(+v) } : { amount: Math.round(+v) }, done);
    };
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    var a = b.getAttribute('data-a'), pid = +b.getAttribute('data-p'), iid = +b.getAttribute('data-i');
    if (a === 'reload') { V = null; load(); return; }
    if (!V) return;
    if (a === 'tab') { setTab(b.getAttribute('data-t')); render(); window.scrollTo(0, 0); }
    if (a === 'approve') decidePayment(iid, true);
    if (a === 'reject') decidePayment(iid, false);
    if (a === 'meReg') meRegister();
    if (a === 'meGuest') meGuest();
    if (a === 'meCancel') meCancel();
    if (a === 'meHistory') meHistory();
    if (a === 'manual') manualCard(pid);
    if (a === 'wa') U.copyText(V.whatsapp, 'הרשימה הועתקה. הדבק בקבוצה.');
    if (a === 'cancelGame') U.confirmSheet({ title: 'לבטל את המשחק?', text: 'כל הנרשמים, כולל אורחים, יקבלו את הקרדיט בחזרה ומייל. רשימת ההמתנה תתרוקן.', ok: 'כן, בטל משחק', danger: true })
      .then(function (y) { if (y) act('cancelGame', {}, function () { U.toast('המשחק בוטל והקרדיטים הוחזרו'); }); });
    if (a === 'gear') gearSheet();
    if (a === 'addPlayer') addPlayerSheet();
    if (a === 'player') playerSheet(pid);
    if (a === 'link') { U.closeSheet(); linkSheet(pid); }
    if (a === 'newLink') {
      var p1 = findPlayer(pid);
      U.confirmSheet({ title: 'ליצור קישור חדש ל' + p1.name + '?', text: 'הקישור הנוכחי יפסיק לעבוד מיד. תצטרך לשלוח ל' + p1.name + ' את הקישור החדש. השתמש בזה אם הקישור דלף או שהוחלף טלפון.', ok: 'צור קישור חדש', danger: true })
        .then(function (y) { if (y) act('newLink', { playerId: pid }, function () { linkSheet(pid); }); });
    }
    if (a === 'remove') {
      var p2 = findPlayer(pid);
      U.confirmSheet({ title: 'להסיר את ' + p2.name + ' מהקבוצה?', text: 'הקישור שלו יפסיק לעבוד מיד. רישומים פתוחים שלו יבוטלו, והקרדיט עליהם יחזור ליתרה. יתרת הכניסות שלו (' + p2.balance + ') נשמרת ותחזור אליו אם תחזיר אותו לקבוצה. אין החזר כספי.', ok: 'הסר מהקבוצה', danger: true })
        .then(function (y) { if (y) act('removePlayer', { playerId: pid }, function () { U.toast(p2.name + ' הוסר. הקישור שלו כבר לא עובד.'); }); });
    }
    if (a === 'restore') act('restorePlayer', { playerId: pid }, function () { U.toast(findPlayer(pid).name + ' חזר לקבוצה. שלח לו את הקישור החדש.'); linkSheet(pid); });
    if (a === 'skip') {
      var d = b.getAttribute('data-d'), on = b.getAttribute('data-s') === '1';
      act('setSkipDate', { date: d, skip: on }, function () { U.toast(on ? 'שני ' + W.ymdLabel(d) + ' מסומן כדילוג. לא ייפתח בו רישום.' : 'שני ' + W.ymdLabel(d) + ' חזר להיות יום משחק'); });
    }
    if (a === 'expense') expenseSheet();
    if (a === 'recon') amountSheet('התאמה מול פייבוקס', 'יתרה באפליקציה: ' + W.nis(V.cash.balance) + '. הקלד את היתרה שמופיעה עכשיו בפייבוקס. אם יש הפרש, הוא יירשם כתנועת התאמה.', 'יתרה בפייבוקס ב-₪', 'reconcile',
      function (res) { U.toast(res.diff ? 'נרשמה התאמה של ' + (res.diff > 0 ? '+' : '') + W.nis(res.diff) : 'הקופה מתואמת לפייבוקס. אין הפרש.'); });
    if (a === 'opening') amountSheet('יתרת פתיחה', 'הקלד את היתרה שמופיעה היום בפייבוקס של הקבוצה. מכאן והלאה כל כרטיסייה והוצאה נרשמות אוטומטית.', 'יתרה בפייבוקס ב-₪', 'setOpeningBalance', function () { U.toast('יתרת הפתיחה נרשמה'); });
    if (a === 'delCash') {
      var en = V.cash.entries.filter(function (x) { return x.id === iid; })[0];
      U.confirmSheet({ title: 'למחוק את התנועה?', text: (en.note || KIND[en.kind]) + ' (' + W.nis(en.amount) + '). היתרה תתעדכן בהתאם.', ok: 'מחק תנועה', danger: true })
        .then(function (y) { if (y) act('deleteCash', { cashId: iid }, function () { U.toast('התנועה נמחקה'); }); });
    }
    if (a === 'undoTr') {
      var x = V.transfers.filter(function (t) { return t.id === iid; })[0];
      U.confirmSheet({ title: 'לבטל את ההעברה?', text: x.amount + ' כניסות יחזרו מ' + x.toName + ' ל' + x.fromName + '. שניהם יקבלו מייל.', ok: 'בטל העברה', danger: true })
        .then(function (y) { if (y) act('undoTransfer', { transferId: iid }, function () { U.toast('ההעברה בוטלה'); }); });
    }
  });

  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && V && !document.querySelector('.scrim')) load(); });

  load();
})();
