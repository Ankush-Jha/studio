#!/usr/bin/env node
// Motion renderer CLI.
//
//   node render.mjs templates/<t> --data <motion.json> --client <slug> [--out <file>.mp4]
//
// Options
//   --group N        render in another group family (default: the client's roster group)
//   --strict         refuse to export when compliance fields or the APR are placeholders
//   --quality q      draft (fast, no motion blur) | final (default: 4-sample motion blur)
//   --mb N           motion-blur samples per frame (overrides --quality); 1 = off
//   --scale N        supersample: render at N x and downscale with lanczos (default 1)
//   --workers N      parallel capture pages (default 5)
//   --gif            also write <out>.gif (loops forever) for the "GIF" format
//   --gif-width W    GIF width in px (default 540)   --gif-fps F (default 15)
//   --loops N        repeat the loop N times in the MP4 (GIF-format posts, short loops)
//   --audio FILE     a finished, pre-mixed soundtrack (replaces the SFX bus), -14 LUFS
//   --voice FILE     voice-over; SFX and music sit under it
//   --music FILE     licensed music bed (Meta Sound Collection or licensed), ducked under voice
//   --silent         no SFX (silent AAC track)
//   --alpha          also write <out>.alpha.mov (ProRes 4444, transparent background)
//   --guides         draw the safe zone into the frames (review renders only)
//   --keep           keep the lossless intermediate segments in .work/
//   --engine films  capture + mux with Studio Films' core/render tools (engines/films) (video.mjs, readcheck.mjs, mux.sh),
//                    then the Instagram pass (no motion blur, GIF or alpha on this engine)
//   --no-strip       skip frame extraction + strip sheet
//
// Every number comes from the data file's `calc` block (lib/calc.mjs); `expect` lines
// copied from the idea's checked math must match or the render stops.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { ROOT, OUT, WORK } from './lib/paths.mjs';
import { resolveClient } from './lib/tokens.mjs';
import { loadData, applyOverrides, substitute } from './lib/data.mjs';
import { runCalc, checkExpect } from './lib/calc.mjs';
import { buildPage, complianceLine } from './lib/page.mjs';
import { launch, openPage, grab, captureSegments } from './lib/capture.mjs';
import { encodeMP4, encodeGIF, encodeAlpha, pngToJpeg, extractFrames, probe, deliveryCheck, normaliseAudio } from './lib/encode.mjs';
import { frameStrip } from './lib/sheet.mjs';
import { buildSoundtrack } from './lib/sfx.mjs';
import { renderFilms } from './lib/films.mjs';
import { missingFields } from './lib/statics.mjs';

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const key = k.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) a[key] = true;
      else { a[key] = next; i++; }
    } else a._.push(k);
  }
  return a;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function psnr(a, b) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = (r.stderr || '').match(/average:(inf|[\d.]+)/);
  return m ? (m[1] === 'inf' ? Infinity : +m[1]) : null;
}

export async function render(tplArg, opts) {
  const t0 = Date.now();
  const tplDir = path.resolve(tplArg);
  const tplMod = path.join(tplDir, 'template.mjs');
  if (!fs.existsSync(tplMod)) throw new Error(`No template at ${tplDir} (expected template.mjs)`);
  const tpl = await import(pathToFileURL(tplMod).href);
  const meta = tpl.meta;
  if (!opts.data) throw new Error('--data <motion.json> is required');
  if (!opts.client) throw new Error('--client <slug> is required');

  const raw = loadData(path.resolve(opts.data));
  const tokens = resolveClient(opts.client, { group: opts.group, dataGroup: raw.group });
  const data = applyOverrides(raw, { client: tokens.client.id, group: tokens.group });
  if (!data[meta.block]) throw new Error(`Data file has no "${meta.block}" block for template ${meta.id}`);

  // Numbers.
  const { values, audit } = runCalc(data.calc);
  const expectProblems = checkExpect(values, data.expect);
  if (expectProblems.length) throw new Error(`Math check failed:\n  ${expectProblems.join('\n  ')}`);
  const ctx = { values, client: { name: tokens.client.name, city: tokens.client.city, province: tokens.client.province }, asOf: data.asOf, inputs: data.calc?.inputs };
  const missing = new Set();
  const block = substitute(data[meta.block], ctx, missing);
  if (missing.size) throw new Error(`Unresolved references in "${meta.block}": ${[...missing].join(', ')}`);

  // Compliance + APR (O. Reg. 188/08 s.6; O. Reg. 191/08 s.18 when a rate is shown).
  const compMissing = missingFields(tokens.client.compliance).map((m) => m.label);
  const aprNeeded = /\{apr\}/.test(data.assumptions || '');
  const aprMissing = aprNeeded && !String(data.apr || '').trim();
  let fine = data.assumptions ? substitute(data.assumptions, ctx, missing) : '';
  fine = esc(fine).replace('{apr}', aprMissing ? '<span class="ph">APR to be confirmed</span>' : esc(data.apr));
  const placeholders = [...compMissing, ...(aprMissing ? ['APR'] : [])];
  if (placeholders.length) {
    const msg = `Placeholders for ${tokens.client.id}: ${placeholders.join(', ')}`;
    if (opts.strict) { const e = new Error(`${msg}. --strict: refusing to export. Fill the client record from the licence record (never invent).`); e.code = 'STRICT'; throw e; }
    console.warn(`! ${msg}. Rendering visible placeholders (export blocked under --strict).`);
  }
  if (tokens.source !== 'statics') console.warn(`! Client brand layer from ${tokens.source}${tokens.source === 'synthesized' ? ' (provisional accent, no brand file on file)' : ` (${path.relative(ROOT, tokens.files.client)})`}.`);

  const width = meta.width, height = meta.height, fps = meta.fps || 30;
  const quality = opts.quality || 'final';
  const blur = Math.max(1, Number(opts.mb || (quality === 'draft' ? 1 : (meta.motionBlur ?? 4))));
  const scale = Math.max(1, Number(opts.scale || 1));
  const workers = Math.max(1, Number(opts.workers || Math.min(5, Math.max(1, os.cpus().length - 3))));

  const model = {
    id: data.id, template: meta.id, width, height, fps, safe: meta.safe,
    seed: `${tokens.client.seed}:${data.id}:${meta.id}`,
    style: tokens.style, family: tokens.family, group: tokens.group,
    client: { id: tokens.client.id, name: tokens.client.name, initials: tokens.client.initials, city: tokens.client.city, province: tokens.client.province, variant: tokens.client.layoutVariant },
    complianceHTML: complianceLine(tokens.client.compliance),
    fine, series: substitute(data.series || '', ctx), tag: substitute(data.tag || '', ctx), asOf: data.asOf,
    block, values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { shown: v.shown, text: v.text, exact: v.exact }])),
    scripts: (tpl.scripts || []).map((p) => path.resolve(ROOT, p)),
  };
  if (tpl.prepare) Object.assign(model, await tpl.prepare({ model, data, tokens, values }));

  // Output paths.
  const outFile = path.resolve(opts.out || path.join(OUT, data.id, tokens.client.id, `${meta.id}.mp4`));
  const base = outFile.replace(/\.mp4$/i, '');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const job = `${data.id}-${tokens.client.id}-${meta.id}-${crypto.randomBytes(3).toString('hex')}`;
  const workDir = path.join(WORK, job);
  fs.mkdirSync(workDir, { recursive: true });
  const htmlPath = path.join(workDir, 'page.html');
  fs.writeFileSync(htmlPath, buildPage({ tplDir, tokens, model, width, height, guides: !!opts.guides, alpha: false }));

  console.log(`▸ ${meta.id} · ${data.id} · ${tokens.client.name} (${tokens.client.id}) · group ${tokens.group} ${tokens.familyName} · layout ${tokens.client.layoutVariant}`);
  const browser = await launch(meta.chromeFlags || []);
  try {
    // 1. Build + QA pass.
    const qaPage = await openPage(browser, htmlPath, { width, height, scale: 1 });
    const info = qaPage.info;
    const duration = Math.round(info.duration * fps) / fps;
    const frames = Math.round(duration * fps);
    const warnings = [...(info.warnings || [])];
    if (meta.duration && (duration < meta.duration.min - 0.01 || duration > meta.duration.max + 0.01)) warnings.push(`duration ${duration.toFixed(2)} s is outside ${meta.duration.min}–${meta.duration.max} s for ${meta.id}`);
    const keyQA = [];
    for (const k of info.keyframes) {
      await qaPage.page.evaluate((tt) => window.__seek(tt), k.t);
      const q = await qaPage.page.evaluate(() => window.__qa());
      keyQA.push({ ...k, issues: q.issues, minContrast: Math.min(...q.runs.map((r) => r.contrast ?? 99)), minSize: Math.min(...q.runs.map((r) => r.size)), runs: q.runs.length });
    }
    const holds = info.holds.map((h) => ({ ...h, secondsPerWord: h.words ? +((h.end - h.start) / h.words).toFixed(2) : null }));
    for (const h of holds) {
      if (h.secondsPerWord != null && h.secondsPerWord < 0.25) warnings.push(`READ: "${h.name}" holds ${h.secondsPerWord} s/word (< 0.25 minimum)`);
      else if (h.secondsPerWord != null && h.secondsPerWord < 0.34) warnings.push(`read: "${h.name}" ${h.secondsPerWord} s/word (PLAYBOOK: 3 words/s at most)`);
    }
    // Seam: last frame vs first frame (loop joins without a jump).
    const a = path.join(workDir, 'seam_first.png'), b = path.join(workDir, 'seam_last.png');
    fs.writeFileSync(a, await grab(qaPage, 0, { fast: false }));
    fs.writeFileSync(b, await grab(qaPage, (frames - 1) / fps, { fast: false }));
    const seamPSNR = psnr(a, b);
    if (meta.loop && !(seamPSNR === Infinity || seamPSNR > 45)) warnings.push(`loop seam: last frame differs from frame 1 (PSNR ${seamPSNR})`);
    // Determinism: the same frames rendered in a different order must be byte-identical.
    const probeT = [0.37, duration * 0.31, duration * 0.58, duration * 0.83].map((t) => Math.round(t * fps) / fps);
    // Byte-identical is the goal; Chromium's compositor can differ by ~1 level on a few
    // edge pixels depending on history, which is invisible (and gone after H.264).
    // Gate: identical, or PSNR >= 60 dB for every probe frame.
    const fwd = []; for (const t of probeT) fwd.push(await grab(qaPage, t, { fast: false }));
    const rev = []; for (const t of [...probeT].reverse()) rev.unshift(await grab(qaPage, t, { fast: false }));
    const detPSNR = fwd.map((buf, i) => {
      if (buf.equals(rev[i])) return Infinity;
      const fa = path.join(workDir, `det_a${i}.png`), fb = path.join(workDir, `det_b${i}.png`);
      fs.writeFileSync(fa, buf); fs.writeFileSync(fb, rev[i]);
      return psnr(fa, fb);
    });
    const minDet = Math.min(...detPSNR);
    const deterministic = minDet === Infinity ? 'byte-identical' : minDet >= 60 ? `visually identical (min PSNR ${minDet.toFixed(1)} dB)` : false;
    if (!deterministic) warnings.push(`determinism: out-of-order frames differ (min PSNR ${minDet.toFixed(1)} dB)`);
    // Poster (cover): the template's poster time, full quality PNG -> JPEG.
    const posterPng = path.join(workDir, 'poster.png');
    fs.writeFileSync(posterPng, await grab(qaPage, info.poster || 0, { fast: false }));
    await qaPage.context.close();
    const issues = keyQA.flatMap((k) => k.issues.map((i) => ({ at: k.name, ...i })));
    for (const i of issues) console.warn(`  ! QA ${i.at}: ${i.kind}${i.text ? ` "${i.text}"` : ''}${i.contrast ? ` ${i.contrast}:1` : ''}`);
    for (const w of warnings) console.warn(`  ! ${w}`);
    if (opts.strict && issues.length) { const e = new Error(`--strict: ${issues.length} QA issue(s)`); e.code = 'STRICT'; throw e; }

    // 2-3. Soundtrack, then capture + encode with our engine or Studio Films' tools.
    // Soundtrack: a pre-mixed --audio file wins; otherwise the template's SFX cues plus
    // optional --voice and --music (licensed bed, ducked under the voice), at -14 LUFS.
    const loops = Math.max(1, Number(opts.loops || 1));
    let audio = null, audioMethod = null, audioInfo = 'silent AAC track';
    if (opts.audio) { const n = normaliseAudio(path.resolve(opts.audio), workDir); audio = n.file; audioMethod = n.method; audioInfo = { src: opts.audio, normalised: audioMethod }; }
    else if (!opts.silent) {
      const st = buildSoundtrack({ cues: info.cues || [], duration, loops, voice: opts.voice ? path.resolve(opts.voice) : null, music: opts.music ? path.resolve(opts.music) : null, workDir });
      if (st) { audio = st.file; audioMethod = st.method; audioInfo = { sfxCues: st.cues, buses: st.buses, voice: opts.voice || null, music: opts.music || 'none (bed slot: --music <licensed file>)', normalised: st.method }; }
    }
    const engine = opts.engine === 'films' ? 'films' : 'motion';
    let filmsInfo = null;
    const outputs = { mp4: outFile };
    if (engine === 'films') {
      const te = Date.now();
      process.stdout.write(`  Studio Films: video.mjs + readcheck + mux.sh (${workers} workers)… `);
      filmsInfo = renderFilms({ html: fs.readFileSync(htmlPath, 'utf8'), filmDir: path.join(workDir, 'film'), fps, workers, width, height, duration, audio, out: outFile });
      console.log(`${((Date.now() - te) / 1000).toFixed(1)} s`);
      if (filmsInfo.readcheck && !filmsInfo.readcheck.ok) warnings.push(`films readcheck: ${filmsInfo.readcheck.report}`);
      pngToJpeg(posterPng, `${base}.poster.jpg`); outputs.poster = `${base}.poster.jpg`;
    } else {
      // 2. Capture.
      const times = [];
      for (let f = 0; f < frames; f++) for (let k = 0; k < blur; k++) times.push((f + (k * 0.5) / blur) / fps);
      process.stdout.write(`  capturing ${frames} frames${blur > 1 ? ` × ${blur} samples` : ''} with ${workers} workers… `);
      const tc = Date.now();
      const { list } = await captureSegments(browser, htmlPath, { width, height, scale, alpha: false, times, fps: fps * blur, workers, workDir });
      console.log(`${((Date.now() - tc) / 1000).toFixed(1)} s`);

      const te = Date.now();
      encodeMP4({ list, out: outFile, fps, duration, loops, blur, scale, width, height, audio, workDir,
        meta: { title: `${data.title || data.id} · ${tokens.client.name}`, comment: `studio-motion ${meta.id}; data ${data.id}; client ${tokens.client.id}; illustrative` } });
      pngToJpeg(posterPng, `${base}.poster.jpg`); outputs.poster = `${base}.poster.jpg`;
      if (opts.gif) outputs.gif = encodeGIF({ list, out: `${base}.gif`, fps, gifFps: Number(opts['gif-fps'] || 15), gifWidth: Number(opts['gif-width'] || 540), blur, scale, width, height, duration });
      if (opts.alpha) {
        // Re-capture with a transparent background for compositing over footage.
        const aHtml = path.join(workDir, 'page_alpha.html');
        fs.writeFileSync(aHtml, buildPage({ tplDir, tokens, model, width, height, alpha: true }));
        const aDir = path.join(workDir, 'alpha'); fs.mkdirSync(aDir);
        const segA = await captureSegments(browser, aHtml, { width, height, scale, alpha: true, times, fps: fps * blur, workers, workDir: aDir });
        outputs.alpha = encodeAlpha({ list: segA.list, out: `${base}.alpha.mov`, fps, duration, blur, scale, width, height });
      }
      console.log(`  encoded in ${((Date.now() - te) / 1000).toFixed(1)} s`);
    }

    // 4. Verify the delivered file.
    const p = probe(outFile);
    const delivery = deliveryCheck(p, { fps, width, height });
    if (delivery.length) console.warn(`  ! delivery: ${delivery.join('; ')}`);

    // 5. Frames from the final MP4 at every settled keyframe + strip sheet.
    let strip = null, frameFiles = [];
    if (!opts['no-strip']) {
      const ktimes = info.keyframes.map((k) => ({ t: Math.min(k.t, duration - 2 / fps), label: `${k.t.toFixed(2)} s · ${k.name}` }));
      fs.rmSync(`${base}_frames`, { recursive: true, force: true });
      frameFiles = extractFrames(outFile, ktimes.map((k) => k.t), `${base}_frames`, meta.id).map((f, i) => ({ ...f, label: ktimes[i].label }));
      strip = await frameStrip(browser, { frames: frameFiles, out: `${base}.strip.jpg`, title: `${meta.id} · ${data.id} · ${tokens.client.name}`, subtitle: `group ${tokens.group} ${tokens.familyName} · ${duration.toFixed(2)} s · frames extracted from the delivered MP4`, width, height, safe: meta.safe, cols: Math.min(6, frameFiles.length) });
      outputs.strip = strip; outputs.frames = `${base}_frames`;
    }

    const manifest = {
      template: meta.id, data: path.relative(ROOT, path.resolve(opts.data)), id: data.id, title: data.title, idea: data.idea || null,
      renderedAt: new Date().toISOString(),
      client: { ...model.client, tokenSource: tokens.source, files: Object.fromEntries(Object.entries(tokens.files).map(([k, v]) => [k, v ? path.relative(ROOT, v) : null])) },
      group: tokens.group, family: tokens.family, contrast: tokens.contrast,
      compliance: { placeholders, strict: !!opts.strict },
      engine: filmsInfo ? { name: 'Studio Films', ...filmsInfo } : 'motion',
      format: { width, height, fps, duration, frames, loops, motionBlurSamples: filmsInfo ? 1 : blur, supersample: scale, audio: audioInfo },
      cues: info.cues || [],
      math: { kind: data.calc?.kind || null, inputs: data.calc?.inputs || null, audit, expect: (data.expect || []).map((e) => ({ ...e, ok: true })) },
      reading: holds, keyframes: keyQA, qaIssues: issues, warnings,
      loopSeamPSNR: seamPSNR === Infinity ? 'identical' : seamPSNR, deterministic,
      ffprobe: p, delivery: delivery.length ? delivery : 'pass',
      outputs: Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, path.relative(ROOT, v)])),
      timings: { totalSeconds: +((Date.now() - t0) / 1000).toFixed(1) },
    };
    fs.writeFileSync(`${base}.manifest.json`, JSON.stringify(manifest, null, 2));
    if (!opts.keep) fs.rmSync(workDir, { recursive: true, force: true });
    console.log(`✓ ${path.relative(process.cwd(), outFile)}  ${duration.toFixed(2)} s · ${p.video.codec} ${p.video.profile} ${p.video.pix_fmt} ${p.video.color_space}/${p.video.color_range} ${p.video.fps} · ${p.audio?.codec} ${p.audio?.bitrate_kbps}k · ${p.bitrate_mbps} Mbps · seam ${manifest.loopSeamPSNR} · ${issues.length} QA issue(s) · ${manifest.timings.totalSeconds} s`);
    return manifest;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._[0] || args.help) {
    console.error('Usage: node render.mjs templates/<t> --data <motion.json> --client <slug> [--out file.mp4] [--group N] [--strict] [--quality draft|final] [--gif] [--loops N] [--audio f] [--alpha] [--guides]');
    process.exit(64);
  }
  render(args._[0], args).catch((e) => { console.error(`✗ ${e.message}`); process.exit(e.code === 'STRICT' ? 2 : 1); });
}
