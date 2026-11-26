#!/usr/bin/env node
// QA gate for the style library. Run after rendering; exits 1 if anything blocks export.
//   node tools/qa-gate.mjs [--strict] [--json out/qa-gate.json]
//
// Checks (what fails, what warns, what is a client TODO):
//   1. In-page QA from every library manifest: safe zone, minimum text size, WCAG contrast on the
//      real pixels, overlap/overflow/fit, compliance slot present, AI-look lint, copy lint.
//   2. Maths: tools/gate_checks.py recomputes every calc audit independently.
//   3. Glyph coverage: every character exists in the font that set it (fontTools).
//   4. Palette: purple + teal AI-palette tell.
//   5. Roster: clients in the same city never share a style; same metro only on another variant.
//   6. Near-duplicates across clients: tools/neardup.py (dHash + pHash, mirror/invert aware).
//   7. Compliance: empty brokerage / licence fields are TODO (FAIL with --strict); never invented.
//   8. Rate premises past their reviewBy date: FAIL.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv.includes('--out') ? path.resolve(process.argv[process.argv.indexOf('--out') + 1]) : path.join(ROOT, 'out');
const strict = process.argv.includes('--strict');
const jsonOut = process.argv.includes('--json') ? path.resolve(process.argv[process.argv.indexOf('--json') + 1]) : path.join(OUT, 'qa-gate.json');
const today = new Date().toISOString().slice(0, 10);

function py(candidates, mod) {
  for (const c of candidates.filter(Boolean)) {
    if (!fs.existsSync(c) && c.includes('/')) continue;
    const r = spawnSync(c, ['-c', `import ${mod}`], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  return null;
}
const VENVS = [path.join(ROOT, '.venv', 'bin', 'python'), path.resolve(ROOT, '..', '..', '.venv', 'bin', 'python')];
const PY_FT = py([process.env.STATICS_PYTHON, ...VENVS, 'python3'], 'fontTools, PIL');
const PY_ND = py([process.env.STATICS_PYTHON, ...VENVS, 'python3'], 'PIL, numpy');

const manifests = [];
for (const post of fs.readdirSync(OUT)) {
  const pdir = path.join(OUT, post);
  if (!fs.statSync(pdir).isDirectory()) continue;
  for (const client of fs.readdirSync(pdir)) {
    const f = path.join(pdir, client, 'manifest.json');
    if (fs.existsSync(f)) manifests.push({ rel: `${post}/${client}`, ...JSON.parse(fs.readFileSync(f, 'utf8')) });
  }
}
const lib = manifests.filter((m) => m.engine === 'library');
const report = { date: today, strict, renders: [], fails: [], warns: [], todos: [], math: [], glyphs: [], palette: [], roster: [], neardup: null };
const fail = (kind, where, detail) => report.fails.push({ kind, where, detail });
const warn = (kind, where, detail) => report.warns.push({ kind, where, detail });
const todo = (kind, where, detail) => report.todos.push({ kind, where, detail });

// 1, 7, 8: per-render in-page results.
for (const m of lib) {
  const issues = m.slides.flatMap((s) => (s.issues || []).map((x) => ({ ...x, slide: s.n })));
  const row = {
    render: m.rel, style: m.style, format: m.format, client: m.client, slides: m.slides.length,
    minContrast: Math.min(...m.slides.map((s) => s.minContrast)),
    minBodyPx: Math.min(...m.slides.map((s) => s.minBodyPx)),
    minFinePx: Math.min(...m.slides.map((s) => s.minFinePx ?? 99)),
    maxWords: Math.max(...m.slides.map((s) => s.words)),
    fail: 0, warn: 0, todo: 0,
  };
  for (const x of issues) {
    const sev = x.sev || 'fail';
    const where = `${m.rel}#${x.slide}`;
    const detail = x.text || x.match || x.slot || '';
    if (sev === 'fail') { row.fail++; fail(x.kind, where, detail); }
    else if (sev === 'warn') { row.warn++; warn(x.kind, where, detail); }
    else if (sev === 'todo') {
      row.todo++;
      if (strict && x.kind === 'compliance-placeholder') { row.fail++; fail('compliance-empty (--strict)', where, detail); }
    }
  }
  const text = m.slides.map((s) => s.text || '').join(' ');
  if (/\[[^\]]*(confirm|brokerage|licen|TBD)[^\]]*\]/i.test(text)) { row.todo++; todo('copy-placeholder', m.rel, text.match(/\[[^\]]*\]/)[0]); }
  if (m.compliance?.placeholder) todo('compliance-fields', m.client, `missing: ${m.compliance.missing.join(', ')}`);
  if (m.slides.some((s) => (s.issues || []).some((x) => x.kind === 'photo-placeholder'))) todo('client-photo', m.client, m.style);
  if (m.reviewBy && m.reviewBy < today) fail('rate-premise-expired', m.rel, `reviewBy ${m.reviewBy}`);
  report.renders.push(row);
}

// 2–4: Python checks.
if (PY_FT) {
  const r = spawnSync(PY_FT, [path.join(ROOT, 'tools', 'gate_checks.py'), ROOT, OUT], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) fail('gate-checks-crashed', 'tools/gate_checks.py', r.stderr.slice(0, 300));
  else {
    const g = JSON.parse(r.stdout);
    report.checked = g.checked;
    report.math = g.math; report.glyphs = g.glyphs; report.palette = g.palette;
    g.math.forEach((e) => fail('math', `${e.render}#${e.slide}`, e.error));
    g.glyphs.forEach((e) => (e.error ? warn('glyph-check', e.render, e.error) : fail('glyph-fallback', `${e.render}#${e.slide}`, `${e.family} lacks "${e.missing}"`)));
    g.palette.forEach((e) => warn('ai-purple-teal', `${e.render}#${e.slide}`, ''));
  }
} else warn('gate-checks-skipped', 'python', 'no Python with fontTools + Pillow');

// 5: roster rules.
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'library', 'roster.json'), 'utf8'));
const cl = Object.entries(roster.clients).filter(([, c]) => c.primary);
for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) {
  const [ia, a] = cl[i], [ib, b] = cl[j];
  const shared = [a.primary, a.secondary].filter((s) => [b.primary, b.secondary].includes(s));
  if (!shared.length) continue;
  if (a.city && a.city === b.city) { report.roster.push({ a: ia, b: ib, shared, rule: 'same city' }); fail('roster-same-city', `${ia} / ${ib}`, shared.join(', ')); }
  else if (a.metro && a.metro === b.metro && a.variant === b.variant) { report.roster.push({ a: ia, b: ib, shared, rule: 'same metro, same variant' }); warn('roster-same-metro', `${ia} / ${ib}`, shared.join(', ')); }
}
for (const [g, v] of Object.entries(roster.groups)) for (const s of v.styles) {
  if (!fs.existsSync(path.join(ROOT, 'library', s, 'style.json'))) warn('roster-style-not-built', `group ${g}`, s);
}

// 6: near-duplicates.
if (PY_ND) {
  const r = spawnSync(PY_ND, [path.join(ROOT, 'tools', 'neardup.py'), OUT, '--json', path.join(OUT, 'neardup.json')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  report.neardup = { exit: r.status, summary: r.stdout.trim().split('\n').filter((l) => !/^\s{4}/.test(l)).join('\n') };
  if (r.status !== 0) {
    const nd = JSON.parse(fs.readFileSync(path.join(OUT, 'neardup.json'), 'utf8'));
    nd.fails.forEach((p) => fail('near-duplicate', `${p.a} ~ ${p.b}`, `dH ${p.dhash} pH ${p.phash}`));
  }
} else warn('neardup-skipped', 'python', 'no Python with Pillow + numpy');

// Print.
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log(`QA gate · ${today} · ${lib.length} library renders, ${lib.reduce((n, m) => n + m.slides.length, 0)} slides${strict ? ' · --strict' : ''}`);
console.log(`${pad('render', 58)} ${pad('slides', 6)} ${pad('minCR', 6)} ${pad('minPx', 6)} ${pad('words', 5)} fail warn todo`);
for (const r of report.renders.sort((a, b) => a.render.localeCompare(b.render))) {
  console.log(`${pad(r.render, 58)} ${pad(r.slides, 6)} ${pad(r.minContrast.toFixed(2), 6)} ${pad(r.minBodyPx, 6)} ${pad(r.maxWords, 5)} ${pad(r.fail, 4)} ${pad(r.warn, 4)} ${r.todo}`);
}
if (report.checked) console.log(`Maths: ${report.checked.audits} calc audits recomputed, ${report.math.length} mismatches. Glyphs: ${report.checked.runs} text runs checked, ${report.glyphs.filter((g) => !g.error).length} with missing glyphs. Palette: ${report.checked.jpgs} JPEGs, ${report.palette.length} purple/teal.`);
console.log(`Roster: ${cl.length} assigned clients, ${report.roster.filter((r) => r.rule === 'same city').length} same-city clashes, ${report.roster.filter((r) => r.rule !== 'same city').length} same-metro same-variant overlaps.`);
if (report.neardup) console.log(`Near-dup:\n  ${report.neardup.summary.replace(/\n/g, '\n  ')}`);
const byKind = (list) => Object.entries(list.reduce((o, x) => ((o[x.kind] = (o[x.kind] || 0) + 1), o), {})).map(([k, n]) => `${k} ×${n}`).join(', ');
console.log(`\nFAIL ${report.fails.length}${report.fails.length ? `: ${byKind(report.fails)}` : ''}`);
report.fails.slice(0, 25).forEach((f) => console.log(`  ✗ ${f.kind}  ${f.where}  ${f.detail}`));
console.log(`WARN ${report.warns.length}${report.warns.length ? `: ${byKind(report.warns)}` : ''}`);
report.warns.slice(0, 25).forEach((f) => console.log(`  ! ${f.kind}  ${f.where}  ${f.detail}`));
const uniqTodo = [...new Map(report.todos.map((t) => [`${t.kind}|${t.where}`, t])).values()];
console.log(`TODO (client assets, never invented) ${uniqTodo.length}: ${byKind(uniqTodo)}`);
fs.writeFileSync(jsonOut, JSON.stringify(report, null, 1));
console.log(report.fails.length ? `\nGATE: FAIL (${path.relative(process.cwd(), jsonOut)})` : `\nGATE: PASS (${path.relative(process.cwd(), jsonOut)})`);
process.exit(report.fails.length ? 1 : 0);
