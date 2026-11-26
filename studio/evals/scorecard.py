#!/usr/bin/env python3
"""Studio quality scorecard: computes every automatic test in tests.json from the files on disk.

  studio/.venv/bin/python studio/evals/scorecard.py [--date YYYY-MM-DD] [--offline] [--quiet] [--json]
  studio/.venv/bin/python studio/evals/scorecard.py --write-catalogue     # refresh the table in TESTS.md

Writes studio/evals/history/<date>.json
  {date, at, suites:{<suite>:{name, score, weight, counts, tests:[{id,name,value,display,target,status,detail,method}]}}, overall, notes}
and keeps history/index.json ([{date, overall, suites:{id:score}}], oldest first). Re-running on the same day overwrites that day.

Spot-check tests read studio/evals/reviews/<date>.json (latest file on or before the date; orchestrator writes
[{test, value, sample, verdict, notes}]); without one they are "pending". Monthly golden tests read
studio/evals/golden/results/*.json (latest). Network: only radar.metric_accuracy (YouTube Data API, 1 quota unit);
--offline skips it. Never prints keys. Read-only everywhere except studio/evals/history/.
"""
import argparse, datetime as dt, glob, json, math, os, random, re, statistics, subprocess, sys, tempfile
import urllib.parse, urllib.request
from collections import Counter, defaultdict
from pathlib import Path

R = Path(os.environ.get("STUDIO_ROOT") or Path(__file__).resolve().parents[2])
EV = R / "studio/evals"
HIST = EV / "history"
REV = EV / "reviews"
GOLD = EV / "golden/results"
CACHE = HIST / ".cache"
RADAR = R / "radar"
JOBS = R / "jobs"
KITS = R / "kits"
LIB = R / "library"
API_PLATFORMS = ("instagram", "youtube", "web")
UTC = dt.timezone.utc


class NoData(Exception):
    """The data source for this test does not exist yet."""


# ---------------------------------------------------------------- small helpers
def jload(p, default=None):
    try:
        return json.loads(Path(p).read_text())
    except Exception:
        return default


def jl(p):
    out = []
    try:
        for line in Path(p).read_text().split("\n"):  # not splitlines(): captions hold U+2028
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except Exception:
                    pass
    except FileNotFoundError:
        pass
    return out


def pdate(s):
    """Parse ISO-ish dates ('2026-11-15T12:00:17Z', '+05:30' offsets, '2026-11-15', '2026-11') to aware UTC."""
    if not s or not isinstance(s, str):
        return None
    s = s.strip()
    try:
        if re.fullmatch(r"\d{4}-\d{2}", s):
            return dt.datetime.fromisoformat(s + "-01").replace(tzinfo=UTC)
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
            return dt.datetime.fromisoformat(s).replace(tzinfo=UTC)
        d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=UTC)
    except Exception:
        return None


def pct(a, b):
    return round(100.0 * a / b, 1) if b else None


def median(xs):
    xs = [x for x in xs if x is not None]
    return round(statistics.median(xs), 1) if xs else None


def mean(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 2) if xs else None


# ---------------------------------------------------------------- data loading (lazy, cached)
class D:
    _c = {}

    @classmethod
    def get(cls, k, fn):
        if k not in cls._c:
            cls._c[k] = fn()
        return cls._c[k]

    @classmethod
    def posts(cls):
        return cls.get("posts", lambda: jl(RADAR / "posts.jsonl"))

    @classmethod
    def accounts(cls):
        def f():
            a = jload(RADAR / "accounts.json", [])
            return a if isinstance(a, list) else a.get("accounts", [])
        return cls.get("accounts", f)

    @classmethod
    def kits(cls):
        def f():
            out = {}
            for p in sorted(KITS.glob("*/kit.json")):
                k = jload(p)
                if not k:
                    continue
                d = p.parent
                out[k.get("id") or d.name] = {"kit": k, "tokens": jload(d / "tokens.json", {}), "confirm": jload(d / "confirm.json", {}),
                                              "history": jload(d / "history.json", {})}
            return out
        return cls.get("kits", f)

    @classmethod
    def jobs(cls):
        def f():
            out = []
            for p in sorted(JOBS.glob("*/job.json")):
                if p.parent.name.startswith("_"):
                    continue
                j = jload(p)
                if not j:
                    continue
                d = p.parent
                out.append({"dir": d, "job": j, "check": jload(d / "check.json"), "qa": jload(d / "qa/report.json"),
                            "critique": jload(d / "qa/critique.json"), "concepts": jload(d / "concepts.json"),
                            "waivers": jload(d / "qa/waivers.json", [])})
            return out
        return cls.get("jobs", f)

    @classmethod
    def feedback(cls):
        return cls.get("feedback", lambda: jl(LIB / "feedback.jsonl"))


def acct_index():
    return {a["id"]: a for a in D.accounts()}


def now_utc():
    return dt.datetime.now(UTC)


# ---------------------------------------------------------------- RADAR
def _eligible_accounts(plat):
    return [a for a in D.accounts() if a.get("platform") == plat and a.get("active", True) and a.get("discoverable", True) is not False]


def radar_coverage(plat):
    def fn(ctx):
        accts = _eligible_accounts(plat)
        if not D.posts():
            raise NoData("radar/posts.jsonl missing or empty")
        if not accts:
            raise NoData(f"no active {plat} accounts in radar/accounts.json")
        cutoff = ctx["now"] - dt.timedelta(days=30)
        by = defaultdict(list)
        for p in D.posts():
            by[p.get("account")].append(p)
        api = plat in API_PLATFORMS
        hit = [a for a in accts if any((not api) or ((pdate(p.get("date")) or dt.datetime.min.replace(tzinfo=UTC)) >= cutoff) for p in by.get(a["id"], []))]
        miss = [a["id"] for a in accts if a not in hit]
        skipped = sum(1 for a in D.accounts() if a.get("platform") == plat and a.get("discoverable") is False)
        det = f"{len(hit)}/{len(accts)} accounts" + (" with a post in 30 days" if api else " with any post")
        if skipped:
            det += f"; {skipped} not discoverable (excluded)"
        if miss:
            det += "; missing: " + ", ".join(miss[:6]) + (" …" if len(miss) > 6 else "")
        return pct(len(hit), len(accts)), det
    return fn


def radar_freshness(ctx):
    if not D.posts():
        raise NoData("radar/posts.jsonl missing")
    accts = [a for p in API_PLATFORMS for a in _eligible_accounts(p)]
    newest = {}
    for p in D.posts():
        s = pdate(p.get("seen"))
        if s and (p.get("account") not in newest or s > newest[p["account"]]):
            newest[p["account"]] = s
    cut = ctx["now"] - dt.timedelta(hours=48)
    fresh = [a for a in accts if newest.get(a["id"]) and newest[a["id"]] >= cut]
    per = Counter(a["platform"] for a in fresh)
    tot = Counter(a["platform"] for a in accts)
    det = ", ".join(f"{k} {per.get(k, 0)}/{tot[k]}" for k in API_PLATFORMS if tot.get(k))
    return pct(len(fresh), len(accts)), f"{len(fresh)}/{len(accts)} fresh < 48 h ({det})"


def radar_source_health(ctx):
    st = jload(RADAR / "status.json")
    if not st or not st.get("sources"):
        raise NoData("radar/status.json missing")
    src = st["sources"]
    ok = [k for k, v in src.items() if v.get("ok")]
    bad = [f"{k}: {(v.get('error') or 'not ok')[:70]}" for k, v in src.items() if not v.get("ok")]
    return pct(len(ok), len(src)), f"{len(ok)}/{len(src)} ok" + ("; " + "; ".join(bad) if bad else "") + f" (checked {st.get('checked', '?')[:16]})"


def _env_key(name):
    p = R / "studio/.env"
    if os.environ.get(name):
        return os.environ[name]
    try:
        for line in p.read_text().split("\n"):
            m = re.match(rf"\s*(?:export\s+)?{name}\s*=\s*(.*)\s*$", line)
            if m:
                return m.group(1).strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return None


def radar_metric_accuracy(ctx):
    if ctx["offline"]:  # keep today's earlier online result instead of blanking it
        prev = jload(HIST / f"{ctx['date']}.json", {})
        for t in ((prev.get("suites") or {}).get("radar") or {}).get("tests", []):
            if t.get("id") == "radar.metric_accuracy" and t.get("value") is not None:
                return t["value"], t["detail"].split(" [carried")[0] + " [carried from an earlier run today]"
        raise NoData("skipped (--offline)")
    key = _env_key("YOUTUBE_API_KEY")
    if not key:
        raise NoData("no YOUTUBE_API_KEY in studio/.env")
    yt = [p for p in D.posts() if p.get("source") == "youtube-api" and (p.get("metrics") or {}).get("views") is not None]
    if not yt:
        raise NoData("no youtube-api posts with views")
    recent = [p for p in yt if (pdate(p.get("seen")) or dt.datetime.min.replace(tzinfo=UTC)) >= ctx["now"] - dt.timedelta(hours=48)]
    pool = recent if len(recent) >= 10 else yt
    rnd = random.Random(ctx["date"])
    sample = rnd.sample(pool, min(10, len(pool)))
    ids = []
    for p in sample:
        m = re.search(r"(?:v=|youtu\.be/|shorts/)([\w-]{11})", p.get("url", "")) or re.match(r"yt-([\w-]{11})$", p.get("id", ""))
        if m:
            ids.append((m.group(1), p))
    q = urllib.parse.urlencode({"part": "statistics", "id": ",".join(i for i, _ in ids), "key": key})
    try:
        with urllib.request.urlopen("https://www.googleapis.com/youtube/v3/videos?" + q, timeout=20) as r:
            data = json.loads(r.read())
    except Exception as e:  # never echo the URL (it holds the key)
        raise NoData(f"YouTube API not reachable ({type(e).__name__})")
    fresh = {it["id"]: int(it.get("statistics", {}).get("viewCount", 0)) for it in data.get("items", [])}
    good, drifts, gone = 0, [], 0
    for vid, p in ids:
        if vid not in fresh:
            gone += 1
            continue
        f, s = fresh[vid], p["metrics"]["views"]
        dr = abs(f - s) / f if f else (0 if s == 0 else 1)
        drifts.append(dr)
        good += dr <= 0.05
    n = len(drifts)
    if not n:
        raise NoData("none of the sampled videos came back from the API")
    worst = max(drifts)
    return pct(good, n), f"{good}/{n} within 5% (median drift {statistics.median(drifts) * 100:.1f}%, worst {worst * 100:.1f}%)" + (f"; {gone} removed/private" if gone else "") + f"; sample from {'last 48 h' if pool is recent else 'all youtube-api posts'}"


def _norm_url(u):
    if not u:
        return None
    m = re.search(r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/)|youtu\.be/)([\w-]{11})", u)
    if m:
        return "yt:" + m.group(1)
    m = re.search(r"instagram\.com/(?:[\w.]+/)?(?:p|reel|reels|tv)/([\w-]+)", u)
    if m:
        return "ig:" + m.group(1)
    try:
        pu = urllib.parse.urlsplit(u.strip())
        return (pu.netloc.lower().removeprefix("www.") + pu.path.rstrip("/")).lower()
    except Exception:
        return u


def radar_duplicates(ctx):
    P = D.posts()
    if not P:
        raise NoData("radar/posts.jsonl missing")
    seen_id, seen_url, seen_cap = set(), set(), set()
    dup = Counter()
    for p in P:
        why = None
        if p.get("id") in seen_id:
            why = "id"
        u = _norm_url(p.get("url"))
        if not why and u and u in seen_url:
            why = "url"
        cap = (p.get("caption") or p.get("hook") or "").strip().lower()[:80]
        ck = (p.get("account"), cap, (p.get("date") or "")[:10]) if len(cap) >= 12 else None
        if not why and ck and ck in seen_cap:
            why = "caption"
        if why:
            dup[why] += 1
        seen_id.add(p.get("id"))
        if u:
            seen_url.add(u)
        if ck:
            seen_cap.add(ck)
    n = sum(dup.values())
    return round(100.0 * n / len(P), 2), f"{n} of {len(P)} posts" + (" (" + ", ".join(f"{k} {v}" for k, v in dup.items()) + ")" if n else "")


def radar_date_sanity(ctx):
    P = D.posts()
    if not P:
        raise NoData("radar/posts.jsonl missing")
    bad = Counter()
    ex = []
    stamp = Counter()
    for p in P:
        ds, ss = p.get("date"), p.get("seen")
        d, s = pdate(ds), pdate(ss)
        if not d:
            continue
        why = None
        timed = isinstance(ds, str) and len(ds) > 10
        if timed:
            stamp[(p.get("account"), ds)] += 1
        if d.year < 2005:
            why = "before 2005"
        elif s and d > s + dt.timedelta(days=1):
            why = "after seen"
        elif s and timed and abs((d - s).total_seconds()) < 120:
            why = "equals fetch time"
        elif s and not timed and p.get("confidence") != "api" and p.get("source") not in ("youtube-api", "ig-business-discovery", "rss") and ds[:10] == ss[:10]:
            why = "date-only = fetch day"
        if why:
            bad[why] += 1
            if len(ex) < 3:
                ex.append(p.get("id"))
    clusters = sum(v for v in stamp.values() if v >= 5)
    if clusters:
        bad["5+ share one timestamp"] += clusters
    n = sum(bad.values())
    return n, ("clean" if not n else ", ".join(f"{k} {v}" for k, v in bad.items()) + "; e.g. " + ", ".join(map(str, ex)))


def radar_dated_share(ctx):
    P = D.posts()
    if not P:
        raise NoData("radar/posts.jsonl missing")
    und = [p for p in P if not p.get("date")]
    by = Counter(p.get("source") for p in und)
    return pct(len(P) - len(und), len(P)), f"{len(P) - len(und)}/{len(P)} dated" + ("; undated by source: " + ", ".join(f"{k} {v}" for k, v in by.most_common()) if und else "")


def radar_run_recency(ctx):
    s = jload(RADAR / "summary.json")
    lr = pdate((s or {}).get("lastRun"))
    if not lr:
        runs = sorted(RADAR.glob("runs/*.json"))
        lr = pdate((jload(runs[-1]) or {}).get("finished")) if runs else None
    if not lr:
        raise NoData("no radar/summary.json lastRun")
    h = (ctx["now"] - lr).total_seconds() / 3600
    return round(h, 1), f"last run {lr.strftime('%Y-%m-%d %H:%M')} UTC"


# ---------------------------------------------------------------- INTEL
def _patterns():
    p = jload(RADAR / "patterns.json")
    if not p or "patterns" not in p:
        raise NoData("radar/patterns.json missing")
    return p


def _pattern_support():
    pa = _patterns()
    pidx = {p["id"]: p for p in D.posts()}
    rows = []
    for x in pa["patterns"]:
        ex = x.get("examples") or []
        accts = {pidx[e].get("account") for e in ex if e in pidx}
        rows.append((x["id"], len(ex), len(accts), len(ex) >= 3 and len(accts) >= 2))
    return rows


def intel_patterns_valid(ctx):
    rows = _pattern_support()
    v = [r for r in rows if r[3]]
    bad = [f"{r[0]} ({r[1]} ex / {r[2]} acct)" for r in rows if not r[3]]
    return len(v), f"{len(v)} of {len(rows)} patterns supported" + ("; weak: " + ", ".join(bad) if bad else "")


def intel_patterns_valid_share(ctx):
    rows = _pattern_support()
    if not rows:
        raise NoData("patterns.json has no patterns")
    return pct(sum(r[3] for r in rows), len(rows)), f"{sum(r[3] for r in rows)}/{len(rows)}"


def intel_client_fit(ctx):
    pa = _patterns()
    nk = len(D.kits()) or 1
    xs = [len(x.get("clientFit") or []) / nk for x in pa["patterns"]]
    if not xs:
        raise NoData("no patterns")
    wide = [x["id"] for x in pa["patterns"] if len(x.get("clientFit") or []) / nk > 0.8]
    return round(100 * sum(xs) / len(xs), 1), f"mean {sum(xs) / len(xs) * nk:.1f} of {nk} kits per pattern" + (f"; fits >80% of kits: {', '.join(wide)}" if wide else "")


def _ids_from(obj):
    """Post ids from a visual.json of unknown-but-plausible shape."""
    ids = set()
    if isinstance(obj, dict):
        for k in ("posts", "items", "tags", "visual"):
            if k in obj:
                return _ids_from(obj[k])
        for k, v in obj.items():
            if isinstance(v, (dict, list)) and k not in ("asOf", "meta", "basis", "window"):
                ids.add(k)
    elif isinstance(obj, list):
        for it in obj:
            if isinstance(it, dict):
                i = it.get("id") or it.get("post") or it.get("postId")
                if i:
                    ids.add(i)
            elif isinstance(it, str):
                ids.add(it)
    return ids


def intel_visual_coverage(ctx):
    vp = RADAR / "visual.json"
    if not vp.exists():
        raise NoData("radar/visual.json not written yet")
    tagged = _ids_from(jload(vp, {}))
    ai = acct_index()
    cut = ctx["now"] - dt.timedelta(days=30)
    comp = [p for p in D.posts() if ai.get(p.get("account"), {}).get("source") != "client" and (pdate(p.get("date")) or dt.datetime.min.replace(tzinfo=UTC)) >= cut and p.get("outlierRaw") is not None]
    top = sorted(comp, key=lambda p: -(p.get("outlierRaw") or 0))[:50]
    if not top:
        raise NoData("no competitor posts with outliers in the last 30 days")
    hit = sum(1 for p in top if p["id"] in tagged)
    return pct(hit, len(top)), f"{hit}/{len(top)} top posts tagged; {len(tagged)} posts tagged in total"


def _questions():
    qp = RADAR / "questions.json"
    if not qp.exists():
        raise NoData("radar/questions.json not written yet")
    q = jload(qp, [])
    if isinstance(q, dict):
        q = q.get("questions") or q.get("items") or []
    out = []
    for it in q:
        s = it if isinstance(it, str) else (it.get("question") or it.get("text") or it.get("q") or "") if isinstance(it, dict) else ""
        if s:
            out.append(s)
    return out


def intel_questions_yield(ctx):
    q = _questions()
    return len(q), f"{len(q)} questions in radar/questions.json"


def intel_questions_dedup(ctx):
    q = _questions()
    if not q:
        raise NoData("questions.json is empty")
    norm = [re.sub(r"[^a-z0-9 ]", "", s.lower()).split() for s in q]
    keep, dups = [], 0
    for toks in norm:
        st = set(toks)
        if any(st == k or (st and k and len(st & k) / len(st | k) >= 0.8) for k in keep):
            dups += 1
        else:
            keep.append(st)
    return pct(len(q) - dups, len(q)), f"{len(q) - dups} unique of {len(q)} ({dups} near-duplicates)"


def intel_candidates_pending(ctx):
    cp = RADAR / "candidates.json"
    if not cp.exists():
        raise NoData("radar/candidates.json not written yet")
    c = jload(cp, [])
    if isinstance(c, dict):
        c = c.get("candidates") or c.get("items") or c.get("accounts") or []
    done = {"accepted", "rejected", "added", "approved", "dismissed", "declined"}
    st = Counter(str(x.get("status") or x.get("decision") or "pending").lower() if isinstance(x, dict) else "pending" for x in c)
    pend = sum(v for k, v in st.items() if k not in done)
    return pend, f"{pend} pending of {len(c)} candidates (" + ", ".join(f"{k} {v}" for k, v in st.most_common()) + ")"


def intel_client_mirror(ctx):
    cm = jload(RADAR / "clients.json")
    if not cm or "clients" not in cm:
        raise NoData("radar/clients.json missing")
    nk = len(D.kits())
    have = [k for k, v in cm["clients"].items() if (v or {}).get("posts")]
    return pct(len(have), nk), f"{len(have)} of {nk} kits have their own posts mirrored ({len(cm['clients'])} client accounts known)"


# ---------------------------------------------------------------- KITS
KEY_FIELDS = [  # (label, value getter, provenance keys)
    ("name", lambda k, t: k.get("name"), ["name"]),
    ("city", lambda k, t: k.get("city"), ["city"]),
    ("province", lambda k, t: k.get("province"), ["province"]),
    ("group", lambda k, t: k.get("group"), ["group"]),
    ("brokerage.name", lambda k, t: (k.get("brokerage") or {}).get("name"), ["brokerage.name", "brokerage"]),
    ("brokerage.licence", lambda k, t: (k.get("brokerage") or {}).get("licence"), ["brokerage.licence", "brokerage"]),
    ("agent.licence", lambda k, t: (k.get("agent") or {}).get("licence"), ["agent.licence", "agent"]),
    ("photo", lambda k, t: (k.get("assets") or {}).get("photo"), ["photo", "assets.photo"]),
    ("footer", lambda k, t: (k.get("assets") or {}).get("footer"), ["footer", "assets.footer"]),
    ("logos", lambda k, t: (k.get("assets") or {}).get("logos"), ["logos", "assets.logos"]),
    ("colors.accent", lambda k, t: None if "default" in str((k.get("provenance") or {}).get("colors.accent", "default")) else ((t.get("color") or {}).get("accent") or {}).get("$value"), ["colors.accent"]),
    ("complianceLine", lambda k, t: k.get("complianceLine"), ["complianceLine"]),
]


def _kits_or_nodata():
    k = D.kits()
    if not k:
        raise NoData("no kits/*/kit.json")
    return k


def kits_completeness(ctx):
    idx = jload(KITS / "_index.json")
    if idx:
        xs = [x.get("completeness") for x in idx if x.get("completeness") is not None]
    else:
        xs = [v["kit"].get("completeness") for v in _kits_or_nodata().values()]
    if not xs:
        raise NoData("no completeness values")
    low = sorted(((x.get("completeness"), x.get("slug")) for x in (idx or [])), key=lambda z: z[0] or 0)[:3]
    return round(100 * sum(xs) / len(xs), 1), f"{len(xs)} kits; lowest: " + ", ".join(f"{s} {round((c or 0) * 100)}%" for c, s in low)


def kits_provenance(ctx):
    filled = sourced = 0
    miss = Counter()
    for slug, v in _kits_or_nodata().items():
        k, t = v["kit"], v["tokens"] or {}
        prov = k.get("provenance") or {}
        for label, get, pkeys in KEY_FIELDS:
            val = get(k, t)
            if val in (None, "", [], {}):
                continue
            filled += 1
            if any(prov.get(pk) and "no source" not in str(prov.get(pk)) for pk in pkeys):
                sourced += 1
            else:
                miss[label] += 1
    return pct(sourced, filled), f"{sourced}/{filled} filled key fields sourced" + ("; unsourced: " + ", ".join(f"{k} x{v}" for k, v in miss.most_common(5)) if miss else "")


CONFLICT_RX = re.compile(r"differs|website says|conflict|inconsisten|mismatch|both Group|spells|contradict", re.I)


def kits_conflicts(ctx):
    n, per = 0, Counter()
    for slug, v in _kits_or_nodata().items():
        flags = [f for f in v["kit"].get("flags") or [] if CONFLICT_RX.search(f)]
        resolved = len((v["confirm"] or {}).get("resolved") or [])
        c = max(0, len(flags) - resolved)
        n += c
        if c:
            per[slug] = c
    return n, f"{n} across {len(per)} kits; most: " + ", ".join(f"{k} {c}" for k, c in per.most_common(3))


def kits_ontario(ctx):
    req = [(s, v["kit"]) for s, v in _kits_or_nodata().items() if v["kit"].get("province") in ("ON", None, "")]
    have = [s for s, k in req if k.get("complianceLine")]
    miss = [s for s, k in req if not k.get("complianceLine")]
    return pct(len(have), len(req)), f"{len(have)}/{len(req)} ON/unknown kits; missing: " + (", ".join(miss) if miss else "none")


def kits_assets_awaiting(ctx):
    n, ex = 0, []
    for s, v in _kits_or_nodata().items():
        dec = {k for k, x in ((v["confirm"] or {}).get("assets") or {}).items() if isinstance(x, bool)}
        for a in (v["kit"].get("assets") or {}).get("check") or []:
            if a not in dec:
                n += 1
                ex.append(a.split("/")[-2] + "/" + a.split("/")[-1] if "/" in a else a)
    return n, ("none" if not n else ", ".join(ex))


def kits_colours_confirmed(ctx):
    ks = _kits_or_nodata()
    ok = 0
    for s, v in ks.items():
        acc = ((v["tokens"] or {}).get("color") or {}).get("accent") or {}
        prov = ((acc.get("$extensions") or {}).get("studio") or {}).get("provisional", True)
        conf = ((v["confirm"] or {}).get("colors") or {}).get("accent")
        ok += (prov is False) or (conf not in (None, False))
    return pct(ok, len(ks)), f"{ok}/{len(ks)} accents confirmed (rest provisional, from website/footer)"


def kits_accent_contrast(ctx):
    ks = _kits_or_nodata()
    ok, low = 0, []
    for s, v in ks.items():
        acc = ((v["tokens"] or {}).get("color") or {}).get("accent") or {}
        c = ((acc.get("$extensions") or {}).get("studio") or {}).get("contrastVsPaper")
        if c is not None and c >= 3:
            ok += 1
        else:
            low.append(f"{s} {c}")
    return pct(ok, len(ks)), f"{ok}/{len(ks)} >= 3:1" + ("; low: " + ", ".join(low[:6]) + (" …" if len(low) > 6 else "") if low else "")


def kits_group(ctx):
    ks = _kits_or_nodata()
    miss = [s for s, v in ks.items() if v["kit"].get("group") in (None, "")]
    return pct(len(ks) - len(miss), len(ks)), f"{len(ks) - len(miss)}/{len(ks)}" + ("; no group: " + ", ".join(miss) if miss else "")


# ---------------------------------------------------------------- CREATIVE
def _jobs_or_nodata(pred=None):
    js = [j for j in D.jobs() if (pred is None or pred(j))]
    if not js:
        raise NoData("no real jobs yet (jobs/<id>/job.json)")
    return js


def _critic_rounds(j):
    outs = [l["msg"] for l in j["job"].get("log") or [] if l.get("node") == "critic" and str(l.get("msg", "")).startswith("done")]
    return outs


def _past_critic(j):
    return bool(_critic_rounds(j)) or (j["critique"] is not None)


def creative_first_pass(ctx):
    js = _jobs_or_nodata(_past_critic)
    fp = [j for j in js if (_critic_rounds(j) or ["done: " + ("pass" if (j["critique"] or {}).get("round") == 1 and j["critique"].get("pass") else "fail")])[0].startswith("done: pass")]
    return pct(len(fp), len(js)), f"{len(fp)}/{len(js)} jobs passed critic round 1"


def creative_rounds(ctx):
    js = _jobs_or_nodata(_past_critic)
    rs = [len(_critic_rounds(j)) or (j["critique"] or {}).get("round") or 1 for j in js]
    return mean(rs), "rounds: " + ", ".join(f"{j['job'].get('client')} {r}" for j, r in zip(js, rs))


LINE_NAMES = {"1": "thumb-stop", "2": "hook alignment", "3": "one idea", "4": "pacing", "5": "typography", "6": "craft", "7": "brand fit",
              "8": "originality", "9": "truth & maths", "10": "compliance", "11": "sound", "12": "payoff"}


def _line_scores():
    per = defaultdict(list)
    for j in D.jobs():
        sc = (j["critique"] or {}).get("scores") or {}
        for k, v in sc.items():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                per[str(k).split("_")[0]].append(v)
    if not per:
        raise NoData("no qa/critique.json scores yet")
    return per


def creative_critic_mean(ctx):
    per = _line_scores()
    allv = [v for xs in per.values() for v in xs]
    lines = sorted(per, key=lambda k: int(k) if k.isdigit() else 99)
    return round(sum(allv) / len(allv), 2), " · ".join(f"{LINE_NAMES.get(k, k)} {sum(per[k]) / len(per[k]):.1f}" for k in lines)


def creative_critic_min(ctx):
    per = _line_scores()
    avg = {k: sum(v) / len(v) for k, v in per.items()}
    k = min(avg, key=avg.get)
    tied = [LINE_NAMES.get(x, x) for x, a in avg.items() if abs(a - avg[k]) < 1e-9]
    return round(avg[k], 2), f"weakest: {', '.join(tied)} (n={len(per[k])})"


def creative_hard_stops(ctx):
    js = _jobs_or_nodata(_past_critic)
    n, det = 0, []
    for j in js:
        c = j["critique"] or {}
        hs = c.get("hardStops") or c.get("hard_stops") or []
        k = len(hs) if isinstance(hs, list) else int(bool(hs))
        if c and c.get("pass") is False:
            k += 1
        if j["qa"] and j["qa"].get("pass") is False:
            k += 1
        if k:
            det.append(f"{j['job'].get('client')} {k}")
        n += k
    return n, ("none on " + str(len(js)) + " jobs" if not n else "; ".join(det))


# --- perceptual hashes (imagehash in studio/.venv)
def _hasher():
    try:
        from PIL import Image
        import imagehash
        return Image, imagehash
    except Exception:
        raise NoData("imagehash/Pillow not importable: run with studio/.venv/bin/python")


def _hcache():
    CACHE.mkdir(parents=True, exist_ok=True)
    return jload(CACHE / "phash.json", {})


def _hash_file(path, cache):
    Image, imagehash = _hasher()
    st = os.stat(path)
    key = f"{path}|{int(st.st_mtime)}|{st.st_size}"
    if key in cache:
        return cache[key]
    out = []
    ext = path.suffix.lower()
    try:
        if ext in (".jpg", ".jpeg", ".png", ".webp"):
            im = Image.open(path).convert("RGB")
            out.append((str(imagehash.phash(im)), str(imagehash.dhash(im))))
        elif ext in (".mp4", ".mov", ".webm", ".m4v"):
            dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True, timeout=30).stdout.strip() or 0)
            with tempfile.TemporaryDirectory() as td:
                for i, f in enumerate((0.25, 0.5, 0.75)):
                    fp = Path(td) / f"{i}.jpg"
                    subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{dur * f:.2f}", "-i", str(path), "-frames:v", "1", "-vf", "scale=360:-2", str(fp)], capture_output=True, timeout=60)
                    if fp.exists():
                        im = Image.open(fp).convert("RGB")
                        out.append((str(imagehash.phash(im)), str(imagehash.dhash(im))))
    except Exception:
        out = []
    cache[key] = out
    return out


def _dist(a, b):
    return (bin(int(a[0], 16) ^ int(b[0], 16)).count("1") + bin(int(a[1], 16) ^ int(b[1], 16)).count("1")) / 2


def _deliverables(d):
    out = d / "out"
    return [p for p in sorted(out.glob("*")) if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm", ".m4v") and not p.name.startswith("contact")] if out.exists() else []


def _job_hashes(cache):
    res = {}
    for j in D.jobs():
        hs = []
        for p in _deliverables(j["dir"]):
            hs += [(h, p.name) for h in _hash_file(p, cache)]
        res[j["job"]["id"]] = (j["job"].get("client"), hs)
    return res


def creative_neardup_clients(ctx):
    _hasher()
    js = _jobs_or_nodata()
    cache = _hcache()
    jh = _job_hashes(cache)
    lib = jload(LIB / "hashes.json", {})
    cards = {}
    for p in LIB.glob("cards/*.json"):
        c = jload(p, {})
        cards[p.stem] = c.get("clients") or []
    best = None
    generic_best = None
    for jid, (client, hs) in jh.items():
        if not hs:
            continue
        for lid, item in (lib.items() if isinstance(lib, dict) else []):
            lcl = cards.get(lid, [])
            refs = [item.get("thumb")] + list(item.get("frames") or [])
            refs = [(r["phash"], r["dhash"]) for r in refs if r and r.get("phash")]
            for (h, fname) in hs:
                for r in refs:
                    dd = _dist(h, r)
                    if lcl and client not in lcl:
                        if best is None or dd < best[0]:
                            best = (dd, jid, fname, f"library:{lid} ({','.join(lcl)})")
                    elif not lcl:
                        if generic_best is None or dd < generic_best[0]:
                            generic_best = (dd, jid, fname, f"library:{lid}")
        for ojid, (oc, ohs) in jh.items():
            if ojid == jid or oc == client:
                continue
            for (h, fname) in hs:
                for (oh, ofn) in ohs:
                    dd = _dist(h, oh)
                    if best is None or dd < best[0]:
                        best = (dd, jid, fname, f"job:{ojid}/{ofn}")
    (CACHE / "phash.json").write_text(json.dumps(cache))
    if best is None:
        raise NoData("nothing from another client to compare against")
    det = f"closest: {best[1].split('-', 3)[-1]}/{best[2]} vs {best[3]}"
    if generic_best:
        det += f"; closest generic piece {generic_best[0]:g} bits"
    return best[0], det


def creative_neardup_competitors(ctx):
    _hasher()
    _jobs_or_nodata()
    cache = _hcache()
    jh = _job_hashes(cache)
    thumbs = sorted((RADAR / "thumbs").glob("*.jpg"))
    if not thumbs:
        raise NoData("no radar/thumbs")
    th = [(t.stem, h) for t in thumbs for h in _hash_file(t, cache)]
    (CACHE / "phash.json").write_text(json.dumps(cache))
    best = None
    for jid, (client, hs) in jh.items():
        for (h, fname) in hs:
            for pid, r in th:
                dd = _dist(h, r)
                if best is None or dd < best[0]:
                    best = (dd, jid, fname, pid)
    if best is None:
        raise NoData("no job deliverables to hash")
    return best[0], f"closest: {best[1].split('-', 3)[-1]}/{best[2]} vs radar {best[3]} ({len(th)} thumbs)"


def creative_variety(ctx):
    js = _jobs_or_nodata(lambda j: j["job"].get("chosen") and j["concepts"])
    scores, det = [], []
    for j in js:
        cs = j["concepts"] if isinstance(j["concepts"], list) else (j["concepts"] or {}).get("concepts", [])
        ch = str(j["job"]["chosen"]).split("+")[0]
        c = next((x for x in cs if x.get("id") == ch), None)
        if not c:
            continue
        nv = c.get("novelty")
        s = nv.get("score") if isinstance(nv, dict) else None
        if s is None and isinstance(nv, str):
            m = re.search(r"score[\s:=]+([01](?:\.\d+)?)", nv)
            s = float(m.group(1)) if m else None
        if s is not None:
            scores.append(float(s))
            det.append(f"{j['job'].get('client')} {s:g}")
    if not scores:
        raise NoData("chosen concepts carry no novelty score")
    return mean(scores), ", ".join(det)


def _is_proof(j):
    txt = " ".join(str(n.get("summary", "")) for n in j["job"].get("nodes") or []) + " " + " ".join(str(l.get("msg", "")) for l in j["job"].get("log") or [] if l.get("node") in ("director", "gate2", "checker"))
    return bool((j["check"] or {}).get("proofOnly")) or bool(re.search(r"\bPROOF\b|proof-only|proof only", txt))


def creative_compliance(ctx):
    ks = D.kits()
    js = _jobs_or_nodata(lambda j: j["qa"] or j["check"])
    req, ok, det = 0, 0, []
    for j in js:
        cl = str(j["job"].get("client") or "")
        prov = (ks.get(cl, {}).get("kit") or {}).get("province") if not cl.startswith("group:") else "ON"
        if prov not in ("ON", None, ""):
            continue
        req += 1
        line = next((c for c in (j["qa"] or {}).get("checks", []) if c.get("id") == "copy.compliance_line"), None)
        good_line = line and line.get("status") == "pass"
        if good_line or _is_proof(j):
            ok += 1
            det.append(f"{cl}: {'line' if good_line else 'PROOF'}")
        else:
            det.append(f"{cl}: MISSING")
    if not req:
        raise NoData("no Ontario pieces yet")
    return pct(ok, req), f"{ok}/{req} ON pieces ok (" + "; ".join(det) + ")"


def creative_maths(ctx):
    js = _jobs_or_nodata(lambda j: j["job"].get("status") not in ("intake", "concepts", "gate1"))
    tot = ok = nochk = 0
    for j in js:
        m = (j["check"] or {}).get("math")
        if not m:
            nochk += 1
            tot += 1
            continue
        tot += len(m)
        ok += sum(1 for x in m if x.get("ok") is True)
    return pct(ok, tot), f"{ok}/{tot} numbers ok across {len(js)} jobs" + (f"; {nochk} job(s) without check.json math" if nochk else "")


def creative_postable(ctx):
    js = _jobs_or_nodata(lambda j: j["job"].get("status") in ("approved", "delivered"))
    pst = [j for j in js if not _is_proof(j)]
    why = [f"{j['job'].get('client')}: {((j['check'] or {}).get('proofReason') or 'proof-only')[:60]}" for j in js if _is_proof(j)]
    return pct(len(pst), len(js)), f"{len(pst)}/{len(js)} approved pieces postable" + ("; " + "; ".join(why) if why else "")


def creative_waivers(ctx):
    js = _jobs_or_nodata(_past_critic)
    n = [len(j["waivers"] or []) if isinstance(j["waivers"], list) else len((j["waivers"] or {}).get("waivers", [])) for j in js]
    return mean(n), ", ".join(f"{j['job'].get('client')} {k}" for j, k in zip(js, n))


def _first_decisions(gate):
    rows = sorted([f for f in D.feedback() if f.get("gate") == gate and not str(f.get("job", "")).startswith("_")], key=lambda f: f.get("at", ""))
    first = {}
    for f in rows:
        first.setdefault(f.get("job"), f)
    return first


FIX_RX = re.compile(r"\bfix|wrong|not (?:like )?proper|change|redo|look in|improve|adjust|bigger|smaller|move |too |instead|replace|remove", re.I)


def creative_gate1(ctx):
    first = _first_decisions("g1")
    if not first:
        raise NoData("no Gate 1 decisions in library/feedback.jsonl")
    user = {k: v for k, v in first.items() if v.get("by") != "producer-test"}
    if not user:
        raise NoData(f"all {len(first)} Gate 1 picks so far were producer test picks, not the owner's")
    ok = sum(1 for v in user.values() if v.get("decision") == "pick")
    return pct(ok, len(user)), f"{ok}/{len(user)} first owner decisions were a pick"


def creative_gate2(ctx):
    first = _first_decisions("g2")
    if not first:
        raise NoData("no Gate 2 decisions yet")
    ok, det = 0, []
    for k, v in first.items():
        clean = v.get("decision") == "approve" and not FIX_RX.search(v.get("notes") or "")
        ok += clean
        if not clean:
            det.append(f"{v.get('client')}: {v.get('decision')} — \"{(v.get('notes') or '').strip()[:60]}\"")
    return pct(ok, len(first)), f"{ok}/{len(first)} clean approvals" + ("; " + "; ".join(det) if det else "")


THEMES = [("visual craft", r"visual|graphic|look|design|font|colou?r|layout|spacing|align|ugly|clean|polish"),
          ("copy", r"\bcopy\b|word|text|caption|hook|headline|wording|tone"), ("numbers", r"number|rate|math|\d%|\$|payment"),
          ("compliance", r"licen|compliance|disclaim|\bapr\b|legal"), ("brand", r"logo|footer|brand"),
          ("pacing/sound", r"slow|fast|pace|music|voice|sound|audio|length")]


def creative_note_themes(ctx):
    notes = [(f.get("notes") or "").strip() for f in D.feedback() if f.get("by") != "producer-test" and (f.get("notes") or "").strip()]
    if not notes:
        raise NoData("no owner notes yet")
    c = Counter()
    for n in notes:
        hit = [name for name, rx in THEMES if re.search(rx, n, re.I)]
        c.update(hit or ["other"])
    top = c.most_common(1)[0][0]
    return top, f"{len(notes)} owner note(s): " + ", ".join(f"{k} {v}" for k, v in c.most_common())


# ---------------------------------------------------------------- LIBRARY
def _approved():
    return _jobs_or_nodata(lambda j: j["job"].get("status") in ("approved", "delivered"))


def _filed(j):
    jid = j["job"]["id"]
    if (LIB / "cards" / f"{jid}.json").exists():
        return True
    lib_node = next((n for n in j["job"].get("nodes") or [] if n.get("id") == "librarian"), {})
    if lib_node.get("status") == "done":
        return True
    for c in D.get("libidx", lambda: jl(LIB / "index.jsonl")):
        if c.get("source") == "job" and jid in json.dumps(c.get("files") or {}) + str(c.get("id")):
            return True
    return False


def library_filing(ctx):
    js = _approved()
    f = [j for j in js if _filed(j)]
    miss = [j["job"].get("client") for j in js if not _filed(j)]
    return pct(len(f), len(js)), f"{len(f)}/{len(js)} approved jobs filed" + ("; not filed: " + ", ".join(miss) if miss else "")


def library_history(ctx):
    js = _approved()
    ks = D.kits()
    ok, miss = 0, []
    for j in js:
        jid = j["job"]["id"]
        h = (ks.get(j["job"].get("client"), {}).get("history") or {}).get("pieces") or []
        if any(jid in (str(p.get("id")) + str(p.get("card")) + str(p.get("job", ""))) for p in h):
            ok += 1
        else:
            miss.append(j["job"].get("client"))
    return pct(ok, len(js)), f"{ok}/{len(js)} in kits/<slug>/history.json" + ("; missing: " + ", ".join(miss) if miss else "")


def library_feedback(ctx):
    js = _jobs_or_nodata()
    fb = {(f.get("job"), f.get("gate")) for f in D.feedback()}
    tot = ok = 0
    miss = []
    for j in js:
        for g, v in (j["job"].get("gates") or {}).items():
            if (v or {}).get("decision"):
                tot += 1
                if (j["job"]["id"], g) in fb:
                    ok += 1
                else:
                    miss.append(f"{j['job'].get('client')}/{g}")
    if not tot:
        raise NoData("no gate decisions yet")
    return pct(ok, tot), f"{ok}/{tot} decisions logged" + ("; missing: " + ", ".join(miss) if miss else "")


# ---------------------------------------------------------------- PIPELINE
AGENTS = ("strategist", "checker", "director", "critic", "librarian")


def _segments(j):
    """Per job: minutes per agent node and per gate wait, plus run counts, from job.json log."""
    mins, runs, waits = defaultdict(float), Counter(), 0.0
    open_ = {}
    for l in sorted(j["job"].get("log") or [], key=lambda x: x.get("t", "")):
        n, msg, t = l.get("node"), str(l.get("msg", "")), pdate(l.get("t"))
        if not t:
            continue
        if n in AGENTS:
            if msg == "running" or msg.startswith("running"):
                open_[n] = t
                runs[n] += 1
            elif (msg.startswith("done") or msg.startswith("fail") or msg.startswith("error")) and n in open_:
                mins[n] += (t - open_.pop(n)).total_seconds() / 60
        elif n in ("gate1", "gate2"):
            if msg.startswith("waiting"):
                open_[n] = t
            elif n in open_:
                waits += (t - open_.pop(n)).total_seconds() / 60
    return mins, runs, waits


def pipeline_time(node):
    def fn(ctx):
        js = _jobs_or_nodata(lambda j: _segments(j)[1].get(node))
        xs = [_segments(j)[0][node] for j in js]
        return median(xs), ", ".join(f"{j['job'].get('client')} {x:.0f}" for j, x in zip(js, xs)) + " min"
    return fn


def pipeline_active(ctx):
    js = _jobs_or_nodata()
    xs = [sum(_segments(j)[0].values()) for j in js]
    return median(xs), ", ".join(f"{j['job'].get('client')} {x:.0f}" for j, x in zip(js, xs)) + " min"


def pipeline_gate_wait(ctx):
    js = _jobs_or_nodata()
    xs = [_segments(j)[2] for j in js]
    return median(xs), ", ".join(f"{j['job'].get('client')} {x:.0f}" for j, x in zip(js, xs)) + " min at gates"


def pipeline_runs(ctx):
    js = _jobs_or_nodata()
    xs = [sum(_segments(j)[1].values()) for j in js]
    return mean(xs), ", ".join(f"{j['job'].get('client')} {x}" for j, x in zip(js, xs))


def _queue():
    q = jload(R / "studio/runner/queue.json", {})
    return q.get("items", []) if isinstance(q, dict) else (q or [])


def pipeline_failures(ctx):
    cut = ctx["now"] - dt.timedelta(days=30)
    n, det = 0, []
    for j in D.jobs():
        for nd in j["job"].get("nodes") or []:
            if nd.get("status") == "failed":
                n += 1
                det.append(f"{j['job'].get('client')}/{nd['id']} failed")
        for l in j["job"].get("log") or []:
            t = pdate(l.get("t"))
            m = str(l.get("msg", ""))
            if t and t >= cut and re.match(r"(fail|error)\b", m, re.I) and l.get("node") != "critic":
                n += 1
                det.append(f"{j['job'].get('client')}/{l.get('node')}: {m[:40]}")
    for it in _queue():
        t = pdate(it.get("ended") or it.get("created"))
        if it.get("status") in ("failed", "error") and (not t or t >= cut):
            n += 1
            det.append(f"runner {it.get('id')}: {str(it.get('error'))[:40]}")
    return n, ("none" if not n else "; ".join(det[:5]))


def pipeline_restarts(ctx):
    q = _queue()
    if not q and not (R / "studio/runner/queue.json").exists():
        raise NoData("studio/runner/queue.json missing")
    retries = sum(max(0, int(it.get("attempts") or 1) - 1) for it in q)
    waits = sum(1 for it in q if it.get("status") == "waiting" or it.get("waitedForUsage"))
    resumes = sum(1 for it in q if str(it.get("text") or it.get("prompt") or "").startswith("/create resume"))
    return retries + waits + resumes, f"{retries} retries, {waits} usage waits, {resumes} resumes over {len(q)} runner runs"


def pipeline_usage(ctx):
    files = list((R / "studio/runner/logs").glob("*.jsonl")) + list(JOBS.glob("*/runs/*.jsonl"))
    cut = ctx["now"] - dt.timedelta(days=30)
    cost, tok, runs, create = 0.0, 0, 0, 0
    for f in files:
        try:
            if dt.datetime.fromtimestamp(f.stat().st_mtime, UTC) < cut:
                continue
            for line in f.read_text().split("\n"):
                if '"type":"result"' not in line:
                    continue
                try:
                    ev = json.loads(line)
                except Exception:
                    continue
                if ev.get("type") != "result":
                    continue
                runs += 1
                cost += float(ev.get("total_cost_usd") or 0)
                u = ev.get("usage") or {}
                tok += sum(int(u.get(k) or 0) for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
                if "/jobs/" in str(f) or "/runs/" in str(f):
                    create += 1
        except Exception:
            continue
    if not runs:
        raise NoData("no headless run logs with a result event")
    return round(cost, 2), f"${cost:.2f} over {runs} runs ({tok / 1e6:.2f} M tokens incl. cache); {create} were job runs. Chat-run jobs are not metered."


# ---------------------------------------------------------------- INTAKE
def _intake():
    def f():
        with tempfile.TemporaryDirectory() as td:
            r = subprocess.run([sys.executable, str(EV / "run_evals.py"), "--out", td], capture_output=True, text=True, timeout=300)
            rep = jload(Path(td) / "report.json")
            if not rep:
                raise NoData(f"run_evals.py failed: {(r.stderr or r.stdout)[-160:]}")
            return rep["summary"]
    try:
        return D.get("intake", f)
    except NoData:
        raise
    except Exception as e:
        raise NoData(f"run_evals.py error: {e}")


def intake_ready(ctx):
    s = _intake()
    return pct(s["ready"], s["briefs"]), f"{s['ready']} ready, {s['proofOnly']} proof-only, {s.get('group', 0)} group, {s.get('blockedReadiness', 0)} blocked of {s['briefs']}"


def intake_pass(ctx):
    s = _intake()
    return pct(s["pass"], s["briefs"]), f"{s['pass']} pass, {s['warn']} warn, {s['blocked']} blocked"


def intake_blocked(ctx):
    s = _intake()
    return s["blocked"], f"{s['blocked']} of {s['briefs']} briefs blocked"


# ---------------------------------------------------------------- GOLDEN (monthly results file)
def _golden():
    files = sorted(GOLD.glob("*.json"))
    if not files:
        raise PendingErr("never run: follow the monthly procedure in TESTS.md")
    return files[-1], jload(files[-1], {})


class PendingErr(Exception):
    pass


def golden_mean(ctx):
    f, g = _golden()
    xs = []
    for b in g.get("briefs", []):
        sc = [v for v in (b.get("scores") or {}).values() if isinstance(v, (int, float))]
        if sc:
            xs.append(sum(sc) / len(sc))
    if not xs:
        raise PendingErr(f"{f.name} has no scores")
    return round(sum(xs) / len(xs), 2), f"{f.stem}: " + ", ".join(f"{b.get('id')} {sum(v for v in b['scores'].values() if isinstance(v, (int, float))) / max(1, len([v for v in b['scores'].values() if isinstance(v, (int, float))])):.1f}" for b in g.get("briefs", []) if b.get("scores"))


def golden_must(ctx):
    f, g = _golden()
    hit = tot = 0
    for b in g.get("briefs", []):
        mc = b.get("mustContain") or {}
        tot += len(mc)
        hit += sum(1 for v in mc.values() if v is True)
    if not tot:
        raise PendingErr(f"{f.name} has no mustContain")
    return pct(hit, tot), f"{f.stem}: {hit}/{tot} items"


def golden_hard(ctx):
    f, g = _golden()
    n = sum(len(b.get("hardStops") or []) for b in g.get("briefs", []))
    return n, f"{f.stem}: {n} hard stops"


def golden_recency(ctx):
    files = sorted(GOLD.glob("*.json"))
    if not files:
        raise PendingErr("never run")
    g = jload(files[-1], {})
    d = pdate(g.get("ran") or g.get("date")) or pdate(files[-1].stem)
    if not d:
        raise NoData(f"{files[-1].name} has no date")
    return (ctx["now"] - d).days, f"last run {d.date()} ({files[-1].name})"


# ---------------------------------------------------------------- registry
COMPUTE = {
    **{f"radar.coverage.{p}": radar_coverage(p) for p in ("instagram", "youtube", "web", "facebook", "linkedin", "tiktok")},
    "radar.freshness": radar_freshness, "radar.source_health": radar_source_health, "radar.metric_accuracy": radar_metric_accuracy,
    "radar.duplicates": radar_duplicates, "radar.date_sanity": radar_date_sanity, "radar.dated_share": radar_dated_share,
    "radar.run_recency": radar_run_recency,
    "intel.patterns_valid": intel_patterns_valid, "intel.patterns_valid_share": intel_patterns_valid_share,
    "intel.client_fit_specificity": intel_client_fit, "intel.visual_coverage": intel_visual_coverage,
    "intel.questions_yield": intel_questions_yield, "intel.questions_dedup": intel_questions_dedup,
    "intel.candidates_pending": intel_candidates_pending, "intel.client_mirror": intel_client_mirror,
    "kits.completeness": kits_completeness, "kits.provenance": kits_provenance, "kits.conflicts": kits_conflicts,
    "kits.ontario_compliance": kits_ontario, "kits.assets_awaiting": kits_assets_awaiting, "kits.colours_confirmed": kits_colours_confirmed,
    "kits.accent_contrast": kits_accent_contrast, "kits.group_assigned": kits_group,
    "creative.qa_first_pass": creative_first_pass, "creative.rounds_to_pass": creative_rounds, "creative.critic_mean": creative_critic_mean,
    "creative.critic_min_line": creative_critic_min, "creative.hard_stops": creative_hard_stops,
    "creative.neardup_clients": creative_neardup_clients, "creative.neardup_competitors": creative_neardup_competitors,
    "creative.variety": creative_variety, "creative.compliance_correct": creative_compliance, "creative.maths_verified": creative_maths,
    "creative.postable": creative_postable, "creative.waivers": creative_waivers, "creative.gate1_clean": creative_gate1,
    "creative.gate2_clean": creative_gate2, "creative.note_themes": creative_note_themes,
    "library.filing_rate": library_filing, "library.history_updated": library_history, "library.feedback_logged": library_feedback,
    "pipeline.time_strategist": pipeline_time("strategist"), "pipeline.time_checker": pipeline_time("checker"),
    "pipeline.time_director": pipeline_time("director"), "pipeline.time_critic": pipeline_time("critic"),
    "pipeline.time_active": pipeline_active, "pipeline.gate_wait": pipeline_gate_wait, "pipeline.runs_per_job": pipeline_runs,
    "pipeline.failures": pipeline_failures, "pipeline.restarts": pipeline_restarts, "pipeline.usage": pipeline_usage,
    "intake.ready": intake_ready, "intake.verdict_pass": intake_pass, "intake.blocked": intake_blocked,
    "golden.mean": golden_mean, "golden.must_contain": golden_must, "golden.hard_stops": golden_hard, "golden.recency": golden_recency,
}


def judge(t, v):
    if t["direction"] == "none" or t.get("target") is None:
        return "info"
    if v is None or isinstance(v, str):
        return "nodata"
    tg, fl = t["target"], t["fail"]
    if t["direction"] == "higher":
        return "pass" if v >= tg else ("fail" if v < fl else "warn")
    return "pass" if v <= tg else ("fail" if v > fl else "warn")


def display(t, v):
    if v is None:
        return "—"
    if isinstance(v, str):
        return v
    u = t["unit"]
    s = f"{v:,.2f}".rstrip("0").rstrip(".") if isinstance(v, float) else f"{v:,}"
    return {"%": f"{s}%", "$": f"${v:,.2f}", "min": f"{s} min", "h": f"{s} h", "days": f"{s} d"}.get(u, s)


def latest_review(date):
    files = sorted(p for p in REV.glob("*.json") if re.fullmatch(r"\d{4}-\d{2}-\d{2}", p.stem) and p.stem <= date)
    if not files:
        return None, []
    rows = jload(files[-1], [])
    if isinstance(rows, dict):
        rows = rows.get("reviews") or rows.get("items") or []
    return files[-1].stem, rows


def run(date, offline=False, quiet=False):
    cat = jload(EV / "tests.json")
    if not cat:
        sys.exit("tests.json missing")
    now = now_utc() if date == dt.date.today().isoformat() else dt.datetime.fromisoformat(date + "T23:59:00").replace(tzinfo=UTC)
    ctx = {"date": date, "now": now, "offline": offline}
    rev_date, reviews = latest_review(date)
    rev_by = {}
    for r in reviews:
        if isinstance(r, dict) and r.get("test"):
            rev_by[r["test"]] = r
    pts = cat.get("points", {"pass": 100, "warn": 50, "fail": 0})
    notes = []
    suites = {}
    for s in cat["suites"]:
        suites[s["id"]] = {"name": s["name"], "weight": s["weight"], "question": s.get("question", ""), "tests": []}
    for t in cat["tests"]:
        row = {"id": t["id"], "name": t["name"], "method": t["method"], "unit": t["unit"], "direction": t["direction"],
               "target": t.get("target"), "fail": t.get("fail"), "weight": t.get("weight", 1)}
        try:
            if t["method"] == "spot":
                r = rev_by.get(t["id"])
                if not r:
                    raise PendingErr("awaiting orchestrator review" + (f" (latest review {rev_date} has no entry)" if rev_date else ""))
                v = r.get("value")
                v = float(v) if isinstance(v, (int, float)) else None
                age = (dt.date.fromisoformat(date) - dt.date.fromisoformat(rev_date)).days
                det = f"{r.get('verdict', '')} · review {rev_date}" + (f" ({age} d old, stale)" if age > 31 else "") + (f" · {r.get('notes')}" if r.get("notes") else "")
            else:
                fn = COMPUTE.get(t["id"])
                if not fn:
                    raise NoData("no compute function")
                v, det = fn(ctx)
            st = judge(t, v)
            if st == "nodata" and t["direction"] == "none":
                st = "info"
        except PendingErr as e:
            v, det, st = None, str(e), "pending"
        except NoData as e:
            v, det, st = None, str(e), "nodata"
        except Exception as e:  # a bug in one test must not kill the card
            v, det, st = None, f"error: {type(e).__name__}: {e}", "nodata"
            notes.append(f"{t['id']}: {type(e).__name__}: {e}")
        row.update(value=v, display=display(t, v), status=st, detail=det,
                   targetText=t.get("thresholds", {}).get("pass", ""), failText=t.get("thresholds", {}).get("fail", ""))
        suites[t["suite"]]["tests"].append(row)
    tot_w = tot = 0.0
    for sid, s in suites.items():
        scored = [x for x in s["tests"] if x["status"] in ("pass", "warn", "fail")]
        w = sum(x["weight"] for x in scored)
        s["score"] = round(sum(pts[x["status"]] * x["weight"] for x in scored) / w) if w else None
        s["counts"] = dict(Counter(x["status"] for x in s["tests"]))
        if s["score"] is not None:
            tot += s["score"] * s["weight"]
            tot_w += s["weight"]
    overall = round(tot / tot_w) if tot_w else None
    for p in ("visual.json", "questions.json", "candidates.json"):
        if not (RADAR / p).exists():
            notes.append(f"radar/{p} not written yet: its tests show 'nodata'")
    if not rev_date:
        notes.append("no orchestrator review yet (studio/evals/reviews/<date>.json): spot-checks pending")
    doc = {"date": date, "at": now_utc().isoformat(timespec="seconds"), "overall": overall, "suites": suites,
           "review": rev_date, "notes": notes, "catalogue": {"tests": len(cat["tests"]), "version": cat.get("version")}}
    HIST.mkdir(parents=True, exist_ok=True)
    (HIST / f"{date}.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False))
    idx = [x for x in jload(HIST / "index.json", []) if x.get("date") != date]
    idx.append({"date": date, "overall": overall, "suites": {k: v["score"] for k, v in suites.items()},
                "fails": sum(v["counts"].get("fail", 0) for v in suites.values()), "warns": sum(v["counts"].get("warn", 0) for v in suites.values())})
    idx.sort(key=lambda x: x["date"])
    (HIST / "index.json").write_text(json.dumps(idx, indent=1))
    return doc


SYM = {"pass": "ok  ", "warn": "WARN", "fail": "FAIL", "info": "info", "nodata": "n/a ", "pending": "wait"}


def print_table(doc):
    print(f"Studio scorecard {doc['date']}  overall {doc['overall'] if doc['overall'] is not None else '—'}/100")
    for sid, s in doc["suites"].items():
        c = s["counts"]
        print(f"\n{s['name'].upper():<22} {s['score'] if s['score'] is not None else '—':>4}   pass {c.get('pass', 0)} · warn {c.get('warn', 0)} · fail {c.get('fail', 0)} · pending/n-a {c.get('pending', 0) + c.get('nodata', 0)}")
        for x in s["tests"]:
            print(f"  {SYM[x['status']]} {x['id']:<34} {x['display'][:16]:>16}  {x['targetText']:<12} {x['detail'][:78]}")
    for n in doc["notes"]:
        print("note:", n)


# ---------------------------------------------------------------- catalogue table for TESTS.md
def write_catalogue():
    cat = jload(EV / "tests.json")
    md = (EV / "TESTS.md").read_text()
    M = {"auto": "automatic", "spot": "orchestrator spot-check", "user": "user signal", "monthly": "monthly golden run"}
    L = ["<!-- catalogue:start (generated from tests.json by scorecard.py --write-catalogue; edit tests.json, not this table) -->"]
    for s in cat["suites"]:
        ts = [t for t in cat["tests"] if t["suite"] == s["id"]]
        L += ["", f"### {s['name']} (`{s['id']}`, {len(ts)} tests, suite weight {s['weight']:g})", "", f"_{s['question']}_", "",
              "| id | what it measures | how | target | warn | fail | why it matters |", "|---|---|---|---|---|---|---|"]
        for t in ts:
            th = t.get("thresholds", {})
            esc = lambda x: str(x).replace("|", "\\|")
            L.append(f"| `{t['id']}` | {esc(t['measures'])} | {M.get(t['method'], t['method'])}: {esc(t['computed'])} | {esc(th.get('pass', ''))} | {esc(th.get('warn', ''))} | {esc(th.get('fail', ''))} | {esc(t['why'])} |")
    L.append("<!-- catalogue:end -->")
    new = re.sub(r"<!-- catalogue:start.*?<!-- catalogue:end -->", "\n".join(L), md, flags=re.S)
    (EV / "TESTS.md").write_text(new)
    print(f"TESTS.md catalogue refreshed: {len(cat['tests'])} tests")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--date", default=dt.date.today().isoformat())
    ap.add_argument("--offline", action="store_true", help="skip the YouTube re-fetch")
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--json", action="store_true", help="print the day's JSON instead of the table")
    ap.add_argument("--write-catalogue", action="store_true")
    a = ap.parse_args()
    if a.write_catalogue:
        return write_catalogue()
    doc = run(a.date, a.offline, a.quiet)
    if a.json:
        print(json.dumps(doc, indent=1))
    elif not a.quiet:
        print_table(doc)
        print(f"\nwrote {HIST / (a.date + '.json')}")


if __name__ == "__main__":
    main()
