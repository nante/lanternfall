import type { RenderStyle } from './content-schema.ts';

export type StylePreset = { id: string; blurb: string; flat: boolean; style: RenderStyle };

const golden: RenderStyle = {
  name: 'Golden hour', pitch: 50, viewHeight: 8.4, pixelHeight: 215,
  sunElevation: 37, sunAzimuth: -147, sunIntensity: 4.4, sunWarmth: 1, ambient: 1.9, ambientTint: 1, shadows: true,
  exposure: 1.7, saturation: 1.18, contrast: 1, warmHighlights: 1, coolShadows: 1, vignette: 0.6, levels: 48, dither: 0.5,
  groundBrightness: 1, groundDetail: 1, outline: 0.45, rim: 0.55, grid: 0, grass: 1, grassHeight: 1, dapple: 1, shafts: 1, dust: 1, actorPop: 0, alwaysNames: false,
};

/** Five directions. The first is the current mood; the rest trade atmosphere for legibility in different ways. */
export const stylePresets: StylePreset[] = [
  { id: 'golden', flat: false, blurb: 'The current look: low warm sun, long shadows, light shafts, dense grass. Moody, but shade and clutter hide things.', style: golden },
  {
    id: 'noon', flat: false, blurb: 'Same world under a high sun. Short crisp shadows, neutral colour, quiet ground, characters lifted and always named.',
    style: { ...golden, name: 'Clear noon', groundBrightness: 1.45, groundDetail: 0.55, sunElevation: 64, sunAzimuth: -125, sunIntensity: 3.6, sunWarmth: 0.25, ambient: 2.6, ambientTint: 0.45, exposure: 1.55, saturation: 1.1, contrast: 1.05, warmHighlights: 0.2, coolShadows: 0.35, vignette: 0.15, outline: 0.7, rim: 0.2, grid: 0.06, grass: 0.4, grassHeight: 0.7, dapple: 0.2, shafts: 0, dust: 0, actorPop: 0.18, alwaysNames: true },
  },
  {
    id: 'ink', flat: false, blurb: 'Storybook print: heavy dark outlines on everything, bold saturated colour in few tones, soft two-step shading.',
    style: { ...golden, name: 'Ink & paint', groundBrightness: 1.5, groundDetail: 0.3, sunElevation: 55, sunAzimuth: -135, sunIntensity: 2.8, sunWarmth: 0.35, ambient: 3, ambientTint: 0.3, exposure: 1.5, saturation: 1.45, contrast: 1.2, warmHighlights: 0.3, coolShadows: 0.2, vignette: 0.1, levels: 14, dither: 0, outline: 1, rim: 0, grid: 0, grass: 0.25, grassHeight: 0.8, dapple: 0, shafts: 0, dust: 0, actorPop: 0.25, alwaysNames: true },
  },
  {
    id: 'flat34', flat: true, blurb: 'Flat 2D, three-quarter view: no cast shadows, even light, faces told apart by a faint top light and outlines. Reads like a sprite game.',
    style: { ...golden, name: 'Flat ¾ sprites', groundBrightness: 1.75, groundDetail: 0.35, pitch: 52, viewHeight: 9, pixelHeight: 230, sunElevation: 70, sunAzimuth: -120, sunIntensity: 1.1, sunWarmth: 0, ambient: 3.4, ambientTint: 0, shadows: false, exposure: 1.35, saturation: 1.3, contrast: 1.1, warmHighlights: 0, coolShadows: 0, vignette: 0, levels: 40, dither: 0, outline: 1, rim: 0, grid: 0.1, grass: 0.2, grassHeight: 0.6, dapple: 0, shafts: 0, dust: 0, actorPop: 0.3, alwaysNames: true },
  },
  {
    id: 'flatmap', flat: true, blurb: 'Flat 2D, near top-down: a tactical map. Tile grid on, no grass clutter, big readable figures. Clarity over atmosphere.',
    style: { ...golden, name: 'Flat map', groundBrightness: 1.8, groundDetail: 0.2, pitch: 84, viewHeight: 11, pixelHeight: 260, sunElevation: 80, sunAzimuth: -120, sunIntensity: 0.8, sunWarmth: 0, ambient: 3.6, ambientTint: 0, shadows: false, exposure: 1.3, saturation: 1.25, contrast: 1.12, warmHighlights: 0, coolShadows: 0, vignette: 0, levels: 40, dither: 0, outline: 1, rim: 0, grid: 0.22, grass: 0, grassHeight: 0.5, dapple: 0, shafts: 0, dust: 0, actorPop: 0.35, alwaysNames: true },
  },
];
export const defaultStyle = golden;
