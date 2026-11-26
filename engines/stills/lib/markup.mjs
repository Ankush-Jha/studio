// Tiny inline markup for spec copy. Writers (and the nightly job) type plain text with:
//   ==words==   emphasis mark: the group's default hand mark (highlighter, underline, swash...)
//   ((words))   hand-drawn circle
//   ~~words~~   hand-drawn strike-through
//   *words*     typographic emphasis (italic or accent colour, per group)
//   |           forced line break (use sparingly, for headline rag control)
// Everything else is escaped. Marks may not nest.

export function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Typographic niceties: real apostrophes/quotes, thin space before %, non-breaking units.
function typeset(s) {
  return s
    .replace(/(^|[\s(\[{"])'/g, '$1‘')
    .replace(/'/g, '’')
    .replace(/(^|[\s(\[{])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/\.\.\./g, '…')
    .replace(/ - /g, ' – ')
    .replace(/(\d) (a\.m\.|p\.m\.|ET)/g, '$1 $2')
    .replace(/\b(Dec|Jan|Feb|Nov|Oct|Sept?|Mar|Apr|Jun|Jul|Aug|May) (\d)/g, '$1 $2');
}

export function inline(src = '', { emphasis = 'highlight' } = {}) {
  let s = esc(typeset(String(src)));
  s = s.replace(/==(.+?)==/g, (_, t) => `<span class="mk mk-emph" data-mark="${emphasis}">${t}</span>`);
  s = s.replace(/\(\((.+?)\)\)/g, (_, t) => `<span class="mk mk-circle" data-mark="circle">${t}</span>`);
  s = s.replace(/~~(.+?)~~/g, (_, t) => `<span class="mk mk-strike" data-mark="strike">${t}</span>`);
  s = s.replace(/\*(.+?)\*/g, (_, t) => `<em>${t}</em>`);
  s = s.replace(/\s*\|\s*/g, '<br>');
  return s;
}

// Word count of the visible copy (markup removed). Numbers like "$2,617" count as one word.
export function words(src = '') {
  return String(src)
    .replace(/==|\(\(|\)\)|~~|\*|\|/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}$%]/u.test(w)).length;
}
