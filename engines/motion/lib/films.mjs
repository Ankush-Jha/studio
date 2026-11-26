// --engine films: render a motion template with Studio Films' own render tools (engines/films/core/render).
//   core/render/video.mjs   frame capture (page served over HTTP, film mounted at /@film/)
//   core/render/readcheck.mjs  every on-screen text stays long enough to read
//   core/render/mux.sh      two-pass loudnorm -14 LUFS + limiter, LEMO_COLOR=bt709 (the films engine's variable name)
// then the Instagram pass here: AAC 128 kbps 48 kHz, H.264 High, BT.709 tags, +faststart
// (video stream copied when it already passes the delivery gate, re-encoded otherwise).
// Motion pages satisfy the Studio Films page contract (window.DUR / render(t) / READY / EV / TEXTS).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FONTS } from './paths.mjs';
import { probe, deliveryCheck } from './encode.mjs';

export const FILMS_DIR = process.env.STUDIO_FILMS || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'films');

function run(cmd, args, opts, label) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.status !== 0) throw new Error(`${label} failed (${r.status}):\n${(r.stderr || '').slice(-2000)}${(r.stdout || '').slice(-800)}`);
  return r;
}

export function filmsAvailable() {
  return fs.existsSync(path.join(FILMS_DIR, 'core', 'render', 'video.mjs'));
}

/* Make a film folder from a built motion page: fonts become /@film/fonts/... URLs. */
export function writeFilm(html, filmDir) {
  fs.mkdirSync(path.join(filmDir, 'fonts'), { recursive: true });
  fs.mkdirSync(path.join(filmDir, 'out'), { recursive: true });
  const used = new Set();
  const out = html.replace(/url\("file:\/\/[^"]*\/fonts\/([^"]+)"\)/g, (m, f) => { used.add(decodeURIComponent(f)); return `url("/@film/fonts/${f}")`; });
  for (const f of used) fs.copyFileSync(path.join(FONTS, f), path.join(filmDir, 'fonts', f));
  fs.writeFileSync(path.join(filmDir, 'index.html'), out);
  return filmDir;
}

export function renderFilms({ html, filmDir, fps, workers, width, height, duration, audio, out, readcheck = true }) {
  if (!filmsAvailable()) throw new Error(`Studio Films not found at ${FILMS_DIR} (set STUDIO_FILMS)`);
  writeFilm(html, filmDir);
  const env = { ...process.env, LEMO_COLOR: 'bt709' };
  const video = path.join(filmDir, 'out', 'video.mp4');
  run('node', ['core/render/video.mjs', filmDir, '--fps', String(fps), '--workers', String(workers), '--size', `${width}x${height}`, '--out', video], { cwd: FILMS_DIR, env }, 'films video.mjs');
  let read = null;
  if (readcheck) {
    const r = spawnSync('node', ['core/render/readcheck.mjs', filmDir, '--size', `${width}x${height}`], { cwd: FILMS_DIR, env, encoding: 'utf8' });
    read = { ok: r.status === 0, report: ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-6).join('\n') };
  }
  let wav = audio;
  if (!wav) {
    wav = path.join(filmDir, 'out', 'silence.wav');
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-t', duration.toFixed(3), wav], {}, 'silence');
  }
  const muxed = path.join(filmDir, 'out', 'film.mp4');
  const mx = run('sh', ['core/render/mux.sh', video, wav, muxed, String(fps), '0'], { cwd: FILMS_DIR, env }, 'films mux.sh');
  // Instagram pass.
  const base = ['-hide_banner', '-loglevel', 'error', '-y', '-i', muxed, '-t', duration.toFixed(4)];
  const audioArgs = ['-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart'];
  run('ffmpeg', [...base, '-c:v', 'copy', ...audioArgs, out], {}, 'ig audio pass');
  let p = probe(out), fails = deliveryCheck(p, { fps, width, height }), videoCopied = true;
  if (fails.length) {
    run('ffmpeg', [...base, '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv',
      '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.1', '-preset', 'slow', '-crf', '16', '-maxrate', '20M', '-bufsize', '40M', '-r', String(fps),
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', ...audioArgs, out], {}, 'ig video pass');
    videoCopied = false;
  }
  return { videoCopied, readcheck: read, mux: (mx.stdout || '').trim().split('\n').slice(-3).join(' | ') };
}
