#!/usr/bin/env python3
"""Novelty check for a proposed piece against the library cards and a client's kit history.

Usage:
  variety.py --client <slug> --format <f> --style <s> --device "<text>" --hook-pattern <p> --topic "<t>"
             [--engine <e>] [--today YYYY-MM-DD] [--include-drafts] [--list-styles]

Prints JSON {score, conflicts, recentForClient, recentGlobal, suggestions}.
Rules:
  hard  same style as the client's last piece
  soft  same style used for any client in the last 7 days
  soft  same device or same hook pattern for this client in its last 10 pieces
  soft  same topic for this client within the last 21 days
Draft cards (stills proofs, motion tests) are ignored unless --include-drafts.
"""
import argparse, json, re, datetime, glob, os
from pathlib import Path

R = Path(os.environ.get("STUDIO_ROOT") or Path(__file__).resolve().parents[2])
FILMS = R / 'engines/films/styles'
STILLS = R / 'engines/stills/styles'
STOP = set('the a an of and or to in on for with your you is are not no it its this that from by as at be how what why when'.split())
STILL_FORMATS = {'static', 'carousel', 'cover', 'story'}


def list_styles():
    op = sorted(p.name for p in FILMS.iterdir() if p.is_dir() and p.name not in ('_template',)) if FILMS.exists() else []
    st = sorted(p.name for p in STILLS.iterdir() if p.is_dir() and p.name not in ('_template',)) if STILLS.exists() else []
    return op, st


def toks(s):
    return {w for w in re.findall(r'[a-z0-9$%]+', (s or '').lower()) if w not in STOP and len(w) > 1}


def similar(a, b, thr):
    ta, tb = toks(a), toks(b)
    if not ta or not tb:
        return False
    if a.strip().lower() == b.strip().lower():
        return True
    j = len(ta & tb) / len(ta | tb)
    contain = len(ta & tb) / min(len(ta), len(tb))
    return j >= thr or (contain >= 0.8 and min(len(ta), len(tb)) >= 3)


def load_pieces(client, include_drafts):
    pieces = []
    for f in glob.glob(str(R / 'library/cards/*.json')):
        c = json.load(open(f))
        if c.get('status') == 'draft' and not include_drafts:
            continue
        pieces.append({'id': c['id'], 'date': c.get('date') or '', 'format': c.get('format'), 'engine': c.get('engine'),
                       'style': c.get('style'), 'device': c.get('device'), 'hookPattern': c.get('hookPattern'),
                       'topic': c.get('topic'), 'clients': c.get('clients', []), 'card': c['id'], 'source': 'card'})
    kit = R / f'kits/{client}/history.json'
    kit_pieces = []
    if kit.exists():
        try:
            for p in json.load(open(kit)).get('pieces', []):
                q = {'id': p.get('id') or p.get('card'), 'date': p.get('date') or '', 'format': p.get('format'),
                     'engine': p.get('engine'), 'style': p.get('style'), 'device': p.get('device'),
                     'hookPattern': p.get('hookPattern'), 'topic': p.get('topic'), 'clients': [client],
                     'card': p.get('card'), 'source': 'kit'}
                kit_pieces.append(q)
        except Exception:
            pass
    ids = {p['id'] for p in pieces}
    for q in kit_pieces:  # kit entries that point at a card already loaded are not duplicated
        if q['card'] in ids or q['id'] in ids:
            continue
        pieces.append(q)
    return pieces


def d(s):
    try:
        return datetime.date.fromisoformat((s or '')[:10])
    except ValueError:
        return datetime.date.min


def brief(p):
    return {k: p.get(k) for k in ('id', 'date', 'format', 'engine', 'style', 'device', 'hookPattern', 'topic')} | {'clients': p['clients']}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--client', required=True)
    ap.add_argument('--format', default='')
    ap.add_argument('--style', default='')
    ap.add_argument('--device', default='')
    ap.add_argument('--hook-pattern', default='')
    ap.add_argument('--topic', default='')
    ap.add_argument('--engine', default='')
    ap.add_argument('--today', default='')
    ap.add_argument('--include-drafts', action='store_true')
    ap.add_argument('--list-styles', action='store_true')
    a = ap.parse_args()
    op, st = list_styles()
    today = d(a.today) if a.today else datetime.date.today()
    pieces = sorted(load_pieces(a.client, a.include_drafts), key=lambda p: (d(p['date']), p['id']))
    mine = [p for p in pieces if a.client in p['clients']]
    last10 = mine[-10:]
    style = a.style.strip().lower()
    conflicts = []

    if mine and style and (mine[-1].get('style') or '').lower() == style:
        conflicts.append({'severity': 'hard', 'rule': 'same-style-as-last-piece', 'detail': f"{a.client}'s last piece ({mine[-1]['id']}, {mine[-1]['date']}) already used '{style}'", 'ref': mine[-1]['id']})
    if style:
        week = [p for p in pieces if (p.get('style') or '').lower() == style and 0 <= (today - d(p['date'])).days <= 7]
        if week:
            w = week[-1]
            conflicts.append({'severity': 'soft', 'rule': 'style-used-in-last-7-days', 'detail': f"'{style}' used for {', '.join(w['clients']) or 'a generic piece'} on {w['date']} ({w['id']}); {len(week)} use(s) in 7 days", 'ref': w['id']})
    if a.device:
        for p in reversed(last10):
            if p.get('device') and similar(a.device, p['device'], 0.5):
                conflicts.append({'severity': 'soft', 'rule': 'device-repeat-in-last-10', 'detail': f"device resembles {p['id']}: {p['device'][:110]}", 'ref': p['id']})
                break
    if a.hook_pattern:
        hp = a.hook_pattern.strip().lower()
        same = [p for p in last10 if (p.get('hookPattern') or '').lower() == hp]
        if same:
            conflicts.append({'severity': 'soft', 'rule': 'hook-pattern-repeat-in-last-10', 'detail': f"hook pattern '{hp}' used {len(same)}x in {a.client}'s last {len(last10)} pieces (latest {same[-1]['id']})", 'ref': same[-1]['id']})
    if a.topic:
        for p in reversed(mine):
            if 0 <= (today - d(p['date'])).days <= 21 and similar(a.topic, p.get('topic') or '', 0.45):
                conflicts.append({'severity': 'soft', 'rule': 'topic-repeat-within-21-days', 'detail': f"topic overlaps {p['id']} ({p['date']}): {p.get('topic')}", 'ref': p['id']})
                break

    score = 1.0
    for c in conflicts:
        score -= 0.6 if c['severity'] == 'hard' else 0.15
    score = round(max(0.0, min(1.0, score)), 2)

    # suggestions: styles not used by this client, not used by anyone in the last 7 days; never-used-anywhere first
    pool_op = [(s, 'films') for s in op]
    pool_st = [(s, 'stills') for s in st]
    fmt = a.format.lower()
    pool = pool_st if (fmt in STILL_FORMATS or a.engine == 'stills') else pool_op if (fmt or a.engine) else pool_op + pool_st
    if a.engine == 'films':
        pool = pool_op
    used_client = {(p.get('style') or '').lower() for p in mine}
    used_week = {(p.get('style') or '').lower() for p in pieces if 0 <= (today - d(p['date'])).days <= 7}
    used_any = {(p.get('style') or '').lower() for p in pieces}
    sugg = []
    for s, eng in pool:
        if s in used_client or s in used_week or s == style:
            continue
        sugg.append({'style': s, 'engine': eng, 'usedElsewhere': s in used_any})
    sugg.sort(key=lambda x: (x['usedElsewhere'], x['style']))
    out = {'score': score, 'conflicts': conflicts,
           'recentForClient': [brief(p) for p in mine[-10:][::-1]],
           'recentGlobal': [brief(p) for p in pieces[-10:][::-1]],
           'suggestions': sugg[:15]}
    if a.list_styles:
        out['availableStyles'] = {'films': op, 'stills': st}
    print(json.dumps(out, indent=1, ensure_ascii=False))


if __name__ == '__main__':
    main()
