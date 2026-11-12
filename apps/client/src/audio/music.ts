// Background music: one looping track through Web Audio, so the loop point has no gap (an <audio loop> stutters there).
// Browsers refuse sound before the player has touched the page, so it starts on the first click or key and fades in.
import trackUrl from '../../../../content/audio/music/underlight.ogg?url';

const KEY = 'lanternfall.music';
const FADE_IN = 4;
/** The earlier Off / Low / Medium / High choice, carried over. */
const legacy: Record<string, number> = { off: 0, low: 45, medium: 65, high: 90 };
let volume = 65;
try {
  const saved = localStorage.getItem(KEY) ?? '';
  const n = legacy[saved] ?? Number.parseInt(saved, 10);
  if (Number.isFinite(n)) volume = Math.min(100, Math.max(0, n));
} catch { /* storage blocked: default volume */ }

let ctx: AudioContext | undefined;
let gain: GainNode | undefined;
/** Loudness follows the square of the slider, so equal steps sound like equal steps. */
const gainOf = (v: number) => (v / 100) ** 2;

/** Music volume, 0–100. */
export const musicVolume = () => volume;

export function setMusicVolume(v: number) {
  volume = Math.min(100, Math.max(0, Math.round(v)));
  try { localStorage.setItem(KEY, String(volume)); } catch { /* the choice just won't survive a reload */ }
  if (ctx && gain) { gain.gain.cancelScheduledValues(ctx.currentTime); gain.gain.setTargetAtTime(gainOf(volume), ctx.currentTime, 0.05); }
}

async function play() {
  ctx = new AudioContext();
  gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const buffer = await ctx.decodeAudioData(await (await fetch(trackUrl)).arrayBuffer());
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  source.start();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(gainOf(volume), ctx.currentTime + FADE_IN);
  // A hidden tab goes quiet instead of playing on in the background.
  document.addEventListener('visibilitychange', () => { if (document.hidden) void ctx?.suspend(); else void ctx?.resume(); });
}

/** Arms the music: it begins with the player's first click or key press. */
export function startMusic() {
  const begin = () => {
    removeEventListener('pointerdown', begin, true);
    removeEventListener('keydown', begin, true);
    play().catch(e => console.error('The music could not start.', e));
  };
  addEventListener('pointerdown', begin, true);
  addEventListener('keydown', begin, true);
}
