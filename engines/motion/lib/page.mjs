// Builds the single HTML document a render runs in: local @font-face (engines/stills/fonts),
// token CSS variables, runtime + family CSS, template CSS, GSAP, the runtime, the
// template timeline, and window.MOTION (the resolved model).
import fs from 'node:fs';
import path from 'node:path';
import { fontFaceCSS } from './statics.mjs';
import { STATICS, RUNTIME, NODE_MODULES } from './paths.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function grainSVG(seed, freq = 0.85) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='540' height='540'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' seed='${seed}' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 1'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
  return `url("data:image/svg+xml;utf8,${svg.replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}

// One-line compliance (O. Reg. 188/08 s.6: brokerage authorized name + licence number).
// Empty fields render as visible placeholders with a red tag; --strict refuses to export.
export function complianceLine(c = {}) {
  // A bracketed value ("[BROKERAGE NAME]", "[LICENCE #]") is a placeholder: printed as-is, tagged, refused by --strict.
  const isPh = (v) => /^\s*\[.*\]\s*$/.test(String(v ?? ''));
  const has = (k) => String(c[k] ?? '').trim() && !isPh(c[k]);
  const brk = has('brokerage') ? esc(c.brokerage) : isPh(c.brokerage) ? esc(c.brokerage.trim()) : 'Brokerage name';
  const lic = has('licence') ? `Lic. #${esc(c.licence)}` : isPh(c.licence) ? `Lic. ${esc(c.licence.trim())}` : 'Lic. #——';
  const agent = has('agentName') ? `${esc(c.agentName)}${has('title') ? `, ${esc(c.title)}` : ''} · ` : '';
  const ph = !(has('brokerage') && has('licence'));
  return `<span>${agent}${brk} · ${lic}</span>${ph ? '<span class="ph-tag">placeholder</span>' : ''}`;
}

export function buildPage({ tplDir, tokens, model, width, height, guides = false, alpha = false }) {
  const read = (f) => fs.readFileSync(f, 'utf8');
  const vars = Object.entries(tokens.vars).map(([k, v]) => `${k}:${v};`).join('');
  const fv = Object.entries(tokens.fontVariation).map(([k, v]) => `--fv-${k}:${v};`).join('');
  const s = model.safe;
  const grain = Math.min(0.06, (tokens.texture.grain ?? 0.06) * 0.6); // motion: half-strength, static grain
  const json = JSON.stringify(model).replace(/</g, '\\u003c');
  const tplCss = fs.existsSync(path.join(tplDir, 'style.css')) ? read(path.join(tplDir, 'style.css')) : '';
  const extra = (model.scripts || []).map((p) => `<script>${read(p)}</script>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(model.id)} · ${esc(model.template)}</title>
<style>
${fontFaceCSS(STATICS)}
:root{${vars}${fv}--W:${width}px;--H:${height}px;--sx0:${s.x0}px;--sx1:${s.x1}px;--sy0:${s.y0}px;--sy1:${s.y1}px;--grain:${grain};--grain-img:${grainSVG((tokens.client.seed % 89) + 3, tokens.texture.grainFreq ?? 0.85)};}
${read(path.join(RUNTIME, 'base.css'))}
${tplCss}
${alpha ? 'html,body,#stage{background:transparent!important}.paper,.grain,.deco{display:none!important}' : ''}
</style></head>
<body>
<div id="stage" class="fam-${tokens.family} v-${tokens.client.layoutVariant} tpl-${esc(model.template)}" data-client="${esc(tokens.client.id)}">
  <div class="paper" aria-hidden="true"></div>
  <div class="deco" aria-hidden="true"></div>
  <div class="layer" id="layer"></div>
  <div class="grain" aria-hidden="true"></div>
  ${guides ? '<div class="guide" data-qa-skip></div>' : ''}
</div>
<script>window.MOTION=${json};</script>
<script>${read(path.join(NODE_MODULES, 'gsap', 'dist', 'gsap.min.js'))}</script>
<script>${read(path.join(NODE_MODULES, 'gsap', 'dist', 'CustomEase.min.js'))}</script>
${extra}
<script>${read(path.join(RUNTIME, 'runtime.js'))}</script>
<script>${read(path.join(tplDir, 'timeline.js'))}</script>
</body></html>`;
}
