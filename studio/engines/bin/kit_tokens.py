#!/usr/bin/env python3
"""Write a client's brand layer from its Studio kit into a job's SHADOW statics tokens (never into engines/stills).

    $R/studio/.venv/bin/python $R/studio/engines/bin/kit_tokens.py <kit dir> <shadow statics dir>
    e.g.  ... kit_tokens.py $R/kits/northline-mortgages $P/engines/stills

Prints the token id to pass as --client (an existing token file among slug + aliases, else the slug).
Fills compliance (agent name, title, brokerage, brokerage licence) ONLY from kit.json; empty kit fields stay empty
so the renderers show placeholders and --strict refuses. Accent from kits/<slug>/tokens.json color.accent.
Registers the kit photo as slot "portrait" only when its short side is >= 600 px (otherwise warns and skips).
"""
import json, os, pathlib, shutil, sys

kit_dir, st = sys.argv[1], sys.argv[2]
R = str(pathlib.Path(__file__).resolve().parents[3])
kit = json.load(open(os.path.join(kit_dir, "kit.json")))
tp = os.path.join(kit_dir, "tokens.json")
tok = json.load(open(tp)) if os.path.exists(tp) else {}
slug = kit["id"]
ids = [slug] + list(kit.get("aliases") or [])
cdir = os.path.join(st, "tokens", "clients")
cid = next((i for i in ids if os.path.exists(os.path.join(cdir, i + ".json"))), slug)
path = os.path.join(cdir, cid + ".json")
if os.path.exists(path):
    d = json.load(open(path))
else:
    name = kit.get("name") or slug
    d = {"meta": {"id": cid, "name": name, "initials": "".join(w[0] for w in name.split()[:2]).upper(),
                  "province": kit.get("province", ""), "city": kit.get("city", ""), "group": kit.get("group"),
                  "seed": sum(map(ord, cid)) % 1000, "layoutVariant": (kit.get("stills") or {}).get("variant") or "a"},
         "color": {}, "compliance": {}, "photos": {}}
d["$description"] = f"Studio job copy generated from {kit_dir}/kit.json. Do not copy back into engines/stills."
ag, br = kit.get("agent") or {}, kit.get("brokerage") or {}
d["compliance"] = {"agentName": ag.get("name", "") or "", "title": ag.get("title", "") or "",
                   "brokerage": br.get("name", "") or "", "licence": (br.get("licence") or "").lstrip("#").strip(),
                   "province": kit.get("province", "") or ""}
acc = ((tok.get("color") or {}).get("accent") or {}).get("$value")
if acc:
    d.setdefault("color", {})["accent"] = {"$type": "color", "$value": acc}
photo = (kit.get("assets") or {}).get("photo")
if photo:
    src = photo if os.path.isabs(photo) else os.path.join(R, photo)
    try:
        from PIL import Image
        w, h = Image.open(src).size
    except Exception as e:
        w = h = 0; print(f"! photo unreadable: {src} ({e})", file=sys.stderr)
    if min(w, h) >= 600:
        ext = os.path.splitext(src)[1].lower()
        os.makedirs(os.path.join(st, "assets", "clients", cid), exist_ok=True)
        shutil.copy(src, os.path.join(st, "assets", "clients", cid, "portrait" + ext))
        d["photos"] = {"portrait": "portrait" + ext}
    elif w:
        print(f"! photo {src} is {w}x{h}: too small for a still (needs >= 600 px short side); not registered", file=sys.stderr)
missing = [k for k in ("agentName", "title", "brokerage", "licence") if not d["compliance"][k]]
if missing:
    print(f"! compliance fields empty in kit: {', '.join(missing)} (placeholders will show; --strict will refuse)", file=sys.stderr)
json.dump(d, open(path, "w"), indent=2)
print(cid)
