#!/usr/bin/env python3
"""Put a client's footer banner under 1:1 still renders, giving 1080x1350 (4:5) feed posts with no overlap.

    $R/studio/.venv/bin/python $R/studio/engines/bin/footer_compose.py <dir with NN.jpg 1080x1080> <footer.png> <out dir>

The footer is scaled to 1080 wide and placed flush to the bottom; the gap between the square and the footer is
filled with the square's own bottom-edge colour. Fails if the footer is taller than 270 px after scaling.
"""
import glob, os, sys
from PIL import Image

src, footer, dst = sys.argv[1:4]
W, H = 1080, 1350
os.makedirs(dst, exist_ok=True)
f = Image.open(footer).convert("RGBA")
f = f.resize((W, round(f.height * W / f.width)), Image.LANCZOS)
if f.height > H - 1080:
    sys.exit(f"footer is {f.height} px tall at 1080 wide; more than the 270 px band. Use the feed render + manual layout instead.")
files = sorted(glob.glob(os.path.join(src, "[0-9][0-9].jpg")))
if not files:
    sys.exit(f"no NN.jpg in {src}")
for p in files:
    sq = Image.open(p).convert("RGB")
    if sq.size != (1080, 1080):
        sys.exit(f"{p} is {sq.size}, expected 1080x1080 (render with --format square)")
    bg = sq.getpixel((8, 1072))
    out = Image.new("RGB", (W, H), bg)
    # Balance the layout: find the rows that hold content and centre that block in the space above the
    # footer, so the spare height is shared top/bottom instead of pooling as one empty band over the footer.
    import numpy as np
    a = np.asarray(sq).astype(int)
    diff = (np.abs(a - np.array(bg)).max(axis=2) > 28).mean(axis=1) > 0.004
    rows = np.where(diff)[0]
    avail = H - f.height
    if len(rows):
        top, bot = int(rows[0]), int(rows[-1]) + 1
        ch = bot - top
        y = max(0, (avail - ch) // 2)
        if ch <= avail:
            out.paste(sq.crop((0, top, W, bot)), (0, y))
        else:
            out.paste(sq, (0, 0))
    else:
        out.paste(sq, (0, (avail - 1080) // 2))
    out.paste(f, (0, H - f.height), f)
    q = os.path.join(dst, os.path.basename(p))
    out.save(q, quality=92, subsampling=0, icc_profile=Image.open(p).info.get("icc_profile"))
    print(q)
