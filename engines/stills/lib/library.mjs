// Renderer for the style library (library/<slug>/). One spec, one client, one style, one format.
//   node render.mjs specs/library/<id>.json --client <id> [--style <slug>] [--format feed|story|square]
//                   [--strict] [--only 1,3] [--out dir] [--slot secondary]
// Output: out/<spec-id>--<style>[--<format>]/<client>/  (NN.jpg, png/NN@2x.png, contact.jpg, manifest.json, html/)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { formatOf } from './formats.mjs';
import { loadStyleMeta, loadRoster, loadClient, libTokens, rosterStyle } from './libtokens.mjs';
import { buildLibPage } from './libpage.mjs';
import { runCalc, fillDeep, money, moneyK, pct } from './calc.mjs';
import { inline, esc, words } from './markup.mjs';
import { complianceHTML, missingFields } from './compliance.mjs';
import { contactSheet } from './sheets.mjs';

export function loadSharp(root) {
  const require = createRequire(import.meta.url);
  const dirs = [path.join(root, 'node_modules'), process.env.SHARP_DIR, path.resolve(root, '..', '..', 'node_modules')].filter(Boolean);
  for (const d of dirs) {
    const p = path.join(d, 'sharp');
    if (fs.existsSync(path.join(p, 'package.json'))) return require(p);
  }
  return null;
}

const HIDE_TEXT_CSS = `.qa-hide-text, .qa-hide-text * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; -webkit-text-stroke-color: transparent !important; text-decoration-color: transparent !important; }
.qa-hide-text svg:not(.marks) text, .qa-hide-text svg:not(.marks) tspan { fill: transparent !important; stroke: transparent !important; }`;

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

// WCAG contrast of every run against the real pixels behind it (text hidden), 10th percentile.
async function pixelContrast(sharp, png, runs) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  for (const run of runs) {
    const vals = [];
    let bgSum = [0, 0, 0], n = 0;
    const [fr, fg, fb] = run.fg;
    const a = run.alpha;
    for (const rc of run.rects) {
      // Inline boxes span the font's full ascent+descent; glyph ink sits in roughly the middle
      // 70%, so tight leading next to a coloured band doesn't count the band as background.
      const hh = rc.y1 - rc.y0;
      const x0 = Math.max(0, Math.floor(rc.x0)), x1 = Math.min(W, Math.ceil(rc.x1));
      const y0 = Math.max(0, Math.floor(rc.y0 + hh * 0.14)), y1 = Math.min(H, Math.ceil(rc.y1 - hh * 0.16));
      const step = (x1 - x0) * (y1 - y0) > 120000 ? 2 : 1;
      for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
        const k = (y * W + x) * 3;
        const br = data[k], bg = data[k + 1], bb = data[k + 2];
        let tr, tg, tb;
        if (run.blend === 'multiply') { tr = (fr * br) / 255; tg = (fg * bg) / 255; tb = (fb * bb) / 255; } else { tr = fr; tg = fg; tb = fb; }
        tr = tr * a + br * (1 - a); tg = tg * a + bg * (1 - a); tb = tb * a + bb * (1 - a);
        const L1 = lum(tr, tg, tb), L2 = lum(br, bg, bb);
        vals.push((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05));
        bgSum[0] += br; bgSum[1] += bg; bgSum[2] += bb; n++;
      }
    }
    if (!vals.length) { run.contrast = null; continue; }
    vals.sort((p, q) => p - q);
    run.contrast = +vals[Math.floor(vals.length * 0.1)].toFixed(2);
    run.bg = bgSum.map((v) => Math.round(v / n));
  }
}

function resolveSlides(spec, { client, group, style, format }) {
  return spec.slides.map((s) => {
    let out = { ...s };
    for (const [key, k] of [['byGroup', String(group)], ['byStyle', style], ['byFormat', format], ['byClient', client]]) {
      if (s[key]?.[k]) out = { ...out, ...s[key][k] };
    }
    delete out.byGroup; delete out.byStyle; delete out.byFormat; delete out.byClient;
    return out;
  });
}

function photoHTML(root, client, slot, { label = '', note = '' } = {}) {
  const file = client.photos?.[slot];
  const abs = file ? path.join(root, 'assets', 'clients', client.meta.id, file) : null;
  if (abs && fs.existsSync(abs)) {
    return `<img class="photo" data-client-photo="${esc(slot)}" src="${pathToFileURL(abs).href}" alt="">`;
  }
  return `<div class="photo-ph" data-allow="gradient" data-photo-placeholder="${esc(slot)}"><div class="photo-ph-in" data-role="label"><b>Client photo</b><span>${esc(label || slot)}</span>${note ? `<em>${esc(note)}</em>` : ''}</div></div>`;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export async function renderLibrary(root, specPath, opts, browser, launch, finishJPEGs) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const clientId = opts.client || spec.client;
  if (!clientId) throw new Error('Pass --client <id> (a file in tokens/clients/)');
  const client = loadClient(root, clientId);
  const roster = loadRoster(root);
  const rc = roster.clients?.[clientId] || {};
  const group = Number(opts.group || spec.group || rc.group || client.meta.group);
  const styleSlug = opts.style || spec.style || rosterStyle(roster, clientId, opts.slot || 'primary');
  if (!styleSlug) throw new Error(`No style: pass --style, set "style" in the spec, or add ${clientId} to library/roster.json`);
  const style = loadStyleMeta(root, styleSlug);
  const fmtName = opts.format || spec.canvas || 'feed';
  let fmt = formatOf(fmtName);
  // Footer reserve: --reserve <px> keeps the canvas size but ends the safe box
  // <px> + --reservePad (default 8) above the bottom, so the style lays out in the full height above a
  // client footer that is composited into the bottom <px> afterwards. --css <file> appends job CSS.
  const reserve = Number(opts.reserve || 0);
  if (reserve > 0) {
    const pad = Number(opts.reservePad ?? 8);
    fmt = { ...fmt, reserve, safe: { ...fmt.safe, y1: fmt.h - reserve - pad } };
  }
  const extraCSS = opts.css ? fs.readFileSync(path.resolve(String(opts.css)), 'utf8') : '';
  if (style.formats && !style.formats.includes(fmt.name)) throw new Error(`Style ${style.slug} does not support format ${fmt.name}`);
  const variant = opts.variant || client.byStyle?.[style.slug]?.variant || rc.variant || client.meta.layoutVariant || 'a';
  const tokens = libTokens(style, client);
  const lang = opts.lang || spec.lang || 'en';

  const missing = missingFields(client.compliance);
  if (missing.length) {
    const msg = `Compliance fields empty for ${clientId}: ${missing.map((m) => m.label).join(', ')}`;
    if (opts.strict) {
      const err = new Error(`${msg}. --strict: refusing to export. Fill tokens/clients/${clientId}.json from the broker's licence record (never invent).`);
      err.code = 'STRICT';
      throw err;
    }
    console.warn(`! ${msg}. Rendering visible placeholders (export blocked under --strict).`);
  }
  if (roster.groups && group && roster.groups[String(group)] && !roster.groups[String(group)].styles.includes(style.slug) && !opts.anyGroup) {
    console.warn(`! Style ${style.slug} is not in group ${group}'s roster (${roster.groups[String(group)].styles.join(', ')}). Allowed for proofs; check same-city clients before posting.`);
  }

  const mod = await import(pathToFileURL(path.join(style.dir, 'style.mjs')).href + `?v=${Date.now()}`);
  const slidesRaw = resolveSlides(spec, { client: clientId, group, style: style.slug, format: fmt.name });
  const only = opts.only ? String(opts.only).split(',').map((n) => Number(n) - 1) : null;
  const folder = `${spec.id}--${style.slug}${fmt.name === 'feed' ? '' : `--${fmt.name}`}${fmt.reserve ? `--r${fmt.reserve}` : ''}`;
  const outDir = path.resolve(opts.out || path.join(root, 'out', folder, clientId));
  fs.mkdirSync(path.join(outDir, 'png'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'html'), { recursive: true });

  const own = !browser;
  browser = browser || (await launch());
  const context = await browser.newContext({ viewport: { width: fmt.w, height: fmt.h }, deviceScaleFactor: 2, colorScheme: 'light' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
  const sharp = loadSharp(root);
  const results = [];
  const total = slidesRaw.length;

  for (let i = 0; i < total; i++) {
    if (only && !only.includes(i)) continue;
    let s = slidesRaw[i];
    const calcs = [].concat(s.calc || []).map(runCalc);
    const fills = Object.assign({}, ...calcs.map((c) => c.fills));
    s = fillDeep(s, fills);
    // {keyword} is filled by the style (cta keyword chip), not by a calc.
    const leftover = (JSON.stringify(s).match(/\{[a-zA-Z]\w*\}/g) || []).filter((m) => m !== '{keyword}');
    if (leftover.length) throw new Error(`Slide ${i + 1}: unfilled tokens ${[...new Set(leftover)].join(', ')} (calc: ${calcs.map((c) => c.kind).join(', ') || 'none'})`);
    const rng = mulberry32(hashStr(`${client.meta.seed}:${spec.id}:${style.slug}:${i}`));
    const ctx = {
      index: i, total, isFirst: i === 0, isLast: i === total - 1, isSingle: total === 1,
      format: fmt, variant, lang, group,
      client: { id: clientId, name: client.meta.name, initials: client.meta.initials, city: client.meta.city || rc.city || '', province: client.meta.province, seed: client.meta.seed },
      spec: { id: spec.id, title: spec.title, series: s.series ?? spec.series ?? '', date: spec.date, reviewBy: spec.reviewBy },
      palette: tokens.palette,
      t: (str) => inline(str || '', { emphasis: style.emphasis || 'highlight' }),
      esc, words, money, moneyK, pct, rng,
      calc: calcs[0] || null, calcs,
      compliance: (size = 'line') => complianceHTML(client.compliance, { size }),
      photo: (slot, o) => photoHTML(root, client, slot, o),
      folio: () => (total === 1 ? '' : `${String(i + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`),
    };
    const render = mod.render || mod.default;
    const part = await render(s, ctx);
    if (!part || typeof part.html !== 'string') throw new Error(`Style ${style.slug}: render() must return { html } for slide type "${s.type}"`);
    const hand = {
      seed: `${client.meta.seed}:${spec.id}:${style.slug}:${i}`,
      pen: style.hand?.pen || 'marker', color: style.hand?.color || 'mark-ink', emphasis: style.emphasis,
      strike: style.hand?.strike || 'single', weight: style.hand?.weight, wobble: style.hand?.wobble ?? 1,
      highlightCover: style.hand?.highlightCover, underlineDouble: !!style.hand?.underlineDouble,
      grainSeed: (client.meta.seed * 7 + i * 13) % 97,
    };
    const qaConf = {
      format: fmt.name, safe: fmt.safe, crop34: fmt.crop34, illustrative: !!style.illustrative, allow: style.allow || {},
      maxWords: style.maxWords || 40,
      allowedImg: [pathToFileURL(path.join(root, 'assets', 'clients')).href, pathToFileURL(style.dir).href],
    };
    const html = buildLibPage({ root, style, tokens, fmt, slide: s, index: i, total, part, hand, qaConf, lang, clientId, variant, extraCSS });
    const n = String(i + 1).padStart(2, '0');
    const htmlPath = path.join(outDir, 'html', `${n}.html`);
    fs.writeFileSync(htmlPath, html);
    pageErrors.length = 0;
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    const fontState = await page.evaluate(async () => {
      await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
      await document.fonts.ready;
      return [...document.fonts].map((f) => `${f.family}:${f.style}:${f.weight}:${f.status}`);
    });
    const failed = fontState.filter((f) => !f.endsWith(':loaded'));
    if (failed.length) throw new Error(`Fonts failed to load: ${failed.join(', ')}`);
    if (fs.existsSync(path.join(style.dir, 'page.js'))) {
      await page.waitForFunction(() => typeof window.STYLE_RUN === 'function', null, { timeout: 20000 });
      await page.evaluate(async () => { await window.STYLE_RUN(JSON.parse(document.getElementById('style-data').textContent)); });
    }
    await page.evaluate(() => window.FIT_RUN());
    await page.evaluate(() => window.HAND_RUN());
    const qa = await page.evaluate(() => window.QA_RUN());
    const pngPath = path.join(outDir, 'png', `${n}@2x.png`);
    await page.screenshot({ path: pngPath, type: 'png', clip: { x: 0, y: 0, width: fmt.w, height: fmt.h } });
    // Background-only capture for pixel contrast.
    await page.addStyleTag({ content: HIDE_TEXT_CSS });
    await page.evaluate(() => document.querySelector('.slide').classList.add('qa-hide-text'));
    const bgPng = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: fmt.w, height: fmt.h }, scale: 'css' });
    if (sharp) await pixelContrast(sharp, bgPng, qa.runs);
    for (const r of qa.runs) {
      if (r.contrast != null && r.contrast < r.need) qa.issues.push({ sev: 'fail', kind: 'contrast', ratio: r.contrast, need: r.need, text: r.text.slice(0, 50) });
    }
    if (pageErrors.length) qa.issues.push({ sev: 'fail', kind: 'page-error', text: pageErrors.join(' | ').slice(0, 200) });
    results.push({ n, type: s.type, png: pngPath, jpg: path.join(outDir, `${n}.jpg`), qa, audit: calcs.map((c) => ({ kind: c.kind, ...c.audit, values: c.values })), part });
    const fails = qa.issues.filter((x) => x.sev === 'fail');
    const todos = qa.issues.filter((x) => x.sev === 'todo');
    const warns = qa.issues.filter((x) => x.sev === 'warn');
    const minC = Math.min(...qa.runs.map((r) => r.contrast ?? 99));
    const flag = [fails.length ? `FAIL ${fails.map((x) => x.kind + (x.text ? `("${String(x.text).slice(0, 22)}")` : '')).join(', ')}` : '', warns.length ? `warn ${warns.map((x) => x.kind).join(', ')}` : '', todos.length ? `todo ${[...new Set(todos.map((x) => x.kind))].join(', ')}` : ''].filter(Boolean).join('  ');
    console.log(`  ${n} ${s.type.padEnd(9)} ${String(qa.words).padStart(3)} words  min contrast ${minC.toFixed(2)}  ${flag}`);
  }
  await context.close();

  await finishJPEGs(results.map((x) => [x.png, x.jpg]), fmt);

  if (!only) {
    await contactSheet(browser, {
      title: spec.title,
      subtitle: `${style.name} (${style.slug}) · ${fmt.label} · ${client.meta.name} (${clientId}) · variant ${variant} · group ${group}`,
      items: results.map((x) => ({ src: x.jpg, label: `${x.n} · ${x.type}` })),
      out: path.join(outDir, 'contact.jpg'),
      thumb: fmt.name === 'story' ? 240 : 300,
    });
  }
  if (own) await browser.close();

  const manifest = {
    engine: 'library',
    spec: path.relative(root, path.resolve(specPath)),
    id: spec.id, title: spec.title, renderedAt: new Date().toISOString(),
    group, style: style.slug, styleName: style.name, format: fmt.name, size: [fmt.w, fmt.h], client: clientId, clientName: client.meta.name, variant,
    tokens: { style: path.relative(root, style.file), client: path.relative(root, client.file) },
    contrast: tokens.contrastReport,
    compliance: { missing: missing.map((m) => m.key), placeholder: missing.length > 0, province: client.compliance?.province || client.meta.province },
    reviewBy: spec.reviewBy || null,
    sources: spec.sources || [],
    slides: results.map((x) => ({
      n: x.n, type: x.type, jpg: path.relative(root, x.jpg), png: path.relative(root, x.png), words: x.qa.words,
      minContrast: Math.min(...x.qa.runs.map((r) => r.contrast ?? 99)),
      minBodyPx: Math.min(...x.qa.runs.filter((r) => r.role === 'body' || r.role === 'display').map((r) => r.size)),
      minLabelPx: Math.min(...x.qa.runs.filter((r) => r.role === 'label').map((r) => r.size)),
      minFinePx: Math.min(...x.qa.runs.filter((r) => r.role === 'fine').map((r) => r.size)),
      issues: x.qa.issues,
      runs: x.qa.runs.map((r) => ({ text: r.text, role: r.role, size: r.size, family: r.family, weight: r.weight, contrast: r.contrast, need: r.need, chars: r.chars })),
      text: x.qa.text,
      audit: x.audit,
    })),
  };
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
