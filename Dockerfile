FROM node:20-bookworm-slim

# أدوات النظام: ffmpeg (تحويل الصوت/الفيديو) + python3 + yt-dlp + شهادات
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/*

WORKDIR /app

# ⚠️ الترتيب مهم: ملفات package قبل npm install باش npm يلقى التبعيات.
#    لا تحط postinstall محتاج سكربت من الكود — الملف مازال ما كاينش فنفس الوقت.
#
#    📌 youtube-dl-exec كيطلب python3 وقت npm install (preinstall).
#       python3 مثبّت فوق ⬆️ — بلا نتا كان npm install كيفشل.
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 📞 تبعيات سيرفر المكالمات.
#    عندها postinstall = scripts/patch-caller.js، لذلك ننسخ السكربت قبل npm install.
COPY voip-server/package*.json ./voip-server/
COPY voip-server/scripts ./voip-server/scripts
RUN cd voip-server && npm install --omit=dev --no-audit --no-fund

# كود التطبيق
COPY . .

# مجلدات التخزين: جلسات WhatsApp + البيانات
RUN mkdir -p /app/session /app/data /app/backups /app/voip-server/session

# 📞 بوابة المكالمات: /voip على نفس الدومين (reverse proxy → 8090 داخلي)
ENV VOIP_PORT=8090
ENV VOIP_MOUNT=/voip

# 🤖 البوت 8080 · المكالمات 8090 (داخلي فقط، كيوصّل عبر /voip)
EXPOSE 8080 8090

# 🚀 أمر واحد كيشغّل البوت الرايسي + سيرفر المكالمات مع بعض
CMD ["node", "start.js"]
