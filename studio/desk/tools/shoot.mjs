// Screenshot every Desk screen at desktop + phone, dark + light. Usage: node tools/shoot.mjs <outDir> [filter]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = createRequire(new URL('../../lib/package.json', import.meta.url))('playwright-core');
const OUT = process.argv[2] || 'shots'; const FILTER = process.argv[3] || '';
fs.mkdirSync(OUT, { recursive: true });
const REAL = 'http://127.0.0.1:4747/';
const SAMPLE = process.env.SAMPLE_BASE || 'http://127.0.0.1:4748/';
let state = await (await fetch(REAL + 'api/state')).json();
let GB = REAL;
if (!state.jobs.some((j) => j.status === 'gate1') || !state.jobs.some((j) => j.status === 'gate2')) { try { state = await (await fetch(SAMPLE + 'api/state')).json(); GB = SAMPLE; } catch { /* no sample server */ } }
const g1 = state.jobs.find((j) => j.status === 'gate1')?.id;
const g2v = state.jobs.find((j) => j.status === 'gate2' && j.outputs.some((o) => o.kind === 'video'))?.id;
const g2c = state.jobs.find((j) => j.status === 'gate2' && j.outputs.some((o) => o.kind === 'carousel'))?.id;
const prod = state.jobs.find((j) => j.status === 'producing')?.id;
const kit = state.kits.items.find((k) => k.slug === 'northline-mortgages')?.slug || state.kits.items[0]?.slug;
const shots = [
  ['flow', '#/flow'],
  ['flow-job', `#/flow/${g2v || prod}`, async (p) => { await p.locator('.node[data-id="director"]').click({ force: true }).catch(() => {}); await p.waitForTimeout(900); }, GB],
  ['flow-gate', `#/flow/${g1}`, null, GB],
  ['xx-unused', '#/flow', async (p) => { await p.locator('.node[data-id="director"]').click({ force: true }).catch(() => {}); await p.waitForTimeout(900); }],
  ['radar', '#/radar'],
  ['radar-detail', '#/radar', async (p) => { await p.locator('.post').first().click(); await p.waitForTimeout(700); }],
  ['clients', '#/clients'],
  ['client-detail', `#/clients/${kit}`],
  ['library', '#/library'],
  ['gate1', `#/job/${g1}`, null, GB],
  ['gate2-video', `#/job/${g2v}`, async (p) => { await p.locator('button.chip', { hasText: 'IG safe zones' }).click(); await p.waitForTimeout(300); }, GB],
  ['gate2-carousel', `#/job/${g2c}`, async (p) => { await p.locator('button.chip', { hasText: 'Grid crop' }).click(); await p.waitForTimeout(300); }, GB],
  ['batch', '#/batch', null, GB],
  ['gates', '#/gates', null, GB],
  // runner + radar additions
  ['newpiece', '#/flow', async (p) => { await p.keyboard.press('n'); await p.waitForTimeout(700); await p.locator('.np-client').nth(5).click().catch(() => {}); await p.locator('.np-sug').first().click().catch(() => {}); await p.waitForTimeout(700); }],
  ['runner', '#/flow', async (p) => { await p.locator('.top .rchip').first().click(); await p.waitForTimeout(900); }],
  ['live', `#/job/${process.env.LIVE_JOB || '_runner-test'}?tab=live`, async (p) => { await p.waitForTimeout(800); }],
  ['radar-patterns', '#/radar/patterns'],
  ['radar-clients', '#/radar/clients'],
  // quality scorecard
  ['scorecard', '#/scorecard'],
  ['scorecard-suite', '#/scorecard/creative', async (p) => { await p.locator('.sc-tr.fail, .sc-tr.warn').first().click().catch(() => {}); await p.waitForTimeout(400); }],
];
const browser = await chromium.launch();
const errors = [];
for (const theme of (process.env.THEMES || 'dark,light').split(',')) {
  for (const [vw, vh, tag] of [[1600, 1000, 'desktop'], [430, 932, 'phone']].filter((v) => (process.env.TAGS || 'desktop,phone').includes(v[2]))) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: tag === 'phone' ? 2 : 1 });
    await ctx.addInitScript((t) => { try { localStorage.setItem('desk-theme', t); } catch {} }, theme);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}/${theme}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}/${theme} pageerror: ${e.message}`));
    for (const [name, hash, act, base] of shots) {
      if (name.startsWith('xx') || (FILTER && !name.includes(FILTER))) continue;
      await page.goto((base || REAL) + hash, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1400);
      if (act) await act(page);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${name}-${tag}-${theme}.png` });
    }
    await ctx.close();
  }
}
await browser.close();
console.log('errors:', errors.length ? errors.join('\n') : 'none');
