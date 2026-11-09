# Lanternfall Studio

A local tool for balancing the game and working on its art. It edits the files the game reads, so every change you save is what the game plays with.

```sh
npm run studio      # http://127.0.0.1:4174 (works with the game stopped)
npm run dev         # the game, in another terminal, if you want to try changes
```

## What it edits

| Area | File | After saving |
| --- | --- | --- |
| Items, creatures, spells, progression | `content/balance.json` | The game server restarts by itself. Reload the game and press **Continue**. |
| Icons (16×16) | `content/icons.json` | Reload the game. |
| Ground, wall and roof textures | `content/art/<family>/<kind>.png` | Reload the game. A slot without a PNG uses the generated texture. |

| Characters: name, level, health, mana, skills, deaths, equipment, bags, vault | The live world (`.local/lanternfall.sqlite`), through the game server | Online characters see the change at once; offline ones on their next login. |

Merchants' stock and dialogue, the shrine task and the starter kit are read from `balance.json` too, but the Studio shows them read-only for now.

## Accounts

Lists every character in the world with an online dot. Edit the fields, then **Save** (⌘S). Accounts needs the game server running (`npm run dev`), because the server keeps the world in memory and would overwrite a direct edit to the database.

- **Level** sets experience to the start of that level and refills health and mana to the new maximum. **Melee**, **Shielding** and **Magic** start at 0% of the level you choose; leaving a skill unchanged keeps its progress.
- **Items**: pick each equipment slot (only items that fit are offered), add, remove or recount items in the pack, nested pouches and the vault. Changing a container to a smaller one drops what no longer fits.
- If the character's items change in game while you edit (they loot something, for example), saving refuses the item part. **Refresh** keeps your other edits and drops the item edits.
- Unsaved edits stay when you switch characters or pages, until you reload the Studio.

## Fight lab

Runs the real game engine headlessly: one hero against one creature in a small arena, 100 ms ticks, up to 5 minutes per fight. Pick a creature, a hero level, skills and equipment, then **Run**. With unsaved edits, the same seeds run against the saved numbers and your draft side by side. **Also sweep all creatures** runs the same hero against every creature.

Read the numbers this way:
- Win, death and timeout counts cover every fight.
- Time to kill, damage taken and health left only count fights the hero won.
- Hourly experience and coins assume every fight is won and add the per-kill overhead you enter (resting, walking, looting). They ignore deaths, so read them next to the death rate.
- Coins per kill is mean gold plus the expected value of drops some merchant buys.

## Textures

Each slot has a fixed size: ground 48×48 (covers 2×2 world tiles, must tile seamlessly), walls 16×32, roofs 16×16. Images must be fully opaque PNGs at exactly that size; the Studio never scales or recolours them.

A good workflow: **Export generated** to get the current procedural texture as a PNG, paint over it in Aseprite (or anything that saves PNG), then **Import PNG** and **Save**. **Use generated** removes your PNG again.

Water, props, characters and creatures are not editable yet.

## Icons

Pencil (B), eraser (E) and picker (I, or Alt/right-click). Click a selected swatch again to change its colour; colours used by no pixel can be removed. **Import PNG** accepts exactly 16×16 with every pixel fully opaque or fully transparent, up to 35 colours. **Export PNG** writes the icon at 16×16.

## Safety

- Saves are refused if the file changed on disk since you opened it (for example from another Studio tab). Your draft stays; use **Download my draft** before reloading from disk.
- Invalid values (negative prices, unknown items, a pack that doesn't fit the starter kit, a level curve that stops rising) block saving and show at the field.
- Warnings, like an item that sells for more than it costs, never block saving.
- The previous version of every file you overwrite is kept in `.local/studio-backups/<name>.previous`.
- The Studio only answers on 127.0.0.1 and refuses writes from other origins. Only Accounts changes the world, always through the game server, which saves the change in the same transaction as play.
- The game server writes a fresh random `.local/admin-token` each time it starts. Its `/admin` routes need that token and the 127.0.0.1 Host header; the Studio reads the token and proxies `/api/accounts` to them.

## For developers

- `packages/game/src/content-schema.ts` validates both documents; `rules.ts` turns a balance snapshot into formulas; `default-balance.ts` is the only module that imports the content files (the game uses it, the Studio must not).
- `Engine` takes the balance as a constructor argument, which is how the Fight lab runs saved and draft numbers side by side (`simulate.ts`).
- `apps/studio/server/content-api.ts` is the write path: fixed documents and slots, revision check, validation, backup, temp file and rename.
- `packages/game/src/accounts.ts` reads a character into an editable snapshot and applies an edit all or nothing; `apps/studio/server/accounts-api.ts` forwards to the game server's `/admin/accounts`.
- `tests/content.test.ts` pins the engine to fixed-seed fights captured before the data moved out of code; `tests/fixtures/balance.json` is a frozen copy so later tuning doesn't rewrite the tests.
