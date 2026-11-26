# Studio Stills

Code-rendered Instagram statics, carousels and covers in eleven house styles. Everything is drawn in HTML/CSS/SVG (plus canvas and three.js) and rendered with headless Chromium:
- no AI images and no stock;
- every word, number and licence line is live type;
- every chart and figure is computed from the inputs in the spec (`lib/calc.mjs`), and the QA gate recomputes them independently in Python.

How to pick a style, write a spec, render, gate and deliver: `.claude/skills/stills/SKILL.md` (from the repo root). The rules of every piece: `playbook/PLAYBOOK.md`.

| Doc | What it covers |
|---|---|
| `STYLES.md` | The eleven styles, their groups, signature devices and what each is best for |
| `library/<slug>/STYLE.md` | One style's rules: point of view, type, colour, grid, signature, do/don't, pitfalls |
| `AUTHORING.md` | The render contract, slide vocabulary, calc kinds, markup, how to build a new style |
| `QA.md` | The in-page audit, the gate and the human pass |
| `docs/research/visual_brief_for_stills.md` | The scroll-stopping rules every cover follows |
| `docs/research/references_2026-11-16.md` | The reference board and the 24 testable rules behind the brief |

## Install

```bash
cd engines/stills
npm install                       # playwright-core 1.63 + sharp
npm run setup                     # downloads Chromium headless shell for playwright-core
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # Pillow, numpy, fontTools (JPEG finish, gate)
```

- **Node 20+.** The renderer looks for Playwright in `engines/stills/node_modules`, then `$PLAYWRIGHT_DIR`, then `<repo>/node_modules`; for sharp in `engines/stills/node_modules`, `$SHARP_DIR`, `<repo>/node_modules`.
- **Python** with Pillow + numpy (+ fontTools for the glyph check): `$STATICS_PYTHON`, then `engines/stills/.venv`, then `<repo>/.venv`, then `python3`.
- **Fonts** are vendored in `fonts/`: Google Fonts under the SIL OFL, licence files alongside (`OFL-*.txt`). Renders never touch the network.
- **three.js** is vendored in `vendor/` (MIT, `LICENSE-three.txt`) for the Iso Blocks style.
- On a machine without a GPU, set `STATICS_ANGLE=swiftshader` for the three.js style.
- Note: `playwright-core install` deletes browser builds in the shared Playwright cache that no installed Playwright still references. If another project of yours pins an older Playwright, re-run its own install afterwards.

## Quick start (fictional example client)

The repo ships one fully set-up fictional client, **Northline Mortgages** (agent Sam Rivera, Toronto ON): `tokens/clients/northline-mortgages.json`, an entry in `library/roster.json`, and two example specs.

```bash
cd engines/stills
node render.mjs specs/library/dec9-variable.json --client northline-mortgages                 # roster style (swiss), feed 1080x1350
node render.mjs specs/library/dec9-variable.json --client northline-mortgages --format story --only 1   # reel/story cover 1080x1920
node render.mjs specs/library/heloc-paul.json   --client northline-mortgages --style magazine --anyGroup
node render.mjs specs/library/dec9-variable.json --client northline-mortgages --strict        # refuses: compliance is a placeholder
node tools/qa-gate.mjs                                                                         # gate over out/ (or --out <dir>)
./build-library.sh                                                                             # every style + gate + out/library-overview.jpg
```

Output goes to `out/<id>--<style>[--<format>]/<client>/` (or `--out <dir>`):

| File | What it is |
|---|---|
| `01.jpg … NN.jpg` | sRGB JPEG, q92, 4:4:4, ICC embedded, downsampled from the 2× master. These are the deliverables. |
| `png/NN@2x.png` | 2× PNG masters |
| `contact.jpg` | Contact sheet of the post |
| `manifest.json` | Inputs, contrast per text run, word counts, QA findings, the maths audit, sources |
| `html/NN.html` | The exact page that was rendered, for debugging |

The example's brokerage and licence are the placeholders `[BROKERAGE NAME]` and `[LICENCE #]`: they print with a red `placeholder` tag, QA lists them as TODO, and `--strict` refuses to export. The example specs' rate premise expires on `reviewBy` (2026-12-09); after that the gate fails them on purpose. Change the facts and dates before reusing them.

## Adding your own client

1. Copy `tokens/clients/northline-mortgages.json` to `tokens/clients/<id>.json` (schema: `tokens/clients/_schema.json`). Set `meta` (id, name, initials, city, province, group, a new `seed`, `layoutVariant`) and `color.accent`.
2. Fill `compliance` (agent name, approved title, brokerage name, brokerage licence number) **only from the licence record**. Never invent them. Ontario requires the brokerage's authorized name and licence number on every ad (O. Reg. 188/08 s.6).
3. Add the client to `library/roster.json` with a group, a primary and a secondary style and a variant. Same-city clients never share a style; the gate checks it.
4. The client's own photos (never stock, never AI) go in `assets/clients/<id>/` and are registered in the token file under `photos` (slot → file name). That folder is gitignored.

## Footer bands

Accounts that put a branded footer image under every feed slide:

```bash
node render.mjs specs/library/<id>.json --client <id> --style broadsheet --reserve 180 --out /tmp/r180
python bin/footer_overlay.py /tmp/r180 footer.png /tmp/final --reserve 180
```

- `--reserve <px>` keeps the 1080×1350 canvas but ends the safe box `<px>` + `--reservePad` (default 8) above the bottom, so the style lays out in the full height above the footer. The default folder name gets `--r<px>`.
- `--css <file>` appends extra CSS to every slide.
- `bin/footer_overlay.py` alpha-composites the footer (scaled to 1080 wide) into the reserved band. It refuses if the footer is taller than the reserve, or if anything but paper sits in the band (full-bleed styles like `swiss` fill it: use a paper-ground style or the fallback).
- Fallback: `bin/footer_compose.py <dir of 1080x1080 squares> footer.png <out>` puts square renders (`--format square`) above the footer on a 1080×1350 canvas and fills the gap with the slide's bottom-edge colour (footers up to 270 px).
- Never retype contact details from a footer image; footers go stale.

## Layout

```
render.mjs            CLI + renderer (library specs via lib/library.mjs; legacy families via lib/templates.mjs)
build-library.sh      renders every style with the example client, runs the gate, builds the overview
lib/                  formats, tokens, colour maths, mortgage maths (calc.mjs, mortgage.mjs), markup, page shell, compliance, sheets, finish
assets/               in-page scripts: fit.js (type fitting), hand.js (seeded hand-drawn marks), qa-lib.js/qa.js (audit)
library/<slug>/       one folder per style: style.json, style.css, style.mjs, optional page.js, STYLE.md
library/base.css      shared base for library styles
library/roster.json   clients → group, primary/secondary style, variant (example roster)
specs/library/        example specs (dec9-variable, heloc-paul)
tokens/               group-1..4.json (legacy family tokens), clients/<id>.json (+ _schema.json)
styles/               legacy family stylesheets (superseded by the library; kept for old specs)
tools/                qa-gate.mjs, gate_checks.py (maths/glyph/palette), neardup.py, library-overview.mjs, overview.mjs, finish.py
bin/                  footer_overlay.py, footer_compose.py
fonts/                vendored OFL fonts + licences
vendor/               three.module.min.js + licence
docs/research/        visual brief and reference rules
out/                  renders (gitignored)
```

## Legacy group families

The first prototype's four CSS families (`styles/family-*.css`: Ledger, Kitchen Table, Riso, Dossier, driven by `tokens/group-N.json`) still render through `render.mjs` for specs without `"engine": "library"`. They don't meet the thumb-stop bar; write new specs for the library.
