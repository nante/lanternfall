// Texture slots that hand-made PNGs may replace. A slot without a PNG keeps its procedural generator.
export const artFamilies = {
  ground: { width: 64, height: 64, note: '2×2 world tiles, 32 px per tile', kinds: ['grass', 'meadow', 'dirt', 'cobble', 'plank', 'stone', 'sand', 'moss', 'flagstone'] },
  wall: { width: 16, height: 32, note: '1 tile wide, 2 tiles tall', kinds: ['plaster', 'stone', 'timber', 'rampart', 'cave'] },
  roof: { width: 16, height: 16, note: 'tiles along the roof slope', kinds: ['slate', 'clay', 'thatch', 'teal'] },
} as const;
export type ArtFamily = keyof typeof artFamilies;
export type ArtSlot = { id: string; family: ArtFamily; kind: string; width: number; height: number; path: string };

export const artSlots: ArtSlot[] = (Object.entries(artFamilies) as [ArtFamily, (typeof artFamilies)[ArtFamily]][]).flatMap(([family, f]) =>
  f.kinds.map(kind => ({ id: `${family}.${kind}`, family, kind, width: f.width, height: f.height, path: `art/${family}/${kind}.png` })));
export const artSlot = (id: string) => artSlots.find(s => s.id === id);
