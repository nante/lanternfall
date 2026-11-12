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
- 2026-11-11: surfaces are frosted "pixel glass" (translucent fill, backdrop blur, one faint white ring, radii on the UI grid;
  tokens at the top of `apps/client/src/style.css`). This replaces the bevelled slate frames; the pixel face, icons and grid stay.
- 2026-11-11: Edge keeps the world clear. Its windows start closed and are summoned from a dock (top right; keys M, G, I,
  B, C, J) and dismissed by the same button, key or their close button. Vitals sit bare top left, the action bar floats
  bottom centre, and the console is bare lines until hovered, focused or in a conversation. This reverses the earlier
  rejection of a floating HUD; the cost named then (gear hidden mid-fight) is now one key away. Classic and Twin rails
  keep stacked, folding windows.
- 2026-11-11: the HUD is modern with hints of the pixel world. Interface text is a smooth sans (Outfit); the Lantern pixel
  face stays on what belongs to the world (names and numbers over it, item counts, the title). Icons and item art stay
  pixel art. Controls are pills, panels have large radii, the glass is neutral rather than navy.
- 2026-11-12: Edge becomes the rail, picked from the /proto/hud prototypes (Sheet, Wings, Rail) after the glass video
  references. Summoning everything hid what a hunt needs, so the essentials never hide again: map, hero, bags and battle
  stand open in a column on the right edge (battle at its foot; bags and battle give way and scroll inside), health and
  mana sit as two wide bars over the action bar. Only the rare windows (skills, spells and tasks) are summoned, one at a
  time, from a labelled tab rail on the left edge; they open beside it as one pane with the rail inset into its edge.
  The camera-view pill sits at the top of the free world. The doll drops its slate figure on glass. Glass is warmer and denser, compact (10u panes, 5u wells),
  and shows what it allows: column headers light, grab and show a grabber; resizable windows carry a bottom grip bar;
  header buttons sit on a disc. A dragged window drops into the nearest column in both axes. Not picked: Sheet (the same
  column, rare windows as a centred sheet over the action bar) and Wings (battle on the left edge, map, hero and bags on
  the right).
- 2026-11-12: interface icons are Pixelarticons (pixelarticons.com, MIT), one-colour and tinted by the text colour, in
  every layout. `tools/ui/art.ts` rasterises each on its 24-unit grid and draws it at half a UI pixel per unit (a full icon
  is 12 UI pixels), kept in its whole frame so the set's own optical balance holds. Item art stays our own sprites. Balanced fight mode uses ‹ › (the set has no weighing scales).
