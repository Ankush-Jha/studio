// Colour helpers: parsing, mixing and WCAG 2.x contrast.
// Everything works in sRGB because that is what we export.

export function parseHex(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function toHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

function lin(v) {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// Linear-light mix, which looks closer to paint than a gamma-space mix.
export function mix(a, b, t) {
  const A = parseHex(a).map(lin);
  const B = parseHex(b).map(lin);
  const out = A.map((v, i) => v + (B[i] - v) * t).map((v) => {
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
    return s * 255;
  });
  return toHex(out);
}

// Darken (or lighten) `fg` towards `toward` until it reaches `target` contrast on `bg`.
export function ensureContrast(fg, bg, target = 4.5, toward = null) {
  if (contrast(fg, bg) >= target) return fg;
  const dir = toward || (luminance(bg) > 0.4 ? '#000000' : '#FFFFFF');
  for (let t = 0.02; t <= 1; t += 0.02) {
    const c = mix(fg, dir, t);
    if (contrast(c, bg) >= target) return c;
  }
  return dir;
}

// Pick whichever of two inks reads best on a fill.
export function bestOn(fill, inks = ['#111111', '#FFFFFF']) {
  return inks.reduce((best, c) => (contrast(c, fill) > contrast(best, fill) ? c : best), inks[0]);
}
