# 🚀 دليل الرفع على منصة جديدة

> المشروع الجديد: **astro-whatsapp-bot**
> https://github.com/roplizeramr-blip/astro-whatsapp-bot

---

## 1️⃣ احذف التطبيق القديم (يدوي)

⚠️ `api.cranl.net` مات — ما نقدرش نحذف برمجياً. من اللوحة:

1. ادخل لوحة **CranL** → التطبيق `nova-bot-x3unfm`
2. **Settings → Danger Zone → Delete App**
3. ✅ من بعد احذف قاعدة البيانات `astro_bot` كذلك
4. 📦 قبل الحذف: البيانات محفوظة فـ `_platform-backup/` ومش هتضيع

---

## 2️⃣ أنشئ التطبيق الجديد

| | |
|---|---|
| **المصدر** | GitHub → `roplizeramr-blip/astro-whatsapp-bot` |
| **الفرع** | `main` |
| **Root** | `/` (الـ Dockerfile فالجذر) |
| **النوع** | Docker |

الـ `Dockerfile` جاهز: Node 20 + ffmpeg + yt-dlp + الخدمتين.

---

## 3️⃣ المنفذ

| | |
|---|---|
| **HTTP Port** | `8080` |

⚠️ **ما كاينش بورت ثاني** — المكالمات كايوصلو عبر `/voip` على نفس الدومين (reverse proxy داخلي).

---

## 4️⃣ متغيرات البيئة (إجبارية)

```bash
# الذكاء الاصطناعي
GROQ_API_KEYS=gsk_xxx,gsk_yyy     # مفاتيح مفصولين بفاصلة
GEMINI_API_KEY=AIza...            # للمكالمات الصوتية

# رقم البوت الجديد
BOT_NUMBER=201226110887
PAIRING_PHONE=201226110887

# الرابط العام (باش /call و /voip يخدموا صح)
CRANL_APP_URL=https://your-app.cranl.net

# سيرفر المكالمات (نفس 원طة الدومين)
VOIP_MOUNT=/voip
VOIP_PORT=8090

# المالك
OWNER_PHONE=201226110887
OWNERS=201226110887

# البوت
BOT_NAME=ASTRO BOT
BOT_PREFIX=.
PORT=8080
NODE_ENV=production
```

📌 **`DATABASE_URL`**: المنصة كاتعطيك PostgreSQL تلقائياً — إلا ما كانش، حط:

```
postgres://user:pass@host:5432/dbname?sslmode=require
```

---

## 5️⃣ الجداول كايتعملوا تلقائياً

أول إقلاع كايعمل:

| الجدول | الدور |
|---|---|
| `session_storage` | جلسة البوت الرايسي |
| `session_voip_storage` | جلسة سيرفر المكالمات **(مستقلة)** |
| `bot_kv` | الذاكرة، الاقتصاد، الإعدادات |

✅ **نقطة بداية نظيفة** — الجلسات فارغة، والبوت كايطلب QR لتاع الرقم الجديد.

---

## 6️⃣ الربط (أول مرة)

### أ) البوت الرايسي

1. ادخل **لوجات** التطبيق → تقليب QR
2. واتساب → **الإعدادات → الأجهزة المرتبطة → ربط جهاز**
3. صوّر الـ QR
4. ✅ خاصك تشوف `✅ ASTRO BOT شغال! (مرتبط بـ 201226110887)`

### ب) سيرفر المكالمات

1. `https://your-app.cranl.net/voip` → الـ QR ولا الكود
2. نفس الطريقة
3. ✅ كود الربط كايبان فاللوحة

---

## 7️⃣ التحقق

```bash
# لوحة المكالمات (نفس الدومين)
https://your-app.cranl.net/voip

# فحص الصحة
https://your-app.cranl.net/health

# حالة المكالمات
https://your-app.cranl.net/voip/api/status
```

---

## 🆘 إذا وقف شيئ

| | |
|---|---|
⛔ VoIP ما كايخدمش فـ كل المنصات — يحتاج UDP/WebRTC مفتوح
| الذكاء ما جاوبش | تحقّق `GROQ_API_KEYS` |
| QR ما بانش | شوف اللوجات — `📲 افتح واتساب...` |

---

## 📦 بالنسبة للبيانات القديمة

فـ `_platform-backup/`:

| الملف | المحتوى |
|---|---|
| `session-export.json` | جلسة WhatsApp كاملة (13,319 ملف) لـ `201226110887` |
| `platform-stats.json` | إحصائيات + قائمة 10 أشخاص |

⚠️ **هاذا مش متتبّع فـ git** (مستثنى). ولا تستوردو إلا إلا بغيتي تسترجع الذاكرة ديال الناس. للبداية النظيفة: **سيبو**.
