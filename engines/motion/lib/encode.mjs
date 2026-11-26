// ffmpeg stages. Delivery spec (PLAYBOOK "Delivery spec for finished files"):
//   H.264 High, yuv420p, BT.709 limited range with VUI tags, 30 fps CFR, AAC-LC 48 kHz
//   128 kbps stereo (a silent track when there is no audio), +faststart, < 25 Mbps.
// RGB -> YUV uses the BT.709 matrix explicitly (ffmpeg's default for RGB input is
// BT.601, which shifts colours on phones that honour the tags).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './paths.mjs';

function ff(args, label) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg ${label} failed: ${r.stderr}`);
  return r;
}

function preFilters({ blur, scale, width, height }) {
  const f = [];
  if (blur > 1) f.push(`tmix=frames=${blur}`, `framestep=${blur}`);
  if (scale > 1) f.push(`scale=${width}:${height}:flags=lanczos`);
  return f;
}

// Loudness: prefer ffmpeg-normalize (two-pass EBU R128): $FFMPEG_NORMALIZE, engines/motion/.venv, <repo>/.venv, PATH.
function findNormalize() {
  const c = [process.env.FFMPEG_NORMALIZE, path.join(ROOT, '.venv', 'bin', 'ffmpeg-normalize'), path.resolve(ROOT, '..', '..', '.venv', 'bin', 'ffmpeg-normalize')].filter(Boolean);
  for (const p of c) if (fs.existsSync(p)) return p;
  const r = spawnSync('ffmpeg-normalize', ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? 'ffmpeg-normalize' : null;
}
export function normaliseAudio(src, workDir, { target = -14, truePeak = -1.5 } = {}) {
  const out = path.join(workDir, 'audio_norm.wav');
  const fn = findNormalize();
  if (fn) {
    const r = spawnSync(fn, [src, '-nt', 'ebu', '-t', String(target), '-tp', String(truePeak), '-ar', '48000', '-c:a', 'pcm_s16le', '-f', '-o', out], { encoding: 'utf8' });
    if (r.status === 0 && fs.existsSync(out)) return { file: out, method: 'ffmpeg-normalize (EBU R128, two-pass)' };
  }
  ff(['-i', src, '-af', `loudnorm=I=${target}:TP=${truePeak}:LRA=11`, '-ar', '48000', '-c:a', 'pcm_s16le', out], 'loudnorm');
  return { file: out, method: 'ffmpeg loudnorm (single pass)' };
}

export function encodeMP4({ list, out, fps, duration, loops = 1, blur = 1, scale = 1, width, height, audio = null, workDir, crf = 16, meta = {} }) {
  let input = list;
  if (loops > 1) {
    const body = fs.readFileSync(list, 'utf8');
    input = path.join(workDir, 'segments_loop.txt');
    fs.writeFileSync(input, body.repeat(loops));
  }
  const total = duration * loops;
  const vf = [...preFilters({ blur, scale, width, height }),
    'scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int', 'format=yuv420p',
    'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv'].join(',');
  const args = ['-f', 'concat', '-safe', '0', '-r', String(fps * blur), '-i', input];
  if (audio) args.push('-i', audio);
  else args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  args.push(
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', vf,
    '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.1', '-preset', 'slow', '-crf', String(crf),
    '-maxrate', '20M', '-bufsize', '40M', '-g', String(fps * 2), '-keyint_min', String(fps), '-bf', '2',
    '-x264-params', 'aq-mode=3:aq-strength=0.8:deblock=-1,-1',
    '-r', String(fps), '-fps_mode', 'cfr',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
  );
  if (audio) args.push('-af', 'apad');
  args.push('-t', total.toFixed(4), '-movflags', '+faststart');
  for (const [k, v] of Object.entries(meta)) args.push('-metadata', `${k}=${v}`);
  args.push(out);
  ff(args, 'encode');
  return out;
}

// ProRes 4444 with alpha, for compositing graphics over client footage in an NLE or ffmpeg.
export function encodeAlpha({ list, out, fps, duration, blur = 1, scale = 1, width, height }) {
  const vf = [...preFilters({ blur, scale, width, height }), 'format=yuva444p10le'].join(',');
  ff(['-f', 'concat', '-safe', '0', '-r', String(fps * blur), '-i', list, '-vf', vf, '-c:v', 'prores_ks', '-profile:v', '4444', '-alpha_bits', '16',
    '-r', String(fps), '-t', duration.toFixed(4), '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', out], 'alpha');
  return out;
}

// GIF from the lossless master: two-pass palette, error-diffusion dither, loops forever.
export function encodeGIF({ list, out, fps, gifFps = 15, gifWidth = 540, blur = 1, scale = 1, width, height, duration }) {
  const pre = preFilters({ blur, scale, width, height });
  const chain = [...pre, `fps=${gifFps}`, `scale=${gifWidth}:-2:flags=lanczos`].join(',');
  ff(['-f', 'concat', '-safe', '0', '-r', String(fps * blur), '-i', list, '-t', duration.toFixed(4),
    '-filter_complex', `[0:v]${chain},split[a][b];[a]palettegen=max_colors=160:stats_mode=diff:reserve_transparent=0[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
    '-loop', '0', out], 'gif');
  return out;
}

export function pngToJpeg(src, out) {
  ff(['-i', src, '-frames:v', '1', '-q:v', '2', '-pix_fmt', 'yuvj444p', out], 'poster');
  return out;
}

// Extract frames from the FINAL file (what Instagram receives) at given times.
export function extractFrames(mp4, times, dir, prefix = 'f') {
  fs.mkdirSync(dir, { recursive: true });
  return times.map((t, i) => {
    const name = `${prefix}_${String(i).padStart(3, '0')}_${t.toFixed(2).replace('.', 'p')}s.png`;
    const file = path.join(dir, name);
    ff(['-ss', t.toFixed(4), '-i', mp4, '-frames:v', '1', '-update', '1', file], `frame ${t}`);
    // Seeking onto the very last frame can return nothing; take it from the end instead.
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) ff(['-sseof', '-0.25', '-i', mp4, '-update', '1', file], `frame ${t} (eof)`);
    return { t, file };
  });
}

export function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === 'video') || {};
  const a = j.streams.find((s) => s.codec_type === 'audio') || {};
  return {
    container: j.format.format_name,
    duration: +(+j.format.duration).toFixed(3),
    size_mb: +(j.format.size / 1048576).toFixed(2),
    bitrate_mbps: +(j.format.bit_rate / 1e6).toFixed(2),
    video: {
      codec: v.codec_name, profile: v.profile, level: v.level, pix_fmt: v.pix_fmt, width: v.width, height: v.height,
      fps: v.r_frame_rate, avg_fps: v.avg_frame_rate, frames: +v.nb_frames || null,
      color_range: v.color_range, color_space: v.color_space, color_transfer: v.color_transfer, color_primaries: v.color_primaries,
      bitrate_mbps: v.bit_rate ? +(v.bit_rate / 1e6).toFixed(2) : null,
    },
    audio: a.codec_name ? { codec: a.codec_name, profile: a.profile, sample_rate: +a.sample_rate, channels: a.channels, bitrate_kbps: a.bit_rate ? Math.round(a.bit_rate / 1000) : null } : null,
    faststart: moovFirst(file),
  };
}

// +faststart check: the 'moov' atom must come before 'mdat'.
function moovFirst(file) {
  const fd = fs.openSync(file, 'r');
  try {
    let pos = 0;
    const size = fs.fstatSync(fd).size;
    const hdr = Buffer.alloc(16);
    while (pos < size) {
      fs.readSync(fd, hdr, 0, 16, pos);
      let len = hdr.readUInt32BE(0);
      const type = hdr.toString('latin1', 4, 8);
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (len === 1) len = Number(hdr.readBigUInt64BE(8));
      if (len < 8) return null;
      pos += len;
    }
    return null;
  } finally { fs.closeSync(fd); }
}

// Delivery gate: what must be true before a file goes to the posting queue.
export function deliveryCheck(p, { fps, width, height }) {
  const v = p.video;
  const fails = [];
  const want = (cond, msg) => { if (!cond) fails.push(msg); };
  want(v.codec === 'h264', `codec ${v.codec} (want h264)`);
  want(v.profile === 'High', `profile ${v.profile} (want High)`);
  want(v.pix_fmt === 'yuv420p', `pix_fmt ${v.pix_fmt} (want yuv420p)`);
  want(v.color_space === 'bt709' && v.color_transfer === 'bt709' && v.color_primaries === 'bt709', `colour tags ${v.color_space}/${v.color_transfer}/${v.color_primaries} (want bt709)`);
  want(v.color_range === 'tv', `range ${v.color_range} (want tv/limited)`);
  want(v.fps === `${fps}/1`, `fps ${v.fps} (want ${fps}/1)`);
  want(v.width === width && v.height === height, `size ${v.width}x${v.height} (want ${width}x${height})`);
  want(p.audio && p.audio.codec === 'aac' && p.audio.sample_rate === 48000, `audio ${p.audio ? `${p.audio.codec} ${p.audio.sample_rate}` : 'missing'} (want aac 48k)`);
  want(p.audio && p.audio.bitrate_kbps && p.audio.bitrate_kbps <= 140, `audio bitrate ${p.audio?.bitrate_kbps} kbps (want 128)`);
  want(p.bitrate_mbps < 25, `bitrate ${p.bitrate_mbps} Mbps (want < 25)`);
  want(p.faststart === true, 'moov atom not at the front (+faststart)');
  return fails;
}
