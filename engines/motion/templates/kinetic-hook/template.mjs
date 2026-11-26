// Kinetic-typography hook reel: 6-12 s, loops to frame 1.
// Data block "kinetic":
//   cards: [
//     { text: "$7,800 paid.|Still owes ==$150,000==." },              statement card
//     { kind: "number", label, from: "@paymentBefore", to: "@paymentNow",
//       strike: true, caption: "a month since prime rose Oct 29" },   number card
//   ]
//   card fields: hold (seconds of settled reading time; default from word count)
// Card 1 is the hook: it is fully set in frame 1 and comes back at the end, so the
// last frame is the first frame (no end card).
export const meta = {
  id: 'kinetic-hook',
  block: 'kinetic',
  width: 1080,
  height: 1920,
  fps: 30,
  duration: { min: 6, max: 12 },
  safe: { x0: 65, x1: 1015, y0: 270, y1: 1248 },
  loop: true,
  formats: ['Graphic reel', 'Short reel', 'GIF'],
};

export function prepare({ model }) {
  const cards = model.block.cards || [];
  if (cards.length < 2) throw new Error('kinetic-hook needs at least 2 cards (card 1 is the hook)');
  const hook = String(cards[0].text || '').replace(/==|~~|\(\(|\)\)|\^\^|\*/g, '').replace(/\|/g, ' ').trim();
  const words = hook.split(/\s+/).filter(Boolean).length;
  const warnings = [];
  if (words < 3 || words > 7) warnings.push(`hook has ${words} words (PLAYBOOK: 3-7 on screen in frame 1)`);
  return { hookWords: words, prepWarnings: warnings };
}
