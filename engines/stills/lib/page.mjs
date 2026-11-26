// Wraps a slide template in a full HTML document: local @font-face, token CSS
// variables, base + family stylesheets, masthead, compliance footer, grain, and the
// two SVG layers that hand.js draws into.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { esc } from './markup.mjs';
import { complianceHTML } from './compliance.mjs';

const FONTS = [
  ['Archivo', 'Archivo[wdth,wght].ttf', 'normal', '100 900', '62% 125%'],
  ['Archivo', 'Archivo-Italic[wdth,wght].ttf', 'italic', '100 900', '62% 125%'],
  ['Fraunces', 'Fraunces[SOFT,WONK,opsz,wght].ttf', 'normal', '100 900', null],
  ['Fraunces', 'Fraunces-Italic[SOFT,WONK,opsz,wght].ttf', 'italic', '100 900', null],
  ['Instrument Sans', 'InstrumentSans[wdth,wght].ttf', 'normal', '400 700', '75% 100%'],
  ['Instrument Sans', 'InstrumentSans-Italic[wdth,wght].ttf', 'italic', '400 700', '75% 100%'],
  ['Bricolage Grotesque', 'BricolageGrotesque[opsz,wdth,wght].ttf', 'normal', '200 800', '75% 100%'],
  ['Newsreader', 'Newsreader[opsz,wght].ttf', 'normal', '200 800', null],
  ['Newsreader', 'Newsreader-Italic[opsz,wght].ttf', 'italic', '200 800', null],
  ['IBM Plex Sans', 'IBMPlexSans[wdth,wght].ttf', 'normal', '100 700', '85% 100%'],
  ['IBM Plex Mono', 'IBMPlexMono-Regular.ttf', 'normal', '400', null],
  ['IBM Plex Mono', 'IBMPlexMono-Medium.ttf', 'normal', '500', null],
  ['IBM Plex Mono', 'IBMPlexMono-SemiBold.ttf', 'normal', '600', null],
];

export function fontFaceCSS(root) {
  const dir = path.join(root, 'fonts');
  return FONTS.filter(([, file]) => fs.existsSync(path.join(dir, file)))
    .map(([family, file, style, weight, stretch]) => `@font-face{font-family:"${family}";src:url("${pathToFileURL(path.join(dir, file)).href}") format("truetype");font-style:${style};font-weight:${weight};${stretch ? `font-stretch:${stretch};` : ''}font-display:block;}`)
    .join('\n');
}

export const FONT_FAMILIES = [...new Set(FONTS.map((f) => f[0]))];

function grainSVG(seed, freq = 0.85) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='540' height='540'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' seed='${seed}' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 1'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
  return `url("data:image/svg+xml;utf8,${svg.replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}

export function buildPage({ root, tokens, spec, slide, index, total, part }) {
  const tk = tokens;
  const css = (name) => fs.readFileSync(path.join(root, 'styles', name), 'utf8');
  const vars = Object.entries(tk.vars).map(([k, v]) => `${k}:${v};`).join('');
  const fv = Object.entries(tk.fontVariation).map(([k, v]) => `--fv-${k}:${v};`).join('');
  const series = slide.series ?? spec.series ?? '';
  const isSingle = total === 1;
  const folio = isSingle ? '' : `<span class="folio">${String(index + 1).padStart(2, '0')}<i>/</i>${String(total).padStart(2, '0')}</span>`;
  const comp = part.footer === 'none' ? '' : complianceHTML(tk.client.compliance, { size: part.footer === 'block' ? 'block' : 'line' });
  const cueDraws = part.cue
    ? [{ shape: 'arrow', from: { sel: '.cue', at: 'right', dx: 14, dy: 2 }, to: { sel: '.cue', at: 'right', dx: tk.family === 'riso' ? 150 : 120, dy: tk.family === 'kitchen' ? -10 : 0 }, bend: tk.family === 'kitchen' ? 0.22 : 0.06, ...(tk.family === 'riso' ? { pen: 'marker', weight: 7, color: 'ink' } : {}) }]
    : [];
  const draws = [...cueDraws, ...(part.draws || [])];
  const hand = {
    seed: `${tk.client.seed}:${spec.id}:${index}`,
    pen: tk.annotation.pen,
    color: tk.annotation.color || 'mark-ink',
    emphasis: tk.annotation.emphasis,
    strike: tk.annotation.strike,
    weight: tk.annotation.weight,
    wobble: tk.annotation.wobble,
    highlightCover: tk.annotation.highlightCover,
    underlineDouble: !!tk.annotation.underlineDouble,
  };
  const grainSeed = (String(tk.client.seed).length * 7 + index * 13) % 97;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(spec.id)} ${index + 1}/${total}</title>
<style>
${fontFaceCSS(root)}
:root{${vars}${fv}--grain:${tk.texture.grain ?? 0.08};--grain-img:${grainSVG(grainSeed, tk.texture.grainFreq ?? 0.85)};}
${css('base.css')}
${css(`family-${tk.family}.css`)}
</style></head>
<body>
<div class="slide fam-${tk.family} t-${slide.type} v-${tk.client.layoutVariant}${isSingle ? ' is-single' : ''}${index === 0 ? ' is-first' : ''}${index === total - 1 ? ' is-last' : ''}" data-client="${esc(tk.client.id)}">
  <div class="paper" aria-hidden="true"></div>
  <svg class="marks under" viewBox="0 0 1080 1350" width="1080" height="1350" aria-hidden="true"></svg>
  <div class="frame">
    <header class="mast" data-role="label" data-noword>
      <span class="logo" data-qa><span>${esc(tk.client.initials || '')}</span></span>
      <span class="series">${esc(series)}</span>
      ${folio}
    </header>
    <main class="main">${part.main}</main>
    <footer class="foot">
      ${part.footNote ? `<p class="foot-note" data-role="fine">${part.footNote}</p>` : ''}
      ${comp}
      ${part.cue ? `<span class="cue" data-role="label">${esc(slide.cue || 'Swipe')}</span>` : ''}
    </footer>
  </div>
  ${isSingle ? '' : `<div class="edge-tab" aria-hidden="true" data-bleed style="--i:${index};--n:${total}"><span>${String(index + 1).padStart(2, '0')}</span></div>`}
  <svg class="marks over" viewBox="0 0 1080 1350" width="1080" height="1350" aria-hidden="true"></svg>
  <div class="grain" aria-hidden="true"></div>
</div>
<script id="draws" type="application/json">${JSON.stringify(draws)}</script>
<script>window.HAND=${JSON.stringify(hand)};</script>
<script>${fs.readFileSync(path.join(root, 'assets', 'hand.js'), 'utf8')}</script>
<script>${fs.readFileSync(path.join(root, 'assets', 'qa.js'), 'utf8')}</script>
</body></html>`;
}
