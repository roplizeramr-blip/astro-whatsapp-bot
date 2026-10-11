# 📞 سيرفر المكالمات الصوتية

سيرفر مستقل كيوصّل **مكالمة WhatsApp حقيقية** وكيحاورد معاها بـ **Gemini Live** (صوت داخل وخارج لحظي).

---

## 🏗️ المعمارية: جوج سيرفرين، نفس الحساب

```
   الحساب 48732079554
          │
    ┌─────┴──────────────────────────────┐
    │                                    │
┌───▼────────────────┐          ┌────────▼───────────────┐
│ 🤖 البوت الرايسي   │          │ 📞 سيرفر المكالمات      │
│    index.js        │          │    voip-server/        │
│                    │          │                        │
│ • الرسائل          │          │ • يرد على النداء       │
│ • 107 أمر          │          │ • Gemini Live ⇄ VoIP   │
│ • لوحة :8080       │          │ • لوحة :8090           │
│                    │          │                        │
│ session/           │          │ session/               │
│ جهاز مرتبط #1      │          │ جهاز مرتبط #2          │
│                    │          │                        │
│ 👁️ غير مراقب       │          │ ✅ هو اللي يجاوب       │
└────────────────────┘          └────────────────────────┘
```

**كل واحد:** process منفصل · session منفصل · بورت منفصل · **ماكيستوردش والو من الاخر**.

---

## ⚠️ القاعدة الذهبية — عميل واحد فـ الوقت

> **ما تربطش جهازين فنفس الوقت.**

كان الـ Zapo والـ Baileys واربين مع بعض → واتساب خلط `advSecretKey` بيناتهم →
`Invalid account signature` → `force_logout` → **ماتت جلستا البوت الرايسي**.

### الترتيب الصحيح

```
1️⃣  شغّل البوت الرايسي → ربّطو  → تأكد خدام
2️⃣  ✅ من بعد شغّل هاد السيرفر → ربّطو
3️⃣  ❌ عمرك ما تعاودش 1 و 2 فنفس الوقت
```

---

## 🔧 علاش البوت الرايسي ما كيجلوبش المكالمات

البوت الرايسي فيه غير `core/call-observer.js` — **read-only**:

```js
sock.ev.on('call', (events) => {
  for (const call of events) {
    console.log(`👁️ شفت عرض مكالمة ${call.status} من ${call.from}`);
    // ❌ ممنوع: sock.rejectCall(...)  ← كيقتلها على الجهاز الآخر
    // ❌ ممنوع: sock.acceptCall(...)  ← كيسرقها من هاد السيرفر
  }
});
```

---

## 🌐 الوصول للوحة — دومين واحد

المنصة كتفتح **بورت واحد** للعموم (8080). البورت 8090 خدّام **داخلياً فقط**.

بدل ما نفتح بورث ثاني، البوت كيدير **reverse proxy**:

```
https://bot.cranl.net/voip/*   →   http://127.0.0.1:8090/*
```

| | |
|---|---|
| **اللوحة** | `https://bot.cranl.net/voip` |
| **محلياً** | `http://localhost:8090` (بلا proxy) |
| **المسار** | `VOIP_MOUNT` (الافتراضي `/voip`) |
| **API** | `https://bot.cranl.net/voip/api/status` |

المستخدم كيشوف **دومين واحد**، والمنصة ما تحتاجش تفتح بورث زايد.

### كيفاش خدام

```
المتصفح  ──▶  :8080/voip/api/status
                    │
                    ▼  proxyVoip()  (core/qr-server.js)
              :8090/api/status
                    │
                    ▼
             سيرفر المكالمات
```

الـ proxy بلا مكتبات خارجية — `fetch` + streams ديال Node:

| | |
|---|---|
| المسار | `req.url.slice(VOIP_MOUNT.length)` → يشيل `/voip` |
| الـ header | `x-forwarded-prefix: /voip` → السيرفر يقدر يحيد الـ prefix |
| الصفحة | `BASE = "/voip"` فالـ JS → `fetch(BASE + '/api/status')` |
| إلا 8090 مطفي | `502` بـ JSON مفهوم، ماشي timeout |

`start.js` كيمرّر `VOIP_MOUNT` للخدمتين، وإلا الصفحة غادي تطلب `/api/status`
من البوت بدل سيرفر المكالمات.

---

## 🚀 التشغيل

### 🟢 فـ المنصة (موصى بيه) — أمر واحد

```bash
node start.js
```

الملف `start.js` فـ الجذر كيشغّل **الجوج** (البوت الرايسي + هاد السيرفر) كأдельت
منفصلتين، مع إعادة تشغيل تلقائية وإيقاف نظيف. هو هذا الـ `CMD` ديال الـ Dockerfile.

### 🔵 محلياً — خدمة وحدة

```bash
# البوت الرايسي (الجذر)
node --env-file=.env index.js
# اللوحة: http://localhost:8080

# هاد السيرفر
cd voip-server
node --env-file=../.env index.js
# اللوحة: http://localhost:8090
```

> **Node ≥ 20** ضروري (`@roamhq/wrtc` ما عندو prebuild لـ Node 24).
>
> ⚠️ فـ Docker/المنصة **ما تديرش** `--env-file`: ملف `.env` ما كاينش هناك،
> و Node 20 كيخرج بـ `exit 9` إلا لقي `--env-file` على ملف ناقص.
> المتغيرات كيوصلو مباشرة من البيئة ديال المنصة.

---

## 🔗 الربط (مرة واحدة لكل سيرفر)

1. شغّل السيرفر → الـ QR أو الكود كيبان فـ اللوحة
2. واتساب → **الإعدادات → الأجهزة المرتبطة → ربط جهاز**
3. QR صوّره، ولا **الربط برقم الهاتف** → دخل الكود
4. ✅ لازم تشوف **"تم ربط…"** فـ اللوج قبل ما تمشي للخطوة الجاية

---

## 🎙️ كيفاش خدام

```
المتصل يحدّث          ← WhatsApp relay ← WASM ← call.on('audio', pcm 16kHz)
                                             ↓
                                        LiveSession (Gemini)
                                             ↓
                              'audio16k' → getLiveFeeder().push()
                                             ↓
              WASM → WhatsApp relay → 📱 المتصل يسمع
```

| المرحلة | التقنية |
|---|---|
| النداء | Baileys (`chama-bailez-pro`) |
| الوسائط | WhatsApp Web VoIP **WASM** + WebRTC |
| الصوت | 16 kHz mono PCM (Opus) |
| الذكاء | Gemini Live (`gemini-3.8-live`, صوت Puck) |

---

## 🔬 الـ patch — ليه خاصو

`AudioFeeder` الأصلي فـ `chama-bailez-pro` كيشتغل **بملف صوت فقط** (mp3/wav كيدوّرو).
حنا خصنا نوجّهو صوت Gemini **لايف** → زدنا **ring buffer**:

```js
live.on('audio16k', (pcm) => getLiveFeeder()?.push(pcm));  // Gemini → المكالمة
call.on('audio',  (pcm) => live.sendAudio(pcm));           // المتصل → Gemini
live.on('interrupted', () => getLiveFeeder()?.flush());    // barge-in
```

| | |
|---|---|
| الملف | `scripts/patch-caller.js` |
| الهدف | `node_modules/chama-bailez-pro/lib/Caller/audio-feeder.mjs` |
| التشغيل | تلقائي فـ `postinstall` |
| إعادة التطبيق | `npm run repatch` |
| الأمان | version-guarded — إلا تبدّلت المكتبة كيخرج بخطأ واضح |

يعطي: `push(pcm)` · `flush()` · `queued` · `getLiveFeeder()`

---

## ⚙️ الإعدادات

كلشي فـ `.env` ديال الأب:

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `BOT_NUMBER` | `48732079554` | رقم الحساب |
| `VOIP_PORT` | `8090` | بورت اللوحة |
| `GEMINI_API_KEY` | — | **مطلوب** |
| `GEMINI_LIVE_MODEL` | `gemini-3.8-live` | موديل Gemini Live |
| `VOIP_MAX_CALL_MS` | `600000` | أقصى مدة مكالمة |
| `VOIP_GREETING` | تحية استرو | أول كلام |

---

## ⚠️ تحذيرات

- كل هاد المكتبات **مخالفة لـ ToS ديال واتساب** → خطر حظر الحساب. جرب برقم ثانٍ.
- Volta ديال WASM كيتكسّر مع كل تحديث ديال WhatsApp Web → خاص تجدد `assets/wasm/`.
- `DATABASE_URL` فـ `.env` كايشير لـ localhost بلا PostgreSQL → تحذيرات غير ضارة.

---

## 📂 الملفات

```
voip-server/
├── index.js               ← السيرفر: Baileys + VoIP + لوحة
├── live.js                ← جسر Gemini Live (16k ⇄ 24k)
├── config.js              ← الإعدادات
├── package.json
├── scripts/patch-caller.js ← patch ديال البث لايف
├── session/               ← جلسة الجهاز #2 (مستثناة من git)
└── README.md
```