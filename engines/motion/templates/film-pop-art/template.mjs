// Studio Films style "Pop Art" (slug pop-art) as a reusable motion template.
// Sixties screen-print poster language: Ben-Day dots fixed to the paper at 45°, heavy
// black key lines, flat process plates that never quite register, condensed headlines
// printed in (colour lands from an offset, the key snaps on), paper label slips.
//
// One script (data block "story"):
//   story.hook   { caption, paid, balance, label?, sticker? }  (sticker only without a caption)
//   story.beats  rise  { from, to, delta, note, label?, caption? }
//                stack { n, unit, total, balance, stamp?, caption? }
//                fix   { pay, extra, off, balanceEnd, interest, label?, caption? }
// Props drawn in code: a HELOC statement, a cash register with its receipt, a wall of
// stamped payment prints, a wallet. hook -> rise -> stack (pattern interrupt, dot pull
// + stamped copies) -> fix -> card flip back to frame 1 (the last frame is frame 1).
export const meta = {
  id: 'film-pop-art',
  block: 'story',
  width: 1080,
  height: 1920,
  fps: 30,
  duration: { min: 15, max: 30 },
  safe: { x0: 65, x1: 1015, y0: 270, y1: 1248 },
  loop: true,
  motionBlur: 4,
  formats: ['Graphic reel', 'Short reel'],
};

export function prepare({ model }) {
  const b = model.block || {};
  if (!b.hook) throw new Error('film-pop-art needs story.hook');
  const ids = (b.beats || []).map((x) => x.id);
  for (const need of ['rise', 'stack', 'fix']) if (!ids.includes(need)) throw new Error(`film-pop-art needs a "${need}" beat in story.beats`);
  const beat = (id) => b.beats.find((x) => x.id === id);
  const num = (v, k) => { if (typeof v !== 'number' || !isFinite(v)) throw new Error(`film-pop-art: ${k} must be a number (use an @value reference)`); };
  num(b.hook.balance, 'hook.balance');
  num(beat('rise').from, 'rise.from'); num(beat('rise').to, 'rise.to');
  num(beat('stack').n, 'stack.n'); num(beat('stack').unit, 'stack.unit'); num(beat('stack').total, 'stack.total'); num(beat('stack').balance, 'stack.balance');
  num(beat('fix').pay, 'fix.pay'); num(beat('fix').off, 'fix.off'); num(beat('fix').balanceEnd, 'fix.balanceEnd');
  if (beat('stack').n < 4 || beat('stack').n > 24) throw new Error('film-pop-art: stack.n must be 4-24 (one stamped copy per payment)');
  return {};
}
