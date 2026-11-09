# Lanternfall vs Tibia 7.6 mechanics, round 1 (opus)

Scope: mechanics only (rules, formulas, timings). Copy no assets, names, maps or text.
Reference sources: Nostalrius (a 7.7 clone built from CipSoft data files, on TFS 1.2), Tibiantis notes (reverse-engineered 7.4), TibiaWiki, OTLand. 7.4–7.7 combat and movement match 7.6 here. TibiaWiki formula pages describe 8.1+ and are flagged where used.

Engine refs: `E` = packages/game/src/engine.ts, `R` = packages/game/src/rules.ts, `W` = packages/game/src/world.ts, `B` = content/balance.json, `C` = apps/client/src/main.ts, `V` = apps/client/src/render/view.ts.

Already correct, no change: level/XP curve (`B` xpCurve [50,-150,400] over (L-1) expands exactly to 7.6's (50/3)(L³−6L²+17L−12)); level-up adds the gained max HP/mana to current HP/mana (`E:210`); the newer 7.6-style systems (luring, respawn, corpse decay, ground items, stacking).

★ = top-10 by player impact.

---

## 1. Movement

**1.1 ★ Step time from speed and ground**
- 7.6: base speed = 220 + 2·(L−1). Step ms = ceil(1000·groundSpeed/speed / 50)·50. Ground speeds: sandstone 70, cobble/wood/marble/tile 100, dirt 110, rock 120, grass/gravel 150, sand 160, mud 120–200, snow 200. A level 1 on grass: 1000·150/220 → 700 ms.
- Ours: flat `stepMs` 300 for every level and tile (`E:431`, `B:14`). That is more than 2× too fast and never changes with level.
- Fix: add `speed` per ground kind in balance and `baseSpeed + 2·(L−1)` for heroes, and use the formula with 50 ms rounding. Also drop the client's 260 ms key throttle (`C:342`) so held keys queue a step whenever the last one finishes.
- Confidence: high. Sources: https://tibiantis-notes.github.io/speed · https://raw.githubusercontent.com/Ezzz-dev/Nostalrius/master/src/creature.cpp (getStepDuration)

**1.2 ★ Diagonal steps cost 3×**
- 7.6: a diagonal step takes 3× an orthogonal one, so players walk diagonals only to dodge.
- Ours: ×1.45 (`E:431`). The A* cost of 2.4 (`W:44`) is close but not the same.
- Fix: multiply by 3 for diagonals and use 3 as the A* diagonal cost.
- Confidence: high. Source: https://tibiantis-notes.github.io/speed

**1.3 Monster speed uses the same formula**
- 7.6: each creature has a speed value, and its step time comes from the same ground formula (and the same 3× diagonal).
- Ours: fixed `step` ms per creature (`B:267,286,313,336`, `E:519`), and ground has no effect.
- Fix: give creatures `speed` instead of `step` and share the step-duration function with heroes.
- Confidence: high. Source: Nostalrius creature.cpp (above)

**1.4 Keyboard diagonals**
- 7.6: arrows walk 4 directions. Diagonals use numpad 1/3/7/9, and Ctrl+arrow turns in place. Holding two arrows does not walk diagonally.
- Ours: holding two keys sums them into a diagonal (`C:339-343`).
- Fix: make two held arrows use the last-pressed key, map numpad 1/3/7/9 (and Q/E/Z/C if WASD stays) to diagonals, and add Ctrl+arrow to turn.
- Confidence: medium (from memory of the client). Source: https://tibia.fandom.com/wiki/Hotkeys

**1.5 Walking into closed doors**
- 7.6: a closed door blocks movement until someone uses it (right-click). Map-click paths do not go through closed doors.
- Ours: stepping onto a door opens it automatically (`E:427`), and pathing treats doors as open (`W:41` allowDoors=true).
- Fix: pass allowDoors=false for player pathing and steps. Keep "use door" (`E:282`). Optionally let a click on a door auto-walk next to it and use it.
- Confidence: medium. Source: https://tibia.fandom.com/wiki/Doors

**1.6 Pushing creatures and players**
- 7.6: you can drag an adjacent player or pushable creature onto a free tile next to it. A creature that just moved can't be pushed for about 1 step. Strong monsters push weaker creatures and items out of their way.
- Ours: no pushing. Occupied tiles just block (`E:184`), so players can wall each other off.
- Fix: add a `push` action (target id and destination tile, adjacent, destination free, target idle for at least one step). Optionally let flagged monsters push. This is needed in narrow corridors.
- Confidence: high on the concept, medium on the timing. Source: https://raw.githubusercontent.com/Ezzz-dev/Nostalrius/master/src/monster.cpp (pushCreatures)

**1.7 Chase/stand and follow**
- 7.6: you toggle "chase opponent" or "stand while fighting". Follow is a separate mode for walking behind any creature.
- Ours: targeting always auto-chases (`E:419-423`).
- Fix: add `chase: boolean` to the hero (default stand, like 7.6) and a `follow` target action.
- Confidence: high. Source: https://tibia.fandom.com/wiki/Fight_Modes

**1.8 Floor changes**
- 7.6: walking onto stairs, ramps or holes changes floor right away. Ladders and rope spots need Use. A floor change counts as a 2× step.
- Ours: linked tiles trigger on step (`E:432`), and ladders and hatches also go through useTile (`E:277`). This is close enough.
- Fix: mark each link as walk or use, and apply the 2× cost on floor change.
- Confidence: medium. Source: Nostalrius creature.cpp (lastStepCost)

## 2. Clicking and interaction

**2.1 ★ Classic mouse semantics and Look**
- 7.6 has only classic controls, with no context menu:
  - Left-click walks, or drags when held.
  - Right-click uses an item, or attacks a creature.
  - Shift+left looks. Ctrl+left uses. Alt+left attacks.
- Look prints a "You see …" line with the name, plus weight when adjacent and armor/attack details for gear. On another player it shows name, level and vocation.
- Ours: left-click does everything: attacks monsters (`C:264`), opens corpses and piles (`C:268-269`), talks to NPCs. Right-click only matters for doors (`C:273`). There is no Look.
- Fix: left = walk/drag, right = use/attack/open, shift = Look (new `look` action that returns a notice). Write our own look text.
- Confidence: medium-high. Source: https://tibia.fandom.com/wiki/Classic_Controls

**2.2 Corpses are ordinary items on the tile stack**
- 7.6: a corpse is a movable container item in the ground pile, and it weighs a lot. Use opens it. It sits on the stack above other items, and you can drag it to uncover what's underneath.
- Ours: corpses are a separate entity (`E:379`) with a 12-slot cap (`E:64`) and are not movable.
- Fix: later, model a corpse as a container `GameItem` under `ground:` with decay stages. Low priority unless the separate entity causes bugs.
- Confidence: high. Source: https://tibia.fandom.com/wiki/Corpse

**2.3 Stacking order and "top item"**
- 7.6: a tile draws ground, then always-on-top things (walls, doors), then creatures, then movable items with the newest on top. Look, use and drag act on the top item. The client shows at most about 10 items.
- Ours: the pile top is the highest slot (`E:144`, `C:291`), which is correct for items. Corpses and creatures are resolved separately (`V:271-276`).
- Fix: keep this. Make right-click Use pick the top usable thing in the same order.
- Confidence: medium. Source: https://tibia.fandom.com/wiki/Stackable_Objects

**2.4 "Use with" crosshair**
- 7.6: multi-use items (runes, rope, shovel, fishing rod, fluids on others) put the cursor in crosshair mode on Use, and the next click picks the target.
- Ours: none (`E:304-305`).
- Fix: add `useWith {id, to: Pos | creatureId}` before adding runes or tools.
- Confidence: high. Source: https://tibia.fandom.com/wiki/Use_With

**2.5 Throwing and containers on the ground**
- 7.6: you can throw to any visible tile within roughly the screen range (about 7 tiles horizontal by 5 vertical) with line of sight, including under creatures. You open a bag on the ground by Use while adjacent.
- Ours: 7-tile Chebyshev throw (`E:139`) and an adjacent pile list. This is close enough. Nothing to fix except making Use open container items lying on the ground.
- Confidence: low. Source: https://tibia.fandom.com/wiki/Throw

## 3. Experience and death

**3.1 ★ XP split by damage share**
- 7.6: each attacker gets floor(xp · theirDamage / totalDamage). There was no party sharing yet.
- Ours: the top damager gets full XP and everyone else gets 1/3 (`E:385`), which mints extra XP when a group kills something.
- Fix: share XP by damage ratio. Cap each hit's credited damage at the creature's remaining HP (`E:369`).
- Confidence: high. Source: https://raw.githubusercontent.com/Ezzz-dev/Nostalrius/master/src/creature.cpp (getDamageRatio)

**3.2 ★ Death penalty**
- 7.6:
  - Lose 10% of total experience (levels under 25; above that a formula, about 10% at low levels).
  - Each skill and magic level loses the same percentage of its total tries or mana spent, floored at skill 10.
  - Each equipped item has a 10% drop chance. A container (backpack) always drops.
- Ours: 8% XP and 5% skill tries (`E:396`, `B:18-19`). Magic is never lost. The pack always drops and other equipment never does (`E:393-394`).
- Fix: set XP and skill loss to 0.10 and apply it to magic too. Roll 10% per equipped non-pack slot to move it into the corpse.
- Confidence: high on the 10% and the container drop, medium on whether 7.6 used the level-25 formula. Sources: https://raw.githubusercontent.com/Ezzz-dev/Nostalrius/master/src/player.cpp (death, dropLoot) · https://tibia.fandom.com/wiki/Death_Penalty

**3.3 Vocation-less per-level gains**
- 7.6 (no vocation): HP = 150 + 5/level, mana = 0 + 5/level, cap = 400 + 10/level (oz).
- Ours: 150 + 15, 30 + 10, 220 + 20 (`B:3-7`). That's knight HP with extra mana.
- Fix: this is a design choice. A true 7.6 baseline means 5/5/10, and creatures would need retuning. Alternatively adopt one vocation's numbers (knight 15/5/25).
- Confidence: high. Source: https://raw.githubusercontent.com/Ezzz-dev/Nostalrius/master/data/XML/vocations.xml

**3.4 ★ Regeneration is too fast**
- 7.6: regen runs only while fed. With no vocation it's 1 HP every 6 s and 1 mana every 6 s, with no level scaling (knight 1 HP/3 s, mage 2 mana/3 s).
- Ours: every 3 s, 1 + L/4 HP and 2 + L/3 mana (`E:414`, `B:17`). At level 20 that's about 2 HP/s.
- Fix: use separate hpTicks/hpAmount and manaTicks/manaAmount with no level term.
- Confidence: high. Sources: Nostalrius vocations.xml · https://tibiantis-notes.github.io/Food_and_regeneration

**3.5 Food cap**
- 7.6: you're "full" when current fed time plus the food's time would reach 1200 s. Food time = nutrition × 12 s.
- Ours: rejects only when already above 1500 s (`E:319`), so you can stack up to about 1860 s.
- Fix: reject if `fed + food >= 1_200_000`.
- Confidence: high. Source: https://tibiantis-notes.github.io/Food_and_regeneration

## 4. Skills

**4.1 ★ Skill advance formula**
- 7.6: tries for skill s → s+1 = base · mult^(s−10).
  - base: fist/club/sword/axe 50, distance 30, shielding 100.
  - No-vocation mult: melee 2.0, fist and shielding 1.5. Knight: 1.1 melee and shielding.
- Ours: 40 · 1.12^(s−10) melee and 30 · 1.12^(s−10) shield (`R:11`, `B:23-25`). Skill 40 takes about 30× fewer tries than a knight's.
- Fix: per-skill base and mult in balance. Pick 1.1 (knight) if heroes are fighters, or 2.0/1.5 for true no-vocation.
- Confidence: high on the constants (TFS vocation.cpp), high on the multipliers. Sources: https://github.com/otland/forgottenserver/blob/master/src/vocation.cpp (getReqSkillTries) · Nostalrius vocations.xml

**4.2 Separate sword/axe/club/fist skills**
- 7.6: each weapon type trains and uses its own skill. With no weapon you use fist fighting, attack 7.
- Ours: one `melee` skill (`model.ts:34`), and unarmed attack is 3 (`E:444`).
- Fix: give each item a `skill: 'sword' | 'axe' | 'club'`, store tries per skill, and use fist with attack 7 when unarmed.
- Confidence: high. Source: https://raw.githubusercontent.com/Ezzz-dev/Nostalrius/master/src/combat.cpp (closeAttack)

**4.3 When melee tries are gained**
- 7.6: 1 try per swing. Blocked or armored swings count only within 30 swings of your last damaging ("blood") hit, which stops AFK training on targets you can't hurt.
- Ours: +1 every swing, always (`E:450`).
- Fix: add a `bloodHitCount` reset to 30 on a damaging hit and decremented on blocked ones.
- Confidence: high. Source: Nostalrius player.cpp (onAttackedCreatureBlockHit)

**4.4 ★ Shielding tries and the 2-block limit**
- 7.6: each creature has 2 defense charges that refill at 1 per second, i.e. 2 blocks per 2 s turn. Attacks past that skip the shield and defense roll. Shielding gains 1 try per attack actually blocked (by shield or armor) while a charge is available, and only within 30 blocks of the attacker's last landed hit.
- Ours: +1 shielding on every monster swing with a shield equipped, blocked or not, unlimited (`E:510`), and the shield blocks every hit (`E:509`).
- Fix: add `blockCount` (max 2, +1 per 1000 ms) to the hero. Run the defense roll only when charged, and train only on a block.
- Confidence: high. Sources: Nostalrius creature.cpp (blockHit, onThink) · https://tibiantis-notes.github.io/training · https://tibia.fandom.com/wiki/Training_Guides

**4.5 Magic level**
- 7.6: mana to reach ML m = 1600 · mult^(m−1). mult: mage 1.1, paladin 1.4, knight 3.0, no vocation 4.0. Magic damage scales with "magic power" = 2·L + 3·ML.
- Ours: 60 · 1.35^m (`R:28-29`, `B:26-27`), and spell power = base + L·perLevel + ML·perMagic (`E:334`).
- Fix: use 1600·mult^(m−1) with a chosen mult. Since our mana pools are tiny, mult 1.1 with a smaller base (e.g. 200) keeps the shape. Consider power = base·(2L + 3ML)/100 with base as a floor.
- Confidence: medium (TFS constant, Tibiantis power formula). Source: https://tibiantis-notes.github.io/Magic

## 5. Combat

**5.1 ★ Melee damage formula**
- 7.6: A = weapon attack (fist 7), S = weapon skill. Max = ceil((5S + 50)·A·0.99/100). Damage = max × a triangular random (average of two 0–99 rolls). There is no level term.
  - Fight mode changes A: offensive ×1.2, balanced ×1, defensive ×0.6.
- Ours: max = attack·(0.6 + skill/18) + level, then a uniform roll (`E:446-447`, `B:20-22`).
- Fix: use the 7.6 formula with the triangular roll. The same formula drives creature melee (`info.skill`, `info.attack`) in place of `random(def.attack)` at `E:511`.
- Confidence: high (Nostalrius code). Source: https://raw.githubusercontent.com/Ezzz-dev/Nostalrius/master/src/combat.cpp (getTotalDamage)

**5.2 Defense (shield or weapon) roll**
- 7.6: D = shield defense + 1 with shielding skill. With no shield, weapon defense + 1 with that weapon's skill. Base 5 when unarmed.
  - Fight mode: offensive D×0.6, defensive D×1.8. With no target you always count as defensive.
  - Defended = (5S + 50)·D·tri/10000, subtracted from the hit. 0 or less means "blocked" (puff).
- Ours: random(def · (0.5 + shielding/20)) (`E:509`), with no weapon defense and no modes.
- Fix: use the same formula as 5.1 for defense, gated by 4.4's block charges.
- Confidence: high. Source: https://raw.githubusercontent.com/Ezzz-dev/Nostalrius/master/src/player.cpp (getDefense)

**5.3 Armor reduction**
- 7.6: total armor A over all slots. If A > 1, reduce by a random value in [floor(A/2), 2·floor(A/2)−1]. Applies after defense. A hit reduced to 0 by armor is the "spark" effect.
- Ours: random(0..armor) (`E:511`), which averages half as much.
- Fix: use the 7.6 range. Creatures: same rule with their armor value (`E:447`).
- Confidence: high. Source: Nostalrius player.cpp (getArmor)

**5.4 ★ Attack speed 2 s**
- 7.6: every vocation (and creatures) melee every 2000 ms.
- Ours: heroes every 1500 ms (`B:15`, `E:449`). Creatures every 2000 ms, which is correct.
- Fix: set `attackMs` to 2000.
- Confidence: high. Source: Nostalrius vocations.xml (attackspeed=2000)

**5.5 Fight modes**
- 7.6: offensive / balanced / defensive, with attack ×1.2/1/0.6 and defense ×0.6/1/1.8. Creatures always use balanced.
- Ours: none.
- Fix: add `fightMode` to the hero with a 3-way toggle in the HUD. Factors in 5.1 and 5.2.
- Confidence: high. Source: https://tibiantis-notes.github.io/Melee_and_Distance

**5.6 Exhaustion**
- 7.6:
  - Attack spells and runes: 2 s (some single-target ones 1 s).
  - Healing and other spells: 1 s.
  - Fluids (the 7.6 stand-in for potions, which did not exist yet): 1 s.
  - Basic actions: 200 ms, "extended" actions 1 s.
- Ours: per-spell cooldown of 1.5–2 s (`B:346,358,371`). Potions share `spellAt` with a 500 ms grace (`E:321-324`). This is roughly right.
- Fix: healing spells to 1000 ms, attack spells 2000 ms. Keep consumables on a separate 1 s timer.
- Confidence: medium (forum, not code). Source: https://otland.net/threads/7-7-damage-and-spell-formulae.252604/

**5.7 In-fight, logout block, protection zones**
- 7.6: any aggression sets in-fight for 60 s. Logout is refused while in-fight (the character stays in the world). Protection zones (temples, depots, houses): no attacking, no damage, creatures can't enter, logout always allowed, and in-fight is not set.
- Ours: in-fight is 30 s (`E:346,449,512`). The logout action always succeeds, but the character stays present (`E:189`), which matches. There are no PZ tiles at all.
- Fix: make in-fight 60 s and reply "You may not log out during a fight." Add a `pz` flag (e.g. on `Place` or a tile layer). Skip creature movement into PZ and block targeting from or into it.
- Confidence: high. Source: https://raw.githubusercontent.com/Ezzz-dev/Nostalrius/master/config.lua (pzLocked=60000)

**5.8 Monster targeting, switching and fleeing**
- 7.6:
  - A creature targets any player it can see within its view (about 9×7 tiles). It needs no line of sight to aggro; it paths there.
  - Every `changeTargetSpeed` ms (typically 2–4 s) it switches with `changeTargetChance` (e.g. 10–50%). The new target is picked by nearest, weakest, most-damage or random weights.
  - A blocking player in its path becomes the target.
  - Below `runOnHealth` it flees (steps away) and doesn't attack.
- Ours: sticks to the current target while that target is on screen. Otherwise nearest within `aggro` with line of sight (`E:500-503`). No switching, no fleeing.
- Fix: add `changeTarget {intervalMs, chance}` and `fleeHp` to creature defs. Drop the line-of-sight requirement for aggro.
- Confidence: medium-high. Sources: Nostalrius monster.cpp (onThinkTarget) · https://tibiantis-notes.github.io/Creature

**5.9 Melee outcomes: no "miss"**
- 7.6: melee never misses. A swing either draws blood, is blocked (puff) or is absorbed by armor (spark).
- Ours: shows "miss" whenever damage is 0 (`E:451`, `E:513`).
- Fix: emit `block` (defense) or `armor` (spark) effects instead of `miss` for melee.
- Confidence: high. Source: Nostalrius combat.cpp (BLOCK_DEFENSE/BLOCK_ARMOR)

**5.10 Target range**
- 7.6: the target drops when it leaves your screen or floor.
- Ours: drops past 12 tiles (`E:418`).
- Fix: use `onScreen` (viewX/viewY).
- Confidence: medium. Source: https://tibia.fandom.com/wiki/Attack

## 6. Other things players notice

**6.1 Capacity units**
- 7.6: 400 oz at level 1 + 10/level. Items have weights such as a club at 25 oz and a backpack at 18 oz.
- Ours: 220 cap and light items (`B:7`).
- Fix: fine if internally consistent, but the HUD should say "oz" and follow 3.3.
- Confidence: medium. Source: Nostalrius vocations.xml (gaincap=10)

**6.2 Light and darkness**
- 7.6: there's a world day/night cycle, and caves are dark. Characters carry a small light radius, and torches give more. Light is a big part of underground danger.
- Ours: not handled in the engine.
- Fix: add a light level per floor and time, plus item light radius. Mostly client work.
- Confidence: high. Source: https://tibia.fandom.com/wiki/Light

**6.3 PvP**
- 7.6: PvP damage is halved. Attacking an unmarked player gives a white skull for 15 min. Unjustified kills lead to a red skull (3/day, 5/week, 10/month).
- Ours: no PvP.
- Confidence: high. Source: Nostalrius config.lua

---

## Top 10 (do in this order)
1. 1.1 Step time from speed and ground (300 ms → about 700 ms at level 1 on grass)
2. 1.2 Diagonal ×3
3. 5.1 Melee formula (no level term, triangular roll)
4. 5.4 Attack every 2 s
5. 4.4 Two blocks per turn, and shielding trains only on blocks
6. 4.1 Skill tries 50/100 · mult^(s−10)
7. 3.4 Regen 1 HP and 1 mana per 6 s, no level scaling
8. 3.2 Death: 10% XP/skills/ML, 10% per equipped item, backpack always drops
9. 3.1 XP by damage share
10. 2.1 Classic clicks plus Look
