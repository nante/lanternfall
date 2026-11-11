// Fixed content and protocol IDs. Order matters: map bytes and equipment slots index into these tuples.
export const grounds = ['void', 'grass', 'meadow', 'dirt', 'cobble', 'plank', 'stone', 'water', 'sand', 'moss', 'flagstone'] as const;
export type GroundKind = (typeof grounds)[number];

export const things = ['none', 'wall', 'rampart', 'tree', 'pine', 'bush', 'fence', 'lamp', 'door', 'hatch', 'ladder', 'crate', 'barrel', 'counter', 'table', 'well', 'rock', 'vault', 'altar', 'flowers', 'shelf', 'cavewall', 'pillar', 'bed', 'anvil', 'brazier', 'stump'] as const;
export type ThingKind = (typeof things)[number];

export const equipSlots = ['weapon', 'shield', 'head', 'body', 'feet', 'pack'] as const;
export type EquipSlot = (typeof equipSlots)[number];

/** Append only: saved worlds keep item kinds by name and in this order. */
export const itemKinds = ['cudgel', 'shortsword', 'hatchet', 'blade', 'buckler', 'banded', 'cap', 'coif', 'tunic', 'jerkin', 'boots', 'pack', 'pouch', 'gold', 'loaf', 'cheese', 'tonic', 'tincture', 'tail', 'shell', 'silk', 'tusk', 'torch',
  'club', 'mace', 'flangedmace', 'maul', 'rustsword', 'broadsword', 'longsword', 'dawnblade', 'beardedaxe',
  'broadaxe', 'greataxe', 'knife', 'dagger', 'dirk', 'spear', 'boarspear', 'halberd', 'lid', 'heater', 'kite',
  'tower', 'sunshield', 'kettlehat', 'visorhelm', 'gildedhelm', 'gambeson', 'mailshirt', 'scalecoat',
  'cuirass', 'shodboots', 'sabatons', 'satchel', 'rucksack', 'purse', 'sack', 'apple', 'mushroom', 'sausage',
  'trout', 'pie', 'haunch', 'draught', 'greattonic', 'drop', 'greattincture', 'elixir', 'pelt', 'horn', 'wax',
  'hide', 'garnet', 'amethyst', 'sapphire', 'emerald', 'amberstone', 'pearl', 'copperring', 'silverring',
  'goldring', 'brooch', 'locket', 'crown', 'key', 'tinsoldier', 'idol', 'glasseye', 'mapscrap',
] as const;
export type ItemKind = (typeof itemKinds)[number];

export const mobKinds = ['gutterRat', 'caveBeetle', 'mireGrub', 'thornboar'] as const;
export type MobKind = (typeof mobKinds)[number];

export const spellIds = ['mend', 'ember', 'renew', 'cinderburst'] as const;
export type SpellId = (typeof spellIds)[number];

export const npcRoles = ['shrine', 'smith', 'inn', 'apothecary', 'store', 'warden'] as const;
export type NpcRole = (typeof npcRoles)[number];

/** Icons the HUD needs besides item and spell icons. */
export const uiIcons = ['bag', 'person', 'menu'] as const;
