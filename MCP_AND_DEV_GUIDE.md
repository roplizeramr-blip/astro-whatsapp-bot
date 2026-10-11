# 🚀 دليل التطوير وربط الـ MCP لبوت ASTRO (Nova WhatsApp Bot)

تم استيراد وتجهيز المشروع بالكامل في هذا المجلد ليكون جاهزاً للفتح والتطوير فوراً في أي محرر أو بيئة تطوير ذكية (Cursor, VS Code, Windsurf, Claude Code, Cline, Roo Code, OpenCode).

---

## 📂 مسار المشروع ومعلومات السيرفر

- **المسار المحلي:** `C:\Users\East-Sound\Desktop\nova-whatsapp-bot`
- **مستودع GitHub:** `https://github.com/roplizeramr-blip/nova-whatsapp-bot.git`
- **الفرع الأساسي:** `main`
- **المنصة السحابية المرفوع عليها البوت:** **CranL Cloud**
- **معرف التطبيق في CranL:** `31970f47-f023-4ab3-9a6d-85af69c85083`
- **رابط التطبيق الحي:** `https://nova-bot-x3unfm.cranl.net`
- **لوحة التحكم المباشرة:** `https://nova-bot-x3unfm.cranl.net` (أو `http://localhost:8080`)
- **غرفة المكالمات الصوتية الحية:** `https://nova-bot-x3unfm.cranl.net/call`

---

## 🔌 ملفات إعدادات الـ MCP الجاهزة بالمشروع

تم تجهيز ملفات MCP متوافقة تلقائياً مع جميع المحررات:

1. **Cursor IDE:**
   - المسار: `.cursor/mcp.json`
2. **VS Code / Cline / Roo Code / Continue:**
   - المسار: `.vscode/mcp.json`
3. **Windsurf & Universal MCP Clients:**
   - المسار: `.mcp.json`
4. **Claude Desktop:**
   - المسار: `claude_desktop_config.json`

### 🛠️ خوادم MCP المجهزة داخل الملفات:

| اسم الخادم | الأداة | الوظيفة |
|---|---|---|
| `github` | `@modelcontextprotocol/server-github` | للتحكم الكامل في مستودع GitHub (رفع تعديلات، إنشاء Pull Requests، تعديل الملفات، فحص الكود) مع التوكن المدمج |
| `git` | `@modelcontextprotocol/server-git` | لإدارة عمليات Git المحلية مباشرة داخل الـ IDE |
| `gemini-live-docs` | `@google/gemini-mcp-server` | للوصول لأحدث وثائق نماذج Google Gemini و Gemini 3.8 Live API |

---

## ⚡ كيف يتم النشر التلقائي على منصة CranL بعد التعديل؟

منصة **CranL** مربوطة بمستودع GitHub بشكل مباشر (Continuous Deployment):

1. قم بأي تعديل برمجى في المشروع داخل الـ IDE المفضل لك.
2. ارفع التعديلات إلى GitHub بأمر بسيط:
   ```bash
   git add .
   git commit -m "تحديث ميزة جديدة"
   git push origin main
   ```
3. بمجرد تنفيذ الـ `git push`، ستقوم منصة **CranL** بسحب الكود وبناء الحاوية ونشر التحديث تلقائياً خلال ثوانٍ معدودة دون الحاجة للتدخل اليدوي!

---

## 💻 التشغيل المحلي (Local Development)

لو أردت تجربة وتشغيل البوت محلياً على جهازك:

1. تثبيت الحزم:
   ```bash
   npm install
   ```
2. تشغيل البوت:
   ```bash
   npm start
   ```
   أو مع المراقبة والتحديث التلقائي:
   ```bash
   npm run dev
   ```

---

## 🔐 مفاتيح وبيانات البيئة (.env)

ملف `.env` موجود وجاهز بكافة الإعدادات المسبقة:
- `GEMINI_API_KEY`: مفتاح Gemini 3.8 Live المباشر
- `GEMINI_LIVE_MODEL`: `gemini-3.8-live`
- `AI_PRIMARY`: `inception` (Mercury 2.5)
- `GROQ_MODEL`: `qwen/qwen3.8-27b`
- `PORT`: `8080`
- `OWNERS`: قائمة أرقام المطورين والمالكين المعتمدين
