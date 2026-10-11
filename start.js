// 🚀 مشغّل واحد للبوت الرايسي + سيرفر المكالمات
//
//   node start.js          ← الجوج مع بعض (المنصة / Docker)
//   node start.js bot      ← البوت وحدو
//   node start.js voip     ← المكالمات وحدو
//
// 🎯 علاش ملف خاص؟
//   المنصة كتطلب أمر واحد، بصح خاصنا جوج عمليات مستقلتين:
//   - session/ مختلفة     (ما يمسّوش نفس جلسة WhatsApp)
//   - ports مختلفة        (8080 / 8090)
//   - فشل واحد ما يوقّفش الآخر
//
//   هاد الملف كيشغّلهم كـ child processes، وكي monitors，自动 بيعاود التشغيل
//   ديال كلي، وكيقفل بالظبط ملي كيوصلو SIGTERM/SIGINT (مهم باش Railway/CranL
//   ما يبقاش يقطعهم فـ نص.
//
// ⚠️ ملاحظة: غادي نزيد process واحد هنا فوقهم — لا تحسب الخطط ديالك غالطة.
//   إلا بغيتي تحذفه ملي تخلص:  node index.js   و  node voip-server/index.js

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 🗺️ الخدمات — الاسم هو اللي كتبعيه فـ CLI
const SERVICES = {
  bot: {
    name: 'nova-bot',
    script: 'index.js',
    cwd: __dirname,
    emoji: '🤖',
    desc: 'البوت الرايسي (رسائل + أوامر)',
  },
  voip: {
    name: 'nova-voip',
    script: join('voip-server', 'index.js'),
    cwd: __dirname,
    emoji: '📞',
    desc: 'سيرفر المكالمات الصوتية',
  },
};

// ⏱️ إعادة التشغيل — تجنّب loop لا نهائي فـCrash loop
const RESTART_DELAY_MS = 5000;
const MAX_RESTARTS = 10;

// 🗃️ الحالة
const children = new Map();
const restartCounts = new Map();
let shuttingDown = false;

// ─────────────────────────────────────────────────────────────
// أدوات اللوج
// ─────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m',
};

function stamp() {
  return new Date().toLocaleTimeString('en-GB');
}

function log(service, msg, color = '') {
  const tag = service
    ? `${C.dim}${stamp()}${C.reset} ${C.cyan}[${service.name}]${C.reset} `
    : `${C.dim}${stamp()}${C.reset} `;
  console.log(`${tag}${color}${msg}${C.reset}`);
}

// ─────────────────────────────────────────────────────────────
// تشغيل خدمة وحدة
// ─────────────────────────────────────────────────────────────
function start(service) {
  if (shuttingDown) return;

  // 🔍 تشخيص قبل ما نحاول نشغّل
  const entry = join(service.cwd, service.script);
  if (!existsSync(entry)) {
    log(service, `${C.red}❌ الملف ما كاينش: ${entry}${C.reset}`);
    return;
  }

  // 🔀 بوابة المكالمات: نفس الدومين /voip → 8090.
  //    الخدمتين خاصهم نفس الإعداد، وإلا الصفحة غادي تطلب /api/status
  //    من البوت بدل سيرفر المكالمات.
  const voipMount = process.env.VOIP_MOUNT || '/voip';

  const child = spawn(process.execPath, [entry], {
    cwd: service.cwd,
    // ⚠️ بلا --env-file. إلا كان .env موجود وودي خدمو محلياً؛
    //    فـ Docker ملف .env ما كاينش أصلاً، و Node 20 كيموت بـ exit 9
    //    إلا حد داز --env-file على ملف ناقص. إذن المتغيرات كيوصلو
    //    من البيئة ديال المنصة مباشرة.
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production', VOIP_MOUNT: voipMount },
  });

  children.set(service.name, child);

  log(service, `${C.green}▶ شدّام (pid ${child.pid})${C.reset}`);

  // ── تمرير اللوج ──
  const pipe = (stream, isErr) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        // نحتفظو باللوج ديال الخدمة بحالو — الپلاتforme كتقراه
        const prefix = `${C.dim}${stamp()}${C.reset} ${C.cyan}[${service.name}]${C.reset} `;
        console.log(isErr ? `${C.red}${prefix}${line}${C.reset}` : `${prefix}${line}`);
      }
    });
  };
  pipe(child.stdout, false);
  pipe(child.stderr, true);

  // ── مات → عاود شغّالو ──
  child.on('exit', (code, signal) => {
    children.delete(service.name);
    if (shuttingDown) return;

    const n = (restartCounts.get(service.name) ?? 0) + 1;
    restartCounts.set(service.name, n);

    if (code === 0) {
      log(service, `${C.yellow}خرج بنظافة (code 0) — ماشي مشكل${C.reset}`);
      return;
    }

    if (n > MAX_RESTARTS) {
      log(
        service,
        `${C.red}❌ طفا ${n} مرات متتالية — كيبطلو. راجع اللوج.${C.reset}`
      );
      return;
    }

    log(
      service,
      `${C.yellow}مات (code ${code}, signal ${signal || '-'}) — كنعاودو بعد ${RESTART_DELAY_MS / 1000}s [${n}/${MAX_RESTARTS}]${C.reset}`
    );
    setTimeout(() => start(service), RESTART_DELAY_MS);
  });

  child.on('error', (err) => {
    log(service, `${C.red}❌ spawn error: ${err.message}${C.reset}`);
  });
}

// ─────────────────────────────────────────────────────────────
// الإيقاف النظيف
// ─────────────────────────────────────────────────────────────
function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;

  log(null, `${C.yellow}⇩ ${sig} — كنقفلو الخدمات…${C.reset}`, C.bold);

  const alive = [...children.values()];
  if (!alive.length) {
    process.exit(0);
  }

  for (const child of alive) {
    child.kill('SIGTERM');
  }

  // أعطيا 10 ثواني قبل ما نجبّرو
  const timer = setTimeout(() => {
    log(null, `${C.red}⏱ ما خرجوش — كنعطيو SIGKILL${C.reset}`);
    for (const child of children.values()) child.kill('SIGKILL');
    process.exit(0);
  }, 10_000);

  let left = alive.length;
  for (const child of alive) {
    child.on('exit', () => {
      left -= 1;
      if (left <= 0) {
        clearTimeout(timer);
        log(null, `${C.green}✔ توقفو كلشي${C.reset}`);
        process.exit(0);
      }
    });
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─────────────────────────────────────────────────────────────
// نقطة البداية
// ─────────────────────────────────────────────────────────────
const want = (process.argv[2] || '').toLowerCase();

let toRun;
if (!want || want === 'all') {
  toRun = Object.values(SERVICES);
} else {
  const svc = SERVICES[want];
  if (!svc) {
    console.error(
      `${C.red}❌ '${want}' ماشي خدمة معروفة.${C.reset}\n` +
      `   المتاح: ${Object.keys(SERVICES).join(', ')}, all`
    );
    process.exit(1);
  }
  toRun = [svc];
}

console.log(`
╔══════════════════════════════════════════════╗
║  🚀 NOVA — ${toRun.length === 1 ? toRun[0].name : 'كل الخدمات'}                   
╚══════════════════════════════════════════════╝`);

for (const service of toRun) {
  log(null, `${service.emoji} ${service.desc} ${C.dim}(${service.script})${C.reset}`);
}

start(toRun[0]);
for (let i = 1; i < toRun.length; i++) start(toRun[i]);