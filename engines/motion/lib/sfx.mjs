// Sound design synthesised in code with ffmpeg (aevalsrc / anoisesrc + filters), so
// there is nothing to license. Templates register cues with MT.cue(t, name, gain); this
// module renders each sound once (cached), places every cue, optionally adds a voice
// track and a licensed music bed (ducked under the voice), and loudness-normalises the
// mix to -14 LUFS / -1.5 dBTP (PLAYBOOK sound spec).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './paths.mjs';
import { normaliseAudio } from './encode.mjs';

const SR = 48000;
const CACHE = path.join(ROOT, '.cache', 'sfx');

// Each recipe is an ffmpeg -filter_complex graph that ends in [out] (mono or stereo).
// Envelopes are written as volume expressions so every sound has a shaped attack/decay.
const RECIPES = {
  // Air moving past: two noise bands whose envelopes peak at different times = a sweep.
  whoosh: { d: 0.62, g: `anoisesrc=d=0.62:c=pink:r=${SR}:a=0.9:s=11,asplit[a][b];
    [a]lowpass=f=700,volume='if(lt(t,0.62),pow(sin(PI*min(t/0.42,1)),2),0)':eval=frame[l];
    [b]bandpass=f=2600:width_type=o:w=1.6,volume='if(lt(t,0.62),pow(sin(PI*min(max(t-0.12,0)/0.45,1)),3)*0.8,0)':eval=frame[h];
    [l][h]amix=inputs=2:normalize=0,afade=t=out:st=0.5:d=0.12[out]` },
  'whoosh-short': { d: 0.34, g: `anoisesrc=d=0.34:c=pink:r=${SR}:a=0.9:s=12,asplit[a][b];
    [a]lowpass=f=900,volume='pow(sin(PI*min(t/0.26,1)),2)':eval=frame[l];
    [b]bandpass=f=3200:width_type=o:w=1.4,volume='pow(sin(PI*min(max(t-0.06,0)/0.26,1)),3)*0.8':eval=frame[h];
    [l][h]amix=inputs=2:normalize=0,afade=t=out:st=0.27:d=0.07[out]` },
  swish: { d: 0.26, g: `anoisesrc=d=0.26:c=white:r=${SR}:a=0.7:s=13,highpass=f=2500,lowpass=f=9000,volume='pow(sin(PI*min(t/0.2,1)),2)':eval=frame,afade=t=out:st=0.2:d=0.06[out]` },
  tick: { d: 0.05, g: `aevalsrc='(0.8*sin(2*PI*3300*t)*exp(-t*170)+0.4*sin(2*PI*1650*t)*exp(-t*120))':s=${SR}:d=0.05[out]` },
  click: { d: 0.04, g: `anoisesrc=d=0.04:c=white:r=${SR}:a=0.9:s=14,highpass=f=1800,volume='exp(-t*190)':eval=frame[out]` },
  pop: { d: 0.16, g: `aevalsrc='sin(2*PI*(820*t-2600*t*t))*exp(-t*28)*min(t*400,1)':s=${SR}:d=0.16[out]` },
  thud: { d: 0.42, g: `aevalsrc='0.9*sin(2*PI*(105*t-80*t*t))*exp(-t*8)*min(t*300,1)':s=${SR}:d=0.42[s];
    anoisesrc=d=0.05:c=brown:r=${SR}:a=0.8:s=15,lowpass=f=1200,volume='exp(-t*70)':eval=frame,apad=whole_dur=0.42[n];
    [s][n]amix=inputs=2:normalize=0[out]` },
  // Register "ka" (mechanical burst) then a bright "ching" (bell partials with beating).
  cash: { d: 1.05, g: `anoisesrc=d=0.07:c=white:r=${SR}:a=0.9:s=16,bandpass=f=1900:width_type=o:w=2,volume='exp(-t*55)':eval=frame,apad=whole_dur=1.05[k];
    aevalsrc='if(gt(t,0.07),(0.55*sin(2*PI*2637*(t-0.07))+0.35*sin(2*PI*3521*(t-0.07))+0.22*sin(2*PI*5274*(t-0.07))+0.12*sin(2*PI*2643*(t-0.07)))*exp(-(t-0.07)*4.2),0)':s=${SR}:d=1.05[b];
    [k][b]amix=inputs=2:normalize=0[out]` },
  rise: { d: 0.85, g: `aevalsrc='0.5*sin(2*PI*(260*t+700*t*t))*pow(t/0.85,1.6)':s=${SR}:d=0.85[s];
    anoisesrc=d=0.85:c=pink:r=${SR}:a=0.5:s=17,highpass=f=1500,volume='pow(t/0.85,2.2)*0.6':eval=frame[n];
    [s][n]amix=inputs=2:normalize=0,afade=t=out:st=0.78:d=0.07[out]` },
  glitch: { d: 0.26, g: `aevalsrc='0.35*sgn(sin(2*PI*(180+140*floor(t*36))*t))*(1-t/0.26)':s=${SR}:d=0.26,acrusher=bits=6:mix=0.6[out]` },
  stamp: { d: 0.36, g: `aevalsrc='0.8*sin(2*PI*(140*t-120*t*t))*exp(-t*14)*min(t*500,1)':s=${SR}:d=0.36[s];
    anoisesrc=d=0.12:c=pink:r=${SR}:a=0.9:s=18,bandpass=f=900:width_type=o:w=2,volume='exp(-t*35)':eval=frame,apad=whole_dur=0.36[n];
    [s][n]amix=inputs=2:normalize=0[out]` },
  paper: { d: 0.22, g: `anoisesrc=d=0.22:c=white:r=${SR}:a=0.6:s=19,highpass=f=3000,volume='(0.6+0.4*sin(2*PI*55*t))*exp(-t*14)':eval=frame[out]` },
};
export const SFX_NAMES = Object.keys(RECIPES);

function ff(args, label) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg ${label} failed: ${r.stderr}`);
}

export function sfxFile(name) {
  const rec = RECIPES[name];
  if (!rec) throw new Error(`Unknown SFX "${name}". Known: ${SFX_NAMES.join(', ')}`);
  fs.mkdirSync(CACHE, { recursive: true });
  const out = path.join(CACHE, `${name}.wav`);
  if (!fs.existsSync(out)) {
    // Stereo, slight width from a 7 ms Haas delay on the right channel; -1 dBFS peak.
    ff(['-filter_complex', `${rec.g.replace(/\n\s*/g, '')};[out]aformat=sample_rates=${SR}:channel_layouts=mono,asplit[m1][m2];[m2]adelay=7[m2d];[m1][m2d]join=inputs=2:channel_layout=stereo,volume=0.7,alimiter=limit=0.85:level=disabled,atrim=0:${rec.d}[final]`, '-map', '[final]', '-c:a', 'pcm_s16le', out], `sfx ${name}`);
  }
  return out;
}

/* Build the soundtrack. cues: [{t, name, gain}] for ONE loop; loops repeats them.
 * voice / music: optional files. Returns { file, method, cues }. */
export function buildSoundtrack({ cues = [], duration, loops = 1, voice = null, music = null, workDir, musicGainDb = -18, sfxGainDb = 0 }) {
  const total = duration * loops;
  const all = [];
  for (let k = 0; k < loops; k++) for (const c of cues) if (c.t < duration - 0.02) all.push({ ...c, t: c.t + k * duration });
  // One ffmpeg input per cue (no asplit): asplit branches with very different delays
  // can deadlock amix in this ffmpeg build.
  const inputs = [];
  const parts = [];
  const buses = [];
  all.forEach((c) => inputs.push('-i', sfxFile(c.name)));
  if (all.length) {
    all.forEach((c, i) => {
      const ms = Math.max(0, Math.round(c.t * 1000));
      parts.push(`[${i}:a]adelay=${ms}|${ms},volume=${(c.gain ?? 1).toFixed(3)},apad,atrim=0:${total.toFixed(3)}[c${i}]`);
    });
    parts.push(`${all.map((_, i) => `[c${i}]`).join('')}amix=inputs=${all.length}:normalize=0:dropout_transition=0,volume=${sfxGainDb}dB,atrim=0:${total.toFixed(3)}[sfx]`);
    buses.push('[sfx]');
  }
  let idx = all.length;
  let vLabel = null;
  if (voice) {
    inputs.push('-i', voice);
    parts.push(`[${idx}:a]aformat=sample_rates=${SR}:channel_layouts=stereo,apad,atrim=0:${total.toFixed(3)},asplit[vo][vkey]`);
    vLabel = '[vo]'; idx++;
  }
  if (music) {
    inputs.push('-stream_loop', '-1', '-i', music);
    parts.push(`[${idx}:a]aformat=sample_rates=${SR}:channel_layouts=stereo,atrim=0:${total.toFixed(3)},volume=${musicGainDb}dB[mb]`);
    if (vLabel) { parts.push(`[mb][vkey]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=250[mbd]`); buses.push('[mbd]'); }
    else buses.push('[mb]');
    idx++;
  } else if (vLabel) parts.push('[vkey]anullsink');
  if (vLabel) buses.push(vLabel);
  if (!buses.length) return null;
  const raw = path.join(workDir, 'soundtrack_raw.wav');
  parts.push(`${buses.join('')}amix=inputs=${buses.length}:normalize=0:dropout_transition=0,atrim=0:${total.toFixed(3)}[mix]`);
  ff([...inputs, '-filter_complex', parts.join(';'), '-map', '[mix]', '-ar', String(SR), '-ac', '2', '-c:a', 'pcm_s16le', raw], 'soundtrack');
  const n = normaliseAudio(raw, workDir);
  return { file: n.file, method: n.method, cues: all.length, buses: buses.length };
}
