// Paper Cut-out, in-page step: cut paper to the set type.
// After fitting, every display line in .ct-strips gets its own torn card strip, every
// ==emphasis== fragment its own accent patch, and every [data-paper] block (sheets, slips,
// bars, tags) a torn sheet behind it. Paper is drawn into svg.ct-layer (under the text, over
// the board art) with the torn-edge filters defined in the background SVG.

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const NS = 'http://www.w3.org/2000/svg';

function lineBoxes(el, S) {
  const r = document.createRange();
  r.selectNodeContents(el);
  const fs = parseFloat(getComputedStyle(el).fontSize);
  const lines = [];
  for (const q of r.getClientRects()) {
    if (q.width < 1) continue;
    const mid = q.top + q.height / 2;
    let ln = lines.find((l) => Math.abs(l.mid - mid) < fs * 0.45);
    if (!ln) { ln = { mid, x0: q.left, x1: q.right, y0: q.top, y1: q.bottom }; lines.push(ln); }
    ln.x0 = Math.min(ln.x0, q.left); ln.x1 = Math.max(ln.x1, q.right);
    ln.y0 = Math.min(ln.y0, q.top); ln.y1 = Math.max(ln.y1, q.bottom);
  }
  return { fs, lines: lines.sort((a, b) => a.mid - b.mid).map((l) => ({ x0: l.x0 - S.left, x1: l.x1 - S.left, y0: l.y0 - S.top, y1: l.y1 - S.top })) };
}

function rect(layer, { x, y, w, h, fill, deg = 0, filter = 'ct-strip' }) {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('filter', `url(#${filter})`);
  const rc = document.createElementNS(NS, 'rect');
  rc.setAttribute('x', x.toFixed(1)); rc.setAttribute('y', y.toFixed(1));
  rc.setAttribute('width', w.toFixed(1)); rc.setAttribute('height', h.toFixed(1));
  rc.setAttribute('fill', fill);
  if (deg) rc.setAttribute('transform', `rotate(${deg.toFixed(2)} ${(x + w / 2).toFixed(1)} ${(y + h / 2).toFixed(1)})`);
  g.appendChild(rc);
  layer.appendChild(g);
}

window.STYLE_RUN = async (data) => {
  await document.fonts.ready;
  if (window.FIT_RUN) window.FIT_RUN();
  const slide = document.querySelector('.slide');
  const S = slide.getBoundingClientRect();
  const css = getComputedStyle(slide);
  const col = (n) => css.getPropertyValue(`--color-${n}`).trim();
  const layer = document.querySelector('svg.ct-layer');
  const r = rng((data.seed || 7) * 7919);

  // Torn sheets behind blocks (drawn first: strips and patches sit on top of them).
  document.querySelectorAll('[data-paper]').forEach((el, i) => {
    const b = el.getBoundingClientRect();
    const pv = el.dataset.paperPad || '0';
    const pad = pv.endsWith('em') ? parseFloat(pv) * parseFloat(getComputedStyle(el).fontSize) : +pv;
    const fill = col(el.dataset.paper) || el.dataset.paper;
    const deg = el.dataset.paperRot !== undefined ? +el.dataset.paperRot : (r() - 0.5) * 1.6;
    rect(layer, { x: b.left - S.left - pad, y: b.top - S.top - pad, w: b.width + pad * 2, h: b.height + pad * 2, fill, deg, filter: i % 2 ? 'ct-torn-b' : 'ct-torn-a' });
  });

  // One torn strip per set line of display copy.
  document.querySelectorAll('.ct-strips').forEach((el) => {
    const { fs, lines } = lineBoxes(el, S);
    const fill = col(el.dataset.strip || 'card');
    lines.forEach((ln, k) => {
      const padX = fs * 0.26;
      const top = ln.y0 + fs * 0.13, bot = ln.y1 - fs * 0.07;
      const jx = (r() - 0.5) * fs * 0.12;
      rect(layer, { x: ln.x0 - padX + jx, y: top, w: ln.x1 - ln.x0 + padX * 2 + (r() - 0.3) * fs * 0.2, h: bot - top, fill, deg: (r() - 0.5) * 1.1 });
    });
    // Accent patch under each emphasised fragment (covers the full text box, so the
    // on-accent ink always has its own ground).
    el.querySelectorAll('[data-mark="patch"]').forEach((m) => {
      const pb = lineBoxes(m, S);
      pb.lines.forEach((ln) => {
        const padX = pb.fs * 0.12;
        rect(layer, { x: ln.x0 - padX, y: ln.y0 + pb.fs * 0.02, w: ln.x1 - ln.x0 + padX * 2, h: ln.y1 - ln.y0 - pb.fs * 0.02, fill: col('accent'), deg: (r() - 0.5) * 1.4, filter: 'ct-torn-a' });
      });
    });
  });
};
