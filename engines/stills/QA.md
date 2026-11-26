# QA: the gate every still passes before delivery

Two layers. The **in-page audit** runs on every render (`assets/qa-lib.js`, plus pixel contrast in `lib/library.mjs`) and lands in each `manifest.json`. The **gate** (`node tools/qa-gate.mjs [--strict]`, run from `engines/stills/`; `--out <dir>` to gate renders elsewhere) reads every manifest, adds the cross-render checks and exits 1 on any FAIL. It writes `out/qa-gate.json`; save its console output as `out/qa-gate.txt`.

Severities:
- **FAIL** blocks export.
- **WARN** needs a human look.
- **TODO** is a client asset we must not invent (licence, photo, APR). Under `--strict`, an empty compliance field is a FAIL.

## In-page checks (per slide)

| Check | Rule | Severity |
|---|---|---|
| Safe zone | Every text run inside the format's safe box. Feed: x 64–1016, y 56–1294. Story: x 65–1015, y 270–1248. Square: x 64–1016, y 64–1016. Only `[data-bleed]` decoration may cross it. | FAIL |
| Minimum size | display/body ≥ 28 px, label ≥ 20 px, fine ≥ 18 px at 1080 wide (SVG text scaled by its CTM) | FAIL |
| WCAG contrast | Measured against the **real pixels** behind the glyph band of each run (text hidden, re-captured, 10th percentile). 4.5:1, or 3:1 for text ≥ 24 px or bold ≥ 18.66 px. Handles photos, canvas, WebGL, multiply-blended riso ink. | FAIL |
| Overlap / overflow / fit | `[data-block]`s don't overlap; `[data-fit="box"]` doesn't overflow; fit.js never gave up | FAIL |
| Compliance slot | `.compliance` present and visible on every slide | FAIL if missing; TODO when it shows the placeholder |
| Client photo | `[data-photo-placeholder]` present | TODO |
| Words | More than about 40 words on a slide (excluding chrome and fine print) | WARN |
| AI-look lint | gradient fill > 4% of the canvas; blur ≥ 16 px on a big element; `backdrop-filter` (glassmorphism); coloured glow ≥ 16 px; gradient-clipped text; emoji; stray `<img>` (only client photos from `assets/clients/` are allowed); real bank or lender names; banking chrome ("sign in", "account number"); a document style missing its visible ILLUSTRATIVE mark | FAIL |
| AI-look lint | three or more identical rounded cards with the same shadow; more than 80% of the text area centred | WARN |
| Copy lint | PLAYBOOK banned phrases ("Here's the thing", "unlock", "dream home"…), "guaranteed", "best/lowest rate", "secret loophole" | FAIL |
| Copy lint | Em-dash asides; "it's not X, it's Y" | WARN |
| Page errors | Any JS error or failed font load | FAIL |

## Gate checks (across renders)

| Check | How | Severity |
|---|---|---|
| Maths | `tools/gate_checks.py` recomputes every calc audit independently: Canadian semi-annual payments, interest-only HELOC, the lump-sum payoff month, minimum down payment, FHSA room. It also checks that a shown delta is the difference of the shown figures. | FAIL on any mismatch |
| Glyph coverage | Every character of every run exists in the font that set it (fontTools cmap; invisible format characters excluded), so nothing falls back to a system face. Catches French accents in hand fonts. | FAIL |
| Palette | Purple + teal palette (each > 5% of the slide, saturated) | WARN |
| Roster | Clients in the same city never share a style. Clients in the same metro (GTA) share one only on different variants. | FAIL / WARN |
| Near-duplicates | `tools/neardup.py`: 64-bit dHash + pHash on every slide and on each cover's 3:4 grid crop (correct for 4:5, 1:1 and 9:16), each pair also compared mirrored and luminance-inverted. A pair fails when one hash is ≤ 10/64 and the other ≤ 20/64. Gated classes: cross-client and cross-post (different clients). Same-client pairs (a client's own series and its story/square re-cuts) are info only. | FAIL |
| Compliance | Brokerage name, licence number, agent name and title come only from `tokens/clients/<id>.json`. Empty fields are TODO; `--strict` and `render.mjs --strict` refuse to export. Never invented. | TODO / FAIL with `--strict` |
| Copy placeholders | Bracketed `[brokerage to confirm]`-style text (e.g. APR) | TODO |
| Rate premise | A spec's `reviewBy` date is past | FAIL |

## The human pass (not scriptable, required)

Read `contact.jpg` and every `NN.jpg` at full size, and look at the covers in `out/library-overview.jpg` (feed and 3:4 crop):
- **Thumb-stop:** at 260 px wide, slide 1 has one giant focal element, a saturated field or deep ground, and no small type floating in empty space.
- **Show, don't tell:** an object, a chart, a document or a photo where the copy names one.
- **Type:** kerning at display sizes, widows and orphans, rags, cramped margins, hierarchy (one focal point).
- **Marks:** each mark lands on its word; nothing crosses copy.
- **Numbers add up** on screen, and the assumptions line states balance, rate, amortization, compounding, term and APR (Ontario).
- **Two clients, two looks:** put the client pair side by side.
- **AI-look checklist:** no gradient blobs, no generic 3D emoji or clay icons, no glossy stock smiles, no glassmorphism, no centred-everything template, no fake UI chrome that pretends to be a real bank.

## Reference result

On the production set this library was built and proven on (47 renders, 168 slides across 11 styles), the gate passed with 0 FAIL: 69 calc audits recomputed with 0 mismatches, 2,191 text runs with 0 missing glyphs, no purple/teal, no same-city clashes, closest cross-client pair 12/64. Remaining WARNs were word counts over about 40 on dense statics and same-metro overlaps on secondary styles; every TODO was client data (compliance fields, APR wording) that must come from the client, never invented.

The shipped example (`northline-mortgages`, `dec9-variable` in swiss + `heloc-paul` in magazine) passes with 0 FAIL / 0 WARN and 3 TODO: the bracketed brokerage and licence placeholders and the APR wording.
