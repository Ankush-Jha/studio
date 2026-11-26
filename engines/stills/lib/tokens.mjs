// Brand tokens: group family (art direction) + client layer (brand + compliance).
// Files use W3C Design Tokens (DTCG) leaves: { "$type": "color", "$value": "#..." }.
// Merge order: group-N.json  <-  client.color/font  <-  client.byGroup["N"].
import fs from 'node:fs';
import path from 'node:path';
import { contrast, ensureContrast, mix, bestOn } from './color.mjs';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function deepMerge(base, over) {
  if (!isObj(over)) return over === undefined ? base : over;
  const out = { ...(isObj(base) ? base : {}) };
  for (const [k, v] of Object.entries(over)) {
    if (k.startsWith('$comment')) continue;
    // A DTCG leaf replaces wholesale.
    out[k] = isObj(v) && !('$value' in v) ? deepMerge(out[k], v) : v;
  }
  return out;
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Could not read ${file}: ${e.message}`);
  }
}

// Resolve "{color.ink}" style references.
function resolveRefs(tree) {
  const get = (p) => p.split('.').reduce((o, k) => (o ? o[k] : undefined), tree);
  const walk = (node, depth = 0) => {
    if (depth > 20) throw new Error('Token reference loop');
    if (typeof node === 'string') {
      const m = node.match(/^\{([\w.-]+)\}$/);
      if (m) {
        const target = get(m[1]);
        const v = isObj(target) && '$value' in target ? target.$value : target;
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

// Flatten DTCG leaves under the given sections into CSS custom properties.
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

export function loadTokens(root, { group, client }) {
  const groupFile = path.join(root, 'tokens', `group-${group}.json`);
  const clientFile = path.join(root, 'tokens', 'clients', `${client}.json`);
  const g = readJSON(groupFile);
  const c = readJSON(clientFile);

  // Client brand applies everywhere; byGroup tunes it to a specific family.
  let merged = deepMerge(g, { color: c.color || {}, font: c.font || {} });
  const perGroup = (c.byGroup || {})[String(group)] || {};
  merged = deepMerge(merged, perGroup);
  merged = resolveRefs(merged);

  const col = (k) => merged.color?.[k]?.$value;
  const paper = col('paper');
  const ink = col('ink');
  const accent = col('accent');

  // Derived colours, so a client accent can never break contrast.
  const derived = {
    'accent-ink': ensureContrast(accent, paper, 4.5),           // accent used as text
    'accent-tint': mix(accent, paper, merged.annotation?.highlightMix ?? 0.55), // highlighter
    'on-accent': bestOn(accent, [ink, paper, '#111111', '#FFFFFF']),
    'mark-ink': ensureContrast(col('mark') || accent, paper, 3.0), // annotation marks: graphics, 3:1
  };
  for (const [k, v] of Object.entries(derived)) {
    if (!merged.color[k]) merged.color[k] = { $type: 'color', $value: v, $description: 'derived' };
  }

  const vars = toCssVars(merged, ['color', 'font', 'size', 'space', 'leading', 'tracking']);
  const layoutVariant = perGroup.meta?.layoutVariant || c.meta?.layoutVariant || 'a';

  return {
    group: Number(group),
    family: merged.meta.family,
    familyName: merged.meta.name,
    vars,
    fontVariation: merged.fontVariation || {},
    annotation: merged.annotation || {},
    texture: merged.texture || {},
    meta: merged.meta,
    client: {
      id: c.meta.id,
      name: c.meta.name,
      initials: c.meta.initials,
      seed: c.meta.seed ?? 1,
      layoutVariant,
      compliance: c.compliance || {},
    },
    contrastReport: {
      'ink/paper': +contrast(ink, paper).toFixed(2),
      'accent-ink/paper': +contrast(merged.color['accent-ink'].$value, paper).toFixed(2),
      'on-accent/accent': +contrast(merged.color['on-accent'].$value, accent).toFixed(2),
      'ink-soft/paper': col('ink-soft') ? +contrast(col('ink-soft'), paper).toFixed(2) : null,
    },
    files: { group: groupFile, client: clientFile },
  };
}
