"""Shared helpers for the Studio QA gate (deterministic, no LLM)."""
import json, os, re, subprocess, shutil, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageOps
import numpy as np

R = Path(os.environ.get("STUDIO_ROOT") or Path(__file__).resolve().parents[3])
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}

SAFE_X0, SAFE_X1, SAFE_Y0, SAFE_Y1 = 65, 1015, 270, 1248   # reel text safe zone on 1080x1920


class Report:
    def __init__(self):
        self.checks = []

    def add(self, cid, name, status, value=None, expected=None, detail="", tag=""):
        assert status in ("pass", "warn", "fail", "skip")
        self.checks.append({"id": f"{cid}@{tag}" if tag else cid, "name": name + (f" [{tag}]" if tag else ""),
                            "status": status, "value": value, "expected": expected, "detail": detail})

    @property
    def ok(self):
        return not any(c["status"] == "fail" for c in self.checks)

    def counts(self):
        out = {"pass": 0, "warn": 0, "fail": 0, "skip": 0}
        for c in self.checks:
            out[c["status"]] += 1
        return out


def run(cmd, timeout=600, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, **kw)


def have(tool):
    return shutil.which(tool) is not None


def jdump(o, p):
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    Path(p).write_text(json.dumps(o, indent=2, default=str))


def safe_json(p):
    try:
        return json.loads(Path(p).read_text())
    except Exception:
        return None


# ---------------------------------------------------------------- OCR
def ocr_image(img, scale=2, psm=11, min_conf=60):
    """OCR a PIL image (or path). Returns word dicts in ORIGINAL pixel coords.
    Tiny noise words (len<2 alnum chars, conf<min_conf) are dropped."""
    if not isinstance(img, Image.Image):
        img = Image.open(img)
    img = img.convert("L")
    w, h = img.size
    big = img.resize((w * scale, h * scale), Image.LANCZOS) if scale != 1 else img
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, "o.png")
        big.save(p)
        env = dict(os.environ, OMP_THREAD_LIMIT="1")
        r = run(["tesseract", p, "stdout", "--psm", str(psm), "-l", "eng", "tsv"], env=env, timeout=120)
    words = []
    for ln in r.stdout.splitlines()[1:]:
        f = ln.split("\t")
        if len(f) < 12 or f[0] != "5":
            continue
        txt = f[11].strip()
        try:
            conf = float(f[10])
        except ValueError:
            continue
        if not txt or conf < min_conf:
            continue
        if len(re.sub(r"\W", "", txt)) < 2 and not re.fullmatch(r"[\$%\d]", txt):
            continue
        x, y, bw, bh = (int(f[6]) / scale, int(f[7]) / scale, int(f[8]) / scale, int(f[9]) / scale)
        if bh < 10:      # tiny noise
            continue
        words.append({"text": txt, "conf": conf, "x0": x, "y0": y, "x1": x + bw, "y1": y + bh,
                      "line": (int(f[2]), int(f[3]), int(f[4]))})
    return words


def ocr_many(images, workers=None):
    workers = workers or min(8, os.cpu_count() or 4)
    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(ocr_image, images))


# ---------------------------------------------------------------- contrast
def _lin(c):
    c = c / 255.0
    return np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _lum(arr):
    a = _lin(arr.astype(np.float64))
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def line_boxes(words):
    """Group OCR words into line boxes: [(text, (x0,y0,x1,y1))]."""
    groups = {}
    for wd in words:
        groups.setdefault(wd["line"], []).append(wd)
    out = []
    for ws in groups.values():
        ws.sort(key=lambda w: w["x0"])
        out.append((" ".join(w["text"] for w in ws),
                    (min(w["x0"] for w in ws), min(w["y0"] for w in ws),
                     max(w["x1"] for w in ws), max(w["y1"] for w in ws))))
    return out


def box_contrast(rgb, box, pad=10):
    """WCAG contrast of text pixels in box vs the background ring around it."""
    H, W = rgb.shape[:2]
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if x1 - x0 < 4 or y1 - y0 < 4:
        return None
    inner = _lum(rgb[y0:y1, x0:x1]).ravel()
    X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
    L = _lum(rgb[Y0:Y1, X0:X1])
    mask = np.ones(L.shape, bool)
    mask[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = False
    ring = L[mask]
    bg = float(np.median(ring)) if ring.size > 20 else float(np.median(inner))
    # 2-means on inner luminance
    c1, c2 = float(inner.min()), float(inner.max())
    if c2 - c1 < 1e-3:
        return 1.0
    for _ in range(12):
        m = np.abs(inner - c1) < np.abs(inner - c2)
        if m.all() or (~m).all():
            break
        c1, c2 = float(inner[m].mean()), float(inner[~m].mean())
    text = c1 if abs(c1 - bg) > abs(c2 - bg) else c2
    hi, lo = max(text, bg), min(text, bg)
    return (hi + 0.05) / (lo + 0.05)


# ---------------------------------------------------------------- misc
def find_assets(folder):
    folder = Path(folder)
    vids = sorted(p for p in folder.rglob("*") if p.suffix.lower() in VIDEO_EXT and not p.name.startswith("."))
    imgs = sorted(p for p in folder.rglob("*") if p.suffix.lower() in IMAGE_EXT and not p.name.startswith(".")
                  and "qa" not in p.relative_to(folder).parts)
    return vids, imgs


def natkey(p):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", str(p))]
