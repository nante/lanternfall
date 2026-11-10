/**
 * Camera stops and the pixel lock.
 * Density is fixed at PX render pixels per world unit horizontally. Pitches are chosen so a ground tile is a whole
 * number of rows tall (sin(pitch) · PX), so every tile drops the same texture rows and no beat pattern appears.
 */
export const PX = 32;

export type StopId = 'close' | 'play' | 'scenery';
/** `chunk` multiplies the upscale: Scenery paints in blocks half as large again, so a vista's detail holds but still reads as pixel art. */
export type Stop = { id: StopId; label: string; pitch: number; zoomStep: number; ortho: boolean; picking: boolean; chunk: number };

export const stops: Record<StopId, Stop> = {
  close: { id: 'close', label: 'Close', pitch: Math.asin(7 / 8), zoomStep: 1, ortho: true, picking: true, chunk: 1 },
  play: { id: 'play', label: 'Play', pitch: Math.asin(3 / 4), zoomStep: 0, ortho: true, picking: true, chunk: 1 },
  scenery: { id: 'scenery', label: 'Scenery', pitch: (2 * Math.PI) / 180, zoomStep: 0, ortho: false, picking: false, chunk: 1.5 },
};
export const stopOrder: StopId[] = ['close', 'play', 'scenery'];

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
