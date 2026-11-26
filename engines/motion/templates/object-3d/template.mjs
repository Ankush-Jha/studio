// Direction C "3D Object": a three.js night scene (house, a $150,000 cash stack, payment
// coins that burn as interest) with a camera fly-through, live HTML captions popping word
// by word, and a hard colour-flip pattern interrupt. 12-15 s, loops to frame 1.
//
// Data block "story" (shared with pop-hook and phone-pov):
//   hook:  { caption, paid: "@paidIO", balance: "@balanceIO" }
//   beats: [ { id: "rise",  caption, from: "@paymentBefore", to: "@paymentNow", delta },
//            { id: "stack", caption, n, unit: "@paymentNow", total: "@paidIO", balance },
//            { id: "fix",   caption, pay, off: "@principalCustom", balanceEnd: "@balanceCustom" } ]
// The cash stack is drawn as 15 equal bundles (balance / 15 each); the top bundle loses
// exactly off / bundle of its length in the "fix" beat, so the picture is to scale.
export const meta = {
  id: 'object-3d',
  block: 'story',
  width: 1080,
  height: 1920,
  fps: 30,
  duration: { min: 12, max: 15 },
  safe: { x0: 65, x1: 1015, y0: 270, y1: 1248 },
  loop: true,
  motionBlur: 4,           // 2 samples strobe (double image) on the coin flights and fly-back; 4 reads as real blur
  formats: ['Graphic reel', 'Short reel'],
};

export const scripts = ['vendor/three.iife.js'];

const plain = (s) => String(s || '').replace(/==|~~|\(\(|\)\)|\^\^|\*/g, '').replace(/\|/g, ' ');
const money = (n) => '$' + Number(n).toLocaleString('en-CA');

export function prepare({ model }) {
  const b = model.block;
  const warn = [];
  const beat = (id) => (b.beats || []).find((x) => x.id === id);
  for (const id of ['rise', 'stack', 'fix']) if (!beat(id)) throw new Error(`object-3d: story needs a "${id}" beat`);
  // Captions are typed copy; make sure every dollar figure in them is a calc value.
  const allowed = new Set(Object.values(model.values).map((v) => v.text));
  const check = (s, where) => (plain(s).match(/\$[\d,]+(?:\.\d+)?/g) || []).forEach((m) => {
    const bare = m.replace(/[.,]$/, '');
    if (!allowed.has(bare)) warn.push(`${where}: "${bare}" is not a computed value`);
  });
  check(b.hook.caption, 'hook');
  b.beats.forEach((x) => check(x.caption, x.id));
  const stack = beat('stack'), fix = beat('fix');
  if (stack.total !== stack.unit * stack.n && Math.abs(stack.total - stack.unit * stack.n) > stack.n) warn.push(`stack: ${money(stack.unit)} × ${stack.n} ≠ ${money(stack.total)}`);
  if (stack.balance - fix.off !== fix.balanceEnd && Math.abs(stack.balance - fix.off - fix.balanceEnd) > 1) warn.push('fix: balance − off ≠ balanceEnd');
  return { prepWarnings: warn };
}
