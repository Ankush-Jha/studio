"""Stills QA checks: carousel slides, statics, covers."""
import io, os, re, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageCms, ImageDraw
sys.path.insert(0, str(Path(__file__).parent))
from common import ocr_many, line_boxes, box_contrast, natkey

CAROUSEL = {(1080, 1350), (1080, 1440)}
STORY = (1080, 1920)
SQUARE = (1080, 1080)
SIDE = 60


def grid_crop_box(w, h):
    """Instagram profile-grid crop = centred 3:4 (w:h = 0.75)."""
    if w / h > 0.75:
        cw = h * 0.75
        return ((w - cw) / 2, 0, (w + cw) / 2, h)
    ch = w / 0.75
    return (0, (h - ch) / 2, w, (h + ch) / 2)


def icc_desc(im):
    raw = im.info.get("icc_profile")
    if not raw:
        return None
    try:
        return ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(raw))).strip()
    except Exception:
        return "unreadable-profile"


def run_stills(rep, paths, qa_dir, kind_hint=None, loop=False, tag="", footer_h=0):
    # footer_h: height of the client's supplied footer band (bottom of feed slides); text inside it is the
    # client's own artwork, used as-is, so it is excluded from margin/grid checks and reported once as a warn.
    footer_hits = []
    paths = sorted(paths, key=natkey)
    qa_dir = Path(qa_dir); fdir = qa_dir / "frames"; fdir.mkdir(parents=True, exist_ok=True)
    ims = []
    for p in paths:
        im = Image.open(p); im.load(); ims.append(im)
    sizes = [im.size for im in ims]
    n = len(paths)
    # --- count / consistency
    carousel = any(s in CAROUSEL for s in sizes) and n > 1
    if carousel:
        rep.add("stills.count", "Carousel slide count", "pass" if 2 <= n <= 20 else "fail", n, "2-20",
                "PLAYBOOK recommends 8-10" if not 8 <= n <= 10 and 2 <= n <= 20 else "", tag)
    else:
        rep.add("stills.count", "Image count", "pass", n, "single static / cover / story", "", tag)
    uniq = sorted(set(sizes))
    ok_sizes = all(s in CAROUSEL or s in (STORY, SQUARE) for s in uniq)
    rep.add("stills.dimensions", "Dimensions", "pass" if ok_sizes and len(uniq) == 1 else "fail",
            ", ".join(f"{w}x{h}" for w, h in uniq), "1080x1350|1440 carousel, 1080x1920 story/cover, 1080x1080 square; one size per set",
            "; ".join(f"{p.name}={im.size[0]}x{im.size[1]}" for p, im in zip(paths, ims) if im.size not in (CAROUSEL | {STORY, SQUARE})
                      or len(uniq) > 1)[:300], tag)
    # --- format / colour / size
    bad = []
    warn = []
    for p, im in zip(paths, ims):
        if im.format not in ("JPEG", "PNG"):
            bad.append(f"{p.name}: {im.format}")
        if im.mode in ("CMYK", "YCCK"):
            bad.append(f"{p.name}: CMYK")
        elif im.mode not in ("RGB", "RGBA"):
            warn.append(f"{p.name}: mode {im.mode}")
        d = icc_desc(im)
        if d and "srgb" not in d.lower():
            warn.append(f"{p.name}: ICC '{d}'")
    rep.add("stills.format", "Format / sRGB", "fail" if bad else "warn" if warn else "pass",
            sorted({im.format for im in ims}), "JPEG/PNG, RGB, sRGB (or untagged)", "; ".join(bad + warn)[:300], tag)
    sizes_mb = [os.path.getsize(p) / 1e6 for p in paths]
    big = [f"{p.name} {s:.1f}MB" for p, s in zip(paths, sizes_mb) if s > 8]
    rep.add("stills.filesize", "File size", "warn" if big else "pass", f"max {max(sizes_mb):.2f} MB", "<= 8 MB each", "; ".join(big), tag)
    # --- OCR
    allw = ocr_many([str(p) for p in paths])
    margin, gridbad, contrast_low, wordy = [], [], [], []
    texts = []
    for i, (p, im, words) in enumerate(zip(paths, ims, allw)):
        W, H = im.size
        texts.append(" ".join(w["text"] for w in words))
        in_footer = lambda w: footer_h and (W, H) != STORY and w["y0"] >= H - footer_h - 4
        for w in words:
            if (w["x0"] < SIDE or w["x1"] > W - SIDE) and in_footer(w):
                footer_hits.append(f"{p.name}:'{w['text']}'")
                continue
            if w["x0"] < SIDE or w["x1"] > W - SIDE:
                margin.append(f"{p.name}:'{w['text']}'@x{int(w['x0'])}-{int(w['x1'])}")
        nw = len([w for w in words if re.search(r"\w", w["text"]) and not in_footer(w)])
        if nw > 40:
            wordy.append(f"{p.name}={nw}")
        rgb = np.asarray(im.convert("RGB"))
        for txt, box in line_boxes(words):
            if len(txt) < 4:
                continue
            c = box_contrast(rgb, box)
            if c is not None and c < 4.5:
                contrast_low.append((p.name, txt[:28], round(c, 1)))
        if i == 0 or (W, H) == STORY and re.search(r"cover|poster", p.stem, re.I):
            gx0, gy0, gx1, gy1 = grid_crop_box(W, H)
            if (gx1 - gx0, gy1 - gy0) != (W, H):
                for w in words:
                    if in_footer(w):
                        continue
                    if w["x0"] < gx0 or w["x1"] > gx1 or w["y0"] < gy0 or w["y1"] > gy1:
                        gridbad.append(f"{p.name}:'{w['text']}'@({int(w['x0'])},{int(w['y0'])})-({int(w['x1'])},{int(w['y1'])})")
    if footer_hits:
        rep.add("stills.footer_band", "Client footer band (used as supplied)", "warn", f"{len(footer_hits)} footer words near the edge",
                "client artwork, not edited", "; ".join(footer_hits[:4]), tag)
    rep.add("stills.margins", "Text inside 60 px side margins", "fail" if margin else "pass",
            f"{len(margin)} words outside", "x 60 .. W-60", "; ".join(margin[:6]), tag)
    first_cover = STORY in sizes and any(re.search(r"cover|poster", p.stem, re.I) or s == STORY for p, s in zip(paths, sizes))
    gx0, gy0, gx1, gy1 = grid_crop_box(*sizes[0])
    rep.add("stills.gridcrop", f"Text inside 3:4 grid crop of slide 1 (x{gx0:.0f}-{gx1:.0f}, y{gy0:.0f}-{gy1:.0f})",
            "pass" if not gridbad else ("fail" if first_cover else "warn"), f"{len(gridbad)} words outside",
            "inside crop", "; ".join(gridbad[:6]), tag)
    rep.add("stills.contrast", "Text contrast >= 4.5:1 (WCAG AA)", "warn" if contrast_low else "pass",
            f"{len(contrast_low)} low-contrast lines" if contrast_low else "all >= 4.5",
            ">= 4.5:1", "; ".join(f"{a} '{b}' {c}:1" for a, b, c in contrast_low[:6]), tag)
    rep.add("stills.words", "Words per slide <= 40", "warn" if wordy else "pass",
            ", ".join(f"{p.name}={sum(1 for w in a if re.search(chr(92)+'w', w['text']))}" for p, a in zip(paths, allw))[:200],
            "<= 40 (carousel ~20)", "; ".join(wordy), tag)
    # --- grid crop preview of slide 1
    im0 = ims[0].convert("RGB")
    gb = grid_crop_box(*im0.size)
    crop = im0.crop(tuple(int(round(v)) for v in gb))
    crop.save(qa_dir / "gridcrop.jpg", quality=88)
    # --- downscaled copies for contact/frames
    frames = []
    for p, im in zip(paths, ims):
        o = fdir / f"{(tag + '_') if tag else ''}{p.stem}.jpg"
        t = im.convert("RGB"); t.thumbnail((540, 960)); t.save(o, quality=85)
        frames.append((p.name, str(o)))
    return {"frames": frames, "text": texts, "words": allw, "gridcrop": str(qa_dir / "gridcrop.jpg")}
