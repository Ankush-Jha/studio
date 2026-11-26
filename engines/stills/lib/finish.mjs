// 2x PNG masters -> 1x delivery JPEGs: Lanczos downsample, light unsharp, sRGB ICC, mozjpeg q92 4:4:4.
// Uses sharp (engines/stills/node_modules, $SHARP_DIR, or <repo>/node_modules);
// falls back to tools/finish.py (Pillow) when sharp is missing.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadSharp } from './library.mjs';

export async function finishJPEGs(root, pairs, fmt, pythonBin) {
  const sharp = loadSharp(root);
  if (sharp) {
    for (const [png, jpg] of pairs) {
      await sharp(png)
        .resize(fmt.w, fmt.h, { kernel: 'lanczos3' })
        .sharpen({ sigma: 0.45, m1: 0.6, m2: 1.2 })
        .withIccProfile('srgb')
        .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
        .toFile(jpg);
    }
    return 'sharp';
  }
  const py = pythonBin();
  const r = spawnSync(py, [path.join(root, 'tools', 'finish.py'), '--size', `${fmt.w}x${fmt.h}`, ...pairs.map(([p, j]) => `${p}=${j}`)], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`finish.py failed: ${r.stderr}`);
  return 'pillow';
}
