/* fit.js: size type to its box after fonts load, before marks and QA.
 *
 *   data-fit="box"    shrink font-size (from the CSS size) until the element's content fits
 *                     inside its own box (it needs a definite height or max-height),
 *                     never below data-fit-min (px, default 60% of the start size).
 *   data-fit="width"  set font-size so the text fills its container's width on ONE line,
 *                     capped by data-fit-max (px). For poster type that runs edge to edge.
 *   data-max-lines="N" with either mode: also shrink until the text sets in N lines or fewer.
 *
 * Failures (text still doesn't fit at the minimum) go to window.FIT_ISSUES, which qa-lib.js
 * reports as "fit-failed". Sizes are rounded to whole px so renders are repeatable.
 */
(function () {
  'use strict';
  // Number of set lines: distinct line boxes of the element's text (not its box height).
  function lines(el) {
    const r = document.createRange();
    r.selectNodeContents(el);
    const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
    const tops = [];
    for (const rc of r.getClientRects()) {
      if (rc.width < 1) continue;
      const mid = rc.top + rc.height / 2;
      if (!tops.some((t) => Math.abs(t - mid) < fs * 0.4)) tops.push(mid);
    }
    return tops.length;
  }
  // Tolerance of 0.3em: glyphs of tight-leaded display type poke out of their line boxes,
  // which is not overflow.
  function overflows(el) {
    const tol = (parseFloat(getComputedStyle(el).fontSize) || 16) * 0.3;
    return el.scrollHeight > el.clientHeight + tol || el.scrollWidth > el.clientWidth + 2;
  }
  window.FIT_RUN = function () {
    const issues = [];
    document.querySelectorAll('[data-fit="width"]').forEach((el) => {
      const box = el.parentElement.getBoundingClientRect().width;
      const max = +el.dataset.fitMax || 1000;
      el.style.whiteSpace = 'nowrap';
      el.style.display = 'inline-block';
      el.style.fontSize = '100px';
      const w = el.getBoundingClientRect().width;
      let size = Math.min(max, Math.floor((100 * box) / w));
      el.style.fontSize = size + 'px';
      while (el.getBoundingClientRect().width > box + 0.5 && size > 8) { size -= 1; el.style.fontSize = size + 'px'; }
      el.dataset.fitSize = size;
    });
    document.querySelectorAll('[data-fit="box"]').forEach((el) => {
      const start = parseFloat(getComputedStyle(el).fontSize);
      const min = +el.dataset.fitMin || Math.round(start * 0.6);
      const maxLines = +el.dataset.maxLines || 0;
      let size = Math.round(start);
      const bad = () => overflows(el) || (maxLines && lines(el) > maxLines);
      while (bad() && size > min) { size -= 2; el.style.fontSize = size + 'px'; }
      el.dataset.fitSize = size;
      if (bad()) issues.push({ kind: 'fit-failed', text: el.textContent.trim().slice(0, 50), size, min });
    });
    window.FIT_ISSUES = issues;
    return issues;
  };
})();
