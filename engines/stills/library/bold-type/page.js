// Poster Type, in-page step: set every display stack edge to edge.
// A stack is a list of words with forced breaks (from `|` and from ==emphasis== segments).
// For each candidate line count we pick the breaks that make the smallest line as big as
// possible (DP over word positions), measure the real widths in the DOM at 100px, and keep
// the line count with the biggest type that still fits the stack's box. Each line is then
// handed to fit.js (data-fit="width") capped at the planned size, so a re-run is idempotent.
// Lines carry data-k (their order) so a motion version can bring them in one by one.

const LH = 0.86;   // line box as a fraction of the font size (caps only)
const GAP = 0.035; // extra space between lines, fraction of the font size
const EM_PAD = 0.36; // band padding .17em each side (covers the font's full content box) + neighbours' clearance // extra space above and below a banded (emphasis) line

function measureFactory(stack) {
  const probe = document.createElement('span');
  probe.className = 'bt-lt bt-probe';
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;font-size:100px;white-space:nowrap;visibility:hidden;';
  stack.appendChild(probe);
  const cache = new Map();
  const fn = (s) => {
    if (cache.has(s)) return cache.get(s);
    probe.textContent = s;
    const w = probe.getBoundingClientRect().width;
    cache.set(s, w);
    return w;
  };
  fn.done = () => probe.remove();
  return fn;
}

function plan(stack, spec) {
  const W = stack.clientWidth;
  const H = stack.clientHeight;
  const cap = +spec.cap || 400;
  const words = [];
  const endsSeg = [];
  spec.segs.forEach((seg) => {
    seg.w.forEach((w, k) => { words.push({ t: w, em: !!seg.em }); endsSeg.push(k === seg.w.length - 1); });
  });
  const n = words.length;
  if (!n) return [];
  const measure = measureFactory(stack);
  const text = (i, j) => words.slice(i, j + 1).map((w) => w.t).join(' ');
  const segStart = (i) => i === 0 || endsSeg[i - 1];
  const allowed = (i, j) => {
    for (let p = i; p < j; p++) if (endsSeg[p]) return false;
    const chars = text(i, j).replace(/\s/g, '').length;
    // A very short line (a lone "YOU") only when it is a whole segment, e.g. an emphasis.
    if (chars < 5 && !(segStart(i) && endsSeg[j])) return false;
    return true;
  };
  const size = (i, j) => Math.min(cap, (100 * W) / measure(text(i, j)));
  const desc = (i, j) => /[$,;Q]/.test(text(i, j));
  const lineH = (i, j) => size(i, j) * (LH + GAP + (words[i].em ? EM_PAD * 2 : desc(i, j) ? 0.11 : 0));
  const limit = H * 0.985;
  const results = [];
  const punct = (j) => endsSeg[j] || /[.,;:?!]$/.test(words[j].t);
  // Don't end a line on an article, preposition or conjunction ("…DOWN TO / BUY…").
  const weak = (j) => !endsSeg[j] && /^(a|an|the|to|of|in|on|at|by|for|and|or|but|with|your|my|is|be)$/i.test(words[j].t);
  // Exhaustive search over break positions (fine up to ~22 words): fill the box, keep line
  // sizes within ~1.9x of each other, prefer breaks at punctuation, then fewer lines.
  if (n <= 22) {
    let bestScore = -Infinity, best = null;
    const cur = [];
    const rec = (start, h) => {
      if (start === n) {
        const k = Math.min(1, limit / h);           // a set that is too tall is scaled down evenly...
        const sizes = cur.map(([i, j]) => size(i, j));
        const mn = Math.min(...sizes) * k, mx = Math.max(...sizes) * k;
        if (mn < (spec.minSize || 40)) return;
        const score = Math.min(h, limit) / H
          - 1.6 * (1 - k)                            // ...but loses its edge-to-edge measure, so it pays
          - 0.6 * Math.max(0, mx / mn - 1.8)
          + 0.07 * cur.filter(([, j]) => punct(j)).length / cur.length
          - 0.06 * cur.filter(([, j]) => weak(j)).length
          - 0.012 * cur.length;
        if (score > bestScore) { bestScore = score; best = { k, lines: cur.map(([i, j]) => ({ i, j })) }; }
        return;
      }
      if (cur.length >= (spec.maxLines || 7)) return;
      for (let j = start; j < n; j++) {
        if (allowed(start, j)) {
          const hh = h + lineH(start, j);
          if (hh <= limit / 0.72) { cur.push([start, j]); rec(j + 1, hh); cur.pop(); }
        }
        if (endsSeg[j]) break;
      }
    };
    rec(0, 0);
    if (best) {
      measure.done();
      return best.lines.map(({ i, j }) => ({ text: text(i, j), em: words[i].em, size: Math.floor(size(i, j) * best.k) }));
    }
  }
  const segCount = endsSeg.filter(Boolean).length;
  for (let L = segCount; L <= Math.min(n, spec.maxLines || 7); L++) {
    const best = Array.from({ length: L + 1 }, () => new Array(n + 1).fill(-1));
    const back = Array.from({ length: L + 1 }, () => new Array(n + 1).fill(-1));
    best[0][0] = Infinity;
    for (let l = 1; l <= L; l++) for (let k = 1; k <= n; k++) for (let i = l - 1; i < k; i++) {
      if (best[l - 1][i] < 0 || !allowed(i, k - 1)) continue;
      const v = Math.min(best[l - 1][i], size(i, k - 1));
      if (v > best[l][k]) { best[l][k] = v; back[l][k] = i; }
    }
    if (best[L][n] < 0) continue;
    const lines = [];
    for (let l = L, k = n; l > 0; l--) { const i = back[l][k]; lines.unshift({ i, j: k - 1 }); k = i; }
    const sized = lines.map(({ i, j }) => ({ text: text(i, j), em: words[i].em, size: Math.floor(size(i, j)) }));
    const height = lines.reduce((s, { i, j }) => s + lineH(i, j), 0);
    results.push({ L, min: best[L][n], height, lines: sized });
  }
  measure.done();
  const fits = results.filter((r) => r.height <= limit);
  let pick;
  if (fits.length) pick = fits.reduce((a, b) => (b.min > a.min + 0.5 ? b : a));
  else {
    pick = results.reduce((a, b) => (b.height < a.height ? b : a));
    const k = (H * 0.985) / pick.height;
    pick.lines.forEach((x) => { x.size = Math.floor(x.size * k); });
  }
  return pick.lines;
}

function build(stack, lines) {
  stack.innerHTML = '';
  lines.forEach((ln, k) => {
    const row = document.createElement('div');
    row.className = 'bt-line' + (ln.em ? ' is-em' : '') + (/[$,;Q]/.test(ln.text) ? ' has-desc' : '');
    row.style.fontSize = `${ln.size}px`;
    row.dataset.k = String(k + (+stack.dataset.k0 || 0));
    const span = document.createElement('span');
    span.className = 'bt-lt';
    span.dataset.fit = 'width';
    span.dataset.fitMax = String(ln.size);
    span.textContent = ln.text;
    row.appendChild(span);
    stack.appendChild(row);
  });
}

window.STYLE_RUN = async (data) => {
  await document.fonts.ready;
  // Size everything else first (figures, callouts), so each stack plans against its final box.
  if (window.FIT_RUN) window.FIT_RUN();
  const stacks = data.stacks || {};
  for (const el of document.querySelectorAll('[data-stack]')) {
    const spec = stacks[el.dataset.stack];
    if (!spec) continue;
    let lines = plan(el, spec);
    build(el, lines);
    if (window.FIT_RUN) window.FIT_RUN();
    // Verify against the real layout; shrink proportionally if the planned set overflows.
    const usedOf = () => [...el.children].reduce((sum, c) => { const cs = getComputedStyle(c); return sum + c.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom); }, 0);
    for (let pass = 0; pass < 4; pass++) {
      const used = usedOf(), box = el.clientHeight;
      if (used <= box + 1) break;
      const k = (box / used) * 0.995;
      lines = lines.map((x) => ({ ...x, size: Math.floor(x.size * k) }));
      build(el, lines);
      if (window.FIT_RUN) window.FIT_RUN();
    }
    // Still too tall: hand it to QA as a fit box so the overflow is reported, not hidden.
    if (usedOf() > el.clientHeight + 2) { el.dataset.fit = 'box'; el.dataset.fitMin = '1'; }
  }
  // data-fill: grow a text block to use the height its wrapper gives it (binary search).
  for (const el of document.querySelectorAll('[data-fill]')) {
    const wrap = el.parentElement;
    const lo0 = +el.dataset.fillMin || 40, hi0 = +el.dataset.fillMax || 120, maxL = +el.dataset.maxLines || 6;
    const fits = (px) => {
      el.style.fontSize = `${px}px`;
      const r = document.createRange(); r.selectNodeContents(el);
      const tops = new Set([...r.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round((q.top + q.height / 2) / (px * 0.5))));
      return el.offsetHeight <= wrap.clientHeight && tops.size <= maxL;
    };
    let lo = lo0, hi = hi0;
    if (!fits(lo)) { el.dataset.fillFailed = '1'; continue; }
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (fits(mid)) lo = mid; else hi = mid; }
    el.style.fontSize = `${lo}px`;
  }
  // Split panels (compare): the background panel follows the measured foreground block.
  const slide = document.querySelector('.slide');
  const S = slide.getBoundingClientRect();
  const src = document.querySelector('[data-split]');
  if (src) {
    const r = src.getBoundingClientRect();
    slide.style.setProperty('--split-x0', `${r.left - S.left}px`);
    slide.style.setProperty('--split-y0', `${r.top - S.top}px`);
    slide.style.setProperty('--split-y1', `${r.bottom - S.top}px`);
  }
};
