const fs = require('fs/promises');
const path = require('path');
const fontverter = require('fontverter');

const LETTERS_DIR = path.join(__dirname, 'Letters');
const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');
const SRC_EXT = /\.(otf|ttf)$/i;

const TARGETS = [
  { format: 'sfnt', ext: 'ttf' },
  { format: 'woff', ext: 'woff' },
  { format: 'woff2', ext: 'woff2' },
];

// OpenType layout tables to strip from the subset output. Removing these is
// what gives the WOFF/WOFF2 a step-change size reduction over a plain subset:
// CJK GSUB lookups (ligatures, alternates, vertical forms, etc.) are huge.
// Web rendering does not need them — browsers fall back to default glyphs.
const DROP_TABLES = ['GSUB', 'GPOS', 'GDEF', 'kern', 'morx', 'mort'];

const HB_SUBSET_SETS_DROP_TABLE_TAG = 3;
const HB_SUBSET_FLAGS_NO_LAYOUT_CLOSURE = 0x00000200;

const hbTag = (s) =>
  s.split('').reduce((a, c) => (a << 8) + c.charCodeAt(0), 0) >>> 0;

let hbInit;
async function loadHarfbuzz() {
  if (!hbInit) {
    hbInit = (async () => {
      const wasmPath = require.resolve('harfbuzzjs/hb-subset.wasm');
      const wasm = await fs.readFile(wasmPath);
      const {
        instance: { exports: hb },
      } = await WebAssembly.instantiate(wasm);
      return { hb, heap: new Uint8Array(hb.memory.buffer) };
    })();
  }
  return hbInit;
}

async function subsetAndStrip(originalFont, text, targetFormat) {
  const { hb, heap } = await loadHarfbuzz();

  // harfbuzz's hb-subset only accepts SFNT input.
  const sfntInput = await fontverter.convert(originalFont, 'truetype');

  const input = hb.hb_subset_input_create_or_fail();
  if (input === 0) {
    throw new Error('hb_subset_input_create_or_fail returned zero');
  }

  const fontPtr = hb.malloc(sfntInput.byteLength);
  heap.set(new Uint8Array(sfntInput), fontPtr);
  const blob = hb.hb_blob_create(fontPtr, sfntInput.byteLength, 2, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);

  try {
    const dropSet = hb.hb_subset_input_set(input, HB_SUBSET_SETS_DROP_TABLE_TAG);
    for (const tag of DROP_TABLES) {
      hb.hb_set_add(dropSet, hbTag(tag));
    }

    // GSUB is being dropped, so layout closure would only waste work and keep
    // glyphs that aren't reachable without GSUB anyway.
    hb.hb_subset_input_set_flags(
      input,
      hb.hb_subset_input_get_flags(input) | HB_SUBSET_FLAGS_NO_LAYOUT_CLOSURE,
    );

    const unicodes = hb.hb_subset_input_unicode_set(input);
    for (const c of text) {
      hb.hb_set_add(unicodes, c.codePointAt(0));
    }

    const subset = hb.hb_subset_or_fail(face, input);
    if (subset === 0) {
      throw new Error('hb_subset_or_fail returned zero');
    }

    try {
      const result = hb.hb_face_reference_blob(subset);
      const offset = hb.hb_blob_get_data(result, 0);
      const length = hb.hb_blob_get_length(result);
      const out = Buffer.from(heap.subarray(offset, offset + length));
      hb.hb_blob_destroy(result);
      return await fontverter.convert(out, targetFormat, 'truetype');
    } finally {
      hb.hb_face_destroy(subset);
    }
  } finally {
    hb.hb_subset_input_destroy(input);
    hb.hb_face_destroy(face);
    hb.free(fontPtr);
  }
}

async function readGlyphSet() {
  const files = await fs.readdir(LETTERS_DIR);
  const parts = await Promise.all(
    files.map((f) => fs.readFile(path.join(LETTERS_DIR, f), 'utf8')),
  );
  return parts.map((s) => s.replace(/^﻿/, '')).join('');
}

async function listSrcFonts() {
  const entries = await fs.readdir(SRC_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && SRC_EXT.test(e.name))
    .map((e) => e.name);
}

async function buildOne(srcFile, text) {
  const baseName = srcFile.replace(SRC_EXT, '');
  const input = await fs.readFile(path.join(SRC_DIR, srcFile));
  let failed = 0;

  for (const { format, ext } of TARGETS) {
    const outPath = path.join(DIST_DIR, `${baseName}.min.${ext}`);
    try {
      const out = await subsetAndStrip(input, text, format);
      await fs.writeFile(outPath, out);
      console.log(
        `  ${path.basename(outPath)}  (${out.length.toLocaleString()} bytes)`,
      );
    } catch (e) {
      failed++;
      console.error(`  ${path.basename(outPath)} — FAILED: ${e.message}`);
    }
  }
  return failed;
}

async function main() {
  const [text, srcFonts] = await Promise.all([readGlyphSet(), listSrcFonts()]);
  if (srcFonts.length === 0) {
    console.error(`No .otf or .ttf files found in ${SRC_DIR}`);
    process.exit(1);
  }
  await fs.mkdir(DIST_DIR, { recursive: true });

  console.log(
    `Subsetting ${srcFonts.length} font(s) with ${text.length} glyphs:`,
  );
  let totalFailed = 0;
  for (const f of srcFonts) {
    console.log(`- ${f}`);
    totalFailed += await buildOne(f, text);
  }
  if (totalFailed > 0) {
    console.error(`\n${totalFailed} target(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
