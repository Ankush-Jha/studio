// Riso print engine (runs in the page). Reads every invisible `.rz-shape` box and every
// `[data-mark="riso"]` / `[data-rz-strike]` span, paints them into two plate density fields,
// then "prints": halftone on a rotated screen per plate, seeded misregistration of plate B,
// blotchy ink density, feed streaks, grain at the dot threshold, pinholes in solids, and
// subtractive (multiply) ink over warm paper with faint fibre. Deterministic per seed.
// Copy is never drawn here: type stays live DOM, multiplied over this canvas.

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rgb = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };

// Integer hash -> [0,1) for per-pixel grain.
function h2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Value-noise grid, bilinear: low-frequency blots.
function noiseGrid(W, H, cell, rng) {
  const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return (x, y) => {
    const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

window.STYLE_RUN = async (data) => {
  // Size type first (fit.js), so the art lines up with the final layout; the renderer's own
  // FIT_RUN afterwards finds nothing left to change.
  if (window.FIT_RUN) window.FIT_RUN();
  document.querySelectorAll('.rz-dbl').forEach((d) => {
    const f = d.querySelector('.rz-fig'), e = d.querySelector('.rz-echo');
    if (f && e) { e.style.fontSize = getComputedStyle(f).fontSize; }
  });

  const slide = document.querySelector('.slide');
  const S = slide.getBoundingClientRect();
  const K = 2;
  const W = Math.round(S.width * K), H = Math.round(S.height * K);
  const rng = mulberry32(hashStr(String(data.seed || 'riso')));
  const inkA = rgb(data.inks.A), inkB = rgb(data.inks.B), paper = rgb(data.paper || '#F3EEE3');

  // Misregistration of plate B (2x px) and a whisper of rotation; plate A carries the type, so it stays put.
  const mag = 5 + rng() * 4, ang = rng() * Math.PI * 2;
  const offB = { x: Math.cos(ang) * mag, y: Math.sin(ang) * mag, r: (rng() - 0.5) * 0.0024 };
  slide.style.setProperty('--echo-dx', `${(10 + rng() * 6) * (rng() < 0.5 ? -1 : 1) / K + offB.x / K}px`);
  slide.style.setProperty('--echo-dy', `${(7 + rng() * 5) / K + offB.y / K}px`);

  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); return g; };
  const P = { a: mk(), b: mk() };
  const grey = (d) => { const v = Math.round(Math.max(0, Math.min(1, d)) * 255); return `rgb(${v},${v},${v})`; };
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left - S.left) * K, y: (r.top - S.top) * K, w: r.width * K, h: r.height * K }; };

  function fillShape(g, el, b, d) {
    const kind = el.dataset.kind || 'rect';
    g.fillStyle = grey(d);
    if (kind === 'disc') { g.beginPath(); g.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); g.fill(); }
    else if (kind === 'path') {
      const [vx, vy, vw, vh] = el.dataset.vb.split(/[ ,]+/).map(Number);
      g.save(); g.translate(b.x, b.y); g.scale(b.w / vw, b.h / vh); g.translate(-vx, -vy); g.fill(new Path2D(el.dataset.path)); g.restore();
    } else g.fillRect(b.x, b.y, b.w, b.h);
  }

  for (const el of slide.querySelectorAll('.rz-shape')) {
    const b = box(el);
    if (b.w < 1 || b.h < 1) continue;
    const plate = P[el.dataset.plate || 'b'];
    for (const k of (el.dataset.knock || '')) if (P[k]) { P[k].fillStyle = '#000'; fillShape(P[k], el, b, 0); }
    if (el.dataset.ramp) {
      const [d0, d1] = el.dataset.ramp.split(',').map(Number);
      const n = +el.dataset.steps || 4, dir = el.dataset.dir || 'down';
      plate.save();
      plate.beginPath();
      if ((el.dataset.kind || 'rect') === 'disc') plate.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); else plate.rect(b.x, b.y, b.w, b.h);
      plate.clip();
      for (let i = 0; i < n; i++) {
        const d = d0 + ((d1 - d0) * i) / Math.max(1, n - 1);
        plate.fillStyle = grey(d);
        if (dir === 'down' || dir === 'up') {
          const k = dir === 'down' ? i : n - 1 - i;
          plate.fillRect(b.x, b.y + (b.h * k) / n, b.w, b.h / n + 1);
        } else {
          const k = dir === 'right' ? i : n - 1 - i;
          plate.fillRect(b.x + (b.w * k) / n, b.y, b.w / n + 1, b.h);
        }
      }
      plate.restore();
    } else {
      const d = +el.dataset.d;
      if (d > 0) fillShape(plate, el, b, d);
    }
  }
  // Emphasis: a field of plate B behind each line of the phrase, slightly uneven, like a hand-cut stencil.
  for (const el of slide.querySelectorAll('[data-mark="riso"]')) {
    const fs = parseFloat(getComputedStyle(el).fontSize) * K;
    for (const r of el.getClientRects()) {
      const x0 = (r.left - S.left) * K - fs * 0.08, x1 = (r.right - S.left) * K + fs * 0.08;
      const yc = (r.top - S.top + r.height * 0.56) * K, hh = fs * 0.36;
      const j = () => (rng() - 0.5) * fs * 0.06;
      P.b.fillStyle = '#fff';
      P.b.beginPath(); P.b.moveTo(x0 + j(), yc - hh + j()); P.b.lineTo(x1 + j(), yc - hh + j()); P.b.lineTo(x1 + j(), yc + hh + j()); P.b.lineTo(x0 + j(), yc + hh + j()); P.b.closePath(); P.b.fill();
    }
  }
  // Strike-through: a thick plate-B bar through the middle of each line.
  for (const el of slide.querySelectorAll('[data-rz-strike]')) {
    const fs = parseFloat(getComputedStyle(el).fontSize) * K;
    for (const r of el.getClientRects()) {
      const x0 = (r.left - S.left) * K - fs * 0.05, x1 = (r.right - S.left) * K + fs * 0.05;
      const yc = (r.top - S.top + r.height * 0.55) * K, hh = fs * 0.075;
      const tilt = (rng() - 0.5) * fs * 0.08;
      P.b.fillStyle = '#fff';
      P.b.beginPath(); P.b.moveTo(x0, yc - hh + tilt); P.b.lineTo(x1, yc - hh - tilt); P.b.lineTo(x1, yc + hh - tilt); P.b.lineTo(x0, yc + hh + tilt); P.b.closePath(); P.b.fill();
    }
  }

  const A = P.a.getImageData(0, 0, W, H).data, B = P.b.getImageData(0, 0, W, H).data;
  const cv = document.querySelector('.bg canvas.rz-print');
  cv.width = W; cv.height = H;
  cv.style.width = `${S.width}px`; cv.style.height = `${S.height}px`;
  const out = cv.getContext('2d');
  const img = out.createImageData(W, H);
  const O = img.data;

  // Screens: plate A at 75°, plate B at 15° (60° apart, no moiré), period 14 px at 2x (7 px in the 1080 file).
  const PER = 14, TAU = Math.PI * 2;
  const LUT = new Float32Array(1024); for (let i = 0; i < 1024; i++) LUT[i] = Math.cos((i / 1024) * TAU);
  const cosP = (u) => { let f = u / PER; f -= Math.floor(f); return LUT[(f * 1024) | 0]; };
  const sa = Math.sin((75 * Math.PI) / 180), ca = Math.cos((75 * Math.PI) / 180);
  const sb = Math.sin((15 * Math.PI) / 180), cb = Math.cos((15 * Math.PI) / 180);
  const seedA = (rng() * 1e6) | 0, seedB = (rng() * 1e6) | 0;
  const blotA = noiseGrid(W, H, 180, mulberry32(seedA)), blotB = noiseGrid(W, H, 150, mulberry32(seedB));
  const fibre = noiseGrid(W, H, 6, mulberry32(seedA ^ 77));
  const streakA = new Float32Array(W), streakB = new Float32Array(W);
  { const nA = noiseGrid(W, 4, 26, mulberry32(seedA ^ 5)), nB = noiseGrid(W, 4, 22, mulberry32(seedB ^ 9)); for (let x = 0; x < W; x++) { streakA[x] = nA(x, 1); streakB[x] = nB(x, 1); } }
  const cx = W / 2, cy = H / 2, cr = Math.cos(offB.r), sr = Math.sin(offB.r);

  function cover(d, x, y, s, c, seed) {
    if (d <= 0.012) return 0;
    const g = (h2(x, y, seed) - 0.5) * 0.22;
    if (d >= 0.93) return 1;
    const u = x * c + y * s, v = -x * s + y * c;
    const f = 0.5 * (cosP(u) + cosP(v));
    const val = f - (1 - 2 * d) + g;
    const cv2 = val / 0.42 + 0.5;
    return cv2 <= 0 ? 0 : cv2 >= 1 ? 1 : cv2;
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let da = A[i] / 255;
      // plate B sampled through its misregistration
      const dx = x - cx - offB.x, dy = y - cy - offB.y;
      const bx = Math.round(cx + dx * cr - dy * sr), by = Math.round(cy + dx * sr + dy * cr);
      let db = bx >= 0 && by >= 0 && bx < W && by < H ? B[(by * W + bx) * 4] / 255 : 0;
      let r = paper[0], g = paper[1], b = paper[2];
      const fb = 1 - 0.035 * fibre(x, y);
      r *= fb; g *= fb; b *= fb;
      if (da > 0.012) {
        let cA = cover(da, x, y, sa, ca, seedA);
        if (cA === 1 && h2(x >> 1, y >> 1, seedA ^ 3) > 0.9965) cA = 0.25;
        const k = cA * (0.87 + 0.11 * blotA(x, y) - 0.035 * streakA[x]);
        r *= 1 - k * (1 - inkA[0] / 255); g *= 1 - k * (1 - inkA[1] / 255); b *= 1 - k * (1 - inkA[2] / 255);
      }
      if (db > 0.012) {
        let cB = cover(db, bx, by, sb, cb, seedB);
        if (cB === 1 && h2(bx >> 1, by >> 1, seedB ^ 7) > 0.996) cB = 0.2;
        const k = cB * (0.86 + 0.12 * blotB(x, y) - 0.04 * streakB[x]);
        r *= 1 - k * (1 - inkB[0] / 255); g *= 1 - k * (1 - inkB[1] / 255); b *= 1 - k * (1 - inkB[2] / 255);
      }
      O[i] = r; O[i + 1] = g; O[i + 2] = b; O[i + 3] = 255;
    }
  }
  out.putImageData(img, 0, 0);
  document.documentElement.dataset.risoDone = '1';
};
