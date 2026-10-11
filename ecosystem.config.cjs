// ⚙️ تشغيل.NOVA BOT تحت PM2 — جوج خدمات فـ خادم واحد
//
//   nova-bot   : البوت الرايسي (رسائل + أوامر)      → http://localhost:8080
//   nova-voip  : سيرفر المكالمات الصوتية + Gemini   → http://localhost:8090
//
// كل واحد: process مستقل · session مستقل · بورت مستقل.
// التشغيل:  pm2 start ecosystem.config.cjs
// السجلات:  pm2 logs        |  التوقف: pm2 stop all
//
// ⚠️ عمرة عمرك ما تزيد instances فوق 1 فـ أي خدمة.
//    جوج Baileys على نفس الـ session = force_logout.
module.exports = {
  apps: [
    {
      name: 'nova-bot',
      script: 'index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      max_memory_restart: '500M',
      time: true,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'nova-voip',
      // ⚠️ بلا --env-file: Node 20 كيخرج بـ exit 9 إلا الملف ما كاينش.
      //    فـ Docker/المنصة المتغيرات كيوصلو مباشرة من البيئة.
      script: 'voip-server/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      max_memory_restart: '500M',
      time: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};