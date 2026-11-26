// Studio Films style "Thermal Camera" (thermal-camera) as a reusable motion template.
// A house at night seen through a radiometric thermal camera (iron palette, sensor noise,
// colour scale, spot meter, area box, isotherm, detector shutter, scan line). The data:
//   story.hook   { caption, paid, balance, sticker?, label? }
//   story.beats  rise  { from, to, delta, note, label? }
//                stack { n, unit, total, balance, stamp? }
//                fix   { pay, extra, off, balanceEnd, interest, label? }
//   values.series  month-end balances on the self-set payment (the box steps through them)
// Story: the INTEREST spot meter sits on the furnace exhaust (heat leaving the house), the
// BALANCE box on the frozen front door. Payments are heat pulses that go up the plume;
// the self-set payment sends a warm stream into the box and the frost melts.
// 15-30 s, loops: the last frame is frame 1 (a scan line restores the hook state).
export const meta = {
  id: 'film-thermal',
  block: 'story',
  width: 1080,
  height: 1920,
  fps: 30,
  duration: { min: 15, max: 30 },
  safe: { x0: 65, x1: 1015, y0: 270, y1: 1248 },
  loop: true,
  motionBlur: 1, // a sensor image: noise is new every frame, so no sub-frame blur
  formats: ['Graphic reel', 'Case study reel'],
  style: { source: 'Studio Films', slug: 'thermal-camera' },
};

export function prepare({ model }) {
  const b = model.block || {};
  const ids = (b.beats || []).map((x) => x.id);
  for (const need of ['rise', 'stack', 'fix']) if (!ids.includes(need)) throw new Error(`film-thermal needs a "${need}" beat in story.beats`);
  const beat = (id) => b.beats.find((x) => x.id === id);
  const nums = { 'hook.paid': b.hook?.paid, 'hook.balance': b.hook?.balance, 'rise.from': beat('rise').from, 'rise.to': beat('rise').to,
    'stack.n': beat('stack').n, 'stack.unit': beat('stack').unit, 'stack.total': beat('stack').total, 'stack.balance': beat('stack').balance,
    'fix.pay': beat('fix').pay, 'fix.extra': beat('fix').extra, 'fix.off': beat('fix').off, 'fix.balanceEnd': beat('fix').balanceEnd };
  for (const [k, v] of Object.entries(nums)) if (typeof v !== 'number' || !isFinite(v)) throw new Error(`film-thermal: ${k} must be a number from calc (got ${JSON.stringify(v)})`);
  if (!b.hook?.caption) throw new Error('film-thermal: story.hook.caption is required');
  return {};
}
