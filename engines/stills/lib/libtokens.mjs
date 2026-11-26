// Tokens for the style library: style palette (library/<slug>/style.json) <- client colours
// (tokens/clients/<id>.json) <- client.byStyle[<slug>]. Derived colours keep any client accent
// accessible on the style's own ground.
import fs from 'node:fs';
import path from 'node:path';
import { contrast, ensureContrast, mix, bestOn } from './color.mjs';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const val = (v) => (isObj(v) && '$value' in v ? v.$value : v);

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`Could not read ${file}: ${e.message}`); }
}

export function loadStyleMeta(root, slug) {
  const dir = path.join(root, 'library', slug);
  const file = path.join(dir, 'style.json');
  if (!fs.existsSync(file)) {
    const known = fs.readdirSync(path.join(root, 'library')).filter((d) => fs.existsSync(path.join(root, 'library', d, 'style.json')));
    throw new Error(`Unknown style "${slug}". Known: ${known.join(', ')}`);
  }
  return { dir, file, ...readJSON(file) };
}

export function loadRoster(root) {
  return readJSON(path.join(root, 'library', 'roster.json'));
}

export function loadClient(root, id) {
  const file = path.join(root, 'tokens', 'clients', `${id}.json`);
  return { file, ...readJSON(file) };
}

// Palette for one style + client. Returns flat hex map, CSS vars and a contrast report.
export function libTokens(style, client) {
  const pal = {};
  for (const [k, v] of Object.entries(style.palette || {})) pal[k] = val(v);
  const cc = client.color || {};
  const own = client.byStyle?.[style.slug]?.color || {};
  // A client accent applies unless the style pins its own (e.g. riso inks are chosen from a set).
  if (cc.accent && !style.pinAccent) pal.accent = val(cc.accent);
  for (const [k, v] of Object.entries(own)) pal[k] = val(v);

  const ground = pal[style.accentGround || 'paper'] || pal.paper;
  const derived = {
    'accent-ink': ensureContrast(pal.accent, ground, 4.5),
    'accent-tint': mix(pal.accent, ground, style.tintMix ?? 0.62),
    'on-accent': bestOn(pal.accent, [pal.ink, pal.paper, '#111111', '#FFFFFF'].filter(Boolean)),
    'mark-ink': ensureContrast(pal.mark || pal.accent, ground, 3.0),
  };
  for (const [k, v] of Object.entries(derived)) if (!pal[k]) pal[k] = v;

  const vars = {};
  for (const [k, v] of Object.entries(pal)) vars[`--color-${k}`] = v;
  const report = {};
  for (const [a, b] of [['ink', 'paper'], ['accent-ink', ground === pal.paper ? 'paper' : style.accentGround], ['on-accent', 'accent'], ['ink-soft', 'paper']]) {
    if (pal[a] && pal[b]) report[`${a}/${b}`] = +contrast(pal[a], pal[b]).toFixed(2);
  }
  return { palette: pal, vars, contrastReport: report };
}

// Which style a client gets when the spec or CLI doesn't say: roster primary, or the
// secondary when `slot` is 'secondary'.
export function rosterStyle(roster, clientId, slot = 'primary') {
  const c = roster.clients?.[clientId];
  if (!c) return null;
  return slot === 'secondary' ? c.secondary : c.primary;
}
