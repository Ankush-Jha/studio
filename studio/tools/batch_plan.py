#!/usr/bin/env python3
"""Batch-mode planner for /create ("carousel for group 2 on <topic>"). Read-only, no model usage.

  batch_plan.py --group N --topic "<t>" [--format carousel] [--no-reel] [--json] [--today YYYY-MM-DD]

1. Lists the group's clients from kits/ (kits/_index.json + kit.json).
2. Flags who cannot be produced as asked: no footer image (every still carries the footer band; blocked),
   complianceLine null (proof-only: Ontario/unknown province per O. Reg. 188/08; other provinces also labelled
   PROOF to match the 19 Nov jobs), video:false when --format is a footage reel (blocked), video:false otherwise
   (noted: no face/footage formats), assets awaiting confirmation, QC French requirement.
3. Proposes ONE distinct stills style (for the still format) and ONE distinct films style (for a reel
   version) per producible client, so siblings never share a style. Uses variety.py's data (library cards + kit
   history): a style that equals the client's last piece is excluded (hard conflict), a style used for anyone in the
   last 7 days costs extra (soft conflict). Stills prefer the client's roster styles (kit `stills` primary, then
   secondary); an optimal one-to-one assignment (scipy) resolves collisions between siblings.
"""
import argparse, datetime, hashlib, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import variety as V

R = V.R
STILL_FORMATS = {"carousel", "static", "cover", "story", "animated-carousel"}
FOOTAGE = {"footage-reel"}


def load_group(n):
    idx = {i["slug"]: i for i in json.load(open(R / "kits/_index.json"))}
    out = []
    for s, i in sorted(idx.items()):
        if i.get("group") == n:
            k = json.load(open(R / f"kits/{s}/kit.json"))
            out.append(k)
    return out


def flags(k, fmt):
    blockers, proof, notes = [], [], []
    a = k.get("assets") or {}
    fp = a.get("footer")
    if fmt in STILL_FORMATS and not (fp and (R / fp).exists()):
        blockers.append("no footer image in kit assets (stills need the footer band)")
    if not k.get("complianceLine"):
        prov = k.get("province")
        proof.append(f"complianceLine null ({prov or 'province unknown'}): PROOF only until the brokerage line is supplied")
    if fmt in FOOTAGE and k.get("video") is not True:
        blockers.append(f"kit video={k.get('video')}: no footage/face formats")
    elif k.get("video") is False:
        notes.append("video:false (stills and graphic reels only, no footage/face reels)")
    if a.get("check"):
        notes.append("needs confirmation before use: " + ", ".join(Path(c).name for c in a["check"]))
    if k.get("province") == "QC" or "fr" in (k.get("languages") or []):
        notes.append("French version required (and French voice needs ElevenLabs, user yes)")
    if not a.get("photo") or not (R / a["photo"]).exists():
        notes.append("no photo: brand/type-led piece, no person shown")
    return blockers, proof, notes


def history(client):
    """Pieces for the client, oldest first (same loader as variety.py)."""
    ps = V.load_pieces(client, False)
    mine = sorted([p for p in ps if client in p["clients"]], key=lambda p: (V.d(p["date"]), p["id"]))
    return ps, mine


def salt(*parts):
    return int(hashlib.md5("|".join(parts).encode()).hexdigest()[:6], 16) / 0xFFFFFF   # 0..1, deterministic tie-break


def cost_table(clients, pool, pieces, today, topic, prefer):
    """cost[c][style]: lower is better; None = excluded (same style as the client's last piece)."""
    used_week = {(p.get("style") or "").lower() for p in pieces if 0 <= (today - V.d(p["date"])).days <= 7}
    used_any = {(p.get("style") or "").lower() for p in pieces}
    table = {}
    for k in clients:
        s = k["id"]
        _, mine = history(s)
        last = (mine[-1].get("style") or "").lower() if mine else ""
        used_client = {(p.get("style") or "").lower() for p in mine}
        pref = prefer(k)
        row = {}
        for st in pool:
            if st == last:
                continue
            c = 0.0
            c += pref.index(st) if st in pref else 4 + (0 if st not in used_any else 1)
            if st in used_week:
                c += 1.5
            if st in used_client:
                c += 1.0
            c += salt(s, st, topic) * 0.4
            row[st] = c
        table[s] = row
    return table


def assign(clients, table):
    """One distinct style per client at minimum total cost (scipy Hungarian); greedy fallback."""
    ids = [k["id"] for k in clients]
    styles = sorted({st for r in table.values() for st in r})
    if len(styles) < len(ids):
        print(f"warning: only {len(styles)} styles for {len(ids)} clients; some siblings will share", file=sys.stderr)
    BIG = 1e6
    try:
        import numpy as np
        from scipy.optimize import linear_sum_assignment
        M = np.full((len(ids), max(len(styles), len(ids))), BIG)
        for i, s in enumerate(ids):
            for j, st in enumerate(styles):
                if st in table[s]:
                    M[i, j] = table[s][st]
        ri, ci = linear_sum_assignment(M)
        return {ids[i]: (styles[j] if j < len(styles) and M[i, j] < BIG else None) for i, j in zip(ri, ci)}
    except ImportError:
        taken, out = set(), {}
        for s in ids:
            for st, _ in sorted(table[s].items(), key=lambda x: x[1]):
                if st not in taken:
                    taken.add(st); out[s] = st; break
        return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--group", type=int, required=True)
    ap.add_argument("--topic", required=True)
    ap.add_argument("--format", default="carousel")
    ap.add_argument("--no-reel", action="store_true", help="skip the films (reel) proposal")
    ap.add_argument("--today", default="")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    today = V.d(a.today) if a.today else datetime.date.today()
    group = load_group(a.group)
    if not group:
        print(f"no clients in group {a.group}", file=sys.stderr); return 2
    op, st = V.list_styles()
    pieces = V.load_pieces("__none__", False)
    rows, producible = [], []
    for k in group:
        b, p, n = flags(k, a.format)
        r = {"slug": k["id"], "name": k.get("name"), "city": k.get("city"), "province": k.get("province"),
             "readiness": "blocked" if b else "proof-only" if p else "ready", "blockers": b, "proof": p, "notes": n,
             "roster": [x for x in ((k.get("stills") or {}).get("primary"), (k.get("stills") or {}).get("secondary")) if x]}
        rows.append(r)
        if not b:
            producible.append(k)
    # still styles: roster first
    pref_still = lambda k: [x for x in ((k.get("stills") or {}).get("primary"), (k.get("stills") or {}).get("secondary")) if x in st]
    t_still = cost_table(producible, st, pieces, today, a.topic, pref_still)
    pick_still = assign(producible, t_still) if a.format in STILL_FORMATS else {}
    pick_reel = {}
    if not a.no_reel and producible:
        # films: prefer styles nobody has used (variety.py "never used anywhere first"), then rank by salt
        used_any = {(p.get("style") or "").lower() for p in pieces}
        pref_reel = lambda k: []
        t_reel = cost_table(producible, op, pieces, today, a.topic + "|reel", pref_reel)
        for s, row in t_reel.items():
            for stl in row:
                row[stl] += 0 if stl not in used_any else 2.5   # new styles first
        pick_reel = assign(producible, t_reel)
    # verify each proposal with variety.py's own conflict rules
    for r in rows:
        s = r["slug"]
        r["still"] = pick_still.get(s)
        r["films"] = pick_reel.get(s)
        _, mine = history(s)
        for key, stl, fmt in (("stillCheck", r["still"], a.format), ("opuscarCheck", r["films"], "graphic-reel")):
            if not stl:
                continue
            conf = []
            last = (mine[-1].get("style") or "").lower() if mine else ""
            if stl == last:
                conf.append("hard: same as client's last piece")
            wk = [p for p in pieces if (p.get("style") or "").lower() == stl and 0 <= (today - V.d(p["date"])).days <= 7]
            if wk:
                conf.append(f"soft: style used in last 7 days ({wk[-1]['id']})")
            r[key] = {"score": round(1 - sum(0.6 if c.startswith("hard") else 0.15 for c in conf), 2), "conflicts": conf}
    # sibling uniqueness proof
    for key in ("still", "films"):
        vals = [r[key] for r in rows if r.get(key)]
        assert len(vals) == len(set(vals)), f"duplicate {key} styles among siblings: {vals}"
    out = {"group": a.group, "topic": a.topic, "format": a.format, "today": str(today), "clients": rows,
           "summary": {"clients": len(rows), "ready": sum(r["readiness"] == "ready" for r in rows),
                       "proofOnly": sum(r["readiness"] == "proof-only" for r in rows),
                       "blocked": sum(r["readiness"] == "blocked" for r in rows)}}
    if a.json:
        print(json.dumps(out, indent=1, ensure_ascii=False)); return 0
    s = out["summary"]
    print(f"Batch plan: group {a.group}, {a.format}, topic \"{a.topic}\" ({today})")
    print(f"{s['clients']} clients: {s['ready']} ready, {s['proofOnly']} proof-only, {s['blocked']} blocked\n")
    print(f"{'client':20} {'prov':4} {'status':10} {'still style':12} {'films style':20} roster")
    for r in rows:
        print(f"{r['slug'][:20]:20} {str(r['province']):4} {r['readiness']:10} {(str(r['still'] or '-') + ('' if r['still'] in r['roster'] else '*')):12} {str(r['films'] or '-'):20} {'/'.join(r['roster'])}")
    print()
    for r in rows:
        for lab, xs in (("BLOCKED", r["blockers"]), ("PROOF", r["proof"]), ("note", r["notes"])):
            for x in xs:
                print(f"  {r['slug']}: {lab}: {x}")
        for key in ("stillCheck", "opuscarCheck"):
            c = r.get(key)
            if c and c["conflicts"]:
                print(f"  {r['slug']}: {key[:-5]} variety {c['score']}: {'; '.join(c['conflicts'])}")
    print("\n* = off the client's roster (the group has 8 clients but only 3 distinct roster styles: magazine, cutout, annotated).")
    print("siblings share no still style and no films style (asserted).")
    print("Next: one `job.mjs new --client <slug> --format <f> --topic ...` per row; hand each strategist its row's style as the starting point.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
