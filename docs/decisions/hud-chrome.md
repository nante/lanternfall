# HUD chrome — decided from the /proto/chrome prototype (2026-11-09)

- Direction: keep three layouts as a setting, not one winner. `chrome` in `content/render-style.json`
  (`classic` | `rails` | `glass`, missing = classic), picked in Studio → Look → Interface. Saving reloads the live game.
- One panel set for every layout: Map, Status, Equipment, Fighting, Battle, Skills, Pack, Spells and tasks, Menu.
  Chat is a fixed console (All / Fight / People tabs); the hotbar floats over the game view.
- Players reorder panels (drag header, or arrow keys on the grip), collapse them, and resize rails (180–440 px),
  chat (88–420 px) and each panel (48–720 px). Saved per layout in localStorage `lanternfall.chrome.v1`.
- Minimap +/− and wheel zoom the minimap only (1×–4×), never the game camera.
- Surfaces: ring shadows instead of solid borders, recessed wells for slots and bars, derived inner radii,
  neutral focus ring, 0.96 press scale, popovers anchored to their trigger.
- Rejected: Inspector (top strip + tabbed side panel) — map, gear and pack never visible together, and the
  one-line chat was easy to miss mid-fight. The old floating glass HUD with a slide-in drawer — panels covered
  the world and the drawer hid gear during fights.
- Known costs: Classic's single column overflows at 900 px tall (players scroll or collapse); Edge glass panels
  cover the world edges; Twin rails gives the narrowest view.
