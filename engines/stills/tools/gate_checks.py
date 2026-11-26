#!/usr/bin/env python3
"""Checks for the QA gate that need Python (run by tools/qa-gate.mjs; prints JSON).

  math    : recomputes every calc audit in every library manifest independently
            (Canadian semi-annual compounding, interest-only HELOC, lump-sum payoff,
            down payment, FHSA room, day counts) and compares to the rendered values.
  glyphs  : every character of every text run must exist in the font that set it
            (fontTools cmap), so nothing silently falls back to a system face.
  palette : flags a purple + teal palette (the commonest AI-palette tell) in any JPEG.

Usage: gate_checks.py <statics-root>
"""
import json
import math
import unicodedata
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent)
OUT = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else ROOT / "out"  # renders folder (qa-gate --out)


def per_rate(pct, comp="semi-annual"):
    k = {"semi-annual": 2, "monthly": 12, "annual": 1}[comp]
    return (1 + pct / 100 / k) ** (k / 12) - 1


def pay(p, pct, years, comp="semi-annual"):
    i = per_rate(pct, comp)
    n = years * 12
    return p * i / (1 - (1 + i) ** -n)


def close(a, b, tol=0.011):
    return abs(a - b) <= tol


def check_audit(a):
    k, inp, v = a.get("kind"), a.get("inputs", {}), a.get("values", {})
    errs = []
    if k == "payment-compare":
        for row in v["rows"]:
            x = pay(inp["principal"], row["annualPct"], inp.get("amortYears", 25), inp.get("compounding", "semi-annual"))
            if not close(round(x, 2), row["exact"]):
                errs.append(f"payment at {row['annualPct']}%: {row['exact']} vs {x:.2f}")
            if round(x) != row["shown"]:
                errs.append(f"rounding at {row['annualPct']}%")
        if v["delta"] != v["rows"][1]["shown"] - v["rows"][0]["shown"]:
            errs.append("delta is not the difference of the shown figures")
    elif k == "payment":
        x = pay(inp["principal"], inp["annualPct"], inp.get("amortYears", 25), inp.get("compounding", "semi-annual"))
        if not close(round(x, 2), v["exact"]):
            errs.append(f"payment {v['exact']} vs {x:.2f}")
    elif k == "heloc":
        for row in v["rows"]:
            x = inp["balance"] * row["annualPct"] / 100 / 12
            if not close(round(x, 2), row["exact"]):
                errs.append(f"interest at {row['annualPct']}%: {row['exact']} vs {x:.2f}")
        pd = v.get("paydown")
        if pd:
            r = v["rows"][pd["rateIndex"]]["annualPct"] / 100 / 12
            bal = inp["balance"]
            for _ in range(pd["months"]):
                bal -= pd["payment"] - bal * r
            if not close(round(bal, 2), pd["balanceAfter"]):
                errs.append(f"paydown balance {pd['balanceAfter']} vs {bal:.2f}")
    elif k == "lump-sum":
        p = pay(inp["balance"], inp["annualPct"], inp["years"], inp.get("compounding", "semi-annual"))
        i = per_rate(inp["annualPct"], inp.get("compounding", "semi-annual"))
        n_exact = -math.log(1 - (inp["balance"] - inp["lump"]) * i / p) / math.log(1 + i)
        if math.ceil(n_exact - 1e-9) != v["monthsAfter"]:
            errs.append(f"months after {v['monthsAfter']} vs {n_exact:.2f}")
        if not close(round(p, 2), v["payment"]):
            errs.append(f"payment {v['payment']} vs {p:.2f}")
        p2 = pay(inp["balance"] - inp["lump"], inp["annualPct"], inp["years"], inp.get("compounding", "semi-annual"))
        if not close(round(p - p2, 2), v["paymentDrop"], 0.02):
            errs.append("payment drop")
    elif k == "down-payment":
        price = inp["price"]
        m = price * 0.2 if price >= 1_500_000 else 0.05 * min(price, 500_000) + 0.10 * max(0, price - 500_000)
        if not close(round(m, 2), v["exact"]):
            errs.append(f"minimum down {v['exact']} vs {m:.2f}")
    elif k == "fhsa-room":
        now = inp["annualRoom"] + min(inp["annualRoom"] - inp.get("contributedThisYear", 0), inp["carryForwardCap"])
        if now != v["now"]:
            errs.append(f"FHSA room {v['now']} vs {now}")
    return errs


def fonts_for(style_slug, cache={}):
    if style_slug in cache:
        return cache[style_slug]
    from fontTools.ttLib import TTFont
    meta = json.loads((ROOT / "library" / style_slug / "style.json").read_text())
    fam = {}
    for f in meta.get("fonts", []):
        cmap = TTFont(ROOT / "fonts" / f["file"], lazy=True).getBestCmap() or {}
        fam.setdefault(f["family"], set()).update(cmap.keys())
    cache[style_slug] = fam
    return fam


def palette_tell(jpg):
    from PIL import Image
    import colorsys
    im = Image.open(jpg).convert("RGB").resize((108, 135))
    q = im.quantize(colors=8).convert("RGB")
    counts = q.getcolors(108 * 135) or []
    total = 108 * 135
    purple = teal = 0.0
    for n, (r, g, b) in counts:
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if s < 0.35 or l < 0.12 or l > 0.92:
            continue
        hue = h * 360
        if 255 <= hue <= 300:
            purple += n / total
        if 165 <= hue <= 195:
            teal += n / total
    return purple > 0.05 and teal > 0.05


def main():
    out = {"math": [], "glyphs": [], "palette": [], "checked": {"audits": 0, "runs": 0, "jpgs": 0}}
    for mf in sorted(OUT.glob("*/*/manifest.json")):
        m = json.loads(mf.read_text())
        if m.get("engine") != "library":
            continue
        rel = str(mf.parent.relative_to(OUT))
        try:
            fam = fonts_for(m["style"])
        except Exception as e:  # missing style.json etc.
            fam = {}
            out["glyphs"].append({"render": rel, "error": str(e)})
        for s in m["slides"]:
            for a in s.get("audit") or []:
                out["checked"]["audits"] += 1
                for e in check_audit(a):
                    out["math"].append({"render": rel, "slide": s["n"], "kind": a.get("kind"), "error": e})
            for r in s.get("runs", []):
                cmap = fam.get(r.get("family"))
                if cmap is None:
                    continue
                out["checked"]["runs"] += 1
                missing = sorted({c for c in (r.get("chars") or "") if not c.isspace() and unicodedata.category(c) != 'Cf' and ord(c) not in cmap})
                if missing:
                    out["glyphs"].append({"render": rel, "slide": s["n"], "family": r["family"], "missing": "".join(missing), "text": r["text"][:40]})
            jpg = (ROOT / s["jpg"]).resolve()
            if jpg.exists():
                out["checked"]["jpgs"] += 1
                if palette_tell(jpg):
                    out["palette"].append({"render": rel, "slide": s["n"]})
    print(json.dumps(out))


if __name__ == "__main__":
    main()
