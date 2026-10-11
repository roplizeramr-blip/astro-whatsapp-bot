// 🧠 Gemini Live — جسر الصوت ثنائي الاتجاه
//
//   المتصل (16kHz Float32)  ──►  sendAudio()   ──►  Gemini Live
//   Gemini (24kHz Int16)     ──►  'audio16k'   ──►  audio16k Float32 → للمكالمة
//
// ⚠️ ملاحظة: ما كاينش thinkingConfig — gemini-3.8-live كيرفضو (close code 1007).

import WebSocket from 'ws';
import EventEmitter from 'node:events';
import { appendFileSync } from 'node:fs';
import { cfg } from './config.js';

/** PCM 24kHz (Int16 little-endian) → Float32 16kHz mono */
export function resample24kTo16k(pcm24) {
  const n24 = pcm24.length >> 1;
  if (!n24) return new Float32Array(0);
  const n16 = Math.floor((n24 * 2) / 3);
  const out = new Float32Array(n16);
  for (let j = 0; j < n16; j++) {
    const pos = (j * 3) / 2;
    const i0 = pos | 0;
    const i1 = Math.min(i0 + 1, n24 - 1);
    const frac = pos - i0;
    const s0 = pcm24.readInt16LE(i0 * 2);
    const s1 = pcm24.readInt16LE(i1 * 2);
    const a = s0 < 0 ? s0 / 0x8000 : s0 / 0x7fff;
    const b = s1 < 0 ? s1 / 0x8000 : s1 / 0x7fff;
    out[j] = (1 - frac) * a + frac * b;
  }
  return out;
}

/** Float32 [-1,1] → PCM Int16 LE Buffer */
export function float32ToPcm16(f32) {
  const buf = Buffer.allocUnsafe(f32.length * 2);
  for (let i = 0; i < f32.length; i++) {
    const s = f32[i] < -1 ? -1 : f32[i] > 1 ? 1 : f32[i];
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2);
  }
  return buf;
}

const PROMPT = `أنت "استرو" — صاحبك المصري، شاب من وسط البلد، عمرك 25 سنة.
دلّاك رنّ عليك صاحبك في التليفون (مكالمة WhatsApp صوتية مباشرة).

## لغتك
- عامية مصرية 100%: "ألو يا فندم"، "إزيّك يا باشا"، "أهلاً يا حبيبي"، "عامل إيه".
- ردود قصيرة: جملة أو اتنين بالكتير — أنت في تليفون مش في كتاب.
- ممنوع الإيموجي والماركداون والروابط — كلامك بيتحول لصوت على طول.

## أسلوبك
- صاحب وفي وخفيف دم. لو زعلان → واسيه. لو مبسوط → فرح معاه.
- لو سأل سؤال → جاوبه عملي ومختصر.
- ما تحكيش إنك روبوت ولا ذكاء اصطناعي — إنت استرو صاحبهم على التليفون.
- إلا سمعك غلط → طلب بلطف: "قنتي إيه بالظبط؟"

## التشغيل الصامت
- إلا كان الصمت طويل، ما تزحلقش كلام. استنى تبان كلام.
- ما تعاودش التحية ولا تلخبط بين الأسئلة.`;

// 🛡️ VAD ديال Gemini كيكفي. حطّينا Ours فـ OFF باش ما يتفعّلوش تعارض.
const LOCAL_VAD = process.env.VOIP_LOCAL_VAD === '1';
if (LOCAL_VAD) console.log('⚠️ VAD المحلي مفعّل — تورّط مع automaticActivityDetection');

export class LiveSession extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.ready = false;
    this.sentSamples = 0;
    this.recvSamples = 0;
    this.closed = false;
    this._speech = false;
    this._lastVoiceAt = 0;
    this._voiceStartedAt = null;
    this._silenceTimer = null;
    this.peak = 0;
    this.rms = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url =
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta' +
        `.GenerativeService.BidiGenerateContent?key=${cfg.geminiApiKey}`;

      const ws = new WebSocket(url);
      this.ws = ws;

      const timer = setTimeout(() => {
        if (this.ready) return;
        try { ws.close(); } catch {}
        reject(new Error('Gemini setup timeout (12s)'));
      }, 12000);

      const fail = (e) => { clearTimeout(timer); if (!this.ready) reject(e); };

      ws.on('open', () => {
        ws.send(JSON.stringify({
          setup: {
            model: `models/${cfg.geminiModel}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
            },
            // ⭐⭐⭐ الأهم: automaticActivityDetection بلا هاد = ما كيتفاعلش مع الصوت
            //                                    ⚠️ 2026-10-11: silenceDurationMs كان 800
            //    → قصير بزاف. chunk (20ms) فيه صمت قصير = كيحسب أن كلامك
            //    سالا → كيجاوب على نص جملة → كيختم الدور → كيصمت.
            //
            //    الحل: 2000ms سكات + حساسية بداية عالية.
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
                // ⚠️ القيم المسموحة غير HIGH / LOW — ما كاينش MEDIUM.
                //    'END_SENSITIVITY_MEDIUM' كيرفضو Gemini بـ close 1007
                //    → ما كيتسنا��ش حتى، وما كيسمعش.
                endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
                prefixPaddingMs: 300,
                // 📊 التوثيق الرسمي: "Recommended (500ms–800ms) ... server's
                //    internal default is approximately 800ms. Too high
                //    (2000ms+): increases perceived latency."
                silenceDurationMs: 800,
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            // 🔇 transcription مقفولة مؤقتاً — كانت كتدخّر الـ buffer
            //    بـ bufferedAudio. مع turnComplete اليدوي، ماشي مشكل.
            systemInstruction: { parts: [{ text: PROMPT }] },
          },
        }));
      });

      ws.on('message', (data) => {
        let m;
        try { m = JSON.parse(data.toString()); } catch { return; }

        if (m.setupComplete) {
          clearTimeout(timer);
          this.ready = true;
          this.emit('ready');
          return resolve();
        }
        if (m.error) {
          clearTimeout(timer);
          return reject(new Error(m.error.message || 'Gemini error'));
        }

        // 🔬 تشخيص: نحفظو كلشي Gemini كيبعثو (بلا audio)
        if (process.env.VOIP_DEBUG_GEMINI) {
          const clone = JSON.parse(JSON.stringify(m, (k, v) =>
            (k === 'data' && typeof v === 'string' && v.length > 80) ? `<${v.length}b>` : v));
          try {
            appendFileSync(`${cfg.sessionDir}/gemini-dump.log`,
              `\n${new Date().toISOString()} ${JSON.stringify(clone)}\n`);
          } catch {}
        }

        const parts = m.serverContent?.modelTurn?.parts || [];
        for (const p of parts) {
          const d = p.inlineData;
          if (d?.mimeType?.startsWith('audio/pcm') && d.data) {
            const pcm24 = Buffer.from(d.data, 'base64');
            this.recvSamples += pcm24.length >> 1;
            const out = resample24kTo16k(pcm24);
            if (out.length) this.emit('audio16k', out);
          }
        }
        if (m.serverContent?.interrupted) { this._speech = false; this.emit('interrupted'); }
        if (m.serverContent?.turnComplete) this.emit('turnComplete');
        // 🗣️ النص ديال المتصل (للتحقق فقط)
        for (const t of m.serverContent?.inputTranscription?.text ? [m.serverContent.inputTranscription.text] : []) {
          if (t.trim()) this.emit('userText', t.trim());
        }
        for (const t of m.serverContent?.outputTranscription?.text ? [m.serverContent.outputTranscription.text] : []) {
          if (t.trim()) this.emit('botText', t.trim());
        }
        // server VAD ك signalling —
        if (m.serverContent?.inputTranscription === undefined && m.realtimeInput) this.emit('serverActivity');
      });

      ws.on('error', (e) => { this.emit('error', e); fail(e); });
      ws.on('close', (code) => {
        this.ready = false;
        this.emit('close', code);
        fail(new Error(`Gemini closed (${code})`));
      });
    });
  }

  /** عينات من المتصل (16kHz Float32) */
  sendAudio(f32) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN || !f32?.length) return;
    this.sentSamples += f32.length;
    // ⭐⭐⭐ الحقل الصحيح حسب التوثيق الرسمي ديال Google:
    //      realtimeInput.audio = { data, mimeType }
    //    ❌ 'mediaChunks' = API قديمة → Gemini كيتجاهلها بالكامل وما كيسمعش.
    this.ws.send(JSON.stringify({
      realtimeInput: {
        audio: {
          data: float32ToPcm16(f32).toString('base64'),
          mimeType: 'audio/pcm;rate=16000',
        },
      },
    }));
    this._trackActivity(f32);
  }

  /**
   * 🛡️ VAD محلي — شبكة أمان بصح** بلاصتو active**.
   *
   * علاش معطّل دابا: VAD ديال Gemini (server-side) كيخدم ملي
   * automaticActivityDetection مفعّل. ملي كنبعثو turnComplete من
   * عندنا فنفس الوقت، كيطلع تعارض — كل واحد كيحبس الاخر.
   *
   * باش تفعّلو الصيانة اليدوية:
   *   VOIP_LOCAL_VAD=1 node --env-file=..\.env index.js
   */
  _trackActivity(f32) {
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < f32.length; i++) {
      const a = Math.abs(f32[i]);
      if (a > peak) peak = a;
      sum += a * a;
    }
    this.peak = peak;
    this.rms = Math.sqrt(sum / f32.length);

    if (!LOCAL_VAD) return;
    const now = Date.now();
    if (this.peak > 0.018) {
      this._speech = true;
      this._lastVoiceAt = now;
      this._voiceStartedAt ??= now;
      clearTimeout(this._silenceTimer);
      this._silenceTimer = setTimeout(() => this._closeTurn(), 1200);
    } else if (this._speech && now - this._lastVoiceAt > 1200) {
      this._closeTurn();
    }
  }

  _closeTurn() {
    clearTimeout(this._silenceTimer);
    if (!this._speech) return;
    this._speech = false;
    this.emit('turnClosed');
  }

  /**
   * إنهاء الدور (Hybrid VAD حسب توثيق Google الرسمي).
   *
   * ⚠️ 'turnComplete' ماشي هو: التوثيق كيقول صريح
   *    "turn_complete=true unconditionally interrupts generation"
   *    → كنقطعو جواب Gemini فنصّه.
   *
   * ✅ 'audioStreamEnd' = "the server treats it as an immediate finalization
   *    prompt, bypassing the default server-side silence detection delay".
   */
  endTurn() {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
  }

  /** كلام مكتوب → يطلع صوت */
  say(text) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    }));
  }

  close() {
    this.closed = true;
    this.ready = false;
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}