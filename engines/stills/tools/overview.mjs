#!/usr/bin/env node
// Build out/overview.jpg from every rendered post under out/ (reads each manifest.json).
// Posts rendered with --group N (folders named <id>-gN) are shown together with the
// original as "same topic, four families".
//   node tools/overview.mjs [--out out/overview.jpg]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../render.mjs';
import { contactSheet } from '../lib/sheets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const outFile = process.argv.includes('--out') ? path.resolve(process.argv[process.argv.indexOf('--out') + 1]) : path.join(OUT, 'overview.jpg');

const manifests = [];
for (const post of fs.readdirSync(OUT)) {
  const pdir = path.join(OUT, post);
  if (!fs.statSync(pdir).isDirectory()) continue;
  for (const client of fs.readdirSync(pdir)) {
    const m = path.join(pdir, client, 'manifest.json');
    if (fs.existsSync(m)) manifests.push({ folder: post, ...JSON.parse(fs.readFileSync(m, 'utf8')) });
  }
}
const order = (m) => [m.slides.length > 1 ? 0 : 1, m.group, m.folder, m.client].join('|');
manifests.sort((a, b) => order(a).localeCompare(order(b)));

const sampler = manifests.filter((m) => /-g\d$/.test(m.folder));
const main = manifests.filter((m) => !/-g\d$/.test(m.folder));
const sections = [];
const singles = [];
for (const m of main) {
  const items = m.slides.map((s) => ({ src: path.join(ROOT, s.jpg), label: `${s.n} · ${s.type}` }));
  if (m.slides.length === 1) singles.push({ src: items[0].src, label: `${m.title.split(':')[0]} · G${m.group} ${m.family} · ${m.client}` });
  else sections.push({ heading: `${m.title}  —  Group ${m.group} · ${m.family} · ${m.client} · layout ${m.layoutVariant}`, items });
}
if (singles.length) sections.push({ heading: 'Single statics', items: singles });

const byBase = {};
for (const m of sampler) (byBase[m.id] ||= []).push(m);
for (const [id, list] of Object.entries(byBase)) {
  const base = main.find((m) => m.id === id && m.client === list[0].client);
  const all = [base, ...list].filter(Boolean).sort((a, b) => a.group - b.group);
  const nums = new Set(list.flatMap((m) => m.slides.map((s) => s.n)));
  const items = [];
  for (const n of [...nums].sort()) for (const m of all) {
    const s = m.slides.find((x) => x.n === n);
    if (s) items.push({ src: path.join(ROOT, s.jpg), label: `G${m.group} ${m.family} · ${n} ${s.type}` });
  }
  sections.push({ heading: `Same topic, four group families  —  “${all[0].title}” · ${list[0].client}`, items });
}

const browser = await launch();
await contactSheet(browser, {
  title: 'Static & carousel system — overview',
  subtitle: `Rendered ${new Date().toLocaleDateString('en-CA')} · 1080×1350 JPEG q92 from 2x masters · ${manifests.reduce((n, m) => n + m.slides.length, 0)} slides · placeholders shown where compliance fields are empty`,
  sections,
  out: outFile,
  thumb: 260,
});
await browser.close();
console.log(path.relative(process.cwd(), outFile));
