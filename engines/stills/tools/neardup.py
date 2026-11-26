#!/usr/bin/env python3
"""Near-duplicate gate for rendered slides (dHash + pHash, 64-bit each).

Compares every rendered slide JPEG under out/ (or the folders given) with every other one.
To stop "variants" that only flip polarity or direction, each pair is also compared after
mirroring and after inverting luminance; the smallest distance counts.
Slide 1 of each post is also compared as the 3:4 profile-grid crop.

Pair classes:
  cross-client  same post, different client    -> GATE
  cross-post    different post, different client -> GATE
  same-client   different post or format, same client -> info only (a client's own series and its
                story/square re-cuts are meant to look related)
  within-post   same post + client             -> info only (one template family is meant to repeat)

A pair fails the gate when one hash is <= NEAR and the other <= CORROBORATE (Hamming distance
out of 64; defaults 10 and 20).
Distances up to REVIEW are listed for a human look.

Usage: neardup.py [dirs...] [--near 10] [--review 16] [--json out/neardup.json]
Exit code 1 if any gated pair fails.
"""
import argparse
import itertools
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def _dct_matrix(n: int) -> np.ndarray:
    k = np.arange(n)
    m = np.cos(np.pi * (2 * k[None, :] + 1) * k[:, None] / (2 * n))
    m[0] *= 1 / np.sqrt(2)
    return m * np.sqrt(2 / n)


D32 = _dct_matrix(32)


def dhash(g: Image.Image) -> np.ndarray:
    a = np.asarray(g.resize((9, 8), Image.Resampling.LANCZOS), dtype=np.float32)
    return (a[:, 1:] > a[:, :-1]).flatten()


def phash(g: Image.Image) -> np.ndarray:
    a = np.asarray(g.resize((32, 32), Image.Resampling.LANCZOS), dtype=np.float32)
    d = D32 @ a @ D32.T
    low = d[:8, :8].flatten()
    med = np.median(low[1:])
    return low > med


def variants(g: Image.Image):
    inv = Image.eval(g, lambda v: 255 - v)
    return {
        "identity": g,
        "mirror": g.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
        "invert": inv,
        "mirror+invert": inv.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
    }


def load(path: Path, crop_grid=False):
    im = Image.open(path).convert("L")
    if crop_grid:  # Instagram profile grid shows a centred 3:4 crop
        w, h = im.size
        if h / w > 4 / 3:  # 9:16 story: crop height
            ch = round(w * 4 / 3)
            y0 = (h - ch) // 2
            im = im.crop((0, y0, w, y0 + ch))
        else:  # 4:5 or 1:1: crop width
            cw = round(h * 3 / 4)
            x0 = (w - cw) // 2
            im = im.crop((x0, 0, x0 + cw, h))
    im = im.resize((256, 320), Image.Resampling.LANCZOS)
    return {k: (dhash(v), phash(v)) for k, v in variants(im).items()}


def ham(a, b):
    return int(np.count_nonzero(a != b))


def distance(ha, hb):
    """Minimum distance over transforms of b against identity of a."""
    best = None
    for name, (d, p) in hb.items():
        dd, pp = ham(ha["identity"][0], d), ham(ha["identity"][1], p)
        if best is None or min(dd, pp) < min(best[0], best[1]):
            best = (dd, pp, name)
    return best


BASES = [ROOT / "out"]


def describe(path: Path):
    rel = None
    for base in BASES:
        try:
            rel = path.resolve().relative_to(base); break
        except ValueError:
            continue
    if rel is None:
        rel = Path(*path.parts[-3:])
    parts = rel.parts  # <post>/<client>/<NN>.jpg
    post, client = (parts[0], parts[1]) if len(parts) >= 3 else (parts[0], "-")
    return {"path": str(rel), "post": post, "client": client, "slide": path.stem}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dirs", nargs="*", default=[str(ROOT / "out")])
    ap.add_argument("--near", type=int, default=10)
    ap.add_argument("--review", type=int, default=16)
    ap.add_argument("--corroborate", type=int, default=20)
    ap.add_argument("--json", default=str(ROOT / "out" / "neardup.json"))
    args = ap.parse_args()
    BASES[:] = [Path(d).resolve() for d in args.dirs] + [(ROOT / "out").resolve()]

    files = sorted({p for d in args.dirs for p in Path(d).rglob("[0-9][0-9].jpg") if "png" not in p.parts})
    if len(files) < 2:
        print("Need at least two rendered slides.")
        return 0
    info = [describe(p) for p in files]
    hashes = [load(p) for p in files]
    covers = {i: load(p, crop_grid=True) for i, p in enumerate(files) if p.stem == "01"}

    rows = []
    for i, j in itertools.combinations(range(len(files)), 2):
        a, b = info[i], info[j]
        if a["post"] == b["post"] and a["client"] == b["client"]:
            cls = "within-post"
        elif a["client"] == b["client"]:
            cls = "same-client"
        elif a["post"] == b["post"]:
            cls = "cross-client"
        else:
            cls = "cross-post"
        dd, pp, how = distance(hashes[i], hashes[j])
        row = {"a": a["path"], "b": b["path"], "class": cls, "dhash": dd, "phash": pp, "closest_as": how}
        if i in covers and j in covers:
            gd, gp, ghow = distance(covers[i], covers[j])
            row.update({"grid_dhash": gd, "grid_phash": gp})
            dd, pp = min(dd, gd), min(pp, gp)
        gated = cls in ("cross-client", "cross-post")
        # One hash within NEAR and the other within CORROBORATE (default 20): a single low pHash on a
        # dark, low-detail slide is not enough evidence on its own.
        row["fail"] = gated and ((dd <= args.near and pp <= args.corroborate) or (pp <= args.near and dd <= args.corroborate))
        row["review"] = not row["fail"] and gated and (dd <= args.review or pp <= args.review)
        rows.append(row)

    gated = [r for r in rows if r["class"] in ("cross-client", "cross-post")]
    fails = [r for r in gated if r["fail"]]
    reviews = [r for r in gated if r["review"]]
    cc = [r for r in rows if r["class"] == "cross-client"]

    def stats(rs):
        if not rs:
            return "n/a"
        d = [min(r["dhash"], r["phash"]) for r in rs]
        return f"{len(rs)} pairs, closest {min(d)}/64, median {int(np.median(d))}/64"

    print(f"Slides: {len(files)}   pairs: {len(rows)}   gate: one hash <= {args.near}/64 and the other <= {args.corroborate}/64 fails (min over identity/mirror/invert)")
    print(f"  cross-client : {stats(cc)}")
    print(f"  cross-post   : {stats([r for r in rows if r['class'] == 'cross-post'])}")
    print(f"  same-client  : {stats([r for r in rows if r['class'] == 'same-client'])}  (info only)")
    print(f"  within-post  : {stats([r for r in rows if r['class'] == 'within-post'])}  (info only)")
    for r in sorted(cc, key=lambda r: min(r["dhash"], r["phash"]))[:8]:
        print(f"    {r['a']:<34} vs {r['b']:<34} dH {r['dhash']:>2}  pH {r['phash']:>2}  ({r['closest_as']})")
    if reviews:
        print(f"  review ({len(reviews)}): " + "; ".join(f"{r['a']}~{r['b']} d{r['dhash']}/p{r['phash']}" for r in reviews[:10]))
    if fails:
        print(f"FAIL: {len(fails)} near-duplicate pair(s):")
        for r in fails:
            print(f"  {r['a']}  ~  {r['b']}  dH {r['dhash']} pH {r['phash']} ({r['closest_as']})")
    else:
        print("PASS: no near-duplicates across clients or posts.")

    Path(args.json).write_text(json.dumps({"near": args.near, "review": args.review, "files": len(files), "fails": fails, "reviews": reviews, "pairs": rows}, indent=1))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
