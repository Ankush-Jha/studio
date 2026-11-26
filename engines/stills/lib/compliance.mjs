// Compliance block, read from the client token file.
// Ontario O. Reg. 188/08 s.6: brokerage authorised name + licence number, clearly and
// prominently; agents add their licensed name and approved title.
// We NEVER invent values. Empty fields render as visible placeholders with a red tag,
// and --strict refuses to export.
import { esc } from './markup.mjs';

export const REQUIRED = [
  ['agentName', 'agent name'],
  ['title', 'licensed title'],
  ['brokerage', 'brokerage name'],
  ['licence', 'brokerage licence number'],
];

// A bracketed value such as "[BROKERAGE NAME]" or "[LICENCE #]" is a placeholder: it prints as-is with the
// red placeholder tag, but it counts as missing (TODO in QA, refused under --strict).
export const isPlaceholder = (v) => /^\s*\[.*\]\s*$/.test(String(v ?? ''));
const filled = (v) => !!String(v ?? '').trim() && !isPlaceholder(v);

export function missingFields(compliance = {}) {
  return REQUIRED.filter(([k]) => !filled(compliance[k])).map(([k, label]) => ({ key: k, label }));
}

// size: 'line' (folio footer on every slide) or 'block' (CTA / single statics).
export function complianceHTML(compliance = {}, { size = 'line' } = {}) {
  const c = compliance;
  const missing = missingFields(c);
  const has = (k) => filled(c[k]);

  const agent = has('agentName') && has('title')
    ? `${esc(c.agentName)}, ${esc(c.title)}`
    : has('agentName') ? esc(c.agentName) : null;
  const brokerage = has('brokerage') ? esc(c.brokerage).toUpperCase() : isPlaceholder(c.brokerage) ? esc(c.brokerage.trim()) : 'BROKERAGE NAME';
  const licence = has('licence') ? `LIC. #${esc(c.licence)}` : isPlaceholder(c.licence) ? esc(c.licence.trim()) : 'LIC. #——';

  const tag = missing.length
    ? `<span class="ph-tag" title="Missing: ${missing.map((m) => m.label).join(', ')}">placeholder</span>`
    : '';

  const agentPart = size === 'block'
    ? `<span class="c-agent${agent ? '' : ' is-ph'}">${agent || 'AGENT NAME, TITLE'}</span>`
    : '';

  return `<div class="compliance c-${size}${missing.length ? ' has-ph' : ''}" data-role="fine">${agentPart}<span class="c-brk${has('brokerage') && has('licence') ? '' : ' is-ph'}">${brokerage} · ${licence}</span>${tag}</div>`;
}
