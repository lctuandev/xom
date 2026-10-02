// Âm thanh (docs/USECASES.md UC-D1 mở rộng): tổng hợp bằng WebAudio — không tải file, không lo bản quyền.
// - Hiệu ứng: bấm nút, tiền vào, múc, dĩa, chuông, lỗi, cửa.
// - "Giọng nói": lầm bầm theo âm tiết (kiểu game), mỗi người một cao độ; đang bực thì nói nhanh, gắt.
// - Nhạc nền: giai điệu ngũ cung kiểu đàn tranh trên nền trầm; ngày tươi, đêm chậm và dịu.
// Trình duyệt chỉ cho phát sau cú chạm đầu tiên → `unlockAudio()` gắn vào pointerdown.

export type Sfx =
  | "click"
  | "coin"
  | "scoop"
  | "plate"
  | "bell"
  | "error"
  | "door"
  | "pop"
  | "shutter";

interface Levels {
  music: number;
  sfx: number;
  voice: number;
  /** Môi trường: tiếng phố, quán, mưa, sấm. */
  ambient: number;
  muted: boolean;
}

const KEY = "xom:audio";
const DEFAULTS: Levels = { music: 0.35, sfx: 0.7, voice: 0.6, ambient: 0.7, muted: false };

function load(): Levels {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

let levels: Levels = typeof window === "undefined" ? { ...DEFAULTS } : load();
let ctx: AudioContext | null = null;
let busMusic: GainNode | null = null;
let busSfx: GainNode | null = null;
let busVoice: GainNode | null = null;
let busAmbient: GainNode | null = null;

export function audioLevels(): Levels {
  return levels;
}

export function setAudioLevels(patch: Partial<Levels>) {
  levels = { ...levels, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(levels));
  } catch {}
  applyLevels();
}

function applyLevels() {
  if (!ctx) return;
  const m = levels.muted ? 0 : 1;
  busMusic?.gain.setTargetAtTime(levels.music * m, ctx.currentTime, 0.1);
  busSfx?.gain.setTargetAtTime(levels.sfx * m, ctx.currentTime, 0.05);
  busVoice?.gain.setTargetAtTime(levels.voice * m, ctx.currentTime, 0.05);
  busAmbient?.gain.setTargetAtTime(levels.ambient * m, ctx.currentTime, 0.1);
}

/** Gọi trong một cú chạm của người chơi (chính sách tự phát của trình duyệt). */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    busMusic = ctx.createGain();
    busSfx = ctx.createGain();
    busVoice = ctx.createGain();
    busAmbient = ctx.createGain();
    for (const b of [busMusic, busSfx, busVoice, busAmbient]) b.connect(master);
    applyLevels();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

/** Một nốt ngắn có bao âm (attack/decay). */
function tone(
  bus: GainNode | null,
  freq: number,
  at: number,
  dur: number,
  type: OscillatorType = "triangle",
  vol = 0.3,
  slideTo?: number,
) {
  if (!ctx || !bus) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(bus);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** Tiếng xì ngắn (múc, lau, cửa) từ nhiễu trắng lọc. */
function noise(bus: GainNode | null, at: number, dur: number, freq: number, vol = 0.2) {
  if (!ctx || !bus) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(bus);
  src.start(at);
}

export function sfx(name: Sfx) {
  if (!ctx || levels.muted) return;
  const t = ctx.currentTime;
  switch (name) {
    case "click":
      tone(busSfx, 880, t, 0.05, "square", 0.08);
      break;
    case "pop":
      tone(busSfx, 520, t, 0.08, "sine", 0.2, 900);
      break;
    case "coin":
      tone(busSfx, 988, t, 0.09, "square", 0.12);
      tone(busSfx, 1319, t + 0.08, 0.25, "square", 0.12);
      break;
    case "scoop":
      noise(busSfx, t, 0.12, 900, 0.25);
      tone(busSfx, 300, t, 0.1, "sine", 0.15, 180);
      break;
    case "plate":
      tone(busSfx, 2100, t, 0.18, "sine", 0.1);
      tone(busSfx, 2640, t + 0.01, 0.15, "sine", 0.06);
      break;
    case "bell":
      tone(busSfx, 1568, t, 0.6, "sine", 0.2);
      tone(busSfx, 2093, t + 0.12, 0.7, "sine", 0.15);
      break;
    case "error":
      tone(busSfx, 196, t, 0.18, "sawtooth", 0.12);
      tone(busSfx, 147, t + 0.12, 0.22, "sawtooth", 0.12);
      break;
    case "door":
      noise(busSfx, t, 0.25, 400, 0.2);
      tone(busSfx, 110, t + 0.18, 0.12, "sine", 0.25);
      break;
    case "shutter":
      // Tách-tách của màn trập: hai tiếng xì ngắn.
      noise(busSfx, t, 0.04, 3000, 0.35);
      noise(busSfx, t + 0.07, 0.05, 2200, 0.3);
      break;
  }
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const lastVoice = new Map<string, number>();

/**
 * Giọng lầm bầm cho một câu nói: số âm tiết theo độ dài câu, cao độ riêng cho mỗi người (theo key),
 * giận thì gắt và nhanh, câu hỏi thì cuối câu lên giọng.
 */
export function voice(key: string, text: string, mood: "calm" | "happy" | "angry" = "calm") {
  if (!ctx || levels.muted || !text) return;
  const now = performance.now();
  if (now - (lastVoice.get(key) ?? 0) < 900) return;
  lastVoice.set(key, now);
  const base = 170 + (hash(key) % 180);
  const syllables = Math.min(14, Math.max(2, Math.round(text.split(/\s+/).length * 0.9)));
  const step = mood === "angry" ? 0.07 : 0.095;
  const type: OscillatorType = mood === "angry" ? "sawtooth" : "triangle";
  let t = ctx.currentTime + 0.02;
  for (let i = 0; i < syllables; i++) {
    const rise = text.trim().endsWith("?") && i === syllables - 1 ? 1.35 : 1;
    const jitter = 0.85 + (hash(`${text}${i}`) % 30) / 100;
    const f = base * jitter * rise * (mood === "angry" ? 1.25 : mood === "happy" ? 1.1 : 1);
    tone(
      busVoice,
      f,
      t,
      step * 0.9,
      type,
      mood === "angry" ? 0.13 : 0.1,
      f * (mood === "angry" ? 0.8 : 1.05),
    );
    t += step;
  }
}

// ───────────────────────── Nhạc nền ─────────────────────────

const PENTA = [0, 2, 4, 7, 9]; // ngũ cung
let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextNote = 0;
let beat = 0;
let mood: "day" | "night" = "day";

export function setMusicMood(m: "day" | "night") {
  mood = m;
}

/** Bắt đầu nhạc nền (gọi sau unlockAudio). Lên lịch trước 0,2 giây để không giật. */
export function startMusic() {
  if (!ctx || musicTimer) return;
  nextNote = ctx.currentTime + 0.1;
  musicTimer = setInterval(() => {
    if (!ctx) return;
    const spb = mood === "night" ? 0.62 : 0.42; // giây mỗi phách
    while (nextNote < ctx.currentTime + 0.25) {
      const root = mood === "night" ? 57 : 62; // A3 / D4
      const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
      // Bè trầm mỗi 4 phách.
      if (beat % 4 === 0) {
        const bassDeg = [0, 3, 4, 2][Math.floor(beat / 4) % 4] ?? 0;
        tone(busMusic, midi(root - 24 + (PENTA[bassDeg] ?? 0)), nextNote, spb * 3.6, "sine", 0.18);
      }
      // Giai điệu kiểu đàn tranh: gảy, tắt nhanh, có lúc nghỉ.
      if ((beat * 7 + 3) % 5 !== 0) {
        const deg = (beat * 3 + Math.floor(beat / 8)) % PENTA.length;
        const oct = beat % 16 < 8 ? 0 : 12;
        const f = midi(root + (PENTA[deg] ?? 0) + oct);
        tone(busMusic, f, nextNote, spb * 1.4, "triangle", mood === "night" ? 0.07 : 0.1);
        tone(busMusic, f * 2, nextNote, spb * 0.5, "sine", 0.02);
      }
      nextNote += spb;
      beat++;
    }
  }, 60);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

// ───────────────────────── Âm thanh môi trường (DESIGN §10, §11) ─────────────────────────
// Phố: tiếng xe chạy rì rì (nhiễu lọc trầm), thỉnh thoảng xe máy chạy ngang (vù — trầm dần), còi "bíp bíp",
// tiếng rao lầm bầm. Trong quán: tiếng người nói chuyện, chén dĩa lách cách. Giờ cao điểm thì dày hơn.

let ambientKind: "street" | "inside" | "off" = "off";
let rainLevel = 0;
let busy = 0.5;
let hum: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let ambientTimer: ReturnType<typeof setTimeout> | null = null;

function startHum() {
  if (!ctx || !busAmbient || hum) return;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    // Nhiễu nâu (trầm, êm) cho tiếng xe chạy xa.
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 380;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(lp).connect(gain).connect(busAmbient);
  src.start();
  hum = { src, gain };
}

function motorbike(at: number) {
  if (!ctx || !busAmbient) return;
  const o = ctx.createOscillator();
  const lp = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = "sawtooth";
  const f = 70 + Math.random() * 40;
  o.frequency.setValueAtTime(f * 1.25, at);
  o.frequency.exponentialRampToValueAtTime(f * 0.8, at + 2.2); // trầm dần khi chạy qua
  lp.type = "lowpass";
  lp.frequency.value = 600;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.09, at + 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 2.4);
  o.connect(lp).connect(g).connect(busAmbient);
  o.start(at);
  o.stop(at + 2.5);
}

function horn(at: number) {
  tone(busAmbient, 440, at, 0.12, "square", 0.05);
  tone(busAmbient, 415, at + 0.18, 0.16, "square", 0.05);
}

function scheduleAmbient() {
  if (ambientTimer) clearTimeout(ambientTimer);
  if (ambientKind === "off") return;
  const wait = (ambientKind === "street" ? 4200 : 3000) / (0.5 + busy) + Math.random() * 2500;
  ambientTimer = setTimeout(() => {
    // Mưa to thì ít xe chạy, ít người rao — nhiều lượt chỉ còn tiếng mưa.
    const quiet = rainLevel > 0.5 && Math.random() < 0.6;
    if (ctx && !levels.muted && !quiet) {
      const t = ctx.currentTime + 0.05;
      const r = Math.random();
      if (ambientKind === "street") {
        if (r < 0.55) motorbike(t);
        else if (r < 0.75) horn(t);
        else voice(`rao-${Math.floor(Math.random() * 4)}`, "bánh mì nóng giòn đây", "happy");
      } else {
        if (r < 0.6)
          voice(`khach-${Math.floor(Math.random() * 6)}`, "nói chuyện rôm rả nè", "calm");
        else tone(busAmbient, 2000 + Math.random() * 800, t, 0.15, "sine", 0.05);
      }
    }
    scheduleAmbient();
  }, wait);
}

/** Đổi lớp âm thanh môi trường: phố / trong quán / tắt; `crowd` 0..1 = mức đông đúc (giờ cao điểm). */
export function setAmbient(kind: "street" | "inside" | "off", crowd: number) {
  busy = crowd;
  if (ctx && kind === "street") {
    startHum();
    hum?.gain.gain.setTargetAtTime(0.05 + crowd * 0.12, ctx.currentTime, 0.8);
  } else if (ctx && hum)
    hum.gain.gain.setTargetAtTime(kind === "inside" ? 0.015 : 0, ctx.currentTime, 0.5);
  if (kind !== ambientKind) {
    ambientKind = kind;
    scheduleAmbient();
  }
}

// ───────────────────────── Mưa, sấm (UC-B4) ─────────────────────────
// Mưa: nhiễu trắng lọc cao ("rào rào") lặp vòng, to nhỏ theo mật độ mưa; trong nhà nghe nhỏ, đục hơn.
// Sấm: tiếng nổ trầm (nhiễu lọc thấp) vang dài, đến sau tia chớp một chút.

let rainNode: { gain: GainNode; lp: BiquadFilterNode } | null = null;

function startRain() {
  if (!ctx || !busAmbient || rainNode) return;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 900;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 6000;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(hp).connect(lp).connect(gain).connect(busAmbient);
  src.start();
  rainNode = { gain, lp };
}

/** Độ to tiếng mưa 0–1 (theo mật độ mưa); `inside`: đang trong nhà (nghe đục, nhỏ). */
export function setRain(level: number, inside: boolean) {
  rainLevel = level;
  if (!ctx) return;
  if (level > 0) startRain();
  if (!rainNode) return;
  const vol = level * (inside ? 0.05 : 0.14);
  rainNode.gain.gain.setTargetAtTime(vol, ctx.currentTime, 1.2);
  rainNode.lp.frequency.setTargetAtTime(inside ? 1800 : 6000, ctx.currentTime, 0.5);
}

/** Tiếng sấm sau `delay` giây. */
export function thunder(delay = 0.6) {
  if (!ctx || !busAmbient || levels.muted) return;
  const at = ctx.currentTime + delay;
  const dur = 2.8;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.05 * (Math.random() * 2 - 1)) / 1.05;
    // Nổ mạnh đầu rồi rền dài.
    d[i] = last * 6 * (i < len * 0.08 ? 1 : (1 - i / len) ** 1.5);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 220;
  const g = ctx.createGain();
  g.gain.value = 0.5;
  src.connect(lp).connect(g).connect(busAmbient);
  src.start(at);
}
