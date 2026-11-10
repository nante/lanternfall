# Lab tabs

A file `tabs/<tab>.ts` (tab = figures, scenery, darkness) is loaded when the lab opens with `?tab=<tab>`.
It exports `mount(ctx: TabContext)` (type in `../main.ts`) and may add buttons to `ctx.picks`, read and write
URL state through `ctx.url` and `ctx.write(reload)`, and reach the view (`ctx.view`) and the local engine (`ctx.lab`).
Add `tick=<ms>` to the URL to slow the engine (400 = quarter speed).
