#!/usr/bin/env python3
"""Find where a film's LemoLab / Lemo-Opuscar credit first appears.
usage: find_credit.py <film.mp4> [tail_seconds]  ->  prints JSON {slug, dur, credit_at, mid_hits}
Scans the tail at 4 fps (upscaled 2x for OCR) and the whole film at 0.5 fps for credits elsewhere."""
import json, os, re, subprocess, sys, tempfile, glob

PAT = re.compile(r'lemo|opuscar|0puscar|lemolab|claude\s*opus', re.I)


def dur(f):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
                                capture_output=True, text=True).stdout)


def frames(f, start, fps, d):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.3f}', '-i', f, '-vf', f'fps={fps},scale=2560:-1',
                    os.path.join(d, '%05d.png')], check=True)
    return sorted(glob.glob(os.path.join(d, '*.png')))


def ocr(p):
    out = subprocess.run(['tesseract', p, '-', '--psm', '11'], capture_output=True, text=True).stdout
    return bool(PAT.search(out))


f = sys.argv[1]
tail = float(sys.argv[2]) if len(sys.argv) > 2 else 25
D = dur(f)
start = max(0.0, D - tail)
with tempfile.TemporaryDirectory() as d:
    fps = 4
    hits = [start + i / fps for i, p in enumerate(frames(f, start, fps, d)) if ocr(p)]
credit_at = None
if hits:
    # the credit block: the earliest hit from which hits continue (allow gaps up to 1.5 s for reveal animations)
    credit_at = hits[-1]
    for t in reversed(hits):
        if credit_at - t <= 1.5: credit_at = t
        else: break
with tempfile.TemporaryDirectory() as d:
    mid = [round(i * 2.0, 1) for i, p in enumerate(frames(f, 0, 0.5, d)) if i * 2.0 < start and ocr(p)]
print(json.dumps({'slug': os.path.basename(f)[:-4], 'dur': round(D, 3), 'credit_at': credit_at and round(credit_at, 2),
                  'hits': [round(h, 2) for h in hits], 'mid_hits': mid}))
