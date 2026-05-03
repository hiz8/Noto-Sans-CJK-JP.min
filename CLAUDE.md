# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repo produces a size-reduced subset of the [Noto Sans CJK JP](http://www.google.com/get/noto/help/cjk/) font (v2.004). It is not a runtime library — it is a build pipeline that takes upstream `.otf` (or `.ttf`) source files and emits `.min.ttf`, `.min.woff`, and `.min.woff2` covering only the character ranges declared under `Letters/`.

## Build pipeline

- `npm install` once, then `npm start` (i.e. `node index.js`) is the only build command.
- `index.js` does three things in order:
  1. Concatenates every file under `Letters/` into an in-memory string — the union of glyphs to keep. (No temp file on disk.)
  2. Scans `src/` for `*.otf` and `*.ttf` source fonts.
  3. For each font × `{sfnt, woff, woff2}` calls `harfbuzzjs/hb-subset.wasm` directly to subset the input, **dropping the `GSUB`, `GPOS`, `GDEF`, `kern`, `morx`, `mort` tables** via `HB_SUBSET_SETS_DROP_TABLE_TAG`, then wraps the result in the requested format via [`fontverter`](https://github.com/papandreou/fontverter). The output is written as `<name>.min.{ttf,woff,woff2}` under `dist/`. The output preserves the input outline format (CFF/CFF2 for OTF, glyf for TTF) under the `.min.ttf` extension — `.min.ttf` for an OTF source is technically OTF-inside-a-.ttf-named-file, which every browser handles.
- Stripping the layout tables is the main size reduction lever: CJK GSUB lookups (alternates, vertical forms, etc.) and GPOS kerning data dwarf the actual glyph outlines for a small subset. Browsers fall back to default glyph mapping without GSUB/GPOS, which is fine for horizontal Web body text. Note: in this repo dropping these tables is **not** a regression against the previously published `.min.ttf` — the prior pipeline already produced empty-shell GSUB/GPOS (scripts registered, 0 features, 0 lookups), so behavior is identical and only the empty shells (~104 B/file) are saved. The trade-off statement applies only relative to the upstream OTF: vertical writing (`vert`/`vrt2`) and CJK punctuation alternates would require GSUB lookups, kerning would require GPOS lookups. If a future build needs real layout features, narrow `DROP_TABLES` in `index.js` **and** confirm `harfbuzz-subset` retains the relevant features instead of pruning them.

## Prerequisites

- **Node 18+** (for `fs/promises`). The pipeline is pure JS/WASM — `npm install` pulls `harfbuzzjs` (the harfbuzz-subset wasm binary) and `fontverter`. No Python, no `pyftsubset`, no native compile.
- **Source `.otf` or `.ttf` files** must be placed in `src/` manually. `src/` is `.gitignored` — it is not checked in. Get them from the upstream Noto release.
- **`dist/`** is also `.gitignored`. The `docs/Fonts/NotoSansCJKjp/` directory contains a *published* copy of the subset used by the demo page; it is committed and is not the same as `dist/`.

## Character set layout (`Letters/`)

Each file is one slice of the kept glyph set. Adding/removing a file or editing its contents directly changes which characters survive the subset — the README's character tables mirror these files and should be updated in lockstep.

- `ASCII.txt` — 124 chars
- `Hiragana, Katakana, etc.txt` — 523 chars (kana, punctuation, Greek, Cyrillic, box-drawing, etc.)
- `JIS Level-1 Kanji Set.txt` — 2,965 chars
- `JIS Level-2 Kanji Set (Only one part).txt` — 551 chars (intentionally a partial JIS L2 — adding more would defeat the size goal)

## `docs/` is GitHub Pages

`docs/` is the demo site published at `hiz8.github.io/Noto-Sans-CJK-JP.min/`. `docs/index.html` is Japanese; `docs/en/index.html` is English. The fonts referenced from the demo live in `docs/Fonts/NotoSansCJKjp/` and are committed artifacts — when shipping a new build, the relevant files need to be copied from `dist/` into `docs/Fonts/NotoSansCJKjp/`.

## Conventions

- Prettier is configured (`.prettierrc`: `singleQuote`, `trailingComma: all`) but there is no lint/test script — formatting is the only style enforcement and there is no test suite.
- License for the fonts themselves is SIL OFL (`OFL.txt`); the build script has no separate license header.
