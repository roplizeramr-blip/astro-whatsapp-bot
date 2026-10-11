import { config } from '../config.js';

/**
 * ⚙️ إعدادات النشر على CranL
 *
 * ملاحظة مهمة عن المنافذ:
 *   المنصة كتفتحالبورت 8080 فقط للـ public. البورت 8090 (سيرفر المكالمات)
 *   كيخدم داخلياً، ولكن المستخدم ما يقدروش يفتح اللوحة ديالو من المتصفح.
 *
 *   الحل: زيد VOIP_PUBLIC_URL كـ environment variable فـ إعدادات CranL،
 *   مثال:  https://nova-bot-x3unfm.cranl.net:8090
 *
 *   ⚠️ إلا كانت المنصة ما كتفتحش 8090، خلّي البورت فـ نفس الدومين
 *      وما تبقاش مستعمل '/call' — البوت وحدو غادي يخدم طبيعي.
 */
export const CRANL_CONFIG = {
  appId: '31970f47-f023-4ab3-9a6d-85af69c85083',
  appName: 'nova-whatsapp-bot',
  appUrl: 'https://nova-bot-x3unfm.cranl.net',
  apiUrl: 'https://api.cranl.net/v1',
  githubRepo: 'https://github.com/roplizeramr-blip/nova-whatsapp-bot.git',
  branch: 'main',

  // 🔌 المنافذ
  ports: {
    bot: 8080,   // البوت الرايسي — البورت العام
    voip: 8090,  // المكالمات — داخلي
  },

  // 🔐 environment variables المطلوبة
  requiredEnv: [
    'GEMINI_API_KEY',   // المكالمات الصوتية
    'GROQ_API_KEYS',    // الذكاء الاصطناعي
    'DATABASE_URL',     // التخزين الدائم
  ],
  optionalEnv: [
    'VOIP_PUBLIC_URL',  // رابط لوحة المكالمات للعامة
    'DASH_TOKEN',       // حماية /stats
  ],
};

export default CRANL_CONFIG;