import * as THREE from 'three';

/**
 * Lighting keyframes for the day, blended by the minute of a 40-minute day.
 * Phase table (minutes): dawn 0–3, day 3–23, golden 23–26, blue 26–28, night 28–40.
 * Light azimuth: 0° east (+x), 90° south (+z, behind the Play camera), 180° west. After dusk the directional light is
 * the moon, kept high on the camera's side so night faces read; the moon disc in the sky has its own path (`moonAt`).
 */
export type Key = {
  sunElev: number; sunAzim: number; sun: string; sunI: number; shadows: number;
  /** How much a cast shadow takes away (three's `shadow.intensity`): soft under a low sun or the moon, firm at noon. */
  shadowI: number;
  sky: string; ground: string; ambI: number;
  exposure: number; saturation: number; contrast: number; warm: number; cool: number; vignette: number;
  shafts: number; dust: number; dust_c: string; windows: number; haze: string;
  zenith: string; horizon: string; stars: number; moon: number; clouds: number; cloudLit: string; cloudShade: string;
  /** Hue-shifted grade, as multipliers where #cccccc is 1: shadows lean one way, lights the other (the references' signature). */
  shadowTint: string; lightTint: string;
  /** Cloud shape: 1 round billowing masses (ref-1's midday), higher stretches them into streaks (ref-2's evening). */
  streak: number;
};

const night: Key = {
  // Moonlight after ref-4 and ref-5: deep teal-blue, forms and ground readable, still plainly night.
  sunElev: 42, sunAzim: 118, sun: '#a2c2e2', sunI: 1.5, shadows: 1, shadowI: 0.5,
  sky: '#3a6890', ground: '#121c28', ambI: 1.2,
  exposure: 1.25, saturation: 0.85, contrast: 1.06, warm: 0, cool: 0.55, vignette: 0.55,
  shafts: 0, dust: 0.35, dust_c: '#9ab8e0', windows: 1, haze: '#163440',
  zenith: '#0a2030', horizon: '#2a5a6c', stars: 1, moon: 1, clouds: 0.4, cloudLit: '#7aa0b8', cloudShade: '#142c38',
  shadowTint: '#8cbccc', lightTint: '#d4dad8',
  streak: 1.6,
};
// Before sunrise the moon has set and the sun is not up: the light is the sky's alone, so the light can turn round.
const predawn: Key = {
  ...night,
  sunElev: 20, sunAzim: 40, sun: '#b0a8d4', sunI: 0.5, shadowI: 0.3,
  sky: '#6c78ac', ground: '#2e2a3a', ambI: 3.0, exposure: 1.22, saturation: 0.88, vignette: 0.5,
  haze: '#5c5a88', zenith: '#16234e', horizon: '#9a7aa0', stars: 0.5, moon: 0.4, clouds: 0.5, cloudLit: '#c89ab0', cloudShade: '#3a3260',
  shadowTint: '#9aa0e4', lightTint: '#e0c8d0', windows: 0.7,
};
const dawn: Key = {
  // Sunrise in the east-south-east, so the faces the camera sees catch the first rose-gold light; shadows lean lilac.
  sunElev: 12, sunAzim: 28, sun: '#ffc4a4', sunI: 4.4, shadows: 1, shadowI: 0.45,
  sky: '#98a0c4', ground: '#4e4a50', ambI: 3.4,
  exposure: 1.18, saturation: 1.0, contrast: 1.05, warm: 0.5, cool: 0.3, vignette: 0.4,
  shafts: 0.6, dust: 0.6, dust_c: '#ffd0c0', windows: 0.4, haze: '#d8b0b0',
  zenith: '#3a5090', horizon: '#f4bca0', stars: 0.15, moon: 0.2, clouds: 0.55, cloudLit: '#ffd8bc', cloudShade: '#7a5a8a',
  shadowTint: '#b0b2dc', lightTint: '#ffd8c0',
  streak: 2.0,
};
const day: Key = {
  sunElev: 58, sunAzim: 70, sun: '#fff0e0', sunI: 4.2, shadows: 1, shadowI: 0.85,
  sky: '#7080d0', ground: '#6a5a66', ambI: 1.7,
  exposure: 1.05, saturation: 1.18, contrast: 1.12, warm: 0, cool: 0, vignette: 0.12,
  shafts: 0, dust: 0.25, dust_c: '#fff2c8', windows: 0, haze: '#9aa4d4',
  zenith: '#4d60b8', horizon: '#c4c8dc', stars: 0, moon: 0, clouds: 0.95, cloudLit: '#f2f0f6', cloudShade: '#8591c0',
  shadowTint: '#aeb0f0', lightTint: '#e6dcd0',
  streak: 1.0,
};
const golden: Key = {
  // The evening sun stands in the south-west, behind the Scenery lens: it gilds the faces the view looks at (ref-2).
  sunElev: 12, sunAzim: 150, sun: '#ffd49a', sunI: 6.0, shadows: 1, shadowI: 0.55,
  sky: '#8088b8', ground: '#4a3a2a', ambI: 3.0,
  exposure: 1.2, saturation: 0.95, contrast: 1.15, warm: 0, cool: 0, vignette: 0.45,
  shafts: 1, dust: 1, dust_c: '#ffd29a', windows: 0.3, haze: '#98a2a2',
  // ref-2's sky: slate cloud over a pale cream-gold glow, with warm rims.
  zenith: '#2a3646', horizon: '#f0d49c', stars: 0, moon: 0, clouds: 1, cloudLit: '#f2c88c', cloudShade: '#3b4553',
  shadowTint: '#a8b4cc', lightTint: '#f8d8a4',
  streak: 1.5,
};
// The sun has just gone: an orange afterglow low in the west, rose light on the faces, and no directional light to
// speak of, so the light can swing round to the moon unseen.
const dusk: Key = {
  sunElev: 3, sunAzim: 165, sun: '#ff905c', sunI: 1.3, shadows: 1, shadowI: 0.3,
  sky: '#8a78a4', ground: '#3a2c34', ambI: 2.8,
  exposure: 1.2, saturation: 1.05, contrast: 1.08, warm: 0.4, cool: 0.3, vignette: 0.5,
  shafts: 0.25, dust: 0.5, dust_c: '#f0b8a0', windows: 0.7, haze: '#7a5c80',
  zenith: '#26346a', horizon: '#f0a070', stars: 0.15, moon: 0.45, clouds: 0.6, cloudLit: '#f4a878', cloudShade: '#3c2c52',
  shadowTint: '#b0a6d8', lightTint: '#f4c8b0',
  streak: 2.0,
};
const blue: Key = {
  // Blue hour: the sky's light alone, cool and even, the first lamps warm against it.
  sunElev: 38, sunAzim: 118, sun: '#8ea4d4', sunI: 0.8, shadows: 1, shadowI: 0.35,
  sky: '#5a6c9c', ground: '#1c2234', ambI: 2.0,
  exposure: 1.22, saturation: 0.9, contrast: 1.05, warm: 0.15, cool: 0.6, vignette: 0.5,
  shafts: 0, dust: 0.3, dust_c: '#c0c8f0', windows: 1, haze: '#2c3c64',
  zenith: '#142456', horizon: '#6a5a8a', stars: 0.5, moon: 0.8, clouds: 0.45, cloudLit: '#a080a8', cloudShade: '#252a4c',
  shadowTint: '#a2acd4', lightTint: '#d4c8e0',
  streak: 2.2,
};

/** Control points on the 40-minute dial. */
const points: [number, Key][] = [[0, night], [0.8, predawn], [1.6, dawn], [4.5, day], [21.5, day], [24.5, golden], [26, dusk], [27.2, blue], [29.5, night], [40, night]];

// Colours blend in OKLCh along the shorter hue arc, so a blend of two saturated keys stays saturated instead of
// passing through grey (the "muddy minutes" between golden hour and blue hour).
type Lch = [number, number, number];
const toLch = (hex: string): Lch => {
  const c = new THREE.Color(hex);
  const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b);
  const m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b);
  const s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
};
const fromLch = ([L, C, h]: Lch) => {
  const A = C * Math.cos(h), B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const c = new THREE.Color(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return '#' + new THREE.Color(Math.min(1, Math.max(0, c.r)), Math.min(1, Math.max(0, c.g)), Math.min(1, Math.max(0, c.b))).getHexString();
};
const lch = new Map<string, Lch>();
const lerpHex = (a: string, b: string, t: number) => {
  if (a === b || t <= 0) return a; if (t >= 1) return b;
  const pa = lch.get(a) ?? lch.set(a, toLch(a)).get(a)!, pb = lch.get(b) ?? lch.set(b, toLch(b)).get(b)!;
  // A near-grey end has no meaningful hue: borrow the other end's.
  const ha = pa[1] < 0.02 ? pb[2] : pa[2], hb = pb[1] < 0.02 ? pa[2] : pb[2];
  const dh = Math.atan2(Math.sin(hb - ha), Math.cos(hb - ha));
  return fromLch([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, ha + dh * t]);
};
const smooth = (t: number) => t * t * (3 - 2 * t);
export function keyAt(minute: number): Key {
  const m = ((minute % 40) + 40) % 40;
  let i = 0; while (i < points.length - 2 && points[i + 1][0] <= m) i++;
  const [m0, a] = points[i], [m1, b] = points[i + 1], t = smooth(m1 > m0 ? (m - m0) / (m1 - m0) : 0);
  const out = {} as Key;
  for (const k of Object.keys(a) as (keyof Key)[]) {
    const va = a[k], vb = b[k];
    (out as Record<string, unknown>)[k] = typeof va === 'number' ? va + ((vb as number) - va) * t : lerpHex(va, vb as string, t);
  }
  const da = ((((b.sunAzim - a.sunAzim) % 360) + 540) % 360) - 180;
  out.sunAzim = a.sunAzim + da * t;
  return out;
}

/** The 40-minute dial shown as a 24-hour clock face: dawn begins at 05:00. */
export const minuteToHour = (m: number) => (5 + (((m % 40) + 40) % 40) * 0.6) % 24;
export const hourToMinute = (h: number) => ((((h - 5) / 0.6) % 40) + 40) % 40;
export const phaseOf = (m: number) => { const x = ((m % 40) + 40) % 40; return x < 3 ? 'Dawn' : x < 23 ? 'Day' : x < 26 ? 'Golden hour' : x < 28 ? 'Blue hour' : 'Night'; };

/**
 * Where the moon disc hangs: it rises low in the north-east at dusk, climbs over the north (where the Scenery stop
 * looks) towards midnight and sinks in the north-west before dawn. Low it is a harvest moon, high it is pale.
 */
export function moonAt(minute: number, out = new THREE.Vector3()) {
  const m = ((minute % 40) + 40) % 40, night = m >= 26 ? m - 26 : m + 14; // 0 at dusk, 16 at dawn
  const k = Math.min(1, night / 16);
  const el = THREE.MathUtils.degToRad(3 + 10 * Math.sin(Math.PI * k)), az = THREE.MathUtils.degToRad(300 - 46 * k);
  return out.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
}
/** The moon at midnight; for callers that need one fixed direction. */
export const MOON_DIR = moonAt(33);
