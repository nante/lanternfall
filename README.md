# Lanternfall

A small multiplayer RPG set in an original walled town at dusk: tile-based movement, melee and spell combat, loot, merchants, a personal vault, death penalties, and an undercroft beneath the east lanes. The renderer draws a low-resolution 2.5D pixel-art scene in Three.js with long sunset shadows, light shafts, swaying grass and lamp light.

## Run

```sh
npm install
npm run dev          # world server on :2567, client on http://127.0.0.1:4173
```

Open the client, choose a name, and enter the town. Open a second browser window to play with two characters.

Balance and art tools (see [docs/studio/README.md](docs/studio/README.md)):

```sh
npm run studio       # http://127.0.0.1:4174
```

Desktop build (needs the world server running):

```sh
npm run build
npm run desktop
```

## Play

| Input | Action |
| --- | --- |
| Click ground / minimap | Walk there |
| Click a creature, or <kbd>Space</kbd> | Attack (Space cycles nearby targets) |
| Click a person | Talk; ask about the highlighted topics, or `trade` |
| Click a body | Loot it |
| <kbd>WASD</kbd> / arrows | Step |
| <kbd>1</kbd>–<kbd>6</kbd> | Mend, Ember, Renew, tonic, tincture, eat |
| <kbd>I</kbd> / <kbd>C</kbd> | Pack / character |
| <kbd>Enter</kbd> | Speak (spell words work too: `mend`, `ember`, `renew`) |
| Scroll | Zoom |

Start at the Shrine of the Lantern and ask Sister Wren for a `task`. Buy food at the Copper Kettle, tonics at Odo's, and gear at the Emberforge. The hatch to the Undercroft is in the fenced yard in the east lane; rats live near the ladder, beetles further west, grubs in the northern pits. Thornboars roam the meadow outside the south gate.

## Layout

- `content/` — the game's numbers (`balance.json`), icons (`icons.json`) and hand-made textures (`art/`). Edit them with the Studio.
- `packages/game` — shared rules: `model.ts` (protocol and state), `content-schema.ts`, `rules.ts`, `town.ts` (map generator), `world.ts` (pathing and sight), `engine.ts` (simulation), `simulate.ts` (headless fights).
- `apps/server` — Colyseus room, server-authoritative ticks, SQLite persistence in `.local/lanternfall.sqlite`.
- `apps/client` — Three.js renderer (`src/render`) and the HUD (`src/main.ts`, `src/style.css`).
- `apps/studio` — the balance and art tool.
- `apps/desktop` — Electron shell.
- `tests` — engine tests (`npm test`).

`docs/` holds earlier planning notes that predate the switch to an original world.
