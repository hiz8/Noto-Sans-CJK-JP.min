#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFile, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const README_PATH = join(repoRoot, 'README.md');
const PKG_PATH = join(repoRoot, 'package.json');
const SRC_DIR = join(repoRoot, 'src');
const DIST_DIR = join(repoRoot, 'dist');
const DOCS_FONTS_DIR = join(repoRoot, 'docs', 'Fonts', 'NotoSansCJKjp');
const WIN32 = process.platform === 'win32';

// label -> base file name (without `.min.{ttf,woff2}`).
// Mirrors the README "Size" table rows and the actual files emitted by
// index.js. Order here is the order rendered in README.md.
const WEIGHT_FILES = [
  ['Thin', 'NotoSansCJKjp-Thin'],
  ['Light', 'NotoSansCJKjp-Light'],
  ['DemiLight', 'NotoSansCJKjp-DemiLight'],
  ['Regular', 'NotoSansCJKjp-Regular'],
  ['Medium', 'NotoSansCJKjp-Medium'],
  ['Bold', 'NotoSansCJKjp-Bold'],
  ['Black', 'NotoSansCJKjp-Black'],
  ['Variable', 'NotoSansCJKjp-VF'],
  ['Mono-Regular', 'NotoSansMonoCJKjp-Regular'],
  ['Mono-Bold', 'NotoSansMonoCJKjp-Bold'],
  ['Mono-Variable', 'NotoSansMonoCJKjp-VF'],
];
const LABEL_WIDTH = WEIGHT_FILES.reduce(
  (n, [label]) => Math.max(n, label.length),
  0,
);

const SIZE_TABLE_START = '<!-- size-table:start -->';
const SIZE_TABLE_END = '<!-- size-table:end -->';

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// On Windows, spawnSync({ shell: true }) hands args to cmd.exe which
// re-tokenizes them on whitespace. Node does not pre-quote, so a value like
// "Release 3.0.0" arrives as two tokens and `git commit -m` treats "3.0.0"
// as a pathspec. Quote any arg with whitespace or cmd meta-characters,
// doubling embedded `"` per cmd.exe rules.
function winQuote(arg) {
  if (arg === '' || /[\s"^&|<>]/.test(arg)) {
    return `"${String(arg).replace(/"/g, '""')}"`;
  }
  return arg;
}

function spawn(cmd, args, opts) {
  return spawnSync(cmd, WIN32 ? args.map(winQuote) : args, {
    cwd: repoRoot,
    shell: WIN32,
    ...opts,
  });
}

function run(cmd, args) {
  const result = spawn(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    fail(`${cmd} ${args.join(' ')} exited with code ${result.status}`);
  }
}

function runCapture(cmd, args) {
  return spawn(cmd, args, { encoding: 'utf8' });
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `\`${mb.toFixed(2)} MB\``;
  const kb = bytes / 1024;
  return `\`${Math.round(kb)} KB\``;
}

async function preflight(version, dryRun) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`invalid version: ${version} (expected e.g. 3.2.0)`);
  }
  const status = runCapture('git', ['status', '--porcelain']);
  if (status.status !== 0) fail('git status failed');
  if (status.stdout.trim() !== '') {
    fail(`working tree is not clean:\n${status.stdout}`);
  }
  const tag = runCapture('git', [
    'rev-parse',
    '--verify',
    '--quiet',
    `refs/tags/${version}`,
  ]);
  if (tag.status === 0) {
    fail(`tag ${version} already exists`);
  }
  const srcEntries = await readdir(SRC_DIR).catch(() => []);
  const fonts = srcEntries.filter((f) => /\.(otf|ttf)$/i.test(f));
  if (fonts.length === 0) {
    fail('src/ contains no .otf or .ttf files');
  }
  console.log(
    `preflight ok (version ${version}${dryRun ? ', dry-run' : ''}, ${fonts.length} source font(s))`,
  );
}

function runBuild() {
  console.log('--- build ---');
  run('node', ['index.js']);
}

async function copyDistToDocs() {
  console.log('--- copy dist/*.min.* -> docs/Fonts/NotoSansCJKjp/ ---');
  const files = await readdir(DIST_DIR);
  const targets = files.filter((f) => /\.min\.(ttf|woff|woff2)$/i.test(f));
  await Promise.all(
    targets.map((f) => copyFile(join(DIST_DIR, f), join(DOCS_FONTS_DIR, f))),
  );
  console.log(`copied ${targets.length} file(s)`);
}

function parseOtfColumn(readme) {
  const map = new Map();
  const start = readme.indexOf(SIZE_TABLE_START);
  const end = readme.indexOf(SIZE_TABLE_END);
  if (start === -1 || end === -1) return map;
  const block = readme.slice(start, end);
  // Allow `-` in labels so "Mono-Regular" etc. match.
  const lineRe = /^\|\s*([\w-]+)\s*\|\s*(`[^`]+`|-)\s*\|/gm;
  let m;
  while ((m = lineRe.exec(block)) !== null) {
    const [, label, value] = m;
    if (label === 'Weight') continue;
    map.set(label, value);
  }
  return map;
}

async function buildSizeTable(readme) {
  const otfMap = parseOtfColumn(readme);
  const rows = await Promise.all(
    WEIGHT_FILES.map(async ([label, base]) => {
      const [ttfStat, woff2Stat] = await Promise.all([
        stat(join(DIST_DIR, `${base}.min.ttf`)),
        stat(join(DIST_DIR, `${base}.min.woff2`)),
      ]);
      return { label, ttf: ttfStat.size, woff2: woff2Stat.size };
    }),
  );
  const lines = [
    `| ${'Weight'.padEnd(LABEL_WIDTH)} | otf (Original) | ttf       | woff2     |`,
    `| ${':'.padEnd(LABEL_WIDTH, '-')} | :------------- | :-------- | :-------- |`,
  ];
  for (const { label, ttf, woff2 } of rows) {
    const otf = otfMap.get(label) ?? '`-`';
    lines.push(
      `| ${label.padEnd(LABEL_WIDTH)} | ${otf.padEnd(14)} | ${formatSize(ttf).padEnd(9)} | ${formatSize(woff2).padEnd(9)} |`,
    );
  }
  return lines.join('\n');
}

function spliceReadme(original, table) {
  const startIdx = original.indexOf(SIZE_TABLE_START);
  const endIdx = original.indexOf(SIZE_TABLE_END);
  if (startIdx === -1 || endIdx === -1) {
    fail(
      `README.md is missing size-table markers (${SIZE_TABLE_START} / ${SIZE_TABLE_END})`,
    );
  }
  const before = original.slice(0, startIdx + SIZE_TABLE_START.length);
  const after = original.slice(endIdx);
  return `${before}\n${table}\n${after}`;
}

async function updatePackageVersion(version) {
  const pkg = JSON.parse(await readFile(PKG_PATH, 'utf8'));
  console.log(`package.json version: ${pkg.version} -> ${version}`);
  pkg.version = version;
  await writeFile(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`);
}

function gitRelease(version) {
  console.log('--- git ---');
  run('git', ['add', 'docs/Fonts/NotoSansCJKjp/', 'README.md', 'package.json']);
  run('git', ['commit', '-m', `Release ${version}`]);
  run('git', ['tag', version]);
  run('git', ['push', '--follow-tags']);
}

async function main() {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (!values.version) fail('--version <semver> is required');
  const version = values.version;
  const dryRun = values['dry-run'];

  await preflight(version, dryRun);
  runBuild();

  const readme = await readFile(README_PATH, 'utf8');
  const table = await buildSizeTable(readme);
  const nextReadme = spliceReadme(readme, table);

  if (dryRun) {
    console.log('--- README size table (preview) ---');
    console.log(table);
    const pkg = JSON.parse(await readFile(PKG_PATH, 'utf8'));
    console.log(`package.json version: ${pkg.version} -> ${version}`);
    console.log('\n--- dry-run summary ---');
    console.log(
      'No files modified beyond dist/. Re-run without --dry-run to publish.',
    );
    return;
  }

  await copyDistToDocs();
  if (nextReadme !== readme) {
    await writeFile(README_PATH, nextReadme);
    console.log('README.md size table updated');
  } else {
    console.log('README.md size table unchanged');
  }
  await updatePackageVersion(version);
  gitRelease(version);
  console.log(
    `\nReleased ${version}. GitHub Actions will create the Release shortly.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
