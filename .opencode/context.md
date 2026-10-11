# 🧠 ملخص السياق المعماري والتقني لبوت ASTRO (Nova WhatsApp Bot)

هذا الملف تم إعداده ونقله ليكون بمثابة الذاكرة الكاملة والسياق الشامل لنموذج الذكاء الاصطناعي ومطور المشروع في **OpenCode**.

---

## 📌 1. نظرة عامة على المشروع (Project Overview)
- **اسم المشروع:** ASTRO BOT (Nova WhatsApp Bot)
- **طبيعة البوت:** بوت واتساب غير رسمي فائق التطور يعمل بمحركين متكاملين:
  1. **محرك الرسائل والأوامر:** مبني على مكتبة `@rexxhayanasi/elaina-baileys` لإدارة الشات، الجروبات، الألعاب، الحماية، وتوليد الصور والفيديوهات.
  2. **محرك المكالمات الحية الأصلية (Native In-App VoIP Calls):** مبني على مكتبة `@zapo-js/voip` و `@zapo-js/voip-media` للرد المباشر داخل شاشة واتساب كجهاز مرافق (Companion Device) دون الحاجة لروابط خارجية.
- **شخصية البوت (Astro Persona):** شاب مصري جدع عمره 25 سنة، خفيف الظل، يتحدث بالعامية المصرية الأصيلة 100%، وفيّ ومخلص لأصحابه.

---

## 🎙️ 2. محرك المكالمات الصوتية الحية (Gemini 3.8 Live VoIP Architecture)
- **النموذج النشط:** `gemini-3.8-live` عبر بروتوكول WebSocket المباشر (`v1beta BidiGenerateContent`).
- **خامة الصوت:** `Puck` (صوت رجل هادئ ورقيق).
- **التفكير اللحظي ومقاطعة الكلام:** مفعّل (`thinkingLevel: LOW` مع دعم `barge-in / interrupted`).
- **معالجة وتدفق الصوت (Audio Resampling Pipeline):**
  - **صوت المايكروفون القادم من واتساب:** `16kHz Float32Array` يُحوّل عبر `core/audio-resampler.js` إلى `16kHz 16-bit Int16 LE PCM Buffer` ويُرسل للـ Live WebSocket.
  - **صوت أسترو القادم من Gemini Live:** `24kHz 16-bit Int16 LE PCM Buffer` يُعاد تشكيله لحظياً عبر Linear Interpolation إلى `16kHz Float32Array` ويُضخ في هاتف المتصل عبر `client.voip.feedLiveAudio(callId, samples)`.

---

## 🛡️ 3. حل مشكلة توجيه شبكة المكالمات في السحابة (IPv4 Relay Protection)
- **المشكلة:** خوادم واتساب تُعلن عن مسارات IPv6 و IPv4 في حزم `<relay>`. في حاويات السحابة (Docker / Cloud)، تفشل اتصالات IPv6 فوراً (`ice_connection_failed`).
- **الحل المطبق والمدمج:** باتش فوري في `core/zapo-engine.js` يقوم بتصفية العناوين وتوجيه جميع حزم WebRTC / SCTP عبر خوادم `IPv4` المباشرة فقط (`102.132.x.x` / `57.144.x.x` / `157.240.x.x`).

---

## 💾 4. حفظ واسترجاع الجلسات (Persistent Multi-Device Sessions)
- **الجلسة الرئيسية (Baileys):** مجلد `/app/session` يُحفظ تلقائياً في جدول `session_storage` بقاعدة بيانات PostgreSQL.
- **جلسة المكالمات (Zapo VoIP):** مجلد `/app/session_voip` ومخزن SQLite `voip.sqlite` يُحفظ تلقائياً في جدول `session_voip_storage` بقاعدة بيانات PostgreSQL مع تشفير Base64 للملفات الثنائية، مما يمنع طلب كود QR نهائياً عند كل إعادة نشر.

---

## ☁️ 5. الاستضافة والنشر (CranL Cloud Infrastructure)
- **المستودع:** `https://github.com/roplizeramr-blip/nova-whatsapp-bot.git` (الفرع: `main`)
- **معرف التطبيق في CranL:** `31970f47-f023-4ab3-9a6d-85af69c85083`
- **الرابط المباشر:** `https://nova-bot-x3unfm.cranl.net`
- **النشر التلقائي:** أي `git push origin main` يُطلق عملية بناء ونشر سحابية فورية.

---

## 👑 6. المطورون والمالكون المعتمدون (Owners)
1. **عمرو (المطور والمالك الأساسي):** `201044626335`
2. **أدهم (المطور والصانع الأساسي للبوت):** `201273990719` / `263488291246130@lid`
3. **شروق (حبيبة أسترو المقربة):** `201002135088` / `40171382817021@lid`
