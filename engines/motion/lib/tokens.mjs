// Client tokens for motion: the SAME group family + client brand layer the statics use,
// so a client's reels, carousels and statics read as one brand.
//
// Lookup order for the client brand layer:
//   1. engines/stills/tokens/clients/<slug>.json   (canonical, shared with Studio Stills)
//   2. engines/motion/tokens/clients/<slug>.json   (motion-local overlay for clients
//      the stills have not been set up for yet; copy it into stills when it is approved)
//   3. synthesized from the entry in engines/stills/library/roster.json (name, group, province only)
//      with a provisional accent. A warning is printed and the manifest says so.
//
// Group: --group flag > roster (stills/library/roster.json) > client file meta.group > data.group.
// Compliance values are only ever read from the client file or the roster, never invented.
import fs from 'node:fs';
import path from 'node:path';
import { STATIC_TOKENS, LOCAL_TOKENS, ROSTER } from './paths.mjs';
import { deepMerge, contrast, ensureContrast, mix, bestOn } from './statics.mjs';
import { motionStyle } from './families.mjs';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const readJSON = (f) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error(`Could not read ${f}: ${e.message}`); }
};

function resolveRefs(tree) {
  const get = (p) => p.split('.').reduce((o, k) => (o ? o[k] : undefined), tree);
  const walk = (node, depth = 0) => {
    if (depth > 20) throw new Error('Token reference loop');
    if (typeof node === 'string') {
      const m = node.match(/^\{([\w.-]+)\}$/);
      if (m) {
        const t = get(m[1]);
        const v = isObj(t) && '$value' in t ? t.$value : t;
        if (v === undefined) throw new Error(`Unresolved token reference ${node}`);
        return walk(v, depth + 1);
      }
      return node;
    }
    if (Array.isArray(node)) return node.map((n) => walk(n, depth + 1));
    if (isObj(node)) return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v, depth)]));
    return node;
  };
  return walk(tree);
}

function toCssVars(tree, sections) {
  const vars = {};
  const walk = (node, prefix) => {
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith('$')) continue;
      const name = `${prefix}-${k}`;
      if (isObj(v) && '$value' in v) {
        let val = v.$value;
        if (v.$type === 'fontFamily' && Array.isArray(val)) val = val.map((f) => (/\s/.test(f) && !/^(serif|sans-serif|monospace)$/.test(f) ? `"${f}"` : f)).join(', ');
        vars[`--${name}`] = String(val);
      } else if (isObj(v)) walk(v, name);
    }
  };
  for (const s of sections) if (tree[s]) walk(tree[s], s);
  return vars;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Provisional accents for clients with no brand file yet. Deliberately not purple/teal.
const PROVISIONAL = ['#B4432A', '#2D6A3E', '#2148B0', '#9A5B13', '#7A2E3B', '#1F5F7A', '#5B6B1E', '#A23E6B'];

function initialsOf(name = '') {
  const parts = name.replace(/&/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function findClient(slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`Bad client slug "${slug}" (use a-z, 0-9, -)`);
  const seedFile = fs.existsSync(ROSTER) ? ROSTER : null;
  const roster = (seedFile && readJSON(ROSTER).clients?.[slug]) || null;
  const statics = path.join(STATIC_TOKENS, 'clients', `${slug}.json`);
  const local = path.join(LOCAL_TOKENS, 'clients', `${slug}.json`);
  if (fs.existsSync(statics)) return { file: statics, source: 'statics', data: readJSON(statics), roster, seedFile: roster ? seedFile : null };
  if (fs.existsSync(local)) return { file: local, source: 'motion-local', data: readJSON(local), roster, seedFile: roster ? seedFile : null };
  if (!roster) throw new Error(`Unknown client "${slug}": no token file in engines/stills/tokens/clients or engines/motion/tokens/clients, and no entry in engines/stills/library/roster.json.`);
  const h = hash(slug);
  return {
    file: null,
    source: 'synthesized',
    roster,
    seedFile,
    data: {
      meta: { id: slug, name: roster.name, initials: initialsOf(roster.name), province: roster.province || '', seed: h % 1000, layoutVariant: h % 2 ? 'b' : 'a' },
      color: { accent: { $type: 'color', $value: PROVISIONAL[h % PROVISIONAL.length], $description: 'provisional: no brand colour on file' } },
      compliance: { agentName: '', title: '', brokerage: roster.brokerage || '', licence: roster.licence || '', province: roster.province || '' },
    },
  };
}

export function resolveClient(slug, { group: groupOverride, dataGroup } = {}) {
  const found = findClient(slug);
  const c = found.data;
  const group = Number(groupOverride || found.roster?.group || c.meta?.group || dataGroup);
  if (!(group >= 1 && group <= 4)) throw new Error(`Client "${slug}" has no group 1-4 (roster says ${found.roster?.group}). Pass --group N.`);
  const groupFile = path.join(STATIC_TOKENS, `group-${group}.json`);
  const g = readJSON(groupFile);

  let merged = deepMerge(g, { color: c.color || {}, font: c.font || {} });
  const perGroup = (c.byGroup || {})[String(group)] || {};
  merged = deepMerge(merged, perGroup);
  merged = resolveRefs(merged);

  const col = (k) => merged.color?.[k]?.$value;
  const paper = col('paper'), ink = col('ink'), accent = col('accent');
  const derived = {
    'accent-ink': ensureContrast(accent, paper, 4.5),
    'accent-tint': mix(accent, paper, merged.annotation?.highlightMix ?? 0.55),
    'on-accent': bestOn(accent, [ink, paper, '#111111', '#FFFFFF']),
    'mark-ink': ensureContrast(col('mark') || accent, paper, 3.0),
    'ink-soft-safe': ensureContrast(col('ink-soft') || ink, paper, 4.5),
  };
  for (const [k, v] of Object.entries(derived)) {
    if (!merged.color[k]) merged.color[k] = { $type: 'color', $value: v, $description: 'derived' };
  }
  const vars = toCssVars(merged, ['color', 'font', 'size', 'space']);
  const colors = Object.fromEntries(Object.entries(merged.color).filter(([, v]) => isObj(v) && '$value' in v).map(([k, v]) => [k, v.$value]));
  const roster = found.roster || {};
  const compliance = { ...(c.compliance || {}) };
  // The roster is the record of truth for licence data; fill gaps from it, never invent.
  if (!String(compliance.brokerage || '').trim() && roster.brokerage) compliance.brokerage = roster.brokerage;
  if (!String(compliance.licence || '').trim() && roster.licence) compliance.licence = roster.licence;
  if (!compliance.province) compliance.province = roster.province || c.meta?.province || '';

  const family = merged.meta.family;
  return {
    group,
    family,
    familyName: merged.meta.name,
    vars,
    colors,
    fontVariation: merged.fontVariation || {},
    annotation: merged.annotation || {},
    texture: merged.texture || {},
    style: motionStyle(family, merged.annotation || {}),
    client: {
      id: c.meta?.id || slug,
      name: c.meta?.name || roster.name || slug,
      initials: c.meta?.initials || initialsOf(roster.name),
      seed: c.meta?.seed ?? hash(slug) % 1000,
      layoutVariant: perGroup.meta?.layoutVariant || c.meta?.layoutVariant || 'a',
      province: compliance.province,
      city: roster.city || c.meta?.city || '',
      languages: roster.languages || [],
      compliance,
    },
    source: found.source,
    contrast: {
      'ink/paper': +contrast(ink, paper).toFixed(2),
      'accent-ink/paper': +contrast(colors['accent-ink'], paper).toFixed(2),
      'on-accent/accent': +contrast(colors['on-accent'], accent).toFixed(2),
      'ink-soft/paper': col('ink-soft') ? +contrast(col('ink-soft'), paper).toFixed(2) : null,
    },
    files: { group: groupFile, client: found.file, roster: found.seedFile },
  };
}
