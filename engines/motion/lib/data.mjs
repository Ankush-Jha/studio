// Motion data files ("motion specs"): one idea, several formats.
//
//   { id, title, idea, asOf, series, tag, calc, expect, assumptions, apr,
//     kinetic: {...}, explainer: {...}, carousel: {...}, lottie: {...},
//     byGroup: { "2": {...} }, byClient: { "<slug>": {...} } }
//
// byGroup / byClient may appear on ANY object; they are merged in (group first, then
// client) and removed. Arrays replace wholesale, objects merge.
// Strings may reference computed values:
//   "{paymentNow}"  -> the formatted value ("$650")
//   "@paymentNow"   -> (whole string) the shown number (650), for count-ups and bars
//   "{client.city}" "{client.name}" "{asOf}" also work.
import fs from 'node:fs';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function merge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

export function applyOverrides(node, { client, group }) {
  if (Array.isArray(node)) return node.map((n) => applyOverrides(n, { client, group }));
  if (!isObj(node)) return node;
  let out = { ...node };
  const bg = out.byGroup?.[String(group)];
  const bc = out.byClient?.[client];
  delete out.byGroup; delete out.byClient;
  if (bg) out = merge(out, bg);
  if (bc) out = merge(out, bc);
  for (const k of Object.keys(out)) out[k] = applyOverrides(out[k], { client, group });
  return out;
}

export function substitute(node, ctx, missing = new Set()) {
  if (typeof node === 'string') {
    const whole = node.match(/^@([\w.]+)$/);
    if (whole) {
      const val = lookup(ctx, whole[1], 'shown');
      if (val === undefined) { missing.add(whole[1]); return node; }
      return val;
    }
    return node.replace(/\{([\w.]+)\}/g, (m, key) => {
      const val = lookup(ctx, key, 'text');
      if (val === undefined) { missing.add(key); return m; }
      return String(val);
    });
  }
  if (Array.isArray(node)) return node.map((n) => substitute(n, ctx, missing));
  if (isObj(node)) return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, substitute(v, ctx, missing)]));
  return node;
}

function lookup(ctx, key, field) {
  if (key.startsWith('client.')) return ctx.client?.[key.slice(7)];
  if (key === 'asOf') return ctx.asOf;
  if (key.startsWith('input.')) return ctx.inputs?.[key.slice(6)];
  const [name, sub] = key.split('.');
  const v = ctx.values?.[name];
  if (!v) return undefined;
  if (sub) return v[sub];
  return v[field];
}

export function loadData(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!raw.id || !/^[a-z0-9-]+$/.test(raw.id)) throw new Error(`${file}: needs an "id" of a-z, 0-9, -`);
  return raw;
}
