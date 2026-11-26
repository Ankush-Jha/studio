#!/usr/bin/env python3
"""Copy and compliance checks on caption/script text.
usage: copycheck.py --text <file|-> --client <slug> [--kit kit.json] [--ocr-text file] [--json]"""
import argparse, difflib, json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from common import R, Report, safe_json

BANNED = [  # PLAYBOOK "Copy that reads as AI" + compliance language
    "that's not how it works", "that’s not how it works", "nobody tells you", "here's the thing", "here’s the thing",
    "let's dive in", "let’s dive in", "may surprise you", "game-changer", "game changer", "unlock",
    "dream home", "the point?", "sound familiar?",
    "guaranteed", "best rate", "best rates", "lowest rate", "lowest rates", "secret loophole",
]
SEARCH_TERMS = r"mortgage|renewal|renew|heloc|refinanc|pre-?approv|down payment|first-time|private lend|equity|rate|amortiz|closing cost|CMHC|stress test|broker|home loan|insurance|payment"
RATE_CTX = re.compile(r"(\d+(?:\.\d+)?)\s*%")


def load_text(p):
    t = sys.stdin.read() if p == "-" else Path(p).read_text()
    if str(p).lower().endswith(".md"):    # take the ## Caption section (+ hashtags) of CAPTION.md
        m = re.search(r"^##\s*Caption\s*$(.*?)(?=^##\s*First comment|\Z)", t, re.S | re.M)
        if m:
            t = re.sub(r"^##\s*Hashtags.*$", "", m.group(1), flags=re.M)
    return t


def load_kit(client, kit_path=None):
    for p in ([Path(kit_path)] if kit_path else []) + ([R / "kits" / client / "kit.json"] if client else []):
        if p.exists():
            k = safe_json(p)
            if isinstance(k, dict):
                return k, str(p)
    return None, None


def kit_rules(kit):
    """-> (banned_phrases, required_phrases). Accepts list-of-strings or dict."""
    banned, req = [], []
    rules = (kit or {}).get("rules")
    if isinstance(rules, dict):
        for k, v in rules.items():
            vals = v if isinstance(v, list) else [v]
            vals = [x for x in vals if isinstance(x, str)]
            kl = k.lower()
            if any(s in kl for s in ("ban", "avoid", "never", "forbid", "dont", "don't")):
                banned += vals
            elif any(s in kl for s in ("require", "must", "always", "include")):
                req += vals
    elif isinstance(rules, list):
        for s in rules:
            if isinstance(s, dict):  # SPEC shape: {"kind": never|always|hashtags|..., "text": "..."}
                text = str(s.get("text") or "")
                kind = str(s.get("kind") or "").lower()
                qs = [a or b or c for a, b, c in re.findall(r'"([^"]+)"|“([^”]+)”|(?<![A-Za-z])\'([^\']+?)\'(?![A-Za-z])', text)]
                tags = re.findall(r"#\w+", text) + ["#" + t for t in re.findall(r"\bhashtag\s+#?(\w+)", text, re.I)]
                low = text.lower()
                if kind == "never" or re.search(r"\b(stop using|never|don'?t|do not|avoid)\b", low):
                    banned += qs + tags
                elif kind == "always" and qs:
                    req += qs
                continue
            if not isinstance(s, str):
                continue
            qs = [a or b or c for a, b, c in re.findall(r'"([^"]+)"|“([^”]+)”|\'([^\']+)\'', s)]
            low = s.strip().lower()
            if re.match(r"(never|no |don'?t|do not|avoid|ban)", low):
                banned += qs
            elif re.match(r"(always|must|include|require)", low):
                req += qs
    return banned, req


def fuzzy_has(needle, hay, thresh=0.85):
    norm = lambda s: re.sub(r"[^a-z0-9 ]", " ", s.lower().replace("#", " ")).split()
    n, h = norm(needle), norm(hay)
    if not n:
        return True
    hs = " ".join(h)
    ns = " ".join(n)
    if ns in hs:
        return True
    best = 0.0
    L = len(n)
    for i in range(0, max(1, len(h) - L + 1)):
        win = " ".join(h[i:i + L])
        best = max(best, difflib.SequenceMatcher(None, ns, win).ratio())
        if best >= thresh:
            return True
    return False


def is_ontario(kit):
    blob = " ".join(str(kit.get(k, "")) for k in ("province", "region", "location", "city", "jurisdiction")).lower()
    if "ontario" in blob or re.search(r"\bon\b", blob):
        return True
    if blob.strip() == "":
        return None   # unknown
    return False


def check_copy(text, client=None, kit_path=None, ocr_text="", rep=None, tag=""):
    rep = rep or Report()
    low = text.lower().replace("’", "'")
    kit, kp = load_kit(client, kit_path)

    hits = [b for b in BANNED if b.replace("’", "'") in low]
    hits = sorted(set(h.replace("’", "'") for h in hits))
    rep.add("copy.banned", "Banned phrases", "fail" if hits else "pass", hits or 0, "none",
            "PLAYBOOK banned list: " + ", ".join(hits) if hits else "", tag)

    ems = text.count("—") + len(re.findall(r"\s--\s", text))
    rep.add("copy.emdash", "Em-dash count", "fail" if ems >= 3 else "warn" if ems else "pass", ems, "0 (asides read as AI)", "", tag)

    # client rules
    if kit is None:
        rep.add("copy.kit_rules", "Client kit rules", "skip", None, None,
                f"no kit for client '{client}' (looked in {R}/kits/<slug>/kit.json)" if client else "no --client given", tag)
    else:
        banned, req = kit_rules(kit)
        bad = [b for b in banned if b.lower() in low]
        miss = [r for r in req if not fuzzy_has(r, text + "\n" + ocr_text)]
        if not (kit.get("rules")):
            rep.add("copy.kit_rules", "Client kit rules", "skip", None, None, f"{kp} has no rules", tag)
        else:
            rep.add("copy.kit_rules", "Client kit rules", "fail" if (bad or miss) else "pass",
                    {"banned_hit": bad, "required_missing": miss}, f"{len(banned)} banned / {len(req)} required",
                    "", tag)

    # advertised rate -> APR + term
    rates = []
    for m in RATE_CTX.finditer(text):
        ctx = text[max(0, m.start() - 30): m.end() + 30].lower()
        if re.search(r"\brates?\b|\bapr\b|prime|fixed|variable", ctx):
            rates.append(m.group(0))
    if rates:
        full = text + "\n" + ocr_text
        has_apr = bool(re.search(r"\bapr\b|annual percentage rate", full, re.I))
        has_term = bool(re.search(r"\b\d+[- ]?(?:year|yr|month|mo)s?\b|\bterm\b", full, re.I))
        ok = has_apr and has_term
        rep.add("copy.rate_disclosure", "Rate shown with APR and term", "pass" if ok else "fail",
                {"rates": rates, "apr": has_apr, "term": has_term}, "APR + term wording (O. Reg. 191/08 s.18)", "", tag)
    else:
        rep.add("copy.rate_disclosure", "Rate shown with APR and term", "pass", "no advertised rate", "", "", tag)

    # Ontario compliance line
    if kit is not None:
        line = (kit.get("complianceLine") or "").strip()
        on = is_ontario(kit)
        if line and on is not False:
            ok = fuzzy_has(line, text + "\n" + ocr_text)
            rep.add("copy.compliance_line", "Compliance line present", "pass" if ok else "fail",
                    ok, line, "Ontario ads need brokerage name + licence (O. Reg. 188/08 s.6)"
                    + ("" if on else " (province unknown in kit; assumed required)"), tag)
        elif on and not line:
            rep.add("copy.compliance_line", "Compliance line present", "warn", None, None,
                    "Ontario client but kit has no complianceLine", tag)
        else:
            rep.add("copy.compliance_line", "Compliance line present", "pass", "not required", None, "", tag)
    else:
        rep.add("copy.compliance_line", "Compliance line present", "skip", None, None, "no kit", tag)

    tags = re.findall(r"(?<![\w&])#[A-Za-z]\w*", text)
    rep.add("copy.hashtags", "Hashtags <= 5", "pass" if len(tags) <= 5 else "fail", len(tags), "<= 5", "", tag)

    first = next((l.strip() for l in text.splitlines() if l.strip()), "")
    ok = bool(re.search(SEARCH_TERMS, first, re.I))
    rep.add("copy.line1_search", "Caption line 1 has a search phrase", "pass" if ok else "warn", first[:90],
            "topic phrase (mortgage/renewal/HELOC...) in line 1", "", tag)
    return rep


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--client")
    ap.add_argument("--kit")
    ap.add_argument("--ocr-text")
    a = ap.parse_args()
    rep = check_copy(load_text(a.text), a.client, a.kit, Path(a.ocr_text).read_text() if a.ocr_text else "")
    for c in rep.checks:
        print(f"{c['status'].upper():5} {c['id']:26} {c['value']}  {c['detail']}")
    print(json.dumps({"pass": rep.ok, "checks": rep.checks}, indent=1, default=str) if False else "")
    sys.exit(0 if rep.ok else 1)
