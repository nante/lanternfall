import {
  type Action, type State, type Hero, type Mob, type Pos, type GameItem, type ItemKind, type Notice, type GameView, type MapData, type Effect, type NpcSpawn, type SpellId,
  key, distance, equipSlots, stackMax, T, G,
} from './model.ts';
import { Geography } from './world.ts';
import type { Balance } from './content-schema.ts';
import { createRules, type Rules } from './rules.ts';
import { grounds, things } from './ids.ts';

const uid = () => crypto.randomUUID();
export class GameError extends Error {}
/** Items lying on a tile have the parent "ground:x,y,z". */
export const groundKey = (p: Pos) => `ground:${p.x},${p.y},${p.z}`;
export function groundPos(parent: string): Pos | null {
  if (!parent.startsWith('ground:')) return null;
  const [x, y, z] = parent.slice(7).split(',').map(Number);
  return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) ? { x, y, z } : null;
}
export function corpseName(who: string, kind: 'creature' | 'hero', stage: number) {
  if (kind === 'hero') return stage === 0 ? `${who}'s remains` : stage === 1 ? `${who}'s decaying remains` : `${who}'s bones`;
  const n = who.toLowerCase();
  return stage === 0 ? `Dead ${n}` : stage === 1 ? `Decaying ${n}` : `Remains of a ${n}`;
}

export function emptyState(): State { return { version: 2, revision: 0, time: 0, rng: 91827, players: {}, items: {}, monsters: {}, corpses: {}, doors: {} }; }

export class Engine {
  readonly geo: Geography;
  notices: Notice[] = [];
  effects: Effect[] = [];
  private effectId = 0;
  readonly rules: Rules;
  readonly balance: Balance;
  constructor(readonly map: MapData, balance: Balance, public state: State = emptyState()) {
    this.balance = balance;
    this.rules = createRules(balance);
    this.geo = new Geography(map);
    if (!Object.keys(state.monsters).length) this.seed();
  }

  random(max: number) { let x = this.state.rng | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.state.rng = x >>> 0; return (x >>> 0) % (Math.floor(Math.max(0, max)) + 1); }
  chance(p: number) { return this.random(9999) < p * 10000; }
  note(p: Hero, text: string, kind: Notice['kind'] = 'info', npc?: string) { this.notices.push({ player: p.id, text, kind, at: this.state.time, npc }); }
  effect(kind: Effect['kind'], at: Pos, value = 0, from?: Pos) { this.effects.push({ id: ++this.effectId, kind, at: { x: at.x, y: at.y, z: at.z }, value, time: this.state.time, from: from && { x: from.x, y: from.y, z: from.z } }); }

  seed() {
    for (const s of this.map.spawns) {
      const id = uid();
      this.state.monsters[id] = { x: s.x, y: s.y, z: s.z, id, kind: s.kind, hp: this.balance.creatures[s.kind].hp, home: { x: s.x, y: s.y, z: s.z }, moveAt: 0, attackAt: 0, respawnAt: 0, target: null, damage: {}, facing: 0 };
    }
  }

  // ---- Items ---------------------------------------------------------------
  add(kind: ItemKind, parent: string, slot: number, count = 1) { const item: GameItem = { id: uid(), kind, count, parent, slot, version: 0 }; this.state.items[item.id] = item; return item; }
  children(parent: string) { return Object.values(this.state.items).filter(i => i.parent === parent).sort((a, b) => a.slot - b.slot); }
  root(item: GameItem) {
    let parent = item.parent, depth = 0;
    while (this.state.items[parent]) { if (++depth > 8) throw new GameError('Containers are nested too deeply.'); parent = this.state.items[parent].parent; }
    return parent;
  }
  carried(p: Hero) { return Object.values(this.state.items).filter(i => this.root(i) === `equip:${p.id}`); }
  equipped(p: Hero, slot: (typeof equipSlots)[number]) { return this.children(`equip:${p.id}`).find(i => i.slot === equipSlots.indexOf(slot)); }
  gold(p: Hero) { return this.carried(p).filter(i => i.kind === 'gold').reduce((n, i) => n + i.count, 0); }
  weight(p: Hero) { return this.carried(p).reduce((n, i) => n + this.rules.item(i.kind).weight * i.count, 0); }
  capacityOf(parent: string) { const c = this.state.items[parent]; if (c) return this.rules.item(c.kind).slots ?? 0; if (parent.startsWith('equip:')) return equipSlots.length; if (parent.startsWith('vault:')) return 30; if (this.state.corpses[parent]) return 12; return 0; }
  canReach(p: Hero, root: string) {
    const g = groundPos(root);
    if (g) return distance(p, g) <= 1;
    if (root === `equip:${p.id}`) return true;
    if (root === `vault:${p.id}`) return distance(p, this.map.vault) <= 2;
    const corpse = this.state.corpses[root];
    if (corpse) return corpse.stage < 2 && distance(p, corpse) <= 1 && (corpse.owner === p.id || this.state.time >= corpse.protectedUntil);
    return false;
  }
  access(p: Hero, id: string) { const item = this.state.items[id]; return this.canReach(p, item ? this.root(item) : id); }
  freeSlot(parent: string) { const max = this.capacityOf(parent), used = new Set(this.children(parent).map(i => i.slot)); for (let i = 0; i < max; i++) if (!used.has(i)) return i; return -1; }
  containers(p: Hero) { const out: GameItem[] = []; const walk = (parent: string) => { for (const i of this.children(parent)) if (this.rules.item(i.kind).slots) { out.push(i); walk(i.id); } }; walk(`equip:${p.id}`); return out; }
  give(p: Hero, kind: ItemKind, count: number) {
    const def = this.rules.item(kind);
    if (this.weight(p) + def.weight * count > this.rules.capacity(this.rules.level(p.xp))) throw new GameError('That is too heavy to carry.');
    const bags = this.containers(p);
    if (!bags.length) throw new GameError('You need a pack to carry that.');
    if (def.stack) for (const stack of bags.flatMap(b => this.children(b.id)).filter(i => i.kind === kind && i.count < stackMax)) {
      const n = Math.min(count, stackMax - stack.count); stack.count += n; stack.version++; count -= n; if (!count) return;
    }
    while (count) {
      const bag = bags.find(b => this.freeSlot(b.id) >= 0);
      if (!bag) throw new GameError('Your pack is full.');
      const n = def.stack ? Math.min(stackMax, count) : 1;
      this.add(kind, bag.id, this.freeSlot(bag.id), n); count -= n;
    }
  }
  take(p: Hero, kind: ItemKind, count: number, includeEquipped = false) {
    const pool = this.carried(p).filter(i => i.kind === kind && (includeEquipped || !i.parent.startsWith('equip:')) && !this.children(i.id).length);
    if (pool.reduce((n, i) => n + i.count, 0) < count) return false;
    for (const i of pool) { const n = Math.min(count, i.count); i.count -= n; i.version++; count -= n; if (!i.count) delete this.state.items[i.id]; if (!count) break; }
    return true;
  }
  pay(p: Hero, gold: number) { if (!this.take(p, 'gold', gold)) throw new GameError('You do not have enough gold.'); }

  moveItem(p: Hero, a: Extract<Action, { kind: 'moveItem' }>) {
    const i = this.state.items[a.id];
    if (!i || i.version !== a.version || !this.access(p, i.id)) throw new GameError('That item has moved or is out of reach.');
    const ground = groundPos(a.parent);
    if (ground) return this.dropOnGround(p, i, ground, a.count);
    if (!this.access(p, a.parent)) throw new GameError('You cannot reach that.');
    for (let parent = a.parent; this.state.items[parent]; parent = this.state.items[parent].parent) if (parent === i.id) throw new GameError('A container cannot hold itself.');
    const def = this.rules.item(i.kind), dest = this.state.items[a.parent];
    if (dest && !this.rules.item(dest.kind).slots) throw new GameError('That is not a container.');
    if (a.slot >= this.capacityOf(a.parent)) throw new GameError('There is no room there.');
    if (a.parent.startsWith('equip:') && equipSlots.indexOf(def.slot ?? ('none' as never)) !== a.slot) throw new GameError(`The ${def.name.toLowerCase()} does not go there.`);
    if (this.state.corpses[a.parent] && this.root(i) !== a.parent) throw new GameError('You cannot put things into a corpse.');
    const other = this.children(a.parent).find(j => j.slot === a.slot && j.id !== i.id);
    const n = Math.min(i.count, a.count);
    const before = this.weight(p);
    if (other) {
      if (other.kind === i.kind && def.stack) {
        // Dropping onto the same kind fills that stack; whatever does not fit stays where it was.
        const moved = Math.min(n, stackMax - other.count);
        if (!moved) throw new GameError('That stack is full.');
        other.count += moved; other.version++; i.count -= moved; i.version++; if (!i.count) delete this.state.items[i.id];
      }
      else if (n === i.count) { other.parent = i.parent; other.slot = i.slot; other.version++; i.parent = a.parent; i.slot = a.slot; i.version++; if (other.parent.startsWith('equip:') && equipSlots.indexOf(this.rules.item(other.kind).slot ?? ('none' as never)) !== other.slot) throw new GameError('Those items cannot swap places.'); }
      else throw new GameError('That slot is taken.');
    } else if (n < i.count) { i.count -= n; i.version++; this.add(i.kind, a.parent, a.slot, n); }
    else { i.parent = a.parent; i.slot = a.slot; i.version++; }
    if (def.stack && !a.parent.startsWith('equip:')) this.stackInto(a.parent, i.kind);
    this.assertItems();
    if (this.weight(p) > this.rules.capacity(this.rules.level(p.xp)) && this.weight(p) > before) throw new GameError('That is too heavy to carry.');
  }
  /** Can an item rest on this tile? Open ground and low furniture; never walls, water, trees, doors or hatches. */
  canHoldItems(pos: Pos) {
    const g = this.geo.ground(pos), t = this.geo.thing(pos);
    if (g === G.void || g === G.water) return false;
    return [T.none, T.flowers, T.table, T.counter, T.bed, T.stump].includes(t);
  }
  /** Drop or throw an item onto a tile: within throw range and sight, on the same floor. It lands on top of the pile. */
  dropOnGround(p: Hero, i: GameItem, to: Pos, count: number) {
    const w = this.balance.world, key = groundKey(to);
    if (to.z !== p.z || distance(p, to) > w.throwRange) throw new GameError('That is too far away to throw.');
    if (!this.geo.sight(p, to)) throw new GameError('You cannot throw there.');
    if (!this.canHoldItems(to)) throw new GameError('There is no room there.');
    const pile = this.children(key).filter(j => j.id !== i.id);
    let n = Math.min(i.count, count);
    if (pile.length >= w.tileItemLimit) {
      // Full tile: only what fits on matching stacks lands; the rest stays where it was.
      const room = this.rules.item(i.kind).stack ? pile.filter(j => j.kind === i.kind).reduce((r, j) => r + stackMax - j.count, 0) : 0;
      if (!room) throw new GameError('There is no room there.');
      n = Math.min(n, room);
    }
    const top = pile.length ? pile[pile.length - 1].slot + 1 : 0;
    if (i.parent === key && n === i.count) { i.slot = top; i.version++; this.assertItems(); return; }
    if (n < i.count) { i.count -= n; i.version++; this.add(i.kind, key, top, n); }
    else { i.parent = key; i.slot = top; i.version++; }
    if (this.rules.item(i.kind).stack) this.stackInto(key, i.kind);
    this.assertItems();
  }
  /**
   * Merge stacks of one kind inside a container. Redistributes the exact total: earlier slots fill to the
   * stack limit first, emptied stacks are removed. The total count never changes.
   */
  stackInto(parent: string, kind: ItemKind) {
    const stacks = this.children(parent).filter(i => i.kind === kind);
    if (stacks.length < 2) return;
    let total = stacks.reduce((n, i) => n + i.count, 0);
    for (const st of stacks) {
      const n = Math.min(stackMax, total);
      if (n > 0) { if (st.count !== n) { st.count = n; st.version++; } total -= n; }
      else delete this.state.items[st.id];
    }
  }
  /** Merge split stacks across everything a player owns (their bags and vault). Safe to call any time. */
  tidy(p: Hero) {
    for (const parent of [...this.containers(p).map(c => c.id), `vault:${p.id}`]) {
      const kinds = new Set(this.children(parent).filter(i => this.rules.item(i.kind).stack).map(i => i.kind));
      for (const k of kinds) this.stackInto(parent, k);
    }
  }
  assertItems() {
    const occupied = new Set<string>();
    for (const i of Object.values(this.state.items)) {
      this.root(i);
      if (i.count < 1 || i.count > stackMax) throw new GameError('Invalid stack.');
      const slot = `${i.parent}:${i.slot}`;
      if (occupied.has(slot)) throw new GameError('That slot is taken.');
      occupied.add(slot);
    }
  }

  // ---- Players -------------------------------------------------------------
  occupied(pos: Pos, except = '') {
    return Object.values(this.state.players).some(p => p.id !== except && this.present(p) && distance(pos, p) === 0)
      || Object.values(this.state.monsters).some(m => m.id !== except && m.hp > 0 && distance(pos, m) === 0)
      || this.map.npcs.some(n => distance(n, pos) === 0);
  }
  present(p: Hero) { return p.connected || p.combatUntil > this.state.time; }
  createPlayer(name: string) {
    const id = uid();
    const pos = this.geo.near(this.map.shrine, q => this.occupied(q));
    const p: Hero = { ...pos, id, name, token: uid(), epoch: 1, seq: 0, hp: this.rules.maxHP(1), mana: this.rules.maxMana(1), xp: 0, melee: 0, shielding: 0, magic: 0, fed: 120_000, regen: 0, moveAt: 0, attackAt: 0, spellAt: 0, combatUntil: 0, connected: true, target: null, path: [], facing: Math.PI, quests: {}, talking: null, deaths: 0, fightMode: 'balanced', chase: true, manual: false, blocks: this.balance.world.blocksPerTurn, blockTurn: 0 };
    this.state.players[id] = p;
    const equip = `equip:${id}`, starter = this.balance.starter;
    let pack: GameItem | undefined;
    equipSlots.forEach((slot, i) => { const kind = starter.equipment[slot]; if (kind) { const item = this.add(kind, equip, i); if (slot === 'pack') pack = item; } });
    if (pack) starter.pack.forEach((e, i) => this.add(e.item, pack!.id, i, e.count));
    this.note(p, 'You wake in the Shrine of the Lantern. Sister Wren is by the altar. Say "hi" to her.');
    return p;
  }
  stats(p: Hero) { const r = this.rules, l = r.level(p.xp); return { level: l, maxHp: r.maxHP(l), maxMana: r.maxMana(l), cap: r.capacity(l), melee: r.melee(p.melee).level, shielding: r.shielding(p.shielding).level, magic: r.magic(p.magic).level }; }
  armor(p: Hero) { return this.children(`equip:${p.id}`).reduce((n, i) => n + (this.rules.item(i.kind).armor ?? 0), 0); }
  gainXp(p: Hero, xp: number) {
    const r = this.rules, before = r.level(p.xp);
    p.xp += xp;
    this.effect('xp', p, xp);
    const after = r.level(p.xp);
    if (after > before) {
      p.hp = Math.min(r.maxHP(after), p.hp + r.maxHP(after) - r.maxHP(before));
      p.mana = Math.min(r.maxMana(after), p.mana + r.maxMana(after) - r.maxMana(before));
      this.effect('level', p, after);
      this.note(p, `You advanced to level ${after}.`, 'level');
      for (const s of Object.values(this.balance.spells)) if (s.level === after) this.note(p, `You can now cast ${s.name}. Say "${s.words}".`, 'level');
    }
  }
  skillUp(p: Hero, field: 'melee' | 'shielding' | 'magic', amount: number) {
    const read = (v: number) => this.rules[field](v).level;
    const before = read(p[field]);
    p[field] += amount;
    const after = read(p[field]);
    if (after > before) this.note(p, `Your ${field === 'melee' ? 'melee' : field === 'shielding' ? 'shielding' : 'magic'} skill rose to ${after}.`, 'level');
  }

  // ---- NPC talk --------------------------------------------------------------
  npcNear(p: Hero, id?: string | null) {
    const list = this.map.npcs.filter(n => n.z === p.z && distance(n, p) <= 3 && (!id || n.id === id));
    return list.sort((a, b) => distance(p, a) - distance(p, b))[0];
  }
  talk(p: Hero, npc: NpcSpawn, text: string): void {
    const def = this.balance.merchants[npc.role];
    const say = (line: string) => this.note(p, line, 'npc', npc.id);
    if (/\b(bye|farewell)\b/.test(text)) { say('Safe roads.'); p.talking = null; return; }
    if (p.talking !== npc.id || /\b(hi|hello|greetings)\b/.test(text)) { p.talking = npc.id; say(def.greeting); if (!/\b(hi|hello|greetings)\b/.test(text)) return this.talk(p, npc, text); return; }
    if (/\btrade\b/.test(text)) { say(def.sells.length || def.buys.length ? 'Have a look.' : 'I have nothing to sell, friend.'); return; }
    if (npc.role === 'shrine' && /\bheal\b/.test(text)) {
      const s = this.stats(p);
      if (p.combatUntil > this.state.time) return say('Not while your blood is up. Catch your breath first.');
      if (s.level > 6 && p.hp > s.maxHp * 0.3) return say('Your wounds are not deep. Mend them yourself.');
      p.hp = s.maxHp; this.effect('heal', p, s.maxHp); return say(def.topics.heal);
    }
    if (npc.role === 'shrine' && /\b(task|quest|help|shells?)\b/.test(text)) {
      const q = p.quests.shells ?? 0, task = this.balance.quests.shells;
      const want = this.rules.item(task.item).name.toLowerCase();
      if (q === 0) { p.quests.shells = 1; return say(`The shrine glaze is made from ${want}s. Bring me ${task.need} from the Undercroft and I will see you better armed.`); }
      if (q === 1) {
        if (!this.take(p, task.item, task.need)) return say(`I still need ${task.need} ${want}s. The hatch is in the east lane, past the lamplighter.`);
        this.give(p, task.reward, 1); this.give(p, 'gold', task.gold); p.quests.shells = 2;
        this.note(p, `Quest complete: you received a ${this.rules.item(task.reward).name.toLowerCase()} and ${task.gold} gold.`, 'level');
        return say('Perfect. Take this shield. It served the last warden well.');
      }
      return say('You have done enough for the shrine. The lanterns thank you.');
    }
    for (const [topic, line] of Object.entries(def.topics)) if (line && text.includes(topic.replace(/s$/, ''))) return say(line);
    say(def.sells.length || def.buys.length ? 'Ask me to "trade", or about something you have heard.' : 'Hm. Ask me about something else.');
  }

  // ---- Actions -------------------------------------------------------------
  action(p: Hero, a: Action) {
    switch (a.kind) {
      case 'walk': if (!a.dx && !a.dy) return; p.path = [{ x: p.x + a.dx, y: p.y + a.dy, z: p.z }]; p.manual = true; break;
      case 'path': {
        p.manual = true;
        if (distance(p, a.to) === 0) { p.path = []; break; }
        p.path = this.geo.path(p, a.to, this.state);
        if (!p.path.length) throw new GameError('There is no way through.');
        break;
      }
      case 'stop': p.path = []; p.target = null; break;
      case 'target': {
        if (a.id) { const m = this.state.monsters[a.id]; if (!m || m.hp <= 0 || m.z !== p.z) throw new GameError('That creature is not here.'); if (this.geo.pz(p)) throw new GameError('You may not attack from a protection zone.'); }
        p.target = a.id; p.path = []; p.manual = false; break;
      }
      case 'useTile': {
        const t = this.geo.thing(a.to);
        if (distance(p, a.to) > 1) {
          if (t === T.vault || t === T.hatch || t === T.ladder || t === T.door || t === T.well) { const near = this.geo.path(p, a.to, this.state); if (near.length) { if (t !== T.door && t !== T.hatch && t !== T.ladder) near.pop(); p.path = near; p.target = null; return; } }
          throw new GameError('Move closer to use that.');
        }
        const link = this.map.links[key(a.to)];
        if (link) { this.travel(p, link); break; }
        if (t === T.door) { this.state.doors[key(a.to)] = !this.state.doors[key(a.to)]; break; }
        if (t === T.vault) { if (distance(p, this.map.vault) > 2) throw new GameError('Stand in front of the vault.'); this.note(p, 'You open your vault.', 'info'); break; }
        if (t === T.well) { this.note(p, 'The water is cold and clear.'); break; }
        if (t === T.altar) { this.note(p, 'The altar lantern burns steadily.'); break; }
        break;
      }
      case 'say': {
        const text = a.text.trim().toLowerCase();
        const spell = Object.entries(this.balance.spells).find(([, s]) => s.words === text);
        if (spell) { this.cast(p, spell[0] as SpellId); break; }
        const npc = this.npcNear(p, p.talking) ?? this.npcNear(p);
        if (npc) { this.note(p, `${p.name}: ${a.text}`, 'info'); this.talk(p, npc, text); }
        else this.note(p, `${p.name}: ${a.text}`);
        break;
      }
      case 'talk': {
        if (!a.npc) { p.talking = null; break; }
        const npc = this.npcNear(p, a.npc);
        if (!npc) throw new GameError('Move closer to talk.');
        p.talking = null; this.talk(p, npc, 'hi'); break;
      }
      case 'cast': this.cast(p, a.spell); break;
      case 'useItem': { const i = this.state.items[a.id]; if (!i || !this.access(p, i.id)) throw new GameError('You cannot reach that.'); this.use(p, i); break; }
      case 'useKind': { const i = this.carried(p).find(i => i.kind === a.item); if (!i) throw new GameError(`You have no ${this.rules.item(a.item).name.toLowerCase()}.`); this.use(p, i); break; }
      case 'moveItem': this.moveItem(p, a); break;
      case 'trade': this.trade(p, a); break;
      case 'logout':
        if (p.combatUntil > this.state.time && !this.geo.pz(p)) throw new GameError('You may not log out during or right after a fight.');
        p.connected = false; p.combatUntil = 0; p.path = []; p.target = null; p.talking = null; break;
      case 'mode':
        if (a.fight) p.fightMode = a.fight;
        if (a.chase !== undefined) { p.chase = a.chase; if (!a.chase && !p.manual) p.path = []; }
        break;
      case 'look': this.note(p, this.describe(p, a.at, a.actor), 'info'); break;
      default: { const exhaustive: never = a; return exhaustive; }
    }
  }
  travel(p: Hero, to: Pos) {
    const spot = this.geo.near(to, q => this.occupied(q, p.id));
    Object.assign(p, spot); p.path = []; p.target = null; p.talking = null;
    this.note(p, to.z === 1 ? 'You climb down into the Undercroft. It smells of wet stone.' : 'You climb back up into the evening air.');
  }
  use(p: Hero, i: GameItem) {
    const def = this.rules.item(i.kind), s = this.stats(p);
    if (def.food) { if (p.fed + def.food > this.balance.world.foodCapSec * 1000) throw new GameError('You are full.'); p.fed += def.food; this.consume(i); this.note(p, `You eat the ${def.name.toLowerCase()}.`); return; }
    if (def.heal || def.mana) {
      if (this.state.time < p.spellAt - 500) throw new GameError('You are exhausted.');
      if (def.heal) { if (p.hp >= s.maxHp) throw new GameError('You are not hurt.'); const v = Math.min(s.maxHp - p.hp, def.heal + this.random(20)); p.hp += v; this.effect('heal', p, v); }
      if (def.mana) { if (p.mana >= s.maxMana) throw new GameError('Your mind is already clear.'); const v = Math.min(s.maxMana - p.mana, def.mana + this.random(15)); p.mana += v; this.effect('mana', p, v); }
      p.spellAt = this.state.time + 1000; this.consume(i); return;
    }
    throw new GameError(def.slots ? 'Open it in your inventory.' : 'Equip it from your inventory.');
  }
  consume(i: GameItem) { i.count--; i.version++; if (!i.count) delete this.state.items[i.id]; }
  cast(p: Hero, id: SpellId) {
    const spell = this.balance.spells[id], s = this.stats(p);
    if (s.level < spell.level) throw new GameError(`You need level ${spell.level} for ${spell.name}.`);
    if (this.state.time < p.spellAt) throw new GameError('You are exhausted.');
    if (p.mana < spell.mana) throw new GameError(`You need ${spell.mana} mana.`);
    const power = spell.base + s.level * spell.perLevel + s.magic * spell.perMagic;
    if (spell.kind === 'heal') {
      if (p.hp >= s.maxHp) throw new GameError('You are not hurt.');
      const v = Math.min(s.maxHp - p.hp, power + this.random(power * spell.spread));
      p.hp += v; this.effect('heal', p, v);
    } else if (spell.kind === 'area') {
      // A ring of fire around the caster: every creature it can see within the radius burns.
      if (this.geo.pz(p)) throw new GameError('You may not attack from a protection zone.');
      const r = spell.radius;
      const caught = Object.values(this.state.monsters).filter(m => m.hp > 0 && m.z === p.z && (m.x - p.x) ** 2 + (m.y - p.y) ** 2 <= r * r + r && this.geo.sight(p, m));
      this.effect('burst', p, 0, p);
      for (const m of caught) { const dmg = power + this.random(spell.spread); this.effect('ember', m, dmg, p); this.hurt(p, m, dmg); }
      p.combatUntil = this.state.time + this.balance.world.fightLockSec * 1000;
    } else {
      if (this.geo.pz(p)) throw new GameError('You may not attack from a protection zone.');
      const m = p.target ? this.state.monsters[p.target] : undefined;
      if (!m || m.hp <= 0) throw new GameError('Choose a target first.');
      if (distance(p, m) > spell.range || !this.geo.sight(p, m)) throw new GameError('Your target is out of reach.');
      const dmg = power + this.random(spell.spread);
      this.effect('ember', m, dmg, p);
      this.hurt(p, m, dmg);
      p.combatUntil = this.state.time + this.balance.world.fightLockSec * 1000;
    }
    p.mana -= spell.mana; p.spellAt = this.state.time + spell.cooldown;
    this.skillUp(p, 'magic', spell.mana);
  }
  trade(p: Hero, a: Extract<Action, { kind: 'trade' }>) {
    const npc = this.npcNear(p, a.npc);
    if (!npc) throw new GameError('Move closer to the merchant.');
    const def = this.balance.merchants[npc.role], item = this.rules.item(a.item);
    if (a.mode === 'buy') {
      if (!def.sells.includes(a.item)) throw new GameError(`${npc.name} does not sell that.`);
      this.pay(p, item.buy * a.count); this.give(p, a.item, a.count);
      this.note(p, `${npc.name}: Here you are. ${a.count} × ${item.name} for ${item.buy * a.count} gold.`, 'npc', npc.id);
    } else {
      if (!def.buys.includes(a.item)) throw new GameError(`${npc.name} does not buy that.`);
      if (!this.take(p, a.item, a.count)) throw new GameError(`You do not have ${a.count} unequipped ${item.name.toLowerCase()}.`);
      this.give(p, 'gold', item.sell * a.count);
      this.note(p, `${npc.name}: ${item.sell * a.count} gold for those. Pleasure.`, 'npc', npc.id);
    }
  }

  // ---- Combat ----------------------------------------------------------------
  hurt(p: Hero, m: Mob, dmg: number) {
    const credited = Math.max(0, Math.min(dmg, m.hp));
    m.hp -= dmg; if (credited) m.damage[p.id] = (m.damage[p.id] ?? 0) + credited;
    if (m.target === null) m.target = p.id;
    if (m.hp <= 0) this.dead(m);
  }
  dead(m: Mob) {
    const def = this.balance.creatures[m.kind];
    const ranked = Object.entries(m.damage).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    m.hp = 0; m.respawnAt = this.state.time + this.respawnDelay(); m.target = null; m.damage = {};
    const owner = ranked[0] ? this.state.players[ranked[0][0]] : undefined;
    const id = uid(), w = this.balance.world, now = this.state.time;
    this.state.corpses[id] = { x: m.x, y: m.y, z: m.z, id, name: corpseName(def.name, 'creature', 0), kind: m.kind, owner: owner?.id ?? '', born: now, stage: 0,
      protectedUntil: now + w.lootProtectSec * 1000, expiresAt: now + (w.corpseStages[0] + w.corpseStages[1] + w.corpseStages[2]) * 1000 };
    let slot = 0;
    const gold = def.gold[0] + this.random(def.gold[1] - def.gold[0]);
    if (gold) this.add('gold', id, slot++, gold);
    for (const l of def.loot) if (this.chance(l.chance)) this.add(l.item, id, slot++, 1);
    for (const h of Object.values(this.state.players)) if (h.target === m.id) this.dropTarget(h);
    // Experience is shared by each attacker's part of the damage, so a group kill never creates extra experience.
    const total = ranked.reduce((n, [, d]) => n + d, 0);
    for (const [pid, d] of ranked) { const p = this.state.players[pid]; if (p) { if (p.target === m.id) this.dropTarget(p); const xp = Math.floor((def.xp * d) / total); if (xp > 0) this.gainXp(p, xp); } }
    if (owner) this.note(owner, slot ? `${def.name} defeated. Open the corpse for loot.` : `${def.name} defeated. Nothing of value.`, 'loot');
  }
  kill(p: Hero) {
    const id = uid(), st = this.balance.world.heroCorpseStages, now = this.state.time;
    // Your own body stays yours while it can still be looted.
    this.state.corpses[id] = { x: p.x, y: p.y, z: p.z, id, name: corpseName(p.name, 'hero', 0), kind: 'hero', owner: p.id, born: now, stage: 0,
      protectedUntil: now + (st[0] + st[1]) * 1000, expiresAt: now + (st[0] + st[1] + st[2]) * 1000 };
    // The pack always falls with the body; every other equipped item has a chance to fall too.
    let slot = 0;
    for (const item of this.children(`equip:${p.id}`)) {
      const isPack = this.rules.item(item.kind).slot === 'pack';
      if (isPack || this.chance(this.balance.world.equipmentLossChance)) { item.parent = id; item.slot = slot++; item.version++; }
    }
    const loss = this.balance.progression;
    p.xp -= Math.floor(p.xp * loss.deathXpLoss); p.melee -= Math.floor(p.melee * loss.deathSkillLoss); p.shielding -= Math.floor(p.shielding * loss.deathSkillLoss); p.magic -= Math.floor(p.magic * loss.deathSkillLoss);
    const s = this.stats(p);
    p.hp = s.maxHp; p.mana = s.maxMana; p.deaths++;
    Object.assign(p, this.geo.near(this.map.shrine, q => this.occupied(q, p.id)));
    p.target = null; p.path = []; p.combatUntil = 0; p.talking = null;
    for (const m of Object.values(this.state.monsters)) if (m.target === p.id) m.target = null;
    this.note(p, 'You died. Your pack, and maybe more, lies with your remains. You lost some experience and skill.', 'error');
  }

  tick(ms = 100) {
    this.state.time += ms;
    const now = this.state.time;
    this.effects = this.effects.filter(e => now - e.time < 1600);
    for (const p of Object.values(this.state.players)) {
      if (!this.present(p)) continue;
      const s = this.stats(p);
      if (p.fed > 0) {
        p.fed = Math.max(0, p.fed - ms); p.regen += ms;
        // Fed regeneration: a flat trickle, not scaled by level.
        if (p.regen >= this.balance.progression.regenMs) { p.regen -= this.balance.progression.regenMs; p.hp = Math.min(s.maxHp, p.hp + this.balance.world.regenHp); p.mana = Math.min(s.maxMana, p.mana + this.balance.world.regenMana); }
      }
      if (p.talking && !this.npcNear(p, p.talking)) p.talking = null;
      const target = p.target ? this.state.monsters[p.target] : undefined;
      if (p.target && (!target || target.hp <= 0 || target.z !== p.z || distance(p, target) > 12)) { this.dropTarget(p); }
      if (p.target && this.geo.pz(p)) { this.dropTarget(p); this.note(p, 'You may not attack from a protection zone.', 'error'); }
      // Chase mode walks after the target; a manual walk takes priority until its path is done. Stand mode never moves.
      if (target && p.target && p.chase && !(p.manual && p.path.length) && distance(p, target) > 1 && (!p.path.length || distance(p.path[p.path.length - 1], target) > 1) && p.moveAt <= now) {
        const spots = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy, z: target.z }))
          .filter(q => !this.geo.blocked(q, this.state, true) && !this.occupied(q, p.id) && !this.geo.pz(q)).sort((a, b) => distance(p, a) - distance(p, b));
        p.path = spots[0] ? this.geo.path(p, spots[0], this.state, 1500, q => this.geo.pz(q)) : []; p.manual = false;
      }
      // Already in melee range: an automatic chase route has done its job.
      if (p.target && target && target.hp > 0 && distance(p, target) <= 1 && !p.manual) p.path = [];
      if (p.path.length && p.moveAt <= now) {
        const next = p.path[0];
        if (this.geo.stepAllowed(p, next, this.state, true) && !this.occupied(next, p.id)) {
          if (this.geo.door(next)) this.state.doors[key(next)] = true;
          const diagonal = p.x !== next.x && p.y !== next.y;
          p.facing = Math.atan2(next.x - p.x, next.y - p.y);
          Object.assign(p, next); p.path.shift();
          // Step time from level speed and the ground being entered; diagonals cost three steps.
          p.moveAt = now + this.rules.stepMs(this.rules.heroSpeed(s.level), grounds[this.geo.ground(p)], diagonal);
          if (!p.path.length) p.manual = false;
          const link = this.map.links[key(p)];
          if (link) this.travel(p, link);
        } else {
          // Someone stepped into the way: route around them instead of giving up.
          const goal = p.path[p.path.length - 1];
          const avoidPz = !p.manual;
          const alt = distance(p, goal) > 1 && !(avoidPz && this.geo.pz(goal)) ? this.geo.path(p, goal, this.state, 2500, q => this.occupied(q, p.id) || (avoidPz && this.geo.pz(q))) : [];
          p.path = alt.length && !this.occupied(alt[0], p.id) ? alt : [];
          p.moveAt = now + 150;
        }
      }
      if (p.target && this.geo.pz(p)) { this.dropTarget(p); this.note(p, 'You may not attack from a protection zone.', 'error'); }
      if (target && p.target && target.hp > 0 && distance(p, target) <= 1 && p.attackAt <= now) {
        const weapon = this.equipped(p, 'weapon');
        const base = weapon ? this.rules.item(weapon.kind).attack ?? 7 : 7; // bare fists hit like a light club
        const pr = this.balance.progression;
        // 7.6 melee: attack adjusted by fighting mode, (5·skill + 50)·attack/100 at most, two averaged d100 rolls so mid hits are common.
        const attack = p.fightMode === 'offensive' ? base + Math.floor(base * 0.2) : p.fightMode === 'defensive' ? base - Math.floor(base * 0.4) : base;
        const raw = Math.ceil(((5 * s.melee + 50) * attack * Math.floor((this.random(99) + this.random(99)) / 2)) / 10000);
        const dmg = Math.max(0, raw - this.armorRoll(this.balance.creatures[target.kind].armor));
        p.facing = Math.atan2(target.x - p.x, target.y - p.y);
        p.attackAt = now + pr.attackMs; p.combatUntil = now + this.balance.world.fightLockSec * 1000;
        this.skillUp(p, 'melee', 1);
        this.effect(dmg ? 'hit' : 'miss', target, dmg, p);
        this.hurt(p, target, dmg);
      }
    }
    for (const m of Object.values(this.state.monsters)) this.think(m, now);
    this.decay(now);
  }
  /** Corpses rot in three stages: fresh and decaying keep their loot; at the final stage the loot is gone. */
  decay(now: number) {
    for (const c of Object.values(this.state.corpses)) {
      const st = c.kind === 'hero' ? this.balance.world.heroCorpseStages : this.balance.world.corpseStages;
      const age = (now - c.born) / 1000, stage = age < st[0] ? 0 : age < st[0] + st[1] ? 1 : 2;
      if (now >= c.expiresAt || stage === 2) for (const i of Object.values(this.state.items)) if (this.state.items[i.id] && this.root(i) === c.id) delete this.state.items[i.id];
      if (now >= c.expiresAt) { delete this.state.corpses[c.id]; continue; }
      if (stage !== c.stage) {
        c.stage = stage;
        const who = c.kind === 'hero' ? this.state.players[c.owner]?.name ?? 'someone' : this.balance.creatures[c.kind as Mob['kind']]?.name ?? c.kind;
        c.name = corpseName(who, c.kind === 'hero' ? 'hero' : 'creature', stage);
      }
    }
  }
  /** Respawn wait: the creature's base time scaled by a random factor between respawnMin and respawnMax. */
  respawnDelay() {
    const w = this.balance.world, base = this.balance.progression.respawnMs;
    return Math.round(base * (w.respawnMin + ((w.respawnMax - w.respawnMin) * this.random(1000)) / 1000));
  }
  /** Look: a short description of what is at a tile, in our own words. */
  describe(p: Hero, at: Pos, actor?: string): string {
    const a = (n: string) => (/^[aeiou]/i.test(n) ? `an ${n}` : `a ${n}`);
    if (actor) {
      const m = this.state.monsters[actor];
      const seen = (q: Pos) => this.onScreen(q, p);
      if (m && m.hp > 0 && seen(m)) { const def = this.balance.creatures[m.kind]; const hurt = m.hp < def.hp ? (m.hp < def.hp / 3 ? ' It is badly wounded.' : ' It is wounded.') : ''; return `You see ${a(def.name.toLowerCase())}.${hurt}`; }
      const h = this.state.players[actor];
      if (h && this.present(h) && seen(h)) return h.id === p.id ? `You see yourself. You are level ${this.rules.level(h.xp)}.` : `You see ${h.name}. They are level ${this.rules.level(h.xp)}.`;
      const n = this.map.npcs.find(n => n.id === actor);
      if (n && seen(n)) return `You see ${n.name}.`;
    }
    if (distance(p, at) > 8) return 'That is too far away to make out.';
    const pile = this.children(groundKey(at));
    if (pile.length) {
      const top = pile[pile.length - 1], d = this.rules.item(top.kind);
      const what = top.count > 1 ? `${top.count} × ${d.name.toLowerCase()}` : a(d.name.toLowerCase());
      const stats = [d.attack && `attack ${d.attack}`, d.defense && `block ${d.defense}`, d.armor && `armour ${d.armor}`].filter(Boolean).join(', ');
      return `You see ${what}${stats ? ` (${stats})` : ''}. It weighs ${(d.weight * top.count).toFixed(1)} oz.`;
    }
    const corpse = Object.values(this.state.corpses).find(c => c.x === at.x && c.y === at.y && c.z === at.z);
    if (corpse) {
      const n = corpse.name.toLowerCase();
      return `You see ${n.startsWith('remains') ? `the ${n}` : n.startsWith('dead') || n.startsWith('decaying') ? a(n) : corpse.name}.`;
    }
    const thing = things[this.geo.thing(at)];
    const thingText: Partial<Record<string, string>> = {
      wall: 'a wall', rampart: 'the town wall', tree: 'an old tree', pine: 'a pine', bush: 'a bush', fence: 'a wooden fence', lamp: 'a lamp post. Its flame never goes out',
      door: this.state.doors[key(at)] ? 'an open door' : 'a closed door', hatch: 'a hatch in the ground', ladder: 'a ladder leading up', crate: 'a crate', barrel: 'a barrel', counter: 'a counter',
      table: 'a table', well: 'a well', rock: 'a rock', vault: 'a vault chest', altar: 'an altar with a lantern', flowers: 'some flowers', shelf: 'a shelf full of jars', cavewall: 'rough cave rock',
      pillar: 'a stone pillar', bed: 'a bed', anvil: 'an anvil', brazier: 'a burning brazier', stump: 'a tree stump',
    };
    const zone = this.geo.pz(at) ? ' This is a protection zone.' : '';
    if (thing !== 'none' && thingText[thing]) return `You see ${thingText[thing]}.${zone}`;
    const ground = grounds[this.geo.ground(at)];
    const groundText: Partial<Record<string, string>> = { grass: 'grass', meadow: 'tall grass', dirt: 'a dirt path', cobble: 'cobblestones', plank: 'wooden planks', stone: 'stone floor', water: 'water', sand: 'sand', moss: 'mossy stone', flagstone: 'flagstones' };
    return `You see ${groundText[ground] ?? 'nothing special'}.${zone}`;
  }
  /** Drop a hero's target along with any automatic (chase) route; a manual walk carries on. */
  dropTarget(p: Hero) { p.target = null; if (!p.manual) p.path = []; }
  /** Armour soaks between half and all of its value: ⌊a/2⌋ + random(0 … ⌊a/2⌋−1); tiny armour rolls 0 … a. */
  armorRoll(a: number) { if (a < 2) return a; const h = Math.floor(a / 2); return h + this.random(h - 1); }
  /** Can a creature at `from` see `h`? Old-style screen rectangle on the same floor. */
  onScreen(h: Pos, from: Pos) { const w = this.balance.world; return h.z === from.z && Math.abs(h.x - from.x) <= w.viewX && Math.abs(h.y - from.y) <= w.viewY; }
  think(m: Mob, now: number) {
    const def = this.balance.creatures[m.kind], w = this.balance.world;
    const players = Object.values(this.state.players).filter(p => this.present(p));
    if (m.hp <= 0) {
      if (m.respawnAt > now) return;
      // A respawn waits while anyone stands near the spawn; a taken spawn square uses the nearest free one.
      if (players.some(p => p.z === m.home.z && distance(p, m.home) <= w.blockRange)) return;
      let spot: Pos;
      try { spot = this.geo.near(m.home, q => this.occupied(q, m.id)); } catch { return; }
      Object.assign(m, spot); m.hp = def.hp; m.damage = {}; m.target = null;
      return;
    }
    // Anti-luring: pulled too far from its spawn (or off its floor), the creature vanishes and the spawn starts over.
    if (m.z !== m.home.z || distance(m, m.home) > w.lureLimit) {
      m.hp = 0; m.target = null; m.damage = {}; m.respawnAt = now + this.respawnDelay();
      for (const p of players) if (p.target === m.id) this.dropTarget(p);
      return;
    }
    // Nobody on its screen: the creature idles where it is. It does not walk home.
    const watching = players.filter(h => this.onScreen(h, m));
    if (!watching.length) { m.target = null; return; }
    const current = m.target ? this.state.players[m.target] : undefined;
    let p = current && this.present(current) && this.onScreen(current, m) && !this.geo.pz(current) ? current : undefined;
    if (!p) p = watching.filter(h => !this.geo.pz(h) && distance(h, m) <= def.aggro && this.geo.sight(m, h)).sort((a, b) => distance(m, a) - distance(m, b))[0];
    m.target = p?.id ?? null;
    if (p) {
      if (distance(m, p) <= 1) {
        if (m.attackAt <= now) {
          m.attackAt = now + this.balance.progression.monsterAttackMs; m.facing = Math.atan2(p.x - m.x, p.y - m.y);
          const s = this.stats(p);
          let raw = Math.ceil((def.attack * Math.floor((this.random(99) + this.random(99)) / 2)) / 99);
          // A shield (or, without one, the weapon) can block up to blocksPerTurn attacks per 2 s; armour soaks every hit.
          if (now >= p.blockTurn) { p.blocks = this.balance.world.blocksPerTurn; p.blockTurn = now + 2000; }
          let blocked = false;
          const guard = this.equipped(p, 'shield') ?? this.equipped(p, 'weapon');
          const baseDef = guard ? this.rules.item(guard.kind).defense ?? 0 : 0;
          if (p.blocks > 0 && baseDef > 0) {
            p.blocks--;
            const d = p.fightMode === 'defensive' ? Math.floor(baseDef * 1.8) : p.fightMode === 'offensive' ? Math.floor(baseDef * 0.6) : baseDef;
            const skill = this.equipped(p, 'shield') ? s.shielding : s.melee;
            const roll = Math.floor(((5 * skill + 50) * d * Math.floor((this.random(99) + this.random(99)) / 2)) / 10000);
            if (this.equipped(p, 'shield')) this.skillUp(p, 'shielding', 1);
            if (roll >= raw) blocked = true;
            raw = Math.max(0, raw - roll);
          }
          const dmg = blocked ? 0 : Math.max(0, raw - this.armorRoll(this.armor(p)));
          p.combatUntil = now + this.balance.world.fightLockSec * 1000;
          this.effect(dmg ? 'hit' : blocked ? 'block' : 'miss', p, dmg, m);
          if (dmg) { p.hp -= dmg; if (p.hp <= 0) this.kill(p); }
        }
      } else if (m.moveAt <= now) {
        const next = this.geo.path(m, p, this.state, 600, q => this.occupied(q, m.id) || this.geo.door(q) || this.geo.pz(q))[0];
        let stepped = false;
        if (next && !this.occupied(next, m.id) && !this.geo.door(next) && !this.geo.pz(next) && distance(next, p) >= 1) {
          m.facing = Math.atan2(next.x - m.x, next.y - m.y);
          const diagonal = next.x !== m.x && next.y !== m.y;
          Object.assign(m, next); stepped = true;
          m.moveAt = now + this.rules.creatureStepMs(def.step, grounds[this.geo.ground(m)], diagonal);
        }
        if (!stepped) m.moveAt = now + def.step;
      }
      return;
    }
    if (m.moveAt > now) return;
    m.moveAt = now + def.step * 2 + this.random(2500);
    // Wander around wherever it is now; creatures do not heal or return home on their own.
    const r = w.wanderRadius;
    if (!r) return;
    const goal = { x: m.x + this.random(r * 2) - r, y: m.y + this.random(r * 2) - r, z: m.z };
    const next = this.geo.path(m, goal, this.state, 300)[0];
    if (next && !this.occupied(next, m.id) && !this.geo.door(next) && !this.geo.pz(next)) { m.facing = Math.atan2(next.x - m.x, next.y - m.y); Object.assign(m, next); }
  }

  view(p: Hero): GameView {
    const safe = (h: Hero) => { const { token: _t, path: _p, ...rest } = h; return rest; };
    const near = (q: Pos) => distance(p, q) < 22;
    return {
      revision: this.state.revision, time: this.state.time, self: safe(p), route: p.path,
      players: Object.values(this.state.players).filter(h => h.id !== p.id && this.present(h) && near(h)).map(safe),
      monsters: Object.values(this.state.monsters).filter(m => m.hp > 0 && near(m)),
      corpses: Object.values(this.state.corpses).filter(near),
      items: Object.values(this.state.items).filter(i => this.access(p, i.id)),
      ground: Object.values(this.state.items).filter(i => { const g = groundPos(i.parent); return !!g && g.z === p.z && Math.abs(g.x - p.x) <= 11 && Math.abs(g.y - p.y) <= 9; }),
      doors: this.state.doors,
      effects: this.effects.filter(e => near(e.at)),
    };
  }
}
