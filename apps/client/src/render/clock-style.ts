import * as THREE from 'three';

/**
 * Five lighting keyframes for the day, blended by the minute of a 40-minute day.
 * Phase table (minutes): dawn 0–3, day 3–23, golden 23–26, blue 26–28, night 28–40.
 * Sun azimuth: 0° east (+x), 90° south (+z, behind the camera), 180° west.
 */
export type Key = {
  sunElev: number; sunAzim: number; sun: string; sunI: number; shadows: number;
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
  sunElev: 28, sunAzim: 290, sun: '#8fa6d8', sunI: 0.7, shadows: 1,
  sky: '#2a3570', ground: '#0c1020', ambI: 0.6,
  exposure: 1.2, saturation: 0.6, contrast: 1.05, warm: 0, cool: 1, vignette: 0.75,
  shafts: 0, dust: 0.4, dust_c: '#9ab0d8', windows: 1, haze: '#141c30',
  zenith: '#070a1a', horizon: '#1d2750', stars: 1, moon: 1, clouds: 0.35, cloudLit: '#3c4a78', cloudShade: '#141a31',
  shadowTint: '#99aaff', lightTint: '#d8d0e6',
  streak: 2.0,
};
const dawn: Key = {
  sunElev: 6, sunAzim: 330, sun: '#ffb0a0', sunI: 2.6, shadows: 1,
  sky: '#7a74a8', ground: '#4a3c50', ambI: 4.2,
  exposure: 1.15, saturation: 0.95, contrast: 1.05, warm: 0.5, cool: 0.7, vignette: 0.45,
  shafts: 0.6, dust: 0.6, dust_c: '#ffd0c0', windows: 0.4, haze: '#c89aa8',
  zenith: '#34427a', horizon: '#e8a49c', stars: 0.2, moon: 0.3, clouds: 0.55, cloudLit: '#ffd2b8', cloudShade: '#74507e',
  shadowTint: '#a8a0e8', lightTint: '#ffd0c0',
  streak: 2.2,
};
const day: Key = {
  sunElev: 58, sunAzim: 70, sun: '#fff0e0', sunI: 4.2, shadows: 1,
  sky: '#7080d0', ground: '#6a5a66', ambI: 1.7,
  exposure: 1.05, saturation: 1.18, contrast: 1.12, warm: 0, cool: 0, vignette: 0.12,
  shafts: 0, dust: 0.25, dust_c: '#fff2c8', windows: 0, haze: '#9aa4d4',
  zenith: '#4d60b8', horizon: '#c4c8dc', stars: 0, moon: 0, clouds: 0.95, cloudLit: '#e6e4ee', cloudShade: '#8591c0',
  shadowTint: '#aeb0f0', lightTint: '#e6dcd0',
  streak: 1.0,
};
const golden: Key = {
  // The evening sun stands in the south-west, behind the Scenery lens: it gilds the faces the view looks at (ref-2).
  sunElev: 12, sunAzim: 150, sun: '#ffd49a', sunI: 6.0, shadows: 1,
  sky: '#7890a0', ground: '#3a3226', ambI: 3.0,
  exposure: 1.2, saturation: 0.95, contrast: 1.15, warm: 0, cool: 0, vignette: 0.45,
  shafts: 1, dust: 1, dust_c: '#ffd29a', windows: 0.3, haze: '#98a2a2',
  // ref-2's sky: slate cloud over a pale cream-gold glow, with warm rims.
  zenith: '#2a3646', horizon: '#f0d49c', stars: 0, moon: 0, clouds: 1, cloudLit: '#f2c88c', cloudShade: '#3b4553',
  shadowTint: '#a0bcc8', lightTint: '#f4d8a8',
  streak: 1.5,
};
const blue: Key = {
  sunElev: -4, sunAzim: 250, sun: '#4a5a9a', sunI: 0, shadows: 0,
  sky: '#34488a', ground: '#141826', ambI: 0.9,
  exposure: 1.2, saturation: 0.9, contrast: 1.05, warm: 0.2, cool: 1, vignette: 0.6,
  shafts: 0, dust: 0.3, dust_c: '#c0c8f0', windows: 1, haze: '#23305a',
  zenith: '#162050', horizon: '#5a4a7c', stars: 0.5, moon: 0.75, clouds: 0.45, cloudLit: '#a8708e', cloudShade: '#2d2140',
  shadowTint: '#9aa0f0', lightTint: '#d0c0e0',
  streak: 2.4,
};

/** Control points on the 40-minute dial; linear between them. */
const points: [number, Key][] = [[0, night], [1.5, dawn], [4.5, day], [21.5, day], [24.5, golden], [27, blue], [29.5, night], [40, night]];

const lerpHex = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
export function keyAt(minute: number): Key {
  const m = ((minute % 40) + 40) % 40;
  let i = 0; while (i < points.length - 2 && points[i + 1][0] <= m) i++;
  const [m0, a] = points[i], [m1, b] = points[i + 1], t = m1 > m0 ? (m - m0) / (m1 - m0) : 0;
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

/** Where the moon hangs in the sky: low in the north, where the Scenery stop looks. */
export const MOON_DIR = (() => { const el = (13 * Math.PI) / 180, az = (284 * Math.PI) / 180; return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize(); })();
