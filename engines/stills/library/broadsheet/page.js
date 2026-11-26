// Front Page: wood-type headlines. A newspaper sets its splash headline as big as the page
// allows, so [data-grow] elements take the largest whole-pixel size (between data-grow-min and
// data-grow-max) at which they still fit their own flex box, within data-max-lines lines and
// without breaking a word. Runs before fit.js, so fit.js only ever confirms the result.
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

window.STYLE_RUN = async () => {
  document.querySelectorAll('[data-grow]').forEach((el) => {
    const min = +el.dataset.growMin || 48;
    const max = +el.dataset.growMax || 140;
    const maxLines = +el.dataset.maxLines || 99;
    const fits = (px) => {
      el.style.fontSize = `${px}px`;
      const tol = px * 0.3;
      return el.scrollHeight <= el.clientHeight + tol && el.scrollWidth <= el.clientWidth + 2 && lines(el) <= maxLines;
    };
    let lo = min, hi = max, best = min;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (fits(mid)) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    el.style.fontSize = `${best}px`;
    el.dataset.growSize = best;
  });
};
