// Loads hand-made textures from content/art. Bundled by Vite, so the desktop build carries them too.
import { artSlots } from '../../../../packages/game/src/art-slots.ts';
import { setTextureOverride } from './textures.ts';

const files = import.meta.glob('../../../../content/art/*/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export async function loadTextureOverrides() {
  const errors: string[] = [];
  await Promise.all(Object.entries(files).map(async ([path, url]) => {
    const m = path.match(/content\/art\/([a-z]+)\/([a-z]+)\.png$/);
    const slot = m && artSlots.find(s => s.family === m[1] && s.kind === m[2]);
    if (!slot) return;
    try {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      if (bitmap.width !== slot.width || bitmap.height !== slot.height) throw new Error(`is ${bitmap.width}×${bitmap.height}, expected ${slot.width}×${slot.height}`);
      const c = new OffscreenCanvas(bitmap.width, bitmap.height), g = c.getContext('2d')!;
      g.drawImage(bitmap, 0, 0);
      setTextureOverride(slot.id, { width: bitmap.width, height: bitmap.height, data: g.getImageData(0, 0, bitmap.width, bitmap.height).data });
    } catch (e) { errors.push(`content/${slot.path}: ${(e as Error).message}`); }
  }));
  if (errors.length) throw new Error(`Some hand-made textures could not be loaded:\n${errors.join('\n')}`);
}
