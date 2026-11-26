// Direction A, "Bold Pop": saturated colour blocks, giant numbers, snap zooms.
// One script (data block "story"): hook -> rise -> stack (pattern interrupt) -> fix -> hook.
//   story.hook   { caption, paid:"@paidIO", balance:"@balanceIO" }
//   story.beats  rise  { from, to, delta, note }
//                stack { n, unit, total, balance }
//                fix   { pay, extra, off, balanceEnd, caption }
// 12-15 s, loops to frame 1 (the last frame is frame 1).
export const meta = {
  id: 'pop-hook',
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
  const ids = (model.block.beats || []).map((b) => b.id);
  for (const need of ['rise', 'stack', 'fix']) if (!ids.includes(need)) throw new Error(`pop-hook needs a "${need}" beat in story.beats`);
  return {};
}
