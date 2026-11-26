"""Contact sheet builder: grid of frames/slides with labels.
usage: contact.py out.jpg img1[:label] img2[:label] ..."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def _font(size):
    for p in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


def build_contact(items, out, cols=None, thumb_h=420, pad=10, label_h=26, max_w=2400):
    """items: list of (image_path, label). Writes a JPEG grid to `out`."""
    if not items:
        return None
    ims = []
    for p, lab in items:
        try:
            im = Image.open(p).convert("RGB")
        except Exception:
            continue
        s = thumb_h / im.height
        ims.append((im.resize((max(1, int(im.width * s)), thumb_h), Image.LANCZOS), lab))
    if not ims:
        return None
    tw = max(i.width for i, _ in ims)
    if cols is None:
        cols = max(1, min(len(ims), (max_w - pad) // (tw + pad)))
    rows = -(-len(ims) // cols)
    W = cols * (tw + pad) + pad
    H = rows * (thumb_h + label_h + pad) + pad
    sheet = Image.new("RGB", (W, H), (24, 24, 28))
    d = ImageDraw.Draw(sheet)
    f = _font(15)
    for n, (im, lab) in enumerate(ims):
        r, c = divmod(n, cols)
        x = pad + c * (tw + pad) + (tw - im.width) // 2
        y = pad + r * (thumb_h + label_h + pad)
        sheet.paste(im, (x, y + label_h))
        d.text((pad + c * (tw + pad), y + 4), str(lab)[:int(tw / 8.5)], fill=(235, 235, 235), font=f)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=85)
    return str(out)


if __name__ == "__main__":
    out, *rest = sys.argv[1:]
    its = []
    for a in rest:
        p, _, lab = a.partition(":")
        its.append((p, lab or Path(p).stem))
    print(build_contact(its, out))
