#!/usr/bin/env python3
"""Job-local variant of studio/engines/bin/footer_compose.py for renders made with --reserve.

    footer_overlay.py <dir with NN.jpg 1080x1350> <footer.png> <out dir> [--reserve 195]

Input slides are full 1080x1350 renders whose safe box already ends above the bottom <reserve> px,
so the footer (scaled to 1080 wide, alpha kept) is alpha-composited flush to the bottom over the
slide's own paper. No resizing, no gap fill, no content moved. Refuses if the scaled footer is taller
than the reserve, or if the reserved band behind the footer holds anything but paper.
"""
import glob, os, sys
import numpy as np
from PIL import Image

args = sys.argv[1:]
reserve = 195
if "--reserve" in args:
    i = args.index("--reserve"); reserve = int(args[i + 1]); del args[i:i + 2]
src, footer, dst = args[:3]
W, H = 1080, 1350
os.makedirs(dst, exist_ok=True)
f = Image.open(footer).convert("RGBA")
f = f.resize((W, round(f.height * W / f.width)), Image.LANCZOS)
if f.height > reserve:
    sys.exit(f"footer is {f.height} px at 1080 wide, taller than the {reserve} px reserve; re-render with --reserve {f.height}")
files = sorted(glob.glob(os.path.join(src, "[0-9][0-9].jpg")))
if not files:
    sys.exit(f"no NN.jpg in {src}")
for p in files:
    im = Image.open(p)
    icc = im.info.get("icc_profile")
    sl = im.convert("RGB")
    if sl.size != (W, H):
        sys.exit(f"{p} is {sl.size}, expected {W}x{H} (render with --format feed --reserve {reserve})")
    band = np.asarray(sl)[H - reserve:].astype(int)
    paper = np.median(band.reshape(-1, 3), axis=0)
    ink = (np.abs(band - paper).max(axis=2) > 40).mean()
    if ink > 0.002:
        sys.exit(f"{p}: {ink:.2%} non-paper pixels inside the reserved band; the layout spills into the footer zone")
    out = sl.convert("RGBA")
    out.alpha_composite(f, (0, H - f.height))
    q = os.path.join(dst, os.path.basename(p))
    out.convert("RGB").save(q, quality=92, subsampling=0, icc_profile=icc)
    print(q)
