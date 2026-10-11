// 🔧 Patch ديال chama-bailez-pro: كيزيد بث صوت لايف (Live Audio Streaming)
//
// 📌 علاش؟
//    الـ AudioFeeder الأصلي كيشتغل بملف صوت فقط (mp3/wav) كيدوّرو (loop).
//    حنا خصنا نوجه صوت Gemini Live لايف للمكالمة → خاص ring buffer.
//
// ✅ نفس الطريقة اللي استعملها whatsapp-call-bridge (MIT) — vendored + modified.
//
// ⚠️ version-guarded: إلا ما لقيناوش الـ anchors بالضبط، كيخرج بخطأ واضح
//    باش ما يبقاش silent breakage من بعد إعادة التثبيت.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = join(__dirname, '..', 'node_modules', 'chama-bailez-pro', 'lib', 'Caller', 'audio-feeder.mjs');
const BACKUP = `${TARGET}.novaorig`;

const MARKER = '/* __NOVA_LIVE_PATCH__ */';

let src;
try {
  src = readFileSync(TARGET, 'utf8');
} catch {
  console.error('[patch-caller] ⚠️ ما لقيناش chama-bailez-pro — تخطّى (تخلي install قبل الخطي)');
  process.exit(0);
}

// audio-feeder: إلا كان مطبّق من قبل، نتخطّاو ليه (ما نخرجوش!)
// حيت خاصنا نكمّلو ل wasm-engine patch.
const FEEDER_ALREADY = src.includes(MARKER);

if (FEEDER_ALREADY) {
  if (process.argv.includes('--force')) {
    try {
      src = readFileSync(BACKUP, 'utf8');
      console.log('[patch-caller] ♻️ --force: رجعنا للنسخة الأصلية ديال audio-feeder.');
    } catch {
      console.error('[patch-caller] ❌ --force ولكن ما لقيناش الـ backup.');
      process.exit(1);
    }
  } else {
    console.log('[patch-caller] ✔️ audio-feeder مطبّق من قبل — نكملو ل wasm-engine.');
  }
} else {
  writeFileSync(BACKUP, src, 'utf8');
}

const patches = [
  // ── 1) Ring buffer + registry ─────────────────────────────────────────
  {
    find: `const audioBufferCache = new Map();`,
    replace: `const audioBufferCache = new Map();
${MARKER}

// 🔴 رينج بفر → كيسمح ليك تحقن PCM فـ أي وقت، و AudioFeeder كيسحب منه كل 20ms
class LiveRing {
    #cap; #buf; #r = 0; #w = 0;
    constructor(capacity) { this.#cap = capacity; this.#buf = new Float32Array(capacity); }
    get available() { return this.#w - this.#r; }
    push(src) {
        if (this.available + src.length > this.#cap) this.#compact();
        if (this.available + src.length > this.#cap) {
            // مخزن ممتلئ → نحيدو الأقدم (drop oldest) باش ما يتجمدش الصوت
            this.#r = this.#w - (this.#cap - src.length);
        }
        for (let i = 0; i < src.length; i++) this.#buf[this.#w++ % this.#cap] = src[i];
    }
    #compact() {
        const n = this.available;
        if (n <= 0) { this.#r = this.#w = 0; return; }
        const copy = new Float32Array(n);
        for (let i = 0; i < n; i++) copy[i] = this.#buf[(this.#r + i) % this.#cap];
        this.#buf.set(copy, 0);
        this.#r = 0; this.#w = n;
    }
    /** يملا out بالمتاح، والباقي صمت. كيرجع عدد العينات الحقيقية. */
    read(out) {
        const n = Math.min(out.length, this.available);
        for (let i = 0; i < out.length; i++) {
            out[i] = i < n ? this.#buf[(this.#r + i) % this.#cap] : 0;
        }
        this.#r += n;
        return n;
    }
    clear() { this.#r = this.#w = 0; }
}

let _liveFeeder = null;
/** كيرجع الـ AudioFeeder الخامل فـ وضع البث لايف (ولا null). */
export function getLiveFeeder() { return _liveFeeder; }`,
  },

  // ── 2) حقل #ring فـ الكلاس ──────────────────────────────────────────
  {
    find: `    droppedChunks = 0;
    underflowChunks = 0;
    bytesProduced = 0;`,
    replace: `    droppedChunks = 0;
    underflowChunks = 0;
    bytesProduced = 0;
    /** @nova-live ring buffer — غير فارغ ملي source === "__live__" */
    #ring = null;
    get isLive() { return this.#ring !== null; }`,
  },

  // ── 3) تهيئة الرينج فـ الـ constructor ──────────────────────────────
  {
    find: `        this.#loopGapRemaining = Math.max(0, Math.round(this.loopGapMs / this.#chunkIntervalMs));
    }`,
    replace: `        this.#loopGapRemaining = Math.max(0, Math.round(this.loopGapMs / this.#chunkIntervalMs));
        // @nova-live: 30 ثانية ديال المخزن (ب Plenty بزاف لـ AI)
        this.#ring = (this.source === "__live__") ? new LiveRing(this.sampleRate * 30) : null;
    }`,
  },

  // ── 4) وضع اللايف فـ start() ────────────────────────────────────────
  {
    find: `        const cacheKey = \`\${this.source}:\${this.sampleRate}:\${this.channels}\`;
        if (!this.source || this.source === "silence") {`,
    replace: `        const cacheKey = \`\${this.source}:\${this.sampleRate}:\${this.channels}\`;
        // @nova-live: وضع البث لايف — كنبداو من الصمت، وكيت injections عبر push()
        if (this.source === "__live__") {
            _liveFeeder = this;
            this.#ring.clear();
            this.#startPacer();
            console.log("[AudioFeeder] 🔴 LIVE mode — في انتظار pushAudio()…");
            return;
        }
        if (!this.source || this.source === "silence") {`,
  },

  // ── 5) سحب من الرينج فـ #flushOne() ─────────────────────────────────
  {
    find: `        // 2. Speech PCM samples phase
        else if (this.#samples && this.#playhead < this.#samples.length) {`,
    replace: `        // 2. @nova-live: صوت لايف جاي من Gemini (ولو ما كاينش → صمت)
        else if (this.#ring) {
            const got = this.#ring.read(frame);
            if (got < this.#chunkSamples) this.underflowChunks++;
            this.droppedChunks += (this.#chunkSamples - got);
        }
        // 3. Speech PCM samples phase
        else if (this.#samples && this.#playhead < this.#samples.length) {`,
  },

  // ── 6) push() + إيقاف نهائي ─────────────────────────────────────────
  {
    find: `    stop = () => {
        if (!this.#active)
            return;`,
    replace: `    /** @nova-live: حقن عينات PCM (16kHz mono Float32) فـ المكالمة. */
    push = (pcm) => {
        if (!this.#ring || !pcm || pcm.length === 0) return;
        this.#ring.push(pcm);
    };
    /** @nova-live: طي الصوت لي mateb3ي (barge-in / interruption). */
    flush = () => { this.#ring?.clear(); };
    /** @nova-live: شحال باقي مخزّن بالعينات (diagnostics). */
    get queued() { return this.#ring ? this.#ring.available : 0; };
    stop = () => {
        if (!this.#active)
            return;
        if (_liveFeeder === this) _liveFeeder = null;`,
  },
];

// ══════════════════════════════════════════════════════════════════════
// 🐛 patch #2 — نفس الـ bug، ولكن فـ wasm-engine.mjs
// ══════════════════════════════════════════════════════════════════════
// wasm-engine.mjs كان فيه guard كيحذف أي chunk صامت:
//     const hasNonZero = audioData.some((s) => Math.abs(s) > 0.0001);
//     if (hasNonZero) callbacks.onAudioPlaybackData(audioData)
//
// النتيجة: كل فاصل سكات بين الكلمات كيتحذف → Gemini كيشوف شظايا صوت
//         مقطعة بلا linkage → ما كيقدرش يفهم جملة، وما كيردّش.
//
// الحل: عبّر على كل chunk. السكات = صفر natural فـ PCM — وهو بالضبط
//       اللي VAD خاصو باش يحدّد بداية ونهاية الكلام.
const ENGINE_TARGET = join(
  __dirname, '..', 'node_modules', 'chama-bailez-pro', 'lib', 'Caller', 'wasm-engine.mjs'
);
const ENGINE_MARKER = '__NOVA_SILENCE_PATCH__';

// ── application ───────────────────────────────────────────────────────
let out = src;
let applied = 0;
const failed = [];

if (!FEEDER_ALREADY || process.argv.includes('--force')) {
  for (const { find, replace } of patches) {
    const at = out.indexOf(find);
    if (at === -1) {
      failed.push(find.split('\n')[0].trim().slice(0, 60));
      continue;
    }
    out = out.slice(0, at) + replace + out.slice(at + find.length);
    applied++;
  }
}

// ── engine patch ──────────────────────────────────────────────────────
const ENGINE_TARGET2 = join(
  __dirname, '..', 'node_modules', 'chama-bailez-pro', 'lib', 'Caller', 'wasm-engine.mjs'
);
const ENGINE_MARKER2 = '__NOVA_SILENCE_PATCH__';

try {
  let e = readFileSync(ENGINE_TARGET2, 'utf8');
  if (!e.includes(ENGINE_MARKER2)) {
    const F =
      '                const hasNonZero = audioData.some((s) => Math.abs(s) > 0.0001);\n' +
      '                if (hasNonZero)\n' +
      '                    this.#config.callbacks?.onAudioPlaybackData?.(audioData);';
    const R =
      `                ${ENGINE_MARKER2}\n` +
      '                // 🐛 كان كيحذف كل chunk صامت (hasNonZero guard).\n' +
      '                // الفواصل ديال السكات بين الكلمات = جزء من الكلام!\n' +
      '                // ملي كيتحذفو، Gemini كيشوف شظايا مقطعة بلا linkage\n' +
      '                // → ما كيقدرش يفهم جملة، وما كيردّش.\n' +
      '                // الحل: عبّر دايماً. السكات = صفر natural فـ PCM،\n' +
      '                //       وهو بالضبط اللي VAD خاصو.\n' +
      '                this.#config.callbacks?.onAudioPlaybackData?.(audioData);';
    const i = e.indexOf(F);
    if (i === -1) {
      console.error('[patch-caller] ❌ ما لقيناش الـ silence-guard فـ wasm-engine.mjs');
      process.exit(1);
    }
    const bk = `${ENGINE_TARGET2}.novaorig`;
    if (!existsSync(bk)) writeFileSync(bk, e, 'utf8');
    writeFileSync(ENGINE_TARGET2, e.slice(0, i) + R + e.slice(i + F.length), 'utf8');
    console.log('[patch-caller] ✔️ طُبّق patch wasm-engine.mjs (إصلاح حذف السكات) ✅');
  } else {
    console.log('[patch-caller] ✔️ patch wasm-engine مطبّق من قبل.');
  }
} catch (err) {
  console.error('[patch-caller] ❌ wasm-engine:', err.message);
  process.exit(1);
}

if (failed.length) {
  console.error(`[patch-caller] ❌ فشل ${failed.length}/${patches.length} patch ديال audio-feeder:`);
  for (const f of failed) console.error(`   - ما لقيناش: ${f}`);
  console.error('[patch-caller]    على الأرجح chama-bailez-pro بدّل الكود. راجع الملف يدوياً.');
  process.exit(1);
}

// ── engine patch: معطّل عمداً ────────────────────────────────────────
// كان كنحيدو guard ديال hasNonZero (حيت كيتجاهل chunks الصامتة).
// ⚠️ النتيجة عكسية: audioIn طا 0.0s — الـ inbound مات.
// ➜ رجعنا للنسخة الأصلية. المرجع الرسمي ديال Google كيقول أن
//    الصمت جزء طبيعي من الـ PCM، ولكن evidently الـ fork محتاجو.
console.log('[patch-caller] ⏭️  wasm-engine.mjs: بلا تعديل (audioInاشتغل بهاد الشكل).');

writeFileSync(TARGET, out, 'utf8');
if (!existsSync(BACKUP)) writeFileSync(BACKUP, src, 'utf8');
console.log(`[patch-caller] ✔️ طُبّق ${applied}/${patches.length} patches على audio-feeder.mjs`);
console.log('[patch-caller]    دابا تقدر تستعمل: getLiveFeeder().push(float32_16k)');