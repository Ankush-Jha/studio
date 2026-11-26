#!/usr/bin/env python3
"""Near-duplicate finder (pHash + dHash).
usage: neardup.py <image-or-video> [--against library|jobs|radar|all] [--exclude-client <slug>] [--client <slug>] [--top 5]
Index: $R/library/hashes.json if present (items: {path,client,phash,dhash}); otherwise built on the fly from
$R/library/thumbs, $R/jobs/*/out/**, $R/radar|studio/radar thumbs, and cached in tools/qa/.cache/hashes.json.
Distance = mean of pHash and dHash Hamming distances (64-bit each). Fail <= 6 to a DIFFERENT client's piece, warn <= 10."""
import argparse, json, os, sys, tempfile, time
from pathlib import Path
import imagehash
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
from common import R, IMAGE_EXT, VIDEO_EXT, run, safe_json

CACHE = Path(__file__).parent / ".cache" / "hashes.json"
FAIL_D, WARN_D = 6, 10


def hash_img(im):
    im = im.convert("RGB")
    return str(imagehash.phash(im)), str(imagehash.dhash(im))


def video_frames(path, n=4):
    """Return PIL frames at ~1s, 25%, 50%, 75%."""
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    try:
        d = float(r.stdout.strip())
    except ValueError:
        d = 4.0
    ts = sorted({min(1.0, d / 2)} | {d * f for f in (0.25, 0.5, 0.75)})
    out = []
    with tempfile.TemporaryDirectory() as td:
        for i, t in enumerate(ts):
            p = os.path.join(td, f"{i}.jpg")
            run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1", "-vf", "scale=256:-2", p])
            if os.path.exists(p):
                out.append(Image.open(p).convert("RGB").copy())
    return out


def hashes_of(path):
    path = Path(path)
    if path.suffix.lower() in VIDEO_EXT:
        ims = video_frames(path)
    else:
        ims = [Image.open(path)]
    return [hash_img(i) for i in ims]


def job_client(path):
    """client slug from jobs/<id>/job.json for a path inside a job dir."""
    p = Path(path).resolve()
    for par in p.parents:
        if (par / "job.json").exists():
            return (safe_json(par / "job.json") or {}).get("client"), par.name
        if par.parent.name == "jobs":
            return None, par.name
    return None, None


def entry(path, kind, client=None):
    try:
        st = Path(path).stat()
        hs = hashes_of(path)
    except Exception:
        return None
    if not hs:
        return None
    return {"path": str(path), "kind": kind, "client": client, "mtime": st.st_mtime, "hashes": [list(h) for h in hs]}


def scan_dirs(against):
    dirs = []
    if against in ("library", "all"):
        dirs.append((R / "library" / "thumbs", "library"))
        dirs.append((R / "library" / "cards", "library"))
    if against in ("jobs", "all"):
        for o in sorted(set((R / "jobs").glob("*/out")) | set((R / "jobs").glob("*/*/out"))):
            if o.is_dir():
                dirs.append((o, "jobs"))
    if against in ("radar", "all"):
        for base in (R / "radar", R / "studio" / "radar"):
            dirs.append((base / "thumbs", "radar"))
    return dirs


def build_index(against):
    cache = {}
    if CACHE.exists():
        cache = {e["path"]: e for e in (safe_json(CACHE) or {}).get("items", [])}
    items = []
    fresh = {}
    # prebuilt library index
    lib = R / "library" / "hashes.json"
    pre = safe_json(lib) if lib.exists() else None
    if pre and isinstance(pre, dict) and "items" not in pre and against in ("library", "all"):
        # library/hashes.json from seed_library.py: {card_id: {thumb:{phash,dhash}, frames:[{phash,dhash}]}}
        for cid, v in pre.items():
            if not isinstance(v, dict):
                continue
            card = safe_json(R / "library" / "cards" / f"{cid}.json") or {}
            cl = (card.get("clients") or [None])[0]
            hs = [[h["phash"], h["dhash"]] for h in ([v.get("thumb")] + list(v.get("frames") or [])) if isinstance(h, dict) and "phash" in h]
            if hs:
                items.append({"path": f"library/cards/{cid}.json", "kind": "library", "client": cl, "hashes": hs})
        pre = {"items": []}
    if pre and against in ("library", "all"):
        for e in (pre["items"] if isinstance(pre, dict) and "items" in pre else pre if isinstance(pre, list) else []):
            if "phash" in e and "dhash" in e:
                items.append({"path": e.get("path", "?"), "kind": "library", "client": e.get("client"),
                              "hashes": [[e["phash"], e["dhash"]]]})
    for d, kind in scan_dirs(against):
        if kind == "library" and pre:
            continue
        if not d.is_dir():
            continue
        for p in sorted(d.rglob("*")):
            if p.name.startswith(".") or "qa" in p.relative_to(d).parts:
                continue
            ext = p.suffix.lower()
            if ext not in IMAGE_EXT | VIDEO_EXT:
                continue
            c = cache.get(str(p))
            if c and abs(c.get("mtime", 0) - p.stat().st_mtime) < 1:
                e = c
            else:
                client = job_client(p)[0] if kind == "jobs" else None
                e = entry(p, kind, client)
            if e:
                e["kind"] = kind
                fresh[str(p)] = e
                items.append(e)
    try:
        CACHE.parent.mkdir(exist_ok=True)
        merged = dict(cache); merged.update(fresh)
        CACHE.write_text(json.dumps({"items": list(merged.values())}))
    except Exception:
        pass
    return items


def find_matches(path, against="all", client=None, exclude_client=None, exclude_prefix=None, top=5, index=None):
    index = index if index is not None else build_index(against)
    mine = hashes_of(path)
    me = str(Path(path).resolve())
    res = []
    for e in index:
        if exclude_client and e.get("client") == exclude_client:
            continue
        ep = e.get("path", "")
        if ep != "?" and (str(Path(ep).resolve()) == me or (exclude_prefix and str(Path(ep).resolve()).startswith(exclude_prefix))):
            continue
        best = None
        for hp, hd in e["hashes"]:
            for mp, md in mine:
                dp = imagehash.hex_to_hash(mp) - imagehash.hex_to_hash(hp)
                dd = imagehash.hex_to_hash(md) - imagehash.hex_to_hash(hd)
                score = (dp + dd) / 2
                if best is None or score < best[0]:
                    best = (score, dp, dd)
        if best:
            res.append({"path": ep, "client": e.get("client"), "kind": e.get("kind"),
                        "distance": best[0], "phash": best[1], "dhash": best[2]})
    res.sort(key=lambda r: r["distance"])
    return res[:top]


def verdict(matches, client=None):
    """-> (status, detail)."""
    status, detail = "pass", ""
    for m in matches:
        d = m["distance"]
        other = (client is None) or (m["client"] != client)
        known_other = m["client"] is not None and other
        if d <= FAIL_D and known_other:
            return "fail", f"dist {d:.1f} to other client's piece ({m['client']}): {m['path']}"
        if d <= WARN_D and status == "pass":
            status, detail = "warn", f"dist {d:.1f} to {m['client'] or 'unknown-client'} piece: {m['path']}"
    return status, detail


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("target")
    ap.add_argument("--against", default="all", choices=["library", "jobs", "radar", "all"])
    ap.add_argument("--exclude-client")
    ap.add_argument("--client", help="client of the target piece (default: from its job.json)")
    ap.add_argument("--top", type=int, default=5)
    a = ap.parse_args()
    t0 = time.time()
    client = a.client or job_client(a.target)[0]
    m = find_matches(a.target, a.against, client, a.exclude_client, top=a.top)
    st, det = verdict(m, client)
    for x in m:
        print(f"{x['distance']:5.1f}  (p{x['phash']} d{x['dhash']})  {x['client'] or '-':12} {x['kind']:8} {x['path']}")
    print(f"{st.upper()} {det}  [{time.time()-t0:.1f}s, client={client}]")
    sys.exit(1 if st == "fail" else 0)
