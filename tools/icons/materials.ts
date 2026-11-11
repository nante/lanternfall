/**
 * Icon materials. Each ramp runs outline, deep shadow, shadow, base, light, highlight, and for shiny materials a
 * specular colour. Every hex comes from the game's palette family (apps/client/src/render/palette.ts ramps and the
 * reference colours, and the figure materials in render/figures/kit.ts), hue-shifted by hand: shadows lean violet or
 * blue, lights lean warm. `rim` is the cool backlight laid on the shadow side's edge. `kind` decides the specular
 * treatment in the painted icon and the material tag of the world sprite.
 */
export type Kind = 'matte' | 'metal' | 'gem' | 'glass' | 'liquid' | 'emissive';
export type Grain = 'none' | 'wood' | 'cloth' | 'speckle' | 'fur';
export type Material = { ramp: readonly string[]; kind: Kind; rim: string; grain?: Grain; amount?: number };

const m = (ramp: string[], kind: Kind, rim: string, grain: Grain = 'none', amount = 0): Material => ({ ramp, kind, rim, grain, amount });

export const materials = {
  // Metals by tier: pitted iron, iron, steel, blackened steel, bronze, silver, gilded.
  rust: m(['#191725', '#3b2819', '#5a3d27', '#6f6a63', '#8c867b', '#aaa395', '#c8c0ae'], 'metal', '#736574', 'speckle', 0.5),
  iron: m(['#191725', '#3e3d3f', '#55524f', '#6f6a63', '#8c867b', '#aaa395', '#d2d3d3'], 'metal', '#7a879c'),
  steel: m(['#0b1122', '#2d3a70', '#55627a', '#7a879c', '#a7b4cb', '#d2d3d3', '#fdfefd'], 'metal', '#8591c0'),
  dark: m(['#06070d', '#141a31', '#2b365d', '#3e4c81', '#616ca1', '#99a5cd', '#d2d3d3'], 'metal', '#a8708e'),
  bronze: m(['#2e130b', '#43301a', '#7d5b2e', '#a07636', '#c4923f', '#e5c18a', '#f6e1c5'], 'metal', '#854457'),
  copper: m(['#2e130b', '#5c2410', '#93391a', '#c95a24', '#ec8a35', '#ffb95e', '#ffe2a0'], 'metal', '#854457'),
  silver: m(['#191725', '#3c2e3e', '#736574', '#a7b4cb', '#d2d3d3', '#fdfefd', '#fdfefd'], 'metal', '#8591c0'),
  gold: m(['#2e130b', '#5e4424', '#a07636', '#c4923f', '#efb759', '#ffe2a0', '#fdfefd'], 'metal', '#a8708e'),
  mail: m(['#191725', '#3e3d3f', '#55524f', '#6f6a63', '#8c867b', '#aaa395', '#d2d3d3'], 'metal', '#7a879c', 'speckle', 0.4),
  // Woods and leathers.
  wood: m(['#1a120c', '#2c1f15', '#4d3422', '#6b4a30', '#a07a4e', '#c4a072'], 'matte', '#4a3460', 'wood', 0.45),
  oak: m(['#2c1f15', '#4d3422', '#7b5737', '#a07a4e', '#c4a072', '#ece2c8'], 'matte', '#74507e', 'wood', 0.4),
  darkwood: m(['#130e04', '#1a120c', '#2c1f15', '#3b2819', '#5a3d27', '#7b5737'], 'matte', '#2d2140', 'wood', 0.45),
  leather: m(['#1a120c', '#2c1f15', '#3b2819', '#5a3d27', '#7b5737', '#a07a4e'], 'matte', '#4a3460', 'cloth', 0.3),
  redleather: m(['#2e130b', '#3f1716', '#6a2621', '#963c30', '#bd6447', '#d39a9c'], 'matte', '#4a3460', 'cloth', 0.3),
  // Cloths.
  felt: m(['#2e130b', '#3f1716', '#6a2621', '#963c30', '#bd6447', '#d39a9c'], 'matte', '#4a3460', 'cloth', 0.35),
  quilt: m(['#2a1d0f', '#43301a', '#5e4424', '#7d5b2e', '#a07636', '#c4923f'], 'matte', '#4a3460', 'cloth', 0.4),
  linen: m(['#3e3d3f', '#736574', '#aaa395', '#d6ccb2', '#ece2c8', '#fbf4e2'], 'matte', '#99a5cd', 'cloth', 0.3),
  blue: m(['#0b1122', '#10283a', '#1d4058', '#2f6180', '#4f8daa', '#8cc0d2'], 'matte', '#99a5cd', 'cloth', 0.3),
  canvas: m(['#141c07', '#2c3318', '#434c20', '#5e6a2b', '#7f8b38', '#a6ad4c'], 'matte', '#3a5878', 'cloth', 0.35),
  wool: m(['#2e130b', '#4a2418', '#6c3223', '#8a4a36', '#a8664a', '#c39569'], 'matte', '#4a3460', 'cloth', 0.35),
  purple: m(['#0c0f1e', '#2d2140', '#4a3460', '#74507e', '#a8708e', '#d39a9c'], 'matte', '#525f95', 'cloth', 0.3),
  // Organic.
  bone: m(['#3e3d3f', '#736574', '#aaa395', '#d6ccb2', '#ece2c8', '#fbf4e2'], 'matte', '#99a5cd'),
  ivory: m(['#3c2e3e', '#8c867b', '#c2ae87', '#d6ccb2', '#f6e1c5', '#fbf4e2'], 'matte', '#99a5cd'),
  crust: m(['#2a1d0f', '#5e4424', '#7d5b2e', '#a07636', '#c4923f', '#e5c18a'], 'matte', '#854457', 'speckle', 0.25),
  crumb: m(['#7b5737', '#a07a4e', '#c4a072', '#ece2c8', '#f6e1c5', '#fbf4e2'], 'matte', '#c8ac9f', 'speckle', 0.3),
  cheese: m(['#5e4424', '#a07636', '#c4923f', '#e5c18a', '#f4d399', '#ffe2a0'], 'matte', '#b77c65'),
  rind: m(['#2e130b', '#3f1716', '#6a2621', '#963c30', '#be5b54', '#d39a9c'], 'matte', '#4a3460'),
  apple: m(['#2e130b', '#3f1716', '#6a2621', '#963c30', '#be5b54', '#e3b48c', '#fbf4e2'], 'glass', '#74507e'),
  leaf: m(['#0a120d', '#18291c', '#2b4a2d', '#4a7139', '#678d43', '#90ab55'], 'matte', '#3a5878'),
  meat: m(['#2e130b', '#3f1716', '#6a2621', '#854457', '#a8708e', '#d39a9c', '#f6e1c5'], 'glass', '#4a3460'),
  fat: m(['#736574', '#a8708e', '#c8ac9f', '#e3b48c', '#f6e1c5', '#fbf4e2'], 'matte', '#99a5cd'),
  fish: m(['#0f2135', '#1d4058', '#3a5878', '#727cab', '#a7b4cb', '#d2d3d3', '#fdfefd'], 'metal', '#8591c0'),
  mushroom: m(['#2c1f15', '#584a39', '#8b795b', '#c2ae87', '#d6ccb2', '#ece2c8'], 'matte', '#736574'),
  cap: m(['#2a1d0f', '#43301a', '#7d5b2e', '#a07636', '#c4923f', '#e5c18a'], 'matte', '#74507e', 'speckle', 0.2),
  fur: m(['#191725', '#3e3d3f', '#55524f', '#71614a', '#8b795b', '#a6936f'], 'matte', '#736574', 'fur', 0.5),
  pink: m(['#2d2140', '#4a3460', '#9a6446', '#a8708e', '#d39a9c', '#e3b48c'], 'matte', '#74507e'),
  hide: m(['#130e04', '#1a120c', '#2c1f15', '#4d3422', '#6b4a30', '#7b5737'], 'matte', '#4a3460', 'fur', 0.5),
  chitin: m(['#06070d', '#0b1122', '#1c295c', '#3d499b', '#616ca1', '#8591c0', '#d2d3d3'], 'metal', '#a8708e'),
  silk: m(['#584a39', '#a6936f', '#c2ae87', '#ece2c8', '#fbf4e2', '#fdfefd'], 'matte', '#99a5cd', 'cloth', 0.25),
  wax: m(['#43301a', '#7f804d', '#a6ad4c', '#cdc875', '#dccd5b', '#ece2c8', '#fdfefd'], 'glass', '#74507e'),
  paper: m(['#584a39', '#8b795b', '#c2ae87', '#d6ccb2', '#ece2c8', '#fbf4e2'], 'matte', '#99a5cd', 'speckle', 0.2),
  stone: m(['#191725', '#3e3d3f', '#55524f', '#6f6a63', '#8c867b', '#aaa395'], 'matte', '#7a879c', 'speckle', 0.3),
  rope: m(['#2c1f15', '#584a39', '#8b795b', '#a6936f', '#c2ae87', '#d6ccb2'], 'matte', '#736574', 'wood', 0.4),
  // Glass and liquids.
  glass: m(['#132a3b', '#313c4a', '#545e6b', '#8c8f83', '#b8c3cb', '#d2d3d3', '#fdfefd'], 'glass', '#8591c0'),
  red: m(['#2e130b', '#3f1716', '#6a2621', '#963c30', '#be5b54', '#d39a9c', '#fdfefd'], 'liquid', '#a8708e'),
  bluedrop: m(['#06070d', '#16204c', '#243166', '#3d499b', '#616ca1', '#99a5cd', '#fdfefd'], 'liquid', '#a8708e'),
  amberdrop: m(['#2a1d0f', '#5c2410', '#93391a', '#c95a24', '#ec8a35', '#ffb95e', '#fdfefd'], 'liquid', '#a8708e'),
  honey: m(['#2a1d0f', '#5e4424', '#a07636', '#c4923f', '#efb759', '#ffe2a0', '#fdfefd'], 'liquid', '#a8708e'),
  // Gems.
  garnet: m(['#191725', '#3c2e3e', '#6a3c5a', '#854457', '#be5b54', '#d39a9c', '#fdfefd'], 'gem', '#d39a9c'),
  sapphire: m(['#06070d', '#0f163b', '#1c295c', '#3d499b', '#616ca1', '#99a5cd', '#fdfefd'], 'gem', '#a8708e'),
  emerald: m(['#0a120d', '#142218', '#233d27', '#335631', '#4a7139', '#90ab55', '#fdfefd'], 'gem', '#8cc0d2'),
  amethyst: m(['#0c0f1e', '#2d2140', '#4a3460', '#74507e', '#a8708e', '#d39a9c', '#fdfefd'], 'gem', '#99a5cd'),
  amber: m(['#2a1d0f', '#5e4424', '#a07636', '#c4923f', '#efb759', '#ffe2a0', '#fdfefd'], 'gem', '#be5b54'),
  pearl: m(['#4c4a45', '#8c8f83', '#b8c3cb', '#d2d3d3', '#f6e1c5', '#fdfefd', '#fdfefd'], 'gem', '#d39a9c'),
  // Light.
  flame: m(['#5c2410', '#93391a', '#c95a24', '#ec8a35', '#ffb95e', '#ffe2a0'], 'emissive', '#ffe2a0'),
  ember: m(['#2e130b', '#5c2410', '#93391a', '#c95a24', '#ec8a35', '#ffb95e'], 'emissive', '#ffb95e'),
  // Magic only: the Lantern's teal (palette.ts says teal means magic and nothing else).
  magic: m(['#0d3236', '#0d3236', '#17605e', '#2c9a8e', '#5fd7c4', '#bff7ec'], 'emissive', '#bff7ec'),
  // Interface glyphs: parchment on its own outline.
  ink: m(['#06070d', '#3b2819', '#7b5737', '#c4a072', '#ece2c8', '#fbf4e2'], 'matte', '#99a5cd'),
} satisfies Record<string, Material>;
export type MatId = keyof typeof materials;
