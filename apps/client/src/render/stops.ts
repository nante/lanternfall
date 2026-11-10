/**
 * Camera stops (the player's perspectives) and the pixel lock.
 * Density is fixed at PX render pixels per world unit horizontally. Orthographic pitches are chosen so a ground tile is
 * a whole number of rows tall (sin(pitch) · PX), so every tile drops the same texture rows and no beat pattern appears.
 */
export const PX = 32;

export type StopId = 'top' | 'close' | 'play' | 'third' | 'first' | 'scenery';
/**
 * A perspective lens, relative to the hero's feet and the camera's yaw: the lens stands `back` tiles behind and `up`
 * tiles above them and aims at the point `ahead` tiles in front at height `look`. `ahead` lets a first-person eye look
 * forward from the head instead of down at its own feet.
 */
export type Eye = { back: number; up: number; ahead: number; look: number; fov: number };
/**
 * Distance fog, measured from the hero so it closes before the server's actor window (22 tiles) runs out. `top`: fog
 * fades out between these world heights, so far landmarks stand clear above it; omit for fog at every height.
 */
export type StopFog = { near: number; far: number; top?: [number, number] };
type StopBase = {
  id: StopId; label: string;
  /**
   * The pitch figures are baked at. One bake is 64 MB of atlas on each of CPU and GPU and about 0.4 s of work, so stops
   * share two: the orthographic stops draw figures as Tilt sees them (a 3/4 sprite over a steeper map, as top-down
   * pixel RPGs do), and every lens draws them from just above head height.
   */
  figures: number;
  zoomStep: number;
  /** Multiplies the upscale: the Vista paints in blocks half as large again, so its detail still reads as pixel art. */
  chunk: number;
  picking: boolean;
  /** Free yaw turns with Q and E and makes movement keys camera-relative; fixed yaw is north-up. */
  yaw: 'fixed' | 'free';
  /** The non-interactive far view: needs open sky, a click returns to play, the wheel never reaches it. */
  vista: boolean;
};
/** `pitch`: the orthographic camera's pitch. */
export type Stop = StopBase & ({ projection: 'ortho'; pitch: number } | { projection: 'persp'; eye: Eye; fog: StopFog });

const TILT = Math.asin(3 / 4), LOW = (9 * Math.PI) / 180;
export const stops = {
  top: { id: 'top', label: 'Top-down', projection: 'ortho', pitch: Math.asin(31 / 32), figures: TILT, zoomStep: 0, chunk: 1, picking: true, yaw: 'fixed', vista: false },
  close: { id: 'close', label: 'Close', projection: 'ortho', pitch: Math.asin(7 / 8), figures: TILT, zoomStep: 1, chunk: 1, picking: true, yaw: 'fixed', vista: false },
  play: { id: 'play', label: 'Tilt', projection: 'ortho', pitch: TILT, figures: TILT, zoomStep: 0, chunk: 1, picking: true, yaw: 'fixed', vista: false },
  third: {
    id: 'third', label: 'Third person', projection: 'persp', figures: LOW, zoomStep: 0, chunk: 1, picking: true, yaw: 'free', vista: false,
    eye: { back: 5, up: 2.3, ahead: 1.5, look: 1.3, fov: 52 }, fog: { near: 9, far: 38, top: [0.3, 7] },
  },
  first: {
    id: 'first', label: 'First person', projection: 'persp', figures: LOW, zoomStep: 0, chunk: 1, picking: true, yaw: 'free', vista: false,
    eye: { back: 0.6, up: 1.25, ahead: 8, look: 0.5, fov: 70 }, fog: { near: 9, far: 38, top: [0.3, 7] },
  },
  scenery: {
    id: 'scenery', label: 'Vista', projection: 'persp', figures: LOW, zoomStep: 0, chunk: 1.5, picking: false, yaw: 'fixed', vista: true,
    eye: { back: 30, up: 4.4, ahead: 0, look: 7.4, fov: 30 }, fog: { near: 62, far: 672 },
  },
} satisfies Record<StopId, Stop>;
/** The wheel and `-` / `=` walk this order; pitch falls along it. The Vista has its own key. */
export const stopOrder: StopId[] = ['top', 'close', 'play', 'third', 'first'];
export const stopIds = Object.keys(stops) as StopId[];
export const isStopId = (s: string): s is StopId => s in stops;

/**
 * A movement key's step (screen up is dy −1) turned into the world by the camera yaw and snapped to the 8 tile
 * directions. Yaw 0 looks north; positive yaw turns the view to the left.
 */
export function stepFromView(dx: number, dy: number, yaw: number): [number, number] {
  if (!dx && !dy) return [0, 0];
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const a = Math.round(Math.atan2(-dx * s + dy * c, dx * c + dy * s) / (Math.PI / 4)) * (Math.PI / 4);
  return [Math.round(Math.cos(a)) || 0, Math.round(Math.sin(a)) || 0];
}

/** The server treats a 17×13-tile window as on screen (balance.world.viewX/viewY); Play must show at least that much. */
const SERVER_VIEW = { w: 17, h: 13 };
/** Whole-number upscale from the host's physical height, capped so Play covers the server window; Close is one step bigger. */
export function pixelLock(hostCssW: number, hostCssH: number, dpr: number, stop: Stop) {
  const physW = Math.round(hostCssW * dpr), physH = Math.round(hostCssH * dpr);
  const cover = Math.floor(Math.min(physW / (SERVER_VIEW.w * PX), physH / (SERVER_VIEW.h * PX * 0.75)));
  const k = Math.round((Math.max(2, Math.min(Math.round(physH / 290), cover)) + stop.zoomStep) * stop.chunk);
  const bufW = Math.floor(physW / k), bufH = Math.floor(physH / k);
  return { k, bufW, bufH, cssW: (bufW * k) / dpr, cssH: (bufH * k) / dpr, viewW: bufW / PX, viewH: bufH / PX };
}
