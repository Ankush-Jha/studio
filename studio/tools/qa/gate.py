#!/usr/bin/env python3
"""Studio QA gate.
usage: gate.py <job_dir> [--kind video|stills|auto] [--script script.json] [--client slug] [--caption file] [--kit kit.json]
       gate.py --target <folder-or-file>      (any folder; report goes to <folder>/qa/)
Writes qa/report.json, qa/frames/*.jpg, qa/contact.jpg. Exit 0 = pass, 1 = fail."""
import argparse, datetime, json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import R, Report, find_assets, safe_json, jdump, VIDEO_EXT, IMAGE_EXT
from contact import build_contact
import copycheck, neardup as nd


def find_caption(job, out):
    for base in (job, out):
        for n in ("caption.txt", "caption.md", "CAPTION.md", "Caption.txt"):
            if (base / n).exists():
                return base / n
    return None


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("job", nargs="?")
    ap.add_argument("--target")
    ap.add_argument("--kind", default="auto", choices=["auto", "video", "stills"])
    ap.add_argument("--script")
    ap.add_argument("--client")
    ap.add_argument("--caption")
    ap.add_argument("--kit")
    ap.add_argument("--loop", action="store_true", help="treat as a looping reel (PSNR seam warn < 20 dB)")
    ap.add_argument("--no-neardup", action="store_true")
    ap.add_argument("--against", default="all")
    a = ap.parse_args(argv)
    t0 = time.time()
    tgt = Path(a.target or a.job).resolve()
    if tgt.is_file():
        job, out = tgt.parent, tgt.parent
        files = [tgt]
    elif a.target:
        job, out = tgt, tgt
        files = None
    else:
        job, out = tgt, tgt / "out"
        files = None
    if not out.exists():
        print(f"no such folder {out}", file=sys.stderr); return 2
    qa = job / "qa"
    (qa / "frames").mkdir(parents=True, exist_ok=True)
    for old in (qa / "frames").glob("*.jpg"):
        old.unlink()
    jj = safe_json(job / "job.json") or {}
    client = a.client or jj.get("client")
    script_p = Path(a.script) if a.script else (job / "script.json" if (job / "script.json").exists() else None)
    script = safe_json(script_p) if script_p and script_p.exists() else None
    loop = a.loop or bool((script or {}).get("loop") or jj.get("loop"))
    lang = (script or {}).get("lang", "en")

    vids, imgs = ([f for f in files if f.suffix.lower() in VIDEO_EXT], [f for f in files if f.suffix.lower() in IMAGE_EXT]) \
        if files else find_assets(out)
    # contact sheets / review aids belong in qa/, not out/: never treat them as deliverables
    stray = [] if files else [i for i in imgs if i.stem.lower().startswith("contact") and "out" in i.relative_to(job).parts[:-1]]
    imgs = [i for i in imgs if i not in stray]
    kind = a.kind
    if kind == "auto":
        kind = "video" if vids else "stills"
    if kind == "video":
        imgs = [i for i in imgs if i.stem.lower() in ("poster", "cover", "thumbnail")]   # video jobs: only the cover still
    else:
        vids = []
    rep = Report()
    if stray:
        rep.add("out.review_aids", "Review aids in out/", "warn", ", ".join(str(p.relative_to(job)) for p in stray),
                "none (contact sheets live in qa/)", "ignored by QA; move review aids to qa/")
    contact_items, frame_paths, ocr_text = [], [], []
    extra = {}
    if not vids and not imgs:
        rep.add("input.assets", "Assets found", "fail", 0, ">= 1 video or image", f"nothing in {out}")
    # ---- video
    import video as V
    vres = {}
    for v in vids:
        r = V.run_video(rep, v, qa, script, loop, lang, multi=len(vids) > 1, job=job)
        vres[v.name] = r
        frame_paths += [p for _, p in r["frames"]]
        contact_items += [(p, f"{v.stem[:14]} {t:.1f}s") for t, p in r["frames"]]
        ocr_text += r["ocr"]["text"]
        extra.setdefault("runtime_s", {})[v.name] = round(r["secs"], 1)
        extra.setdefault("scene_cuts", {})[v.name] = r["scene_cuts"]
        extra.setdefault("transcript", {})[v.name] = r["transcript"]
    # ---- stills
    sres = None
    if imgs:
        import stills as S
        s0 = time.time()
        footer_h = 0
        try:
            kj = json.loads((R / "kits" / str(client) / "kit.json").read_text()) if client else {}
            fp = (kj.get("assets") or {}).get("footer")
            if fp and (R / fp).exists():
                from PIL import Image as _I
                with _I.open(R / fp) as _f:
                    footer_h = round(_f.height * 1080 / _f.width)
        except Exception:
            footer_h = 0
        sres = S.run_stills(rep, imgs, qa, kind, loop, footer_h=footer_h)
        frame_paths += [p for _, p in sres["frames"]]
        if not vids:
            contact_items += [(p, n) for n, p in sres["frames"]]
        else:
            contact_items += [(p, f"cover {n}") for n, p in sres["frames"]]
        ocr_text += sres["text"]
        extra.setdefault("runtime_s", {})["stills"] = round(time.time() - s0, 1)
        extra["gridcrop"] = "qa/gridcrop.jpg"
    # ---- copy & compliance
    cap_p = Path(a.caption) if a.caption else find_caption(job, out)
    pieces = []
    if cap_p:
        pieces.append(("caption", copycheck.load_text(str(cap_p))))
    vl = V.voice_lines(script, job)
    ocrblob = "\n".join(ocr_text)
    if pieces:
        txt = pieces[0][1]
        copycheck.check_copy(txt, client, a.kit, ocrblob, rep)
    else:
        rep.add("copy.caption", "Caption file", "skip", None, "caption.txt", "no caption.txt / CAPTION.md found; copy checks not run")
    if vl:   # script voice lines: banned phrases + rate disclosure only
        sub = Report()
        copycheck.check_copy(" ".join(vl), client, a.kit, ocrblob, sub, tag="script")
        keep = {"copy.banned", "copy.emdash", "copy.rate_disclosure"}
        rep.checks += [c for c in sub.checks if c["id"].split("@")[0] in keep]
    # ---- near-duplicate
    if not a.no_neardup:
        try:
            idx = nd.build_index(a.against)
            prefix = str(job.resolve()) + "/"
            worst = ("pass", "", None)
            n_checked = 0
            for p in ([*vids] + [*imgs])[:20]:
                m = nd.find_matches(p, a.against, client, None, exclude_prefix=prefix, top=3, index=idx)
                n_checked += 1
                st, det = nd.verdict(m, client)
                rank = {"pass": 0, "warn": 1, "fail": 2}
                if rank[st] > rank[worst[0]]:
                    worst = (st, f"{p.name}: {det}", m)
                elif worst[2] is None and m:
                    worst = (worst[0], worst[1], m)
            near = worst[2][0] if worst[2] else None
            rep.add("dup.near", "Near-duplicate vs library/jobs/radar", worst[0],
                    {"nearest": near and {"distance": round(near["distance"], 1), "client": near["client"], "path": near["path"]},
                     "indexed": len(idx), "checked": n_checked},
                    "dist > 10 (fail <= 6 other client, warn <= 10)", worst[1] or (f"index has {len(idx)} items" if idx else "index empty; nothing to compare against"))
        except Exception as e:
            rep.add("dup.near", "Near-duplicate", "skip", None, None, f"neardup error: {e}")
    # ---- contact + report
    contact = None
    if contact_items:
        contact = build_contact(contact_items, qa / "contact.jpg")
    # Waivers: qa/waivers.json [{"check": "<substring of check name>", "reason": "...", "detailContains": "<optional>"}]
    # turn a matching FAIL into a WARN marked WAIVED, so a client-supplied asset (e.g. their footer) cannot block delivery
    # while staying visible to the critic and the user.
    wf = qa / "waivers.json"
    if wf.exists():
        try:
            waivers = json.loads(wf.read_text())
        except Exception:
            waivers = []
        for ch in rep.checks:
            if ch["status"] != "fail":
                continue
            for w in waivers if isinstance(waivers, list) else []:
                if str(w.get("check", "")).lower() in ch["name"].lower() and (not w.get("detailContains") or str(w["detailContains"]).lower() in str(ch.get("detail", "")).lower()):
                    ch["status"] = "warn"
                    ch["detail"] = f"WAIVED: {w.get('reason', '')} | {ch.get('detail', '')}"
                    break
    report = {"pass": rep.ok, "checks": rep.checks,
              "frames": [str(Path(p).relative_to(job)) for p in frame_paths],
              "contact": "qa/contact.jpg" if contact else None,
              "at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
              "kind": kind, "client": client, "summary": rep.counts(), "elapsed_s": round(time.time() - t0, 1), **extra}
    jdump(report, qa / "report.json")
    c = rep.counts()
    print(f"QA {'PASS' if rep.ok else 'FAIL'}  pass={c['pass']} warn={c['warn']} fail={c['fail']} skip={c['skip']}  ({report['elapsed_s']}s)  -> {qa/'report.json'}")
    for ch in rep.checks:
        if ch["status"] != "pass":
            v = json.dumps(ch["value"], default=str)
            print(f"  {ch['status'].upper():4} {ch['name']}: {v[:110]}  {ch['detail'][:160]}")
    return 0 if rep.ok else 1


if __name__ == "__main__":
    sys.exit(main())
