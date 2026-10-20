/**
 * עדכון "אופטימי": המסך מתעדכן מיד אחרי לחיצה על "הירשם", "צרף אורח" או "בטל",
 * עוד לפני שהשרת ענה (שזה לוקח 2–3 שניות בגלל הדרך לגוגל). כשהתשובה מגיעה היא מחליפה את החיזוי,
 * ואם השרת דחה (למשל מישהו תפס את המקום האחרון שנייה לפני), המסך חוזר למצב הקודם.
 * רק לפעולות האלה. תשלומים והעברות מחכים לאישור השרת.
 *
 * predict(view, action, args) מקבל תצוגת שחקן (KS.playerView) ומחזיר את התצוגה הצפויה, או null אם אין חיזוי בטוח.
 */
(function (root) {
  'use strict';

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function predict(view, action, args) {
    if (!view || !view.game) return null;
    var v = clone(view), g = v.game, me = v.me;
    if (g.phase !== 'open' && g.phase !== 'locked') return null;
    args = args || {};

    if (action === 'register') {
      var guest = args.guest ? String(args.guest).trim() : null;
      if (!guest && v.myRegs.some(function (r) { return !r.guest; })) return null;
      if (me.available < 1) return null;
      var label = guest ? guest + ' (אורח של ' + me.name + ')' : me.name;
      var reg = { regId: -1, hostId: me.id, guest: guest, label: label, pending: true };
      if (g.free > 0) {
        g.in.push(reg);
        g.counts.total++;
        if (guest) g.counts.guests++; else g.counts.players++;
        g.free--;
        me.balance--;
        me.available--;
        v.myRegs.push({ regId: -1, guest: guest, status: 'in', label: label, waitPos: null, pending: true });
      } else {
        g.wait.push(reg);
        g.counts.wait++;
        me.available--;
        me.reserved++;
        v.myRegs.push({ regId: -1, guest: guest, status: 'wait', label: label, waitPos: g.wait.length, pending: true });
      }
      if (!guest) v.selfRegister = { error: 'שומר...', code: 'pending' };
    } else if (action === 'cancel') {
      var ids = args.regIds || [];
      var gone = v.myRegs.filter(function (r) { return ids.indexOf(r.regId) >= 0; });
      if (!gone.length) return null;
      gone.forEach(function (r) {
        var drop = function (list) { for (var i = 0; i < list.length; i++) if (list[i].regId === r.regId) return list.splice(i, 1)[0]; return null; };
        if (r.status === 'wait') {
          drop(g.wait);
          g.counts.wait--;
          me.reserved--;
          me.available++;
        } else {
          var x = drop(g.in) || { regId: r.regId, hostId: me.id, guest: r.guest, label: r.label };
          g.counts.total--;
          if (r.guest) g.counts.guests--; else g.counts.players--;
          g.free++;
          if (g.phase === 'open') { me.balance++; me.available++; }
          else g.released.push(x);
        }
      });
      v.myRegs = v.myRegs.filter(function (r) { return ids.indexOf(r.regId) < 0; });
      if (gone.some(function (r) { return !r.guest; })) {
        v.selfRegister = { status: g.free > 0 ? 'in' : 'wait', confirm: g.free > 0 ? (g.phase === 'locked' ? 'late' : null) : 'waitlist' };
      }
    } else return null;

    me.lowCredit = me.balance <= (v.settings ? v.settings.lowCreditThreshold : 2);
    v.pending = true;
    return v;
  }

  var api = { predict: predict };
  root.KSOpt = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
