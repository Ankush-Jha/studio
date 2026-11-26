// Page shell for the style library. A style module returns { bg, html, draws, data };
// this wraps it in a full document: the style's own @font-face set, format + palette CSS
// variables, library/base.css + the style's style.css, the two hand-mark SVG layers, and the
// in-page scripts (fit.js, hand.js, qa-lib.js, and the style's optional page.js module).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { esc } from './markup.mjs';
import { formatVars } from './formats.mjs';

export function fontFaces(root, fonts = []) {
  const dir = path.join(root, 'fonts');
  return fonts.map((f) => {
    const file = path.join(dir, f.file);
    if (!fs.existsSync(file)) throw new Error(`Font file missing: fonts/${f.file} (family ${f.family})`);
    return `@font-face{font-family:"${f.family}";src:url("${pathToFileURL(file).href}") format("truetype");font-style:${f.style || 'normal'};font-weight:${f.weight || '400'};${f.stretch ? `font-stretch:${f.stretch};` : ''}font-display:block;}`;
  }).join('\n');
}

// Procedural grain as an SVG data URI (feTurbulence), so no texture file is ever needed.
export function grainURI(seed = 3, freq = 0.85, size = 540) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' seed='${seed}' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
  return `url("data:image/svg+xml;utf8,${svg.replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}

export function buildLibPage({ root, style, tokens, fmt, slide, index, total, part, hand, qaConf, lang = 'en', clientId, variant, extraCSS = '' }) {
  const css = [path.join(root, 'library', 'base.css'), path.join(style.dir, 'style.css')]
    .filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n') + (extraCSS ? `\n/* job css */\n${extraCSS}` : '');
  const vars = { ...formatVars(fmt), ...(fmt.reserve ? { '--reserve': `${fmt.reserve}px` } : {}), ...tokens.vars, '--grain-img': grainURI(hand.grainSeed || 3, style.grainFreq || 0.85) };
  const varCSS = Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('');
  const pageJS = path.join(style.dir, 'page.js');
  const vendor = pathToFileURL(path.join(root, 'vendor')).href;
  const classes = [
    'slide', `st-${style.slug}`, `fmt-${fmt.name}`, `t-${slide.type}`, `v-${variant}`,
    fmt.reserve ? 'has-reserve' : '', total === 1 ? 'is-single' : '', index === 0 ? 'is-first' : '', index === total - 1 ? 'is-last' : '',
    part.classes || '',
  ].filter(Boolean).join(' ');
  const W = fmt.w, H = fmt.h;
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(style.slug)} ${index + 1}/${total}</title>
<style>
${fontFaces(root, style.fonts)}
:root{${varCSS}}
${css}
</style></head>
<body>
<div class="${classes}" data-client="${esc(clientId)}" data-style="${esc(style.slug)}" data-format="${fmt.name}" data-type="${esc(slide.type)}">
  <div class="bg" aria-hidden="true">${part.bg || ''}</div>
  <svg class="marks under" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"></svg>
  <div class="fg">${part.html}</div>
  <svg class="marks over" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"></svg>
</div>
<script id="draws" type="application/json">${JSON.stringify(part.draws || [])}</script>
<script id="style-data" type="application/json">${JSON.stringify(part.data || {}).replace(/</g, '\\u003c')}</script>
<script>window.HAND=${JSON.stringify(hand)};window.QA_CONF=${JSON.stringify(qaConf)};window.VENDOR=${JSON.stringify(vendor)};</script>
<script>${fs.readFileSync(path.join(root, 'assets', 'fit.js'), 'utf8')}</script>
<script>${fs.readFileSync(path.join(root, 'assets', 'hand.js'), 'utf8')}</script>
<script>${fs.readFileSync(path.join(root, 'assets', 'qa-lib.js'), 'utf8')}</script>
${fs.existsSync(pageJS) ? `<script type="module" src="${pathToFileURL(pageJS).href}"></script>` : ''}
</body></html>`;
}
