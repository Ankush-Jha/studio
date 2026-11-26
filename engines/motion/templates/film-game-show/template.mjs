// film-game-show: Studio Films style "Rhythm Game Show" (styles/game-show/STYLE.md).
// A flat-vector rhythm game show on a fixed 120 BPM grid (beat 0.5 s, bar 2 s, 15 frames a beat):
// toy bean contestants with heavy ink outlines on candy stripes / dots / sunbursts, outlined
// telops, round cards, call-and-response payment drops and a judgement word per round.
//
// One script (data block "story"), read as M.block plus calc values in M.values:
//   story.hook   { caption, paid, balance, sticker?, label?, kicker? }
//   story.beats  rise  { from, to, delta, note, label? }
//                stack { n, unit, total, balance, stamp? }
//                fix   { pay, extra, off, balanceEnd, interest, label? }
//
// Bars (120 BPM):
//   0-1   HOOK      accent set, stripes. Frame 1 = banner + "still owes" + giant balance.
//                   The contestant slams a buzzer on the beat; the balance wobbles and won't move.
//   2     ROUND 1   card bar (hard cut + flash), then the card shrinks into the corner banner.
//   3-4   play      price tag pumped up a step per beat; slam + judgement word (the delta).
//   5-7   SPLIT     pattern interrupt (~38%): no card, split stage, payments drop quarters ->
//                   eighths -> sixteenths onto a tower while the lender bot shakes its head; stamp.
//   8     BONUS     card bar.
//   9-12  play      tag pumped to the new payment; every buzzer press now feeds the balance board,
//                   which steps down month by month (values.series); slam + judgement (amount off).
//   13    LOOP      hard cut on the bar line back to the hook; the last frame is frame 1.
export const meta = {
  id: 'film-game-show',
  block: 'story',
  width: 1080,
  height: 1920,
  fps: 30,
  duration: { min: 15, max: 30 },
  safe: { x0: 65, x1: 1015, y0: 270, y1: 1248 },
  loop: true,
  motionBlur: 2,
  formats: ['Graphic reel'],
  style: { source: 'Studio Films', slug: 'game-show', name: 'Rhythm Game Show' },
};

export function prepare({ model }) {
  const B = model.block || {};
  if (!B.hook) throw new Error('film-game-show needs story.hook');
  const ids = (B.beats || []).map((b) => b.id);
  for (const need of ['rise', 'stack', 'fix']) if (!ids.includes(need)) throw new Error(`film-game-show needs a "${need}" beat in story.beats`);
  const num = (v, k) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`film-game-show: ${k} must be a number (use an @value reference)`); };
  const beat = (id) => B.beats.find((b) => b.id === id);
  num(B.hook.paid, 'hook.paid'); num(B.hook.balance, 'hook.balance');
  num(beat('rise').from, 'rise.from'); num(beat('rise').to, 'rise.to');
  num(beat('stack').n, 'stack.n'); num(beat('stack').unit, 'stack.unit'); num(beat('stack').total, 'stack.total'); num(beat('stack').balance, 'stack.balance');
  num(beat('fix').pay, 'fix.pay'); num(beat('fix').off, 'fix.off'); num(beat('fix').balanceEnd, 'fix.balanceEnd');
  if (beat('stack').n < 3 || beat('stack').n > 18) throw new Error('film-game-show: stack.n must be 3-18 payments');
  return {};
}
