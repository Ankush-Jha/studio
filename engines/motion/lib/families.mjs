// One motion style per family (PLAYBOOK: "one motion style per series"). The group
// family decides how type enters, how emphasis is drawn and how numbers are revealed;
// the client layer only changes colour, seed and layout variant on top of it.
//
// Eases are GSAP names or CustomEase curves registered by the runtime:
//   settle  cubic-bezier(.16,1,.3,1)   long exponential settle, no overshoot
//   soft    cubic-bezier(.22,.9,.24,1) gentler settle for serif families
//   lift    cubic-bezier(.55,0,.75,.2) accelerating exit
//   swap    cubic-bezier(.76,0,.24,1)  symmetric move for pushes and morphs

const BASE = {
  enter: 'mask',            // mask | soft | type
  enterDur: 0.72,
  enterStagger: 0.045,
  enterEase: 'settle',
  exitDur: 0.42,
  exitStagger: 0.028,
  exitEase: 'lift',
  moveEase: 'swap',
  overlap: 0.26,            // next card starts this long before the previous exit ends
  markDur: 0.46,
  markDelay: 0.12,
  countDur: 0.95,
  countEase: 'power2.out',
  display: { weight: 800, stretch: '72%', tracking: '-0.02em', leading: 0.92, caps: false, italicEmph: false },
  body: { weight: 500, stretch: '100%' },
  label: { weight: 700, tracking: '0.12em' },
  device: 'rule',           // the persistent element that carries continuity between beats
};

const FAMILIES = {
  ledger: {
    ...BASE,
    emphasis: 'underline', strike: 'single', circle: 'circle',
    pen: { width: 7, wobble: 0.7, cap: 'round', opacity: 1 },
    device: 'rule',
  },
  kitchen: {
    ...BASE,
    enter: 'soft', enterDur: 0.68, enterStagger: 0.045, enterEase: 'soft',
    exitDur: 0.38, overlap: 0.28,
    emphasis: 'highlight', strike: 'double', circle: 'circle',
    pen: { width: 9, wobble: 1.15, cap: 'round', opacity: 0.95 },
    display: { weight: 600, stretch: '100%', tracking: '-0.028em', leading: 1.0, caps: false, italicEmph: true },
    body: { weight: 500, stretch: '100%' },
    label: { weight: 600, tracking: '0.16em' },
    device: 'margin',
  },
  riso: {
    ...BASE,
    enterDur: 0.62, enterStagger: 0.045,
    emphasis: 'swash', strike: 'scribble', circle: 'circle',
    pen: { width: 16, wobble: 1.6, cap: 'round', opacity: 1 },
    display: { weight: 800, stretch: '75%', tracking: '-0.01em', leading: 0.88, caps: true, italicEmph: false },
    body: { weight: 700, stretch: '85%' },
    label: { weight: 800, tracking: '0.1em' },
    device: 'field',
  },
  dossier: {
    ...BASE,
    enter: 'mask', enterDur: 0.7,
    emphasis: 'box', strike: 'double', circle: 'circle',
    pen: { width: 5.5, wobble: 1.0, cap: 'round', opacity: 0.95 },
    display: { weight: 560, stretch: '100%', tracking: '-0.015em', leading: 1.0, caps: false, italicEmph: false },
    body: { weight: 500, stretch: '100%' },
    label: { weight: 500, tracking: '0.1em' },
    device: 'memo',
  },
};

export function motionStyle(family, annotation = {}) {
  const f = FAMILIES[family];
  if (!f) throw new Error(`No motion style for family "${family}"`);
  return { family, ...f, pen: { ...f.pen, ...(annotation.wobble ? { wobble: annotation.wobble } : {}) } };
}
