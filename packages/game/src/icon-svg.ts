import { iconAlphabet, ICON_SIZE as S, type IconDef } from './content-schema.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Renders an indexed icon as crisp SVG, merging same-colour horizontal runs. */
export function iconSvg(def: IconDef, label?: string) {
  let rects = '';
  def.pixels.forEach((row, y) => {
    let x = 0;
    while (x < S) {
      const ch = row[x];
      let w = 1;
      while (x + w < S && row[x + w] === ch) w++;
      if (ch !== '.') rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${def.palette[iconAlphabet.indexOf(ch)]}"/>`;
      x += w;
    }
  });
  return `<svg viewBox="0 0 ${S} ${S}" shape-rendering="crispEdges" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${rects}</svg>`;
}
