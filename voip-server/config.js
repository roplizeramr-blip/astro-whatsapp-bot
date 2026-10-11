// ⚙️ إعدادات سيرفر المكالمات المستقل — كل شي منفصل عن البوت الرئيسي
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = (k, fallback) => process.env[k] ?? fallback;

export const cfg = {
  // 📞 رقم البوت — كايجي من .env / متغير البيئة ديال المنصة (BOT_NUMBER).
  //    الافتراضي غير للتطوير المحلي.
  botNumber: env('BOT_NUMBER', '201226110887').replace(/\D/g, ''),

  // 🔌 بورت لوحة التحكم ديال السيرفر المستقل
  port: Number(env('VOIP_PORT', 8090)),

  // 🔀 المسار العام للوحة (reverse proxy). فـ السحابة: /voip
  //    محلياً: '' (الصفحة كتخدم على الجذر مباشرة)
  mount: env('VOIP_MOUNT', ''),

  // 🗄️ مجلد جلسة Zapo الخاص بهذا السيرفر (مستقل عن البوت)
  sessionDir: join(__dirname, 'session'),

  // 🧠 Gemini Live
  geminiApiKey: env('GEMINI_API_KEY', ''),
  geminiModel: env('GEMINI_LIVE_MODEL', 'gemini-3.8-live'),

  // 🤖 شخصية استرو
  botName: env('BOT_NAME', 'ASTRO BOT'),
  ownerNumber: env('OWNER_PHONE', '201044626335').replace(/\D/g, ''),

  // ⏱️ أقصى مدة للمكالمة الواحدة (ms)
  maxCallMs: Number(env('VOIP_MAX_CALL_MS', 10 * 60 * 1000)),

  // 👋 التحية الأولى (كتيوطيها Gemini فـ صوت)
  greeting: env(
    'VOIP_GREETING',
    'ألو يا فندم! أنا استرو.. سامعك يا باشا، قولّي إيه الأخبار؟'
  ),
};

if (!cfg.geminiApiKey) {
  console.error('❌ GEMINI_API_KEY مش موجود — حطّو فالـ .env');
  process.exit(1);
}