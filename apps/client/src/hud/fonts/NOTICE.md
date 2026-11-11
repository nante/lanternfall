# Fonts

- `lantern.woff`, `lantern-bold.woff`: Lantern, the HUD's Latin pixel typeface, drawn for Lanternfall (`tools/ui/glyphs.ts`) and built by `tools/ui/font.ts`. Part of this project.
- `lantern-jp-*.woff`: Japanese, Greek, Cyrillic and symbol glyphs from **k8x12** by **Num Kadoma** (Copyright (C) 2015-2021 Num Kadoma), BDF edition of 2021-05-05, downloaded on 2026-11-11 from https://littlelimit.net/arc/k8x12/k8x12_bdf_2021-05-05.zip (font page: https://littlelimit.net/k8x12.htm). Converted from the BDF bitmaps to outlines on the same grid and split into chunks by `tools/ui/font.ts`; the glyphs are unchanged. Licence: free software, use, copy and distribute with or without modification, commercially or not, no warranty; the author's text is in `K8X12-LICENSE.txt` (licence section: ライセンス).

Rebuild: `npx tsx tools/ui/font.ts --jp <path to k8x12.bdf>`.
