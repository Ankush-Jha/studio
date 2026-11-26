// Direction B "Phone POV": a CSS-3D phone on a dark set showing a generic bank app
// (no real bank brand). The story plays out on the statement: notifications land,
// the payment rises, twelve payments stack up while the balance refuses to move,
// then a self-set payment finally moves it. Loops to frame 1.
// Data block "story" (shared by the three directions):
//   hook:  { caption, kicker, paid, balance }
//   beats: [ {id:"rise", caption, from, to, delta, note},
//            {id:"stack", caption, n, unit, total, balance},
//            {id:"fix", caption, pay, extra, off, balanceEnd, interest} ]
// Month-by-month balances come from the calc series (values.series).
export const meta = {
  id: 'phone-pov',
  block: 'story',
  width: 1080,
  height: 1920,
  fps: 30,
  duration: { min: 12, max: 15 },
  safe: { x0: 65, x1: 1015, y0: 270, y1: 1248 },
  loop: true,
  motionBlur: 4,
  formats: ['Graphic reel', 'Short reel'],
};

export function prepare({ model }) {
  const b = model.block;
  const ids = (b.beats || []).map((x) => x.id);
  for (const need of ['rise', 'stack', 'fix']) if (!ids.includes(need)) throw new Error(`phone-pov needs a "${need}" beat in story.beats`);
  const series = model.values.series?.shown;
  if (!Array.isArray(series) || series.length < 2) throw new Error('phone-pov needs calc values.series (month-end balances): set customPayment in calc inputs');
  const fix = b.beats.find((x) => x.id === 'fix');
  if (Math.round(series[series.length - 1]) !== Math.round(fix.balanceEnd)) throw new Error(`series end ${series[series.length - 1]} != fix.balanceEnd ${fix.balanceEnd}`);
  return {};
}
