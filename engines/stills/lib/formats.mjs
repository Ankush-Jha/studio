// Canvas formats for the style library. Every size is CSS px at 1x; renders are taken at 2x.
// safe   = where every word must sit (QA fails text outside it unless it is marked data-bleed).
// crop34 = the 3:4 band Instagram's profile grid shows; the cover headline must sit inside it.
export const FORMATS = {
  feed: {
    name: 'feed', label: '4:5 feed / carousel', w: 1080, h: 1350,
    safe: { x0: 64, y0: 56, x1: 1016, y1: 1294 },
    crop34: { x0: 34, y0: 0, x1: 1046, y1: 1350 },
  },
  story: {
    name: 'story', label: '9:16 story / reel cover', w: 1080, h: 1920,
    // Instagram UI covers the top 14%, the bottom 35% and 6% each side (PLAYBOOK).
    safe: { x0: 65, y0: 270, x1: 1015, y1: 1248 },
    crop34: { x0: 0, y0: 240, x1: 1080, y1: 1680 },
  },
  square: {
    name: 'square', label: '1:1 square', w: 1080, h: 1080,
    safe: { x0: 64, y0: 64, x1: 1016, y1: 1016 },
    crop34: { x0: 135, y0: 0, x1: 945, y1: 1080 },
  },
};

export function formatOf(name = 'feed') {
  const f = FORMATS[name];
  if (!f) throw new Error(`Unknown format "${name}". Known: ${Object.keys(FORMATS).join(', ')}`);
  return f;
}

// CSS custom properties for a format, so a stylesheet can lay out against the safe box.
export function formatVars(f) {
  const s = f.safe;
  return {
    '--W': `${f.w}px`, '--H': `${f.h}px`,
    '--safe-x0': `${s.x0}px`, '--safe-y0': `${s.y0}px`, '--safe-x1': `${s.x1}px`, '--safe-y1': `${s.y1}px`,
    '--safe-w': `${s.x1 - s.x0}px`, '--safe-h': `${s.y1 - s.y0}px`,
    '--safe-r': `${f.w - s.x1}px`, '--safe-b': `${f.h - s.y1}px`,
  };
}
