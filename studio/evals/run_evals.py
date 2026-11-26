#!/usr/bin/env python3
"""Intake dry run for the eval briefs. No model calls, no rendering, no network: pure lookups.

For each brief in briefs.jsonl it resolves the client in kits/ (_index.json + aliases, first names, surnames, brand
names), detects the format, applies the compliance blockers (Ontario or unknown province with a null complianceLine
= proof-only; video:false + footage = blocked; QC = French), lists the kit rules that apply, checks the kit's asset
files exist, picks the engine from the routing table in engines/README.md, and classifies every `expect` item
(coded gate check / kit fact / checker agent / critic / variety tool / manual) and, for kit facts, whether the kit
actually holds the fact.

  run_evals.py [N] [--briefs file] [--out dir]      # N briefs (default all); writes report.md + report.json

Verdict per brief: pass (ready, nothing to flag) / warn (producible but flagged: proof-only, unchecked expects,
assets to confirm, French audio, thin kit) / blocked (cannot be produced as asked).
Readiness: ready / proof-only / blocked (a group brief reports per client).
"""
import argparse, datetime, glob, json, os, re, sys
from pathlib import Path

R = Path(os.environ.get("STUDIO_ROOT") or Path(__file__).resolve().parents[2])
HERE = Path(__file__).resolve().parent
ENG = R / "studio/engines"

# ---------------------------------------------------------------- formats and engine routing (engines/README.md)
FORMATS = [  # (regex, format) first match wins
    (r"\bfootage reel\b|\btalking[- ]head\b", "footage-reel"),
    (r"\banimated carousel\b", "animated-carousel"),
    (r"\bshort reel\b|\btrial reel\b", "short-reel"),
    (r"\bgraphic reel\b", "graphic-reel"),
    (r"\bstory frames?\b|\bstory\b|\bstories\b", "story"),
    (r"\bgif\b", "gif"),
    (r"\bcover\b", "cover"),
    (r"\bcarousel\b", "carousel"),
    (r"\bstatic\b", "static"),
    (r"\breel\b", "graphic-reel"),
]
ROUTING = {  # format -> (default engine adapter, command hint, alternatives)
    "graphic-reel": ("films", "", ["hyperframes", "motion"]),
    "short-reel": ("motion", "", ["hyperframes", "films"]),
    "carousel": ("stills", "", ["custom-html", "hyperframes"]),
    "static": ("stills", "", ["custom-html"]),
    "cover": ("stills", "--format story (or the engine that made the reel: poster.jpg)", ["films"]),
    "gif": ("motion", "--gif", ["hyperframes"]),
    "story": ("stills", "--format story (still) / motion (loop)", ["hyperframes"]),
    "footage-reel": ("face-reels", "", ["hyperframes", "films"]),
    "animated-carousel": ("hyperframes", "animated slides", ["stills"]),
}
STILL_FORMATS = {"carousel", "static", "cover", "story", "animated-carousel"}
REEL_FORMATS = {"graphic-reel", "short-reel", "footage-reel", "gif"}
ENGINE_OFF = {"remotion"}
ENGINE_HOME = {  # a cheap existence check of where the engine lives (no execution)
    "films": str(R / "engines/films/styles"),
    "stills": str(R / "engines/stills"),
    "custom-html": str(ENG / "bin/custom_html_skeleton.mjs"),
    "motion": str(R / "engines/motion"),
    "hyperframes": str(ENG / "hyperframes.md"),
    "face-reels": str(R / "engines/face-reels/vendor/ghost-editor/scripts/doctor.sh"),
}
STOPW = set("the a an of and or to in on for with from about by at is are no not new next".split())


def jl(path):
    return [json.loads(l) for l in open(path) if l.strip()]


def norm(s):
    return re.sub(r"[^a-z0-9 ]", " ", (s or "").lower().replace("&", " and ")).split()


# ---------------------------------------------------------------- kits
def load_kits():
    kits = {}
    idx = {i["slug"]: i for i in json.load(open(R / "kits/_index.json"))}
    for f in sorted(glob.glob(str(R / "kits/*/kit.json"))):
        k = json.load(open(f))
        k["_dir"] = str(Path(f).parent)
        k["_idx"] = idx.get(k["id"], {})
        kits[k["id"]] = k
    return kits


def kit_names(k):
    """phrases that identify a client: (phrase, weight)."""
    out = [(k["id"].replace("-", " "), 5), (k.get("name", ""), 5)]
    for a in k.get("aliases") or []:
        out.append((a.replace("-", " "), 4))
    toks = []
    for n in [k.get("name", "")] + [p.get("name", "") for p in k.get("people", [])]:
        for w in norm(n):
            if w not in STOPW and len(w) > 2 and w not in toks:
                toks.append(w)
    for w in toks:
        out.append((w, 2))
    bn = ((k.get("brokerage") or {}).get("name") or "")
    for w in norm(bn):
        if w not in STOPW and len(w) > 4 and w not in ("mortgage", "mortgages", "group", "dominion", "lending", "centres", "centers", "financial", "architects"):
            out.append((w, 1))
    return out


def resolve_client(text, kits):
    """Returns (slug|None, how, candidates). Looks at the 'for <who>' phrase first, then the whole brief."""
    m = re.search(r"\bfor (?:the )?(.+?)(?:'s\b| (?:about|on|with|from|who|and group)\b|:|,|$)", text, re.I)
    scopes = [m.group(1)] if m else []
    scopes.append(text)
    for scope in scopes:
        low = " " + " ".join(norm(scope)) + " "
        toks = set(norm(scope))
        # "the Okafors" -> okafor
        toks |= {t[:-1] for t in toks if t.endswith("s") and len(t) > 4}
        scored = []
        for slug, k in kits.items():
            sc, why = 0, []
            for ph, w in kit_names(k):
                p = " ".join(norm(ph))
                if not p:
                    continue
                if " " in p:
                    if f" {p} " in low:
                        sc += w * 2; why.append(ph)
                elif p in toks:
                    sc += w; why.append(ph)
            if sc:
                scored.append((sc, slug, why))
        scored.sort(reverse=True)
        if scored:
            top = scored[0]
            ties = [s for s in scored if s[0] == top[0]]
            if len(ties) > 1:
                return None, "ambiguous", [s[1] for s in ties]
            return top[1], "matched " + ", ".join(top[2][:3]), [s[1] for s in scored[:3]]
    return None, "no kit matches", []


def detect_format(text):
    low = text.lower()
    for rx, f in FORMATS:
        if re.search(rx, low):
            return f
    return None


def find_idea(idea_id):
    for f in glob.glob(str(R / "radar/ideas/*/ideas_out/*.json")):
        if Path(f).stem == idea_id:
            return json.load(open(f))
    return None


# ---------------------------------------------------------------- per-client readiness
def asset_path(p):
    return (R / p) if p and not str(p).startswith("/") else (Path(p) if p else None)


def rules_for(k, fmt, text):
    low = text.lower()
    out = []
    for r in k.get("rules") or []:
        ap = r.get("appliesTo") or ["all"]
        hit = "all" in ap or fmt in ap or ("reel" in ap and fmt in REEL_FORMATS) or any(
            a.replace("-", " ") in low.replace("-", " ") for a in ap if a not in ("all", "reel"))
        if hit:
            out.append({"id": r.get("id"), "kind": r.get("kind"), "text": (r.get("text") or "")[:140], "value": r.get("value")})
    return out


def readiness(k, fmt, text):
    """Blockers, proof flags, warnings and notes for one client + format."""
    blockers, proof, warns, notes = [], [], [], []
    prov = k.get("province")
    if not k.get("complianceLine"):
        if prov in (None, "", "ON"):
            proof.append(f"complianceLine is null and province is {prov or 'unknown (treated as Ontario)'}: proof-only (O. Reg. 188/08 s.6)")
        else:
            proof.append(f"complianceLine is null ({prov}): no Ontario rule, but the 19 Nov Keith/Dustin job (AB) was also labelled PROOF and the brokerage line is still needed on every piece")
    if fmt == "footage-reel" and k.get("video") is False:
        blockers.append("kit video:false: no face/footage formats for this client")
    if fmt == "footage-reel" and k.get("video") is None:
        warns.append("kit video flag unset (null): confirm the client allows face/footage")
    langs = k.get("languages") or ["en"]
    if prov == "QC" or "fr" in langs:
        notes.append("QC/French client: French version required in script `fr`")
        if fmt in REEL_FORMATS:
            warns.append("French voice needs ElevenLabs (user yes required; free-tier commercial use UNVERIFIED); Kokoro is English only")
    a = k.get("assets") or {}
    missing = []
    for key in ("photo", "footer"):
        p = asset_path(a.get(key))
        if not p or not p.exists():
            missing.append(key)
    logos = [l for l in (a.get("logos") or []) if asset_path(l) and asset_path(l).exists()]
    if not logos:
        missing.append("logo")
    if "footer" in missing and fmt in STILL_FORMATS:
        blockers.append("no footer image in kit assets: every still carries the footer band")
    elif "footer" in missing:
        warns.append("no footer image (reels use it only where a kit rule asks)")
    if "photo" in missing:
        warns.append("no client photo (brand-only piece; no person shown)")
    if "logo" in missing:
        warns.append("no logo file")
    if a.get("check"):
        warns.append(f"{len(a['check'])} asset(s) need user confirmation before use: {', '.join(Path(c).name for c in a['check'])}")
    if k.get("missing"):
        notes.append("kit missing fields: " + ", ".join(k["missing"]))
    comp = k.get("completeness") or (k.get("_idx") or {}).get("completeness") or 0
    if comp < 0.6:
        warns.append(f"thin kit (completeness {comp:.2f})")
    if k.get("group") is None:
        notes.append("no group assigned (batch and weekly plans skip this client)")
    return {"blockers": blockers, "proof": proof, "warns": warns, "notes": notes, "assetsMissing": missing, "completeness": comp}


def route(fmt):
    eng, hint, alts = ROUTING[fmt]
    adapter = ENG / f"{eng}.md"
    home = ENV = ENGINE_HOME.get(eng)
    return {"engine": eng, "hint": hint, "alternatives": alts, "adapterExists": adapter.exists(),
            "homeExists": bool(home and Path(home).exists()), "off": eng in ENGINE_OFF}


# ---------------------------------------------------------------- expect items
EXPECT_RULES = [  # (regex, checked by, how)
    (r"compliance line|footer|licen[cs]e|lic#|brokerage line|fsra", "gate+kit", "copy.compliance_line (fuzzy vs kit complianceLine) + stills.footer_band"),
    (r"slides?|8-10|second hook", "gate", "stills.count 2-20; slide 2 hook needs critic"),
    (r"never says|no guarantee|banned|no #|hashtag|best rates|guarantees? language", "gate", "copy.banned / copy.kit_rules / copy.hashtags"),
    (r"math|\$\d|\d+\.?\d*%|numbers?\b|dated|sourced|figures?", "checker", "checker agent recomputes math[] and sources"),
    (r"safe zone|3:4|centre|center|6 words or fewer|headline", "gate", "stills.gridcrop / video.safezone; word count by script"),
    (r"loops?|under 8 s|under \d+ ?s", "gate", "video.loop_seam / spec.duration (loop flag from job)"),
    (r"every spoken word|captions in his words|captions?", "gate", "video.wer (whisper vs voice lines); word-keeping diff in face-reels.md"),
    (r"different|distinct|near-dup|not used by|other .* clients|style", "variety+neardup", "variety.py (style/device repeat) + neardup.py across siblings"),
    (r"french|quebec|nova scotia|ontario|new brunswick", "kit+checker", "kit languages/province; checker applies province rules"),
    (r"placeholder|pending|confirm", "kit+critic", "kit missing[]/assets.check; critic confirms placeholders visible"),
    (r"one job per client|nightly idea|uses the nightly|client and group", "producer", "intake / job.mjs (not a render check)"),
]
GENERIC = {"brand", "brokerage", "line", "used", "angle", "fact", "facts", "specific", "slide", "slides", "version", "provided", "present",
           "rules", "footer", "every", "stays", "visible", "unknown", "fees", "numbers", "only", "rule", "context", "audience",
           "people", "person", "shown", "show", "shown", "label", "labelled", "labeled", "illustrative", "labels", "named", "lender",
           "comparison", "without", "until", "confirmed", "pending", "logo", "kept", "words", "spoken", "card", "end", "disclaimer",
           "different", "style", "other", "week", "this", "same", "newcomer", "specifics", "sourced", "consider", "kit", "says",
           "both", "outcomes", "prediction", "honestly", "debt", "still", "exists", "stated", "never", "says", "next", "math",
           "checked", "rounded", "voice", "exact", "screen", "headline", "centre", "band", "loops", "under", "uses", "one", "idea",
           "concept", "re", "each", "clients", "differ", "hook", "visual", "dup", "check", "clean", "across", "siblings",
           "investment", "return", "promises", "guarantees", "language", "dated", "respected", "associate", "rotation", "month",
           "market", "end", "figures", "incentives", "first", "time", "buyer", "home", "unknown", "amortizing", "per", "move",
           "about", "private", "second", "mortgage", "costs", "explained", "lockup", "3-line"}


PROV_NAMES = {"ontario": "ON", "quebec": "QC", "nova scotia": "NS", "new brunswick": "NB", "alberta": "AB", "british columbia": "BC"}
GENERIC |= {"heloc", "interest", "ontario", "quebec", "nova", "scotia", "brunswick", "alberta", "month", "newcomer", "bank", "canada", "dec"}


def province_checks(item, k):
    """Province named in an expect item must be the kit's province, unless it is negated ('not Ontario', 'no Ontario rule')."""
    gaps = {}
    low = item.lower()
    for name, code in PROV_NAMES.items():
        for m in re.finditer(r"\b" + name, low):
            if re.search(r"\b(?:no|not|without)\s+(?:the\s+)?$", low[:m.start()]) or low[:m.start()].endswith("#"):
                continue
            gaps[name.title()] = (k or {}).get("province") == code
    return gaps


def fact_tokens(item):
    """Proper nouns and numbers in an expect item that the kit should be able to back."""
    toks = []
    for m in re.finditer(r"(?<![\w$])(\d{3}[.\- ]\d{3}[.\- ]\d{4}|lic#?\s?\d{4,}|\d{5,})", item, re.I):
        toks.append(m.group(1))
    for w in re.findall(r"\b([A-Z][a-zA-Z]{3,})\b", item):
        if w.lower() not in GENERIC and w.lower() not in STOPW:
            toks.append(w)
    return list(dict.fromkeys(toks))


def kit_blob(k):
    d = {x: y for x, y in k.items() if not x.startswith("_") and x not in ("provenance",)}
    return json.dumps(d, ensure_ascii=False).lower() + " " + (Path(k["_dir"]) / "voice.md").read_text(errors="ignore").lower() \
        if (Path(k["_dir"]) / "voice.md").exists() else json.dumps(d, ensure_ascii=False).lower()


def classify_expect(items, k, city_hint=None):
    out = []
    blob = kit_blob(k) if k else ""
    for it in items:
        by, how = [], []
        for rx, b, h in EXPECT_RULES:
            if re.search(rx, it, re.I):
                by.append(b); how.append(h)
        facts = [] if re.search(r"only if kit", it, re.I) else fact_tokens(it)   # conditional on the kit: nothing to verify
        backed = {}
        for f in facts:
            digits = re.sub(r"\D", "", f)
            backed[f] = (digits in re.sub(r"\D", "", blob) if len(digits) >= 5 else f.lower() in blob)
        backed.update(province_checks(it, k))
        if re.search(r"outro", it, re.I) and any(r.get("kind") == "outro" for r in (k or {}).get("rules", [])):
            by.append("kit+critic"); how.append("kit has an outro rule; critic confirms it is applied")
        city = (k or {}).get("city", "")
        if re.search(r"-specific angle|angle|fact used", it, re.I) and city and city.lower() in it.lower():
            backed[city] = True
        if not by:
            by, how = ["critic"], ["judgement item: critic rubric only, no coded check"]
        checkable = any(b in ("gate", "gate+kit", "checker", "variety+neardup", "kit+checker", "kit+critic", "producer") for b in by)
        status = "checkable" if checkable else "judgement"
        miss = [f for f, ok in backed.items() if not ok]
        if miss:
            status = "kit-gap"
        out.append({"item": it, "checkedBy": by, "how": "; ".join(dict.fromkeys(how)), "status": status,
                    "factsInKit": {f: ok for f, ok in backed.items()}, "kitGaps": miss})
    return out


# ---------------------------------------------------------------- one brief
def eval_brief(b, kits):
    text = b["brief"]
    res = {"id": b["id"], "brief": text, "expect": b.get("expect", [])}
    idea = None
    if text.startswith("idea:"):
        idea = find_idea(text[5:].strip())
        if not idea:
            res.update(verdict="blocked", readiness="blocked", blockers=[f"idea file {text[5:]} not found in radar/ideas/*/ideas_out"])
            return res
        tgt = (idea.get("target") or {})
        slug = tgt.get("id") if tgt.get("kind") == "client" else None
        fmt = detect_format(idea.get("format") or "") or "carousel"
        res["idea"] = {"title": idea.get("title"), "forClient": idea.get("forClient"), "group": idea.get("group"), "format": idea.get("format")}
        res["client"] = {"slug": slug, "how": "from idea target"}
        res["format"] = fmt
        return finish(res, [slug] if slug else [], fmt, text, kits, b)
    fmt = detect_format(text)
    gm = re.search(r"\bgroup (\d+)\b", text, re.I)
    if gm:
        g = int(gm.group(1))
        slugs = [s for s, k in kits.items() if k.get("group") == g]
        res["client"] = {"slug": f"group:{g}", "how": f"{len(slugs)} clients in group {g}"}
        res["format"] = fmt
        return finish(res, slugs, fmt, text, kits, b, group=g)
    slug, how, cands = resolve_client(text, kits)
    res["client"] = {"slug": slug, "how": how, "candidates": cands}
    res["format"] = fmt
    return finish(res, [slug] if slug else [], fmt, text, kits, b)


def finish(res, slugs, fmt, text, kits, b, group=None):
    blockers, proof, warns, notes = [], [], [], []
    if not fmt:
        blockers.append("format not detected from the brief")
    if not slugs:
        blockers.append("client not resolved: " + res["client"].get("how", ""))
    per = []
    if fmt and slugs:
        for s in slugs:
            k = kits.get(s)
            if not k:
                blockers.append(f"kit {s} not found")
                continue
            r = readiness(k, fmt, text)
            r["slug"] = s
            r["rules"] = rules_for(k, fmt, text)
            r["readiness"] = "blocked" if r["blockers"] else "proof-only" if r["proof"] else "ready"
            per.append(r)
    if group:
        ok = [p for p in per if p["readiness"] != "blocked"]
        for p in per:
            if p["readiness"] == "blocked":
                blockers_note = f"{p['slug']}: " + "; ".join(p["blockers"])
                warns.append("cannot produce " + blockers_note)
            elif p["readiness"] == "proof-only":
                warns.append(f"{p['slug']}: proof-only (complianceLine null)")
        if not ok:
            blockers.append(f"no client in group {group} can be produced as {fmt}")
        res["group"] = {"n": group, "clients": [{"slug": p["slug"], "readiness": p["readiness"]} for p in per]}
        k0 = None
        nmin = [p["slug"] for p in per if p["readiness"] == "ready"]
        notes.append(f"group {group}: {len(nmin)} ready, {sum(p['readiness']=='proof-only' for p in per)} proof-only, {sum(p['readiness']=='blocked' for p in per)} blocked of {len(per)}")
        notes.append("batch: one job per client, distinct style each (tools/batch_plan.py)")
    else:
        for p in per:
            blockers += p["blockers"]; proof += p["proof"]; warns += p["warns"]; notes += p["notes"]
        k0 = kits.get(slugs[0]) if slugs else None
        if k0:
            res["kit"] = {"name": k0.get("name"), "city": k0.get("city"), "province": k0.get("province"), "group": k0.get("group"),
                          "completeness": per[0]["completeness"] if per else None, "video": k0.get("video"),
                          "languages": k0.get("languages")}
            res["rulesApplied"] = per[0]["rules"] if per else []
            res["assetsMissing"] = per[0]["assetsMissing"] if per else []
    # engine
    if fmt:
        rt = route(fmt)
        res["engine"] = rt
        if rt["off"]:
            blockers.append(f"engine {rt['engine']} is OFF until the user confirms a licence")
        if not rt["adapterExists"]:
            blockers.append(f"no adapter engines/{rt['engine']}.md")
        if not rt["homeExists"]:
            warns.append(f"engine home for {rt['engine']} not found on disk (setup check needed)")
        if rt["engine"] == "face-reels" and k0:
            if not (R / "engines/face-reels/clients" / k0['id']).exists():
                notes.append("face-reels client folder missing: `new_client.py` creates it from kit facts; also needs the supplied clip")
            warns.append("footage reel needs a supplied clip; face-reels pipeline not yet run end to end (UNVERIFIED, see face-reels.md Status)")
    # expect items
    kk = k0 if not group else None
    if group and per:
        kk = kits.get(per[0]["slug"])
    ex = classify_expect(b.get("expect", []), kk) if b.get("expect") else []
    if group:   # facts of a single client do not apply to the whole group
        for e in ex:
            e["factsInKit"], e["kitGaps"] = {}, []
            if e["status"] == "kit-gap":
                e["status"] = "checkable"
    res["expectChecks"] = ex
    ncheck = sum(e["status"] == "checkable" for e in ex)
    ngap = [e for e in ex if e["status"] == "kit-gap"]
    njudge = sum(e["status"] == "judgement" for e in ex)
    for e in ngap:
        warns.append(f"expect '{e['item']}': kit has no {', '.join(e['kitGaps'])} (cannot be verified or produced from kit facts)")
    if njudge:
        notes.append(f"{njudge} expect item(s) are judgement only (critic, no coded check)")
    res["blockers"], res["proof"], res["warnings"], res["notes"] = blockers, proof, warns, notes
    res["expectSummary"] = {"total": len(ex), "checkable": ncheck, "judgement": njudge, "kitGap": len(ngap)}
    if blockers:
        res["verdict"], res["readiness"] = "blocked", "blocked"
    elif proof:
        res["verdict"], res["readiness"] = "warn", "proof-only"
    elif warns or ngap:
        res["verdict"], res["readiness"] = "warn", "ready"
    else:
        res["verdict"], res["readiness"] = "pass", "ready"
    if group:
        res["readiness"] = "group" if not blockers else "blocked"
    return res


# ---------------------------------------------------------------- report
def write_reports(results, kits, out):
    now = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    cnt = lambda key, val: sum(1 for r in results if r[key] == val)
    summary = {"briefs": len(results), "pass": cnt("verdict", "pass"), "warn": cnt("verdict", "warn"), "blocked": cnt("verdict", "blocked"),
               "ready": cnt("readiness", "ready"), "proofOnly": cnt("readiness", "proof-only"), "group": cnt("readiness", "group"),
               "blockedReadiness": cnt("readiness", "blocked")}
    # per-client production readiness (any client in kits), for the reel/still formats
    clients = []
    for s, k in sorted(kits.items()):
        row = {"slug": s, "name": k.get("name"), "province": k.get("province"), "group": k.get("group")}
        r_still = readiness(k, "carousel", "")
        r_reel = readiness(k, "graphic-reel", "")
        r_foot = readiness(k, "footage-reel", "")
        rd = lambda r: "blocked" if r["blockers"] else "proof-only" if r["proof"] else "ready"
        row.update(still=rd(r_still), reel=rd(r_reel), footage=rd(r_foot),
                   why=(r_still["blockers"] + r_still["proof"] + r_reel["blockers"])[:3] and list(dict.fromkeys(r_still["blockers"] + r_still["proof"] + r_reel["blockers"]))[:3])
        clients.append(row)
    summary["clientsReadyForStillsAndReels"] = sum(1 for c in clients if c["still"] == "ready" and c["reel"] == "ready")
    summary["clientsProofOnly"] = sum(1 for c in clients if c["still"] == "proof-only")
    summary["clientsBlockedStills"] = sum(1 for c in clients if c["still"] == "blocked")
    doc = {"at": now, "summary": summary, "briefs": results, "clients": clients}
    (out / "report.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False))

    L = [f"# Eval dry run (intake readiness)", "", f"Generated {now} by `studio/evals/run_evals.py`. No model usage, no renders: kit, routing and gate lookups only.", "",
         f"**{summary['briefs']} briefs: {summary['pass']} pass, {summary['warn']} warn, {summary['blocked']} blocked.** "
         f"Readiness: {summary['ready']} ready, {summary['proofOnly']} proof-only, {summary['group']} group (per-client below), {summary['blockedReadiness']} blocked.", "",
         "| id | client | format | engine | verdict | readiness | why |", "|---|---|---|---|---|---|---|"]
    for r in results:
        why = (r["blockers"] + r["proof"] + r["warnings"])
        w = "; ".join(why[:2]) + (f" (+{len(why)-2})" if len(why) > 2 else "")
        eng = (r.get("engine") or {}).get("engine", "?")
        L.append(f"| {r['id']} | {r['client'].get('slug')} | {r.get('format')} | {eng} | **{r['verdict']}** | {r['readiness']} | {w.replace('|','/')} |")
    L += ["", "## Per brief", ""]
    for r in results:
        L.append(f"### {r['id']}: {r['brief']}")
        L.append(f"- Verdict **{r['verdict']}** / {r['readiness']}. Client: `{r['client'].get('slug')}` ({r['client'].get('how')}). Format: {r.get('format')}.")
        e = r.get("engine")
        if e:
            L.append(f"- Engine: `{e['engine']}` {e['hint']} (alternatives: {', '.join(e['alternatives'])}); adapter {'ok' if e['adapterExists'] else 'MISSING'}, engine home {'found' if e['homeExists'] else 'NOT FOUND'}.")
        if r.get("kit"):
            kt = r["kit"]
            L.append(f"- Kit: {kt['name']}, {kt['city']} {kt['province']}, group {kt['group']}, completeness {kt['completeness']}, video={kt['video']}, languages {kt['languages']}.")
        for key, lab in (("blockers", "BLOCKER"), ("proof", "PROOF-ONLY"), ("warnings", "warn"), ("notes", "note")):
            for x in r.get(key, []):
                L.append(f"- {lab}: {x}")
        if r.get("group"):
            L.append("- Group members: " + ", ".join(f"{c['slug']} ({c['readiness']})" for c in r["group"]["clients"]))
        if r.get("rulesApplied"):
            L.append("- Kit rules that apply: " + " | ".join(f"[{x['kind']}] {x['text'][:90]}" for x in r["rulesApplied"]))
        if r.get("expectChecks"):
            L.append(f"- Expect items ({r['expectSummary']['checkable']} checkable, {r['expectSummary']['judgement']} judgement, {r['expectSummary']['kitGap']} kit gaps):")
            for x in r["expectChecks"]:
                gap = f"; kit gap: {', '.join(x['kitGaps'])}" if x["kitGaps"] else ""
                L.append(f"  - {x['status']}: {x['item']} -> {'/'.join(x['checkedBy'])}{gap}")
        L.append("")
    L += ["## Clients: production readiness (all kits)", "",
          "Still = carousel/static, Reel = graphic reel, Footage = face/footage reel. `proof-only` = complianceLine null on an Ontario or unknown-province kit.", "",
          "| client | prov | grp | still | reel | footage | main reasons |", "|---|---|---|---|---|---|---|"]
    for c in clients:
        L.append(f"| {c['slug']} | {c['province']} | {c['group']} | {c['still']} | {c['reel']} | {c['footage']} | {'; '.join(c['why'])[:150].replace('|','/')} |")
    L.append("")
    L.append(f"Clients ready for stills and reels: {summary['clientsReadyForStillsAndReels']} of {len(clients)}; proof-only: {summary['clientsProofOnly']}; blocked for stills: {summary['clientsBlockedStills']}.")
    (out / "report.md").write_text("\n".join(L) + "\n")
    return doc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("n", nargs="?", type=int, default=0, help="number of briefs (default all)")
    ap.add_argument("--briefs", default=str(HERE / "briefs.jsonl"))
    ap.add_argument("--out", default=str(HERE))
    a = ap.parse_args()
    kits = load_kits()
    briefs = jl(a.briefs)
    if a.n:
        briefs = briefs[:a.n]
    results = [eval_brief(b, kits) for b in briefs]
    doc = write_reports(results, kits, Path(a.out))
    s = doc["summary"]
    print(f"{s['briefs']} briefs: pass {s['pass']}, warn {s['warn']}, blocked {s['blocked']} | ready {s['ready']}, proof-only {s['proofOnly']}, group {s['group']}")
    for r in results:
        print(f"  {r['id']} {r['verdict']:8} {r['readiness']:10} {str(r['client'].get('slug')):30} {r.get('format')}")
    print(f"-> {Path(a.out)/'report.md'}")


if __name__ == "__main__":
    main()
