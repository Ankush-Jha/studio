#!/usr/bin/env python3
"""Builds the SuperKreatives Film Directory into docs/ (served by GitHub Pages from main /docs).

  python3 site/build.py [--films DIR]

Reads every engines/films/styles/<slug>/style.json (read-only) and poster.jpg, writes docs/index.html, docs/thumbs/<slug>.jpg
(640x360), docs/favicon.svg and docs/.nojekyll. With --films (a folder of the site's 720p cuts, <slug>.mp4) each film's length
is measured from the cut, so the directory shows what actually plays. The films themselves live in the studio-films repo
(its GitHub Pages serve them at FILMS_BASE); site/publish_films.sh updates it.
"""
import argparse, glob, json, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
STYLES = os.path.join(ROOT, 'engines', 'films', 'styles')
OUT = os.path.join(ROOT, 'docs')
FILMS_BASE = os.environ.get('STUDIO_FILMS_BASE', 'https://ankush-jha.github.io/studio-films/')
CATEGORIES = ['Edit & Documentary', 'Painting & Illustration', 'Sketch & Board', 'Traditional Crafts', 'Print & Printmaking', 'Graphic & Type',
              'Line Diagrams', 'Cartoons', 'Games', 'Film & Tape', 'Screens & Interfaces', 'Light & Lines', '3D & Miniature',
              'Instruments & Evidence', 'Data & Maps']

MARK = ('<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
        '<path d="M9.18848 41.7606C16.3457 41.7606 23.2221 41.831 30.0987 41.7606C34.5192 41.6902 38.0979 38.9543 39.431 35.0244C40.7642 31.0251 39.431 26.6044 36.0629 24.0082C34.0281 22.3943 31.6424 21.9031 29.1865 21.833C25.8183 21.7628 22.3801 21.9031 19.0121 21.7628C15.5037 21.6225 13.1881 19.5877 12.9775 16.6406C12.767 13.5531 14.5914 11.1674 18.2402 10.8166C26.1692 9.97456 34.0983 10.4657 42.0273 10.606C43.15 10.606 43.9218 11.3779 44.4832 12.3603C49.2546 20.2191 49.1844 33.8314 38.9399 42.4627C30.7302 49.1989 17.1877 49.549 9.46911 42.7433C9.399 42.6729 9.399 42.5331 9.18848 41.7606Z" fill="#3D49E2"/>'
        '<path d="M37.887 6.1859C30.8702 6.1859 24.3446 6.04558 17.819 6.25601C13.1878 6.32622 9.81976 9.06276 8.62681 13.0624C7.43396 17.062 8.76723 21.4826 11.9949 24.1489C13.9597 25.7628 16.2752 26.4645 18.8013 26.4645C22.3097 26.4645 25.818 26.3943 29.3265 26.5347C32.6946 26.675 35.1505 28.9909 35.1505 31.7973C35.1505 34.6036 32.6244 36.9895 29.2564 37.0599C21.8184 37.1303 14.3105 37.0599 6.80249 37.1304C5.18858 37.1304 3.99574 36.6385 3.01342 35.1649C-2.17903 26.8154 0.136458 13.8342 8.27597 6.46653C16.2051 -0.690658 29.1862 -1.39224 37.045 4.99305C37.3257 4.99305 37.3959 5.27369 37.887 6.1859Z" fill="#0B0B0F"/></svg>')


def seconds(mp4):
    try:
        return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4],
                                    capture_output=True, text=True).stdout)
    except ValueError:
        return None


ap = argparse.ArgumentParser()
ap.add_argument('--films', help='folder of the 720p cuts the site plays (<slug>.mp4), to measure lengths')
args = ap.parse_args()

styles = []
for p in sorted(glob.glob(os.path.join(STYLES, '*', 'style.json'))):
    slug = os.path.basename(os.path.dirname(p))
    if slug.startswith('_') or not os.path.exists(os.path.join(STYLES, slug, 'STYLE.md')): continue
    j = json.load(open(p, encoding='utf-8'))
    dur = j['dur']
    if args.films:
        f = os.path.join(args.films, slug + '.mp4')
        if not os.path.exists(f): raise SystemExit(f'no film for {slug} in {args.films}')
        dur = seconds(f) or dur
    styles.append(dict(slug=slug, num=j['num'], name=j['en'], cat=j['category_en'], film=j['film'], line=j['line'], uses=j['uses'], dur=round(dur, 1)))
styles.sort(key=lambda s: (CATEGORIES.index(s['cat']), int(s['num'] or 999), s['slug']))

os.makedirs(os.path.join(OUT, 'thumbs'), exist_ok=True)
for s in styles:
    # site/posters/<slug>.jpg replaces a style's poster.jpg when that poster shows the upstream credit (site/posters/README.md)
    over = os.path.join(HERE, 'posters', s['slug'] + '.jpg')
    src = over if os.path.exists(over) else os.path.join(STYLES, s['slug'], 'poster.jpg')
    dst = os.path.join(OUT, 'thumbs', s['slug'] + '.jpg')
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src): continue
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf', 'scale=640:360:force_original_aspect_ratio=increase,crop=640:360',
                    '-q:v', '4', dst], check=True)
keep = {s['slug'] + '.jpg' for s in styles}
for f in os.listdir(os.path.join(OUT, 'thumbs')):
    if f not in keep: os.remove(os.path.join(OUT, 'thumbs', f))

cats = [c for c in CATEGORIES if any(s['cat'] == c for s in styles)]
html = open(os.path.join(HERE, 'template.html'), encoding='utf-8').read()
for k, v in {'{{DATA}}': json.dumps(styles, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'),
             '{{FILMS_BASE}}': json.dumps(FILMS_BASE), '{{LOGO}}': MARK, '{{N}}': str(len(styles)), '{{C}}': str(len(cats)),
             '{{MIN}}': str(round(sum(s['dur'] for s in styles) / 60))}.items():
    html = html.replace(k, v)
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(html)
guide = open(os.path.join(HERE, 'guide.html'), encoding='utf-8').read().replace('{{LOGO}}', MARK)
open(os.path.join(OUT, 'guide.html'), 'w', encoding='utf-8').write(guide)
open(os.path.join(OUT, 'favicon.svg'), 'w', encoding='utf-8').write(MARK.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))
open(os.path.join(OUT, '.nojekyll'), 'w').close()
print(f'{len(styles)} styles in {len(cats)} categories -> docs/ (films from {FILMS_BASE})')
