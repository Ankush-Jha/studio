/* qa.js: in-page audit run after layout. Returns a plain object; render.mjs saves it.
 * Checks: minimum text sizes by role, WCAG contrast of every text run against its
 * actual background, words per slide, and text escaping the safe area.
 * Roles (data-role on an element or ancestor): fine (legal/folio), label, body (default), display.
 */
(function () {
  'use strict';
  const MIN = { fine: 18, label: 20, body: 28, display: 28 };

  function parse(c) {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });

  function bgOf(el) {
    const stack = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) bg = over(stack[i], bg);
    return bg;
  }
  function roleOf(el) {
    const r = el.closest('[data-role]');
    return r ? r.dataset.role : 'body';
  }

  window.QA_RUN = function () {
    const slide = document.querySelector('.slide');
    const S = slide.getBoundingClientRect();
    const safe = { x0: 60, y0: 48, x1: 1020, y1: 1302 };
    const issues = [];
    const runs = [];
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    let words = 0;
    while (walker.nextNode()) {
      const t = walker.currentNode;
      const text = t.textContent.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const el = t.parentElement;
      if (el.closest('[aria-hidden="true"]') && !el.closest('[data-qa]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      const role = roleOf(el);
      const size = parseFloat(cs.fontSize);
      const fg = parse(cs.color);
      const bg = bgOf(el);
      const cr = fg ? ratio(over(fg, bg), bg) : 0;
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      // WCAG "large text": 18pt (24px) regular or 14pt (18.66px) bold.
      const large = size >= 24 || (bold && size >= 18.66);
      const need = large ? 3 : 4.5;
      const range = document.createRange();
      range.selectNodeContents(t);
      const rects = Array.from(range.getClientRects());
      const box = rects.length ? rects.reduce((a, r) => ({ x0: Math.min(a.x0, r.left), y0: Math.min(a.y0, r.top), x1: Math.max(a.x1, r.right), y1: Math.max(a.y1, r.bottom) }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }) : null;
      if (role !== 'fine' && !el.closest('[data-noword]')) words += text.split(' ').filter((w) => /[\p{L}\p{N}$%]/u.test(w)).length;
      runs.push({ text: text.slice(0, 60), role, size: +size.toFixed(1), contrast: +cr.toFixed(2) });
      if (size < (MIN[role] ?? 28)) issues.push({ kind: 'small-text', role, size, text: text.slice(0, 50) });
      if (cr < need) issues.push({ kind: 'contrast', ratio: +cr.toFixed(2), need, text: text.slice(0, 50) });
      if (box && !el.closest('[data-bleed]')) {
        const b = { x0: box.x0 - S.left, y0: box.y0 - S.top, x1: box.x1 - S.left, y1: box.y1 - S.top };
        if (b.x0 < safe.x0 - 1 || b.x1 > safe.x1 + 1 || b.y0 < safe.y0 - 1 || b.y1 > safe.y1 + 1) issues.push({ kind: 'outside-safe-area', box: b, text: text.slice(0, 40) });
      }
    }
    // Overlap check between text blocks flagged as exclusive.
    const blocks = Array.from(slide.querySelectorAll('[data-block]')).map((el) => ({ el, r: el.getBoundingClientRect() }));
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      if (blocks[i].el.contains(blocks[j].el) || blocks[j].el.contains(blocks[i].el)) continue;
      const a = blocks[i].r, b = blocks[j].r;
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) issues.push({ kind: 'overlap', a: blocks[i].el.dataset.block, b: blocks[j].el.dataset.block });
    }
    // Overflowing containers.
    slide.querySelectorAll('[data-fit]').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) issues.push({ kind: 'overflow', block: el.dataset.fit });
    });
    return { words, issues, runs };
  };
})();
