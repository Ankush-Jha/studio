#!/usr/bin/env node
// Render a post spec to 1080x1350 slides.
//   node render.mjs specs/<legacy-spec>.json --client <id> [--group 3] [--strict] [--only 1,4] [--out out/x]
// Style library (specs with "engine": "library", a "style" field, or --style):
//   node render.mjs specs/library/<id>.json --client <id> [--style swiss] [--format feed|story|square] [--strict]
//   (see lib/library.mjs and <repo>/.claude/skills/stills/SKILL.md)
// Output (default out/<spec-id>[-g<group>]/<client>/):
//   01.jpg ... NN.jpg      1080x1350 sRGB JPEG q92 (downsampled from the 2x render)
//   png/01@2x.png ...      2160x2700 PNG masters
//   contact.jpg            contact sheet of the post
//   manifest.json          inputs, token files, word counts, maths audit, QA findings
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { loadTokens } from './lib/tokens.mjs';
import { TEMPLATES } from './lib/templates.mjs';
import { buildPage } from './lib/page.mjs';
import { missingFields } from './lib/compliance.mjs';
import { contactSheet } from './lib/sheets.mjs';
import { renderLibrary } from './lib/library.mjs';
import { finishJPEGs } from './lib/finish.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const key = k.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) a[key] = true;
      else { a[key] = next; i++; }
    } else a._.push(k);
  }
  return a;
}

export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const dirs = [path.join(ROOT, 'node_modules'), process.env.PLAYWRIGHT_DIR, path.resolve(ROOT, '..', '..', 'node_modules')].filter(Boolean);
  for (const d of dirs) for (const name of ['playwright', 'playwright-core']) {
    const p = path.join(d, name, 'index.js');
    if (fs.existsSync(p)) return require(p);
  }
  throw new Error('Playwright not found. Run `npm install` in engines/stills/ (then `npx playwright-core install chromium`) or set PLAYWRIGHT_DIR.');
}

export function pythonBin() {
  const cands = [process.env.STATICS_PYTHON, path.join(ROOT, '.venv', 'bin', 'python'), path.resolve(ROOT, '..', '..', '.venv', 'bin', 'python'), 'python3'].filter(Boolean);
  for (const c of cands) {
    const r = spawnSync(c, ['-c', 'import PIL, numpy'], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  throw new Error('Need a Python with Pillow + numpy (set STATICS_PYTHON).');
}

export async function launch() {
  const { chromium } = loadPlaywright();
  // File access lets style page modules import vendor/three.module.min.js; Metal keeps WebGL on the GPU on macOS.
  const angle = process.env.STATICS_ANGLE || (process.platform === 'darwin' ? 'metal' : '');
  return chromium.launch({ args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--allow-file-access-from-files', '--enable-gpu', '--ignore-gpu-blocklist', ...(angle ? [`--use-angle=${angle}`] : [])] });
}

export function isLibrarySpec(specPath, opts = {}) {
  if (opts.style || opts.format) return true;
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  return spec.engine === 'library' || !!spec.style;
}

// Style-library render (lib/library.mjs) with this file's browser launcher and JPEG finisher.
export function renderLib(specPath, opts = {}, browser = null) {
  return renderLibrary(ROOT, specPath, opts, browser, launch, (pairs, fmt) => finishJPEGs(ROOT, pairs, fmt, pythonBin));
}

function resolveSlides(spec, { client, group }) {
  return spec.slides.map((s) => {
    let out = { ...s };
    if (s.byGroup?.[String(group)]) out = { ...out, ...s.byGroup[String(group)] };
    if (s.byClient?.[client]) out = { ...out, ...s.byClient[client] };
    delete out.byGroup; delete out.byClient;
    return out;
  });
}

export async function renderSpec(specPath, opts = {}, browser = null) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const client = opts.client || 'northline-mortgages';
  const group = Number(opts.group || spec.group);
  if (!group) throw new Error('Spec needs "group" (1-4) or pass --group');
  const tokens = loadTokens(ROOT, { group, client });

  const missing = missingFields(tokens.client.compliance);
  if (missing.length) {
    const msg = `Compliance fields empty for ${client}: ${missing.map((m) => m.label).join(', ')}`;
    if (opts.strict) {
      const err = new Error(`${msg}. --strict: refusing to export. Fill tokens/clients/${client}.json from the broker's licence record (never invent).`);
      err.code = 'STRICT';
      throw err;
    }
    console.warn(`! ${msg}. Rendering visible placeholders (export blocked under --strict).`);
  }

  const slides = resolveSlides(spec, { client, group });
  const only = opts.only ? String(opts.only).split(',').map((n) => Number(n) - 1) : null;
  const groupSuffix = opts.group && Number(opts.group) !== Number(spec.group) ? `-g${group}` : '';
  const outDir = path.resolve(opts.out || path.join(ROOT, 'out', `${spec.id}${groupSuffix}`, client));
  fs.mkdirSync(path.join(outDir, 'png'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'html'), { recursive: true });

  const own = !browser;
  browser = browser || (await launch());
  const context = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const page = await context.newPage();
  const results = [];

  for (let i = 0; i < slides.length; i++) {
    if (only && !only.includes(i)) continue;
    const s = slides[i];
    const tpl = TEMPLATES[s.type];
    if (!tpl) throw new Error(`Slide ${i + 1}: unknown type "${s.type}". Known: ${Object.keys(TEMPLATES).join(', ')}`);
    const part = tpl(s, tokens, { index: i, total: slides.length });
    const html = buildPage({ root: ROOT, tokens, spec, slide: s, index: i, total: slides.length, part });
    const n = String(i + 1).padStart(2, '0');
    const htmlPath = path.join(outDir, 'html', `${n}.html`);
    fs.writeFileSync(htmlPath, html);
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    const fontState = await page.evaluate(async () => {
      await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
      await document.fonts.ready;
      return [...document.fonts].map((f) => `${f.family}:${f.style}:${f.status}`);
    });
    const failed = fontState.filter((f) => !f.endsWith(':loaded'));
    if (failed.length) throw new Error(`Fonts failed to load: ${failed.join(', ')}`);
    await page.evaluate(() => window.HAND_RUN());
    const qa = await page.evaluate(() => window.QA_RUN());
    const pngPath = path.join(outDir, 'png', `${n}@2x.png`);
    await page.screenshot({ path: pngPath, type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1350 } });
    results.push({ n, type: s.type, png: pngPath, jpg: path.join(outDir, `${n}.jpg`), qa, audit: part.audit || null });
    const flag = qa.issues.length ? `  ! ${qa.issues.map((x) => x.kind + (x.text ? `("${x.text.slice(0, 24)}")` : '')).join(', ')}` : '';
    console.log(`  ${n} ${s.type.padEnd(9)} ${String(qa.words).padStart(3)} words${flag}`);
  }
  await context.close();

  // 2x PNG -> 1080x1350 sRGB JPEG q92.
  const py = pythonBin();
  const r = spawnSync(py, [path.join(ROOT, 'tools', 'finish.py'), ...results.map((x) => `${x.png}=${x.jpg}`)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`finish.py failed: ${r.stderr}`);

  if (!only) {
    await contactSheet(browser, {
      title: spec.title,
      subtitle: `Group ${group} · ${tokens.familyName} · ${tokens.client.name} (${client}) · layout ${tokens.client.layoutVariant}`,
      items: results.map((x) => ({ src: x.jpg, label: `${x.n} · ${x.type}` })),
      out: path.join(outDir, 'contact.jpg'),
    });
  }
  if (own) await browser.close();

  const manifest = {
    spec: path.relative(ROOT, path.resolve(specPath)),
    id: spec.id,
    title: spec.title,
    renderedAt: new Date().toISOString(),
    group, family: tokens.family, client, layoutVariant: tokens.client.layoutVariant,
    tokens: { group: path.relative(ROOT, tokens.files.group), client: path.relative(ROOT, tokens.files.client) },
    contrast: tokens.contrastReport,
    compliance: { missing: missing.map((m) => m.key), placeholder: missing.length > 0 },
    sources: spec.sources || [],
    slides: results.map((x) => ({
      n: x.n, type: x.type, jpg: path.relative(ROOT, x.jpg), png: path.relative(ROOT, x.png), words: x.qa.words,
      minContrast: Math.min(...x.qa.runs.map((r) => r.contrast)),
      minBodyPx: Math.min(...x.qa.runs.filter((r) => r.role === 'body' || r.role === 'display').map((r) => r.size)),
      minLabelPx: Math.min(...x.qa.runs.filter((r) => r.role === 'label').map((r) => r.size)),
      issues: x.qa.issues, audit: x.audit,
    })),
  };
  // A partial render (--only) updates its slides inside the existing manifest.
  const mPath = path.join(outDir, 'manifest.json');
  if (only && fs.existsSync(mPath)) {
    const prev = JSON.parse(fs.readFileSync(mPath, 'utf8'));
    if (prev.id === manifest.id) {
      const byN = Object.fromEntries(prev.slides.map((x) => [x.n, x]));
      for (const x of manifest.slides) byN[x.n] = x;
      manifest.slides = Object.values(byN).sort((a, b) => a.n.localeCompare(b.n));
    }
  }
  fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2));
  return { outDir, manifest };
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const specPath = args._[0];
  if (!specPath) {
    console.error('Usage: node render.mjs <spec.json> [--client <id>] [--group N] [--style slug] [--format feed|story|square] [--strict] [--only 1,3] [--out dir]');
    process.exit(64);
  }
  const t0 = Date.now();
  const lib = isLibrarySpec(path.resolve(specPath), args);
  console.log(`Rendering ${specPath} for ${args.client || 'northline-mortgages'}${args.group ? ` (group ${args.group})` : ''}${lib ? ` [library${args.style ? `: ${args.style}` : ''}${args.format ? `, ${args.format}` : ''}]` : ''}`);
  (lib ? renderLib(path.resolve(specPath), args) : renderSpec(path.resolve(specPath), args))
    .then(({ outDir, manifest }) => {
      const all = manifest.slides.flatMap((s) => s.issues);
      const fails = all.filter((x) => (x.sev || 'fail') === 'fail').length;
      const todos = all.filter((x) => x.sev === 'todo').length;
      const warns = all.filter((x) => x.sev === 'warn').length;
      console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${path.relative(process.cwd(), outDir)}  (${manifest.slides.length} slides, ${fails} fail, ${warns} warn, ${todos} todo)`);
    })
    .catch((e) => {
      console.error(`✗ ${e.message}`);
      process.exit(e.code === 'STRICT' ? 2 : 1);
    });
}
