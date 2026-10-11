// 👁️ مراقب المكالمات — يراقب فقط، ما كيتدخلش أبداً
//
// ⚠️ قاعدة ذهبية: البوت الرايسي هو سيرفر الرسائل.
//    سيرفر المكالمات (voip-server) هو اللي كيرد على النداء.
//    هنا غير كنسجلو بأننا شفنا العرض — بلا ack، بلا reject.
//
// ❌ ممنوع منعاً باتاً:
//    sock.ev.on('call', c => sock.rejectCall(...))   ← هذا كيقتل المكالمة على الجهاز الآخر
//    sock.ev.on('call', c => sock.acceptCall(...))   ← هذا كيسرقها من سيرفر المكالمات

/**
 * يربط مراقب المكالمات على السوكيت.
 * آمن تماماً: فقط console.log + عدّاد.
 */
export function attachCallObserver(sock, tag = 'MAIN') {
  if (!sock?.ev?.on) return;

  sock.ev.on('call', (events) => {
    for (const call of events) {
      // read-only — ما كنسيفطو والو
      console.log(
        `[${tag}] 👁️ شفت عرض مكالمة ${call.status} من ${call.from ?? '؟'}` +
          ' (غير مراقبة — سيرفر المكالمات غادي يجاوب)'
      );
    }
  });
}