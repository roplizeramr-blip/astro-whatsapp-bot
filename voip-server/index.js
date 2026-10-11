// 📞 سيرفر المكالمات الصوتية — مستقل تماماً عن البوت الرئيسي
//
//   node --env-file=../.env voip-server/index.js
//
// البنية:
//   Baileys (chama-bailez-pro)  ──►  WhatsApp VoIP
//         │  call.on('audio')  ◄──┤  صوت المتصل (16kHz Float32)
//         ▼
//   LiveSession (Gemini Live)   ──►  getLiveFeeder().push()  ──►  صوت البوت
//
// 🎯 عميل واحد = ما كاينش نزاع على الـ <call> offer (كان مشكل Zapo + Baileys).

import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import WebSocket from 'ws';
if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

import makeWASocket, {
  Browsers,
  useMultiFileAuthState,
  DisconnectReason,
  enableCallAutoAnswer,
} from 'chama-bailez-pro';
import { getLiveFeeder } from 'chama-bailez-pro/lib/Caller/audio-feeder.mjs';

import { cfg } from './config.js';
import { LiveSession } from './live.js';

// ══════════════════════════════ الحالة ══════════════════════════════
const state = {
  connected: false,
  registered: false,
  pairingCode: null,
  qr: null,
  activeCall: null,
  calls: 0,
  answered: 0,
  lastError: null,
  audioIn: 0,   // عينات جاية من المتصل
  audioOut: 0,  // عينات متبعتة لـ Gemini
};

let sock = null;
let voip = null;

// ══════════════════════════════ اللوج ══════════════════════════════
const logLines = [];
function log(msg) {
  const line = `${new Date().toLocaleTimeString('en-GB')} ${msg}`;
  logLines.push(line);
  if (logLines.length > 80) logLines.shift();
  console.log(line);
}

// ══════════════════════════════ اللوحة ══════════════════════════════
const PAGE = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>سيرفر المكالمات</title>
<style>
body{font-family:system-ui;background:#0b1220;color:#e6edf3;margin:0;padding:24px;text-align:center}
h1{color:#00ffa3;margin:8px 0}
.card{background:#131c2e;border:1px solid #00ffa33d;border-radius:16px;padding:18px;max-width:560px;margin:14px auto}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;background:#666;margin-left:8px}
.on{background:#00ffa3;box-shadow:0 0 12px #00ffa3}.off{background:#ff3366}
code{background:#0a0f1a;padding:6px 14px;border-radius:8px;font-size:22px;letter-spacing:3px;color:#00ffa3;display:inline-block;margin:8px}
img{background:#fff;padding:10px;border-radius:10px;max-width:250px}
pre{text-align:left;font-size:11px;max-height:240px;overflow:auto;color:#8b98a5}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.stat{background:#0a0f1a;border-radius:10px;padding:12px}
.stat b{display:block;font-size:22px;color:#00ffa3}
.stat span{font-size:11px;color:#7d8894}
</style></head><body>
<h1>📞 سيرفر المكالمات الصوتية</h1>
<div class="card">
  <div>الحالة: <span class="dot" id="dot"></span><b id="st">…</b></div>
  <div style="margin-top:12px">رقم البوت: <code id="num">…</code></div>
  <div id="pc"></div><div id="qrbox"></div>
  <div class="grid">
    <div class="stat"><b id="calls">0</b><span>مكالمات واردة</span></div>
    <div class="stat"><b id="ans">0</b><span>مكالمات مجابة</span></div>
    <div class="stat"><b id="in">0</b><span>صوت مستلم (smp)</span></div>
    <div class="stat"><b id="out">0</b><span>صوت مرسل (smp)</span></div>
  </div>
  <div id="live" style="margin-top:12px"></div>
</div>
<div class="card"><b>📋 اللوج</b><pre id="log"></pre></div>
<script>
// 📌 Base path: ملي كنخدمو ورا reverse proxy (مثلا /voip) خاصنا نزيدو
//    المسار فالطلب، وإلا المتصفح غادي يطلب /api/status من البوت ماشي من هاد السيرفر.
const BASE = ${JSON.stringify(cfg.mount)};
async function tick(){
  try{
    const s = await (await fetch(BASE + '/api/status')).json();
    document.getElementById('st').textContent = s.connected ? 'متصل ✅' : 'غير متصل';
    document.getElementById('dot').className = 'dot ' + (s.connected ? 'on' : 'off');
    document.getElementById('num').textContent = s.botNumber;
    document.getElementById('pc').innerHTML = s.pairingCode ? 'كود الربط: <br><code>'+s.pairingCode+'</code>' : '';
    document.getElementById('qrbox').innerHTML = s.qr ? '<br><img src="'+BASE+'/api/qr.png?ts='+Date.now()+'">' : '';
    document.getElementById('calls').textContent = s.calls;
    document.getElementById('ans').textContent = s.answered;
    document.getElementById('in').textContent = s.audioIn;
    document.getElementById('out').textContent = s.audioOut;
    document.getElementById('live').innerHTML = s.activeCall ? '🔴 مكالمة جارية: <code>'+s.activeCall+'</code>' : '';
    if (s.log?.length) document.getElementById('log').textContent = s.log.join('\\n');
  }catch(e){}
}
tick(); setInterval(tick, 1500);
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  // 🔀 reverse proxy كيقصّ المسار قبل ما يوصلنا. ولكن إلا واحد
  //    بـ raw port (بلا proxy) وبعت prefix، نحيدو باش يخدم فالحالتين.
  const rawPath = req.url.split('?')[0];
  const fwdPrefix = (req.headers['x-forwarded-prefix'] || '').replace(/\/+$/, '');
  const url = (fwdPrefix && rawPath.startsWith(fwdPrefix))
    ? rawPath.slice(fwdPrefix.length) || '/'
    : rawPath;

  if (url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ...state, botNumber: cfg.botNumber, log: logLines.slice(-30) }));
  }

  if (url === '/api/qr.png') {
    if (!state.qr) { res.writeHead(404); return res.end('no qr'); }
    try {
      const { default: QRCode } = await import('qrcode');
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(await QRCode.toBuffer(state.qr, { type: 'png', width: 460, margin: 2 }));
    } catch { res.writeHead(500); return res.end('qrcode missing'); }
  }

  if (url === '/api/refresh' && req.method === 'POST') {
    try {
      const code = await sock.requestPairingCode(cfg.botNumber);
      state.pairingCode = String(code).match(/.{1,4}/g)?.join('-');
      state.qr = null;
      log(`🔢 كود ربط جديد: ${state.pairingCode}`);
    } catch (e) {
      state.lastError = e.message;
      log(`⚠️ طلب الكود فشل: ${e.message}`);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, code: state.pairingCode, error: state.lastError }));
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});

// ══════════════════════════════ 🚀 الإقلاع ══════════════════════════════
console.log(`
╔════════════════════════════════════╗
║   📞 سيرفر المكالمات الصوتية      ║
╚════════════════════════════════════╝
رقم البوت : ${cfg.botNumber}
اللوحة    : http://localhost:${cfg.port}
`);

server.listen(cfg.port, () => log(`🌐 اللوحة على ${cfg.port}`));

async function start() {
  mkdirSync(cfg.sessionDir, { recursive: true });

  // ☁️ استرجاع الجلسة من PostgreSQL — من جدول خاص بالمكالمات
  //    (session_voip_storage) باش ما تتبادلش مع جلسة البوت الرئيسي.
  //
  //    ⚠️ علاش جدول خاص؟ الجوج (البوت + المكالمات) كاينتجو نفس المفاتح
  //       (creds.json, pre-keys, app-state). إلا شاركو نفس الجدول،
  //       واحد كايمسح جلسة الاخر فكل مزامنة. الجدول المنفصل كايعزلهم.
  try {
    const { restoreSessionFromDb } = await import('../core/postgres.js');
    await restoreSessionFromDb(cfg.sessionDir, 'session_voip_storage');
  } catch (e) {
    log(`⚠️ PostgreSQL متاحش (استمرار محلي): ${e.message}`);
  }

  const { state: authState, saveCreds } = await useMultiFileAuthState(cfg.sessionDir);
  // 🔓 نخليو saveCreds متاح من handlers الاخرين
  authState.saveCreds = saveCreds;

  sock = makeWASocket({
    auth: authState,
    // ⚠️ مهم: VoIP كيخدم غير مع Windows/Chrome — هادي شرط من شروط واتساب
    browser: Browsers.windows('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  // ☁️ كل تغيير فالـ creds → نحافظ عليها محلياً + نزامنها فالجدول الخاص
  sock.ev.on('creds.update', async () => {
    await saveCreds();
    try {
      const { scheduleSessionSync } = await import('../core/postgres.js');
      scheduleSessionSync(cfg.sessionDir, 2000, 'session_voip_storage');
    } catch {}
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) { state.qr = qr; state.pairingCode = null; log('📸 باركود جديد — صوّره من اللوحة'); }

    if (connection === 'open') {
      state.connected = true;
      log('✅ متصل بـ WhatsApp');

      // ⚠️ شرط مهم: 'open' كيطلع حتى فـ وضع الـ QR (غير مسجّل).
      //    'sock.user' كايتحط غير ملي pair-success ينجح فعلاً.
      //    مليRegistration ktem3a wla9dherna demande d'un code,
      //    WhatsApp kaydir had l'session b 503 → 401 → logout.
      const paired = Boolean(sock.authState?.creds?.registered || sock.user?.id);
      state.registered = paired;

      // 🛡️ بعض الـ forks ما كيحفظوش registered=true على القرص
      //    → كنصلّحوها باش إعادة التشغيل ما تطلبش ربط جديد.
      if (paired && !sock.authState.creds.registered) {
        sock.authState.creds.registered = true;
        try {
          await authState.saveCreds?.();
          log('🛡️ صلّينا flag "registered" على القرص');
        } catch (e) { /* غير حرج */ }
      }

      if (!paired) {
        try {
          const code = await sock.requestPairingCode(cfg.botNumber);
          state.pairingCode = String(code).match(/.{1,4}/g)?.join('-');
          log(`🔢 كود الربط: ${state.pairingCode}`);
        } catch (e) { log(`⚠️ كود الربط: ${e.message}`); }
        return; // ما نشغّلوش VoIP حتى يربط
      }

      log(`🎉 مربوط كـ ${sock.user?.id ?? '؟'}`);

      if (!voip) {
        voip = await enableCallAutoAnswer(sock, {
          autoAnswer: true,
          audio: '__live__',        // ⭐ ring buffer بدل ملف — باش نقدر نوجّه صوت Gemini لايف
          loop: true,
          warmupSilenceMs: 400,     // تهيئة قصيرة — باش ما نخسروش أول كلمة
          durationMs: cfg.maxCallMs,
          recordCallerAudio: true,
          recordingsDir: `${cfg.sessionDir}/recordings`,
          onCall: handleCall,
          onAnswer: () => log('🎙️ قبل المكالمة — الصوت خدام'),
          onEnd: (_c, reason) => log(`📴 انتهت المكالمة (${reason})`),
        });
        log('📞 محرك VoIP خدام (chama-bailez-pro + WASM)');
      }
    }

    if (connection === 'close') {
      state.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      log(`🔌 انقطع الاتصال${code ? ` (${code})` : ''}`);
      if (code === DisconnectReason.loggedOut) {
        log('⛔ تم تسجيل الخروج — خاص تعاود الربط');
      } else {
        setTimeout(() => start().catch((e) => log(`⚠️ reconnect: ${e.message}`)), 4000);
      }
    }
  });
}

// ══════════════════════════════ 📞 المكالمة الواردة ══════════════════════════════
async function handleCall(call) {
  const who = call.peerJid?.split('@')[0] ?? '?';
  state.activeCall = call.callId;
  state.calls++;
  log(`📞 مكالمة واردة من +${who} (${call.isVideo ? 'فيديو' : 'صوت'})`);

  const live = new LiveSession();
  const stats = { said: 0, got: 0, peak: 0, capture: [], savedBytes: 0 };

  // 🔊 صوت المتصل ← Gemini
  call.on('audio', (pcm) => {
    state.audioIn += pcm.length;
    stats.got += pcm.length;

    // 🔬 تشخيص: نحفظو نفس الـ PCM اللي كنبعثو لـ Gemini
    if (process.env.VOIP_DEBUG_GEMINI && pcm?.length) {
      let pk = 0;
      for (let i = 0; i < pcm.length; i++) {
        const a = Math.abs(pcm[i]);
        if (a > pk) pk = a;
      }
      stats.peak = Math.max(stats.peak || 0, pk);
      // نحفظو أول 3 ثواني ديال الصوت للتحليل
      if (stats.savedBytes < 16000 * 3 * 2) {
        const buf = Buffer.alloc(pcm.length * 2);
        for (let i = 0; i < pcm.length; i++) {
          const s = Math.max(-1, Math.min(1, pcm[i]));
          buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2);
        }
        stats.capture.push(buf);
        stats.savedBytes += buf.length;
      }
    }

    live.sendAudio(pcm);
  });

  // 🔊 صوت Gemini ← للمكالمة
  live.on('audio16k', (samples) => {
    const feeder = getLiveFeeder();
    if (feeder) {
      feeder.push(samples);
      state.audioOut += samples.length;
      stats.said += samples.length;
    }
  });

  // 🛡️ VAD محلي: ملي المتصل يهدا → نقفل الدور باش Gemini يجاوب
  live.on('turnClosed', () => {
    live.endTurn();
    const dur = live._voiceStartedAt ? (Date.now() - live._voiceStartedAt) / 1000 : 0;
    if (dur > 0.4) log(`🎤 المتصل Proud كلام (${dur.toFixed(1)}s) → دور Gemini`);
    live._voiceStartedAt = null;
  });

  // 📝 سجل الكلام — للتحقق
  live.on('userText', (t) => log(`👤 المتصل: ${t.slice(0, 90)}`));
  live.on('botText', (t) => log(`🤖 استرو: ${t.slice(0, 90)}`));

  // ⛔ barge-in: إلا المتصل قطع كلامنا، نطيو الصوت لي mateb3
  live.on('interrupted', () => {
    getLiveFeeder()?.flush();
    log('⛔ interruption — طيّنّا الصوت');
  });

  live.on('error', (e) => log(`⚠️ Gemini: ${e.message?.slice(0, 80)}`));

  try {
    await live.connect();
    log('🧠 جلسة Gemini جاهزة');
    live.say(cfg.greeting);
  } catch (e) {
    state.lastError = e.message;
    log(`❌ Gemini فشل: ${e.message?.slice(0, 90)}`);
  }

  const ticker = setInterval(() => {
    const q = getLiveFeeder()?.queued ?? 0;
    log(`🎤 مستلم ${(stats.got / 16000).toFixed(1)}s | مرسل ${(stats.said / 16000).toFixed(1)}s | مخزن ${Math.round(q / 16)}ms | مستوى ${(live.rms * 100).toFixed(1)}%`);
  }, 5000);

  call.on('connected', () => { state.answered++; });

  call.on('ended', (reason) => {
    clearInterval(ticker);

    // 🔬 نحفظو أول 3 ثواني ديال PCM اللي بعثنا لـ Gemini
    if (stats.capture.length) {
      try {
        const pcm = Buffer.concat(stats.capture);
        const hdr = Buffer.alloc(44);
        hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8);
        hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
        hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(16000, 24); hdr.writeUInt32LE(32000, 28);
        hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
        hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
        const f = `${cfg.sessionDir}/sent-to-gemini-${Date.now()}.wav`;
        writeFileSync(f, Buffer.concat([hdr, pcm]));
        log(`🔬 حفظنا: ${f} (${(pcm.length / 32000).toFixed(1)}s, peak=${stats.peak.toFixed(4)})`);
      } catch (e) { log(`🔬 فشل الحفظ: ${e.message}`); }
    }

    try { live.close(); } catch {}
    state.activeCall = null;
    log(`🧹 تنظيف: ${reason}`);
  });

  call.on('error', (e) => log(`❌ Call: ${e.message}`));
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n👋 إيقاف…');
    try { voip?.destroy?.(); } catch {}
    try { sock?.end?.(undefined); } catch {}
    process.exit(0);
  });
}

// 🛡️ خلي الأعطال تبان بدل ما يموت السيرفر فـ صمت
process.on('uncaughtException', (e) => {
  console.error('💥 uncaughtException:', e?.message, '\n', e?.stack?.split('\n').slice(0, 4).join('\n'));
});
process.on('unhandledRejection', (e) => {
  console.error('💥 unhandledRejection:', e?.message ?? e);
});
process.on('exit', (code) => {
  if (code !== 0) console.error(`❌ process exit code=${code}`);
});

start().catch((e) => { state.lastError = e.message; log(`❌ فشل الإقلاع: ${e.message}`); });