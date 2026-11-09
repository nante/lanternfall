import { z } from 'zod';
import { equipSlots, itemKinds, mobKinds, npcRoles, spellIds, uiIcons, type ItemKind } from './ids.ts';

const n = (min = 0) => z.number().finite().min(min);
const int = (min = 0) => z.number().int().min(min);
const fraction = z.number().finite().min(0).max(1);
const exhaustive = <K extends readonly [string, ...string[]], V extends z.ZodTypeAny>(keys: K, value: V) =>
  z.object(Object.fromEntries(keys.map(k => [k, value])) as { [P in K[number]]: V }).strict();
const itemRef = z.enum(itemKinds);

/**
 * True if ⌊(a·n³ + b·n² + c·n)/3⌋ rises by at least 1 for every n ≥ 0. The unfloored step from n to n+1 is
 * a·n² + (a + 2b/3)·n + (a + b + c)/3, a parabola; with a > 0 its minimum over integers is at 0 or next to the vertex.
 */
export function xpCurveRises([a, b, c]: [number, number, number]) {
  if (!(a > 0)) return false;
  const B = a + (2 * b) / 3, C = (a + b + c) / 3;
  const step = (n: number) => a * n * n + B * n + C;
  const v = -B / (2 * a);
  const candidates = [0, Math.floor(v), Math.ceil(v)].filter(n => n >= 0);
  return candidates.every(n => step(n) >= 1);
}

export const Progression = z.object({
  hpBase: int(1), hpPerLevel: int(0), manaBase: int(0), manaPerLevel: int(0), capBase: n(1), capPerLevel: n(0),
  xpCurve: z.tuple([n(0.001), z.number().finite(), z.number().finite()]),
  stepMs: int(50), attackMs: int(100), monsterAttackMs: int(100), regenMs: int(100),
  deathXpLoss: fraction, deathSkillLoss: fraction,
  meleeSkillBase: n(1), shieldSkillBase: n(1), skillGrowth: z.number().finite().gt(1),
  magicBase: int(1), magicGrowth: z.number().finite().gt(1), respawnMs: int(1000),
}).strict();

/** World rules modelled on 7.6-era behaviour: luring, respawn, corpse decay. Defaults let older files parse. */
export const World = z.object({
  viewX: int(1).max(12), viewY: int(1).max(10),
  lureLimit: int(5).max(200), wanderRadius: int(0).max(10),
  respawnMin: z.number().min(0.1).max(1), respawnMax: z.number().min(0.1).max(2), blockRange: int(0).max(15),
  corpseStages: z.tuple([int(1), int(1), int(1)]), heroCorpseStages: z.tuple([int(1), int(1), int(1)]),
  lootProtectSec: int(0).max(600),
  throwRange: int(0).max(10).default(7), tileItemLimit: int(1).max(100).default(20),
  // Movement: speed = speedBase + speedPerLevel × level; a step takes 1000 × groundSpeed / speed ms (×diagonalCost), rounded up to 50 ms.
  speedBase: int(50).max(1000).default(218), speedPerLevel: n(0).default(2), diagonalCost: n(1).default(3),
  groundSpeed: z.record(z.string(), int(50).max(400)).default({ cobble: 100, plank: 100, flagstone: 100, dirt: 110, stone: 120, moss: 130, grass: 150, meadow: 150, sand: 160 }),
  // Fed regeneration every regenMs, flat; you cannot eat past foodCapSec.
  regenHp: int(0).max(50).default(1), regenMana: int(0).max(50).default(2), foodCapSec: int(60).max(7200).default(1200),
  // Combat: blockable attacks per 2 s turn; fight lock blocks logout.
  blocksPerTurn: int(0).max(10).default(2), fightLockSec: int(0).max(600).default(60),
  // Death: each non-pack equipped item drops with this chance (the pack always drops).
  equipmentLossChance: fraction.default(0.1),
}).strict().refine(w => w.respawnMin <= w.respawnMax, { message: 'Respawn min must not exceed max', path: ['respawnMin'] });
export const defaultWorld: z.infer<typeof World> = {
  viewX: 8, viewY: 6, lureLimit: 50, wanderRadius: 3,
  respawnMin: 0.5, respawnMax: 1, blockRange: 7,
  corpseStages: [300, 300, 60], heroCorpseStages: [600, 600, 300],
  lootProtectSec: 0, throwRange: 7, tileItemLimit: 20,
  speedBase: 218, speedPerLevel: 2, diagonalCost: 3,
  groundSpeed: { cobble: 100, plank: 100, flagstone: 100, dirt: 110, stone: 120, moss: 130, grass: 150, meadow: 150, sand: 160 },
  regenHp: 1, regenMana: 2, foodCapSec: 1200, blocksPerTurn: 2, fightLockSec: 60, equipmentLossChance: 0.1,
};

export const ItemDef = z.object({
  name: z.string().min(1).max(40), icon: z.string().min(1), weight: n(0), buy: int(0), sell: int(0),
  slot: z.enum(equipSlots).optional(), attack: n(0).optional(), defense: n(0).optional(), armor: n(0).optional(),
  slots: int(1).max(40).optional(), stack: z.boolean().optional(), food: int(1).optional(), heal: int(1).optional(), mana: int(1).optional(),
}).strict();

export const CreatureDef = z.object({
  name: z.string().min(1).max(40), hp: int(1), armor: int(0), attack: int(0), xp: int(0),
  gold: z.tuple([int(0), int(0)]).refine(([a, b]) => a <= b && b <= 100, 'Gold range must be min ≤ max ≤ 100'),
  loot: z.array(z.object({ item: itemRef, chance: fraction }).strict()).max(11),
  step: int(100), aggro: int(0).max(12),
}).strict();

const spellBase = {
  words: z.string().regex(/^[a-z]{2,20}$/, 'Spell words are 2–20 lowercase letters'), name: z.string().min(1).max(30),
  mana: int(0), level: int(1).max(100), cooldown: int(0), base: n(0), perLevel: n(0), perMagic: n(0),
};
export const HealSpell = z.object({ ...spellBase, kind: z.literal('heal'), spread: fraction }).strict();
export const AttackSpell = z.object({ ...spellBase, kind: z.literal('attack'), spread: int(0), range: int(1).max(10) }).strict();
/** Hits every visible creature within `radius` tiles of the caster. */
export const AreaSpell = z.object({ ...spellBase, kind: z.literal('area'), spread: int(0), radius: int(1).max(6) }).strict();

export const Merchant = z.object({
  greeting: z.string().min(1), topics: z.record(z.string(), z.string()),
  sells: z.array(itemRef), buys: z.array(itemRef),
}).strict();

export const Balance = z.object({
  progression: Progression,
  world: World.default(defaultWorld),
  items: exhaustive(itemKinds, ItemDef),
  creatures: exhaustive(mobKinds, CreatureDef),
  spells: z.object({ mend: HealSpell, ember: AttackSpell, renew: HealSpell, cinderburst: AreaSpell }).strict(),
  merchants: exhaustive(npcRoles, Merchant),
  quests: z.object({ shells: z.object({ need: int(1).max(100), gold: int(0).max(10000), reward: itemRef, item: itemRef }).strict() }).strict(),
  starter: z.object({
    equipment: z.object(Object.fromEntries(equipSlots.map(s => [s, itemRef.optional()])) as Record<(typeof equipSlots)[number], z.ZodOptional<typeof itemRef>>).strict(),
    pack: z.array(z.object({ item: itemRef, count: int(1).max(100) }).strict()).max(16),
  }).strict(),
}).strict().superRefine((b, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  for (const [kind, def] of Object.entries(b.items)) {
    if (def.stack && def.slot) issue(['items', kind, 'stack'], 'Equippable items cannot stack');
  }
  for (const [role, m] of Object.entries(b.merchants)) for (const list of ['sells', 'buys'] as const)
    m[list].forEach((item, i) => { if (m[list].indexOf(item) !== i) issue(['merchants', role, list, i], 'Listed twice'); });
  const words = Object.values(b.spells).map(s => s.words);
  words.forEach((w, i) => { if (words.indexOf(w) !== i) issue(['spells'], `Two spells share the words "${w}"`); });
  for (const [slot, item] of Object.entries(b.starter.equipment)) if (item && b.items[item].slot !== slot) issue(['starter', 'equipment', slot], `${b.items[item].name} does not fit the ${slot} slot`);
  const pack = b.starter.equipment.pack;
  if (!pack) issue(['starter', 'equipment', 'pack'], 'New characters need a pack');
  else if (b.starter.pack.length > (b.items[pack].slots ?? 0)) issue(['starter', 'pack'], 'Starter items do not fit in the pack');
  b.starter.pack.forEach((e, i) => { if (e.count > 1 && !b.items[e.item].stack) issue(['starter', 'pack', i, 'count'], 'Only stackable items can have a count above 1'); });
  if (!xpCurveRises(b.progression.xpCurve)) issue(['progression', 'xpCurve'], 'The experience curve must keep rising: every level needs at least 1 more xp than the one before, at every level.');
});
export type Balance = z.infer<typeof Balance>;
export type ItemDef = z.infer<typeof ItemDef>;
export type CreatureDef = z.infer<typeof CreatureDef>;
export type HealSpell = z.infer<typeof HealSpell>;
export type AttackSpell = z.infer<typeof AttackSpell>;

export const iconAlphabet = '123456789abcdefghijklmnopqrstuvwxyz';
export const IconDef = z.object({
  palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/i, 'Colours are #rrggbb')).min(1).max(iconAlphabet.length),
  pixels: z.array(z.string().length(16)).length(16),
}).strict().superRefine((d, ctx) => {
  d.pixels.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    const i = iconAlphabet.indexOf(ch);
    if (i < 0 || i >= d.palette.length) ctx.addIssue({ code: 'custom', path: ['pixels', y], message: `Pixel ${x},${y} uses "${ch}", which is not in the palette` });
  }));
});
export const Icons = z.record(z.string().regex(/^[a-z][a-z0-9]*$/), IconDef);
export type IconDef = z.infer<typeof IconDef>;
export type Icons = z.infer<typeof Icons>;

/** Cross-document checks: every icon the game asks for must exist. */
export function missingIcons(balance: Balance, icons: Icons) {
  const need = new Set<string>([...Object.values(balance.items).map(i => i.icon), ...spellIds, ...uiIcons]);
  return [...need].filter(name => !icons[name]);
}

export type Warning = { path: string; message: string };
/** Advisory checks that never block saving. */
export function balanceWarnings(b: Balance): Warning[] {
  const out: Warning[] = [];
  const sellers = (k: string) => Object.entries(b.merchants).filter(([, m]) => m.sells.includes(k as ItemKind)).map(([r]) => r);
  const buyers = (k: string) => Object.entries(b.merchants).filter(([, m]) => m.buys.includes(k as ItemKind)).map(([r]) => r);
  for (const [k, d] of Object.entries(b.items)) {
    if (sellers(k).length && buyers(k).length && d.sell > d.buy) out.push({ path: `items.${k}.sell`, message: `${d.name} sells for more (${d.sell}) than it costs (${d.buy}): free money.` });
    if (d.sell > 0 && !buyers(k).length && k !== 'gold') out.push({ path: `items.${k}.sell`, message: `${d.name} has a sell price but no merchant buys it.` });
  }
  for (const [k, c] of Object.entries(b.creatures)) {
    for (const l of c.loot) if (b.items[l.item].sell > 0 && !buyers(l.item).length) out.push({ path: `creatures.${k}.loot`, message: `${c.name} drops ${b.items[l.item].name}, which nobody buys.` });
    const items = c.loot.map(l => l.item);
    items.forEach((it, i) => { if (items.indexOf(it) !== i) out.push({ path: `creatures.${k}.loot.${i}`, message: `${c.name} has two drop rows for ${b.items[it].name}; each rolls separately.` }); });
  }
  return out;
}

/** How the world is drawn. Every value is a slider in the Studio's Look tab; content/render-style.json holds the chosen one. */
export const RenderStyle = z.object({
  name: z.string().min(1).max(40),
  pitch: z.number().min(30).max(88), viewHeight: z.number().min(5).max(20), pixelHeight: z.number().int().min(120).max(480),
  sunElevation: z.number().min(10).max(85), sunAzimuth: z.number().min(-180).max(180), sunIntensity: z.number().min(0).max(8), sunWarmth: z.number().min(0).max(1),
  ambient: z.number().min(0).max(6), ambientTint: z.number().min(0).max(1), shadows: z.boolean(),
  exposure: z.number().min(0.5).max(3), saturation: z.number().min(0).max(2), contrast: z.number().min(0.5).max(1.8),
  warmHighlights: z.number().min(0).max(1), coolShadows: z.number().min(0).max(1), vignette: z.number().min(0).max(1.5),
  levels: z.number().int().min(6).max(96), dither: z.number().min(0).max(1),
  groundBrightness: z.number().min(0.5).max(2.5), groundDetail: z.number().min(0).max(1),
  outline: z.number().min(0).max(1), rim: z.number().min(0).max(1), grid: z.number().min(0).max(0.6),
  grass: z.number().min(0).max(1), grassHeight: z.number().min(0.3).max(1.5), dapple: z.number().min(0).max(1),
  shafts: z.number().min(0).max(1), dust: z.number().min(0).max(1), actorPop: z.number().min(0).max(1), alwaysNames: z.boolean(),
}).strict();
export type RenderStyle = z.infer<typeof RenderStyle>;
