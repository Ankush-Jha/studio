# Building or changing a style

How a style in the library is built. Read this before you touch `engines/stills/library/<slug>/`, and before you add a style. The tooling root is `engines/stills/` (below, paths are relative to it).

## Where things live

| Path | What it is |
|---|---|
| `library/<slug>/style.json` | Metadata: name, group, fonts, palette, emphasis mark, pen, flags |
| `library/<slug>/style.mjs` | `export function render(slide, ctx)` → `{ bg, html, draws?, data?, classes? }` (runs in Node) |
| `library/<slug>/style.css` | Every visual rule for the style, scoped under `.st-<slug>` |
| `library/<slug>/page.js` | Optional ES module run in the page (canvas, WebGL, measured layout). Sets `window.STYLE_RUN = async (data) => {}` |
| `library/base.css` | Shared resets, the four layers, compliance and photo-placeholder fallbacks |
| `library/roster.json` | Group → styles, client → primary/secondary style and variant |
| `library/<slug>/STYLE.md` | The style's point of view and rules (template at the end of this file) |
| `specs/library/*.json` | Posts (style-agnostic copy + calcs); two examples ship |
| `lib/library.mjs` | The renderer: tokens, calc fills, page shell, fit, marks, QA, pixel contrast, JPEG |
| `lib/calc.mjs` | Every number. Slides declare `calc`, copy uses `{tokens}` |
| `assets/fit.js`, `assets/hand.js`, `assets/qa-lib.js` | In-page: type fitting, seeded hand marks, audit |
| `fonts/` | OFL fonts with their licence files. Never load fonts from the network |
| `vendor/three.module.min.js` | three.js r170 (MIT) for WebGL styles |

Render one post: `node render.mjs specs/library/<id>.json --client <client-id> [--style <slug>] [--format feed|story|square] [--variant a|b]`. Output lands in `out/<id>--<slug>[--<format>]/<client>/` with `NN.jpg`, `png/NN@2x.png`, `contact.jpg`, `html/NN.html` (open it in a browser to debug) and `manifest.json`.

## style.json

```json
{
  "slug": "swiss", "name": "Swiss Data Poster", "group": 1, "family": "Ledger",
  "summary": "one sentence",
  "formats": ["feed", "story", "square"],
  "types": ["cover", "point", "number", "compare", "steps", "recap", "myth", "quote", "stat", "cta"],
  "variants": ["a", "b"],
  "fonts": [{ "family": "Archivo", "file": "Archivo[wdth,wght].ttf", "style": "normal", "weight": "100 900", "stretch": "62% 125%" }],
  "palette": { "paper": "#F4F3EF", "ink": "#000000", "ink-soft": "#4A4A47", "accent": "#E03C1F" },
  "accentGround": "paper",
  "pinAccent": false,
  "emphasis": "accent",
  "hand": { "pen": "fine", "weight": 4.4, "wobble": 0.7 },
  "illustrative": false,
  "allow": {},
  "maxWords": 40
}
```

- **palette** becomes `--color-<name>` on `.slide`. The client accent replaces `accent` unless `pinAccent` is true. Derived for you, contrast-safe against `accentGround`: `--color-accent-ink` (accent as text, ≥ 4.5:1), `--color-accent-tint`, `--color-on-accent` (best text colour on an accent fill), `--color-mark-ink` (hand marks, ≥ 3:1). A client can override any colour per style in `tokens/clients/<id>.json` → `byStyle.<slug>.color`.
- **emphasis** is what `==words==` becomes: a hand.js mark (`highlight`, `underline`, `circle`, `swash`) or any other word, which leaves a `span[data-mark="<word>"]` for your CSS.
- **hand** sets the pen for `((circle))`, `~~strike~~` and `draws`: `fine`, `marker`, `brush`, `pencil`, `highlighter`.
- **illustrative: true** for document styles: QA then fails any slide without a visible `[data-illustrative]` element whose text says illustrative/sample.
- **allow** switches off one AI-look check for the whole style, only with a reason in STYLE.md (`gradient` for a stepped halftone ramp, `blur` for a depth-of-field render…). Per element: `data-allow="gradient"`.

## The render contract

`render(slide, ctx)` returns:
- `bg`: HTML for the background layer (paper, texture, full-bleed art, canvas). Decorative, `aria-hidden`, under the marks.
- `html`: the foreground: every word. Usually one `<div class="stage">…</div>` (the format's safe box, absolutely positioned) plus anything else you place yourself.
- `draws`: hand-drawn arrows/brackets/circles placed after layout (see `assets/hand.js`: `{shape:'arrow', from:{sel, at, dx, dy}, to:{…}, bend}`, `circle|box|underline|bracket` with `sel`).
- `data`: JSON handed to `page.js` (`STYLE_RUN(data)`).
- `classes`: extra classes on `.slide`.

Layers, bottom to top: `.bg` → `svg.marks.under` (highlighter) → `.fg` (your html) → `svg.marks.over` (pen marks). `.slide` carries `st-<slug> fmt-<format> t-<type> v-<variant> is-first|is-last|is-single`.

`ctx` gives you:

| Field | Use |
|---|---|
| `t(str)` | Copy → HTML with typesetting (curly quotes, nbsp in dates) and inline marks: `==emphasis==`, `((circle))`, `~~strike~~`, `*italic*`, `|` line break. Always pass copy through it. |
| `esc(str)` | Escape plain strings (labels, keywords) |
| `calc`, `calcs` | Result of the slide's `calc` (first, all). `calc.chart = { unit: 'money'|'months', rows: [{label, value, shown, shortShown}], highlight }`; `calc.values` exact numbers |
| `compliance('line'|'block')` | The licence slot. **Every slide must include it, inside the safe box.** `block` on `cta` and `stat` |
| `photo(slot, {label, note})` | Client photo from `assets/clients/<id>/`, or a designed placeholder that QA flags TODO. The only allowed `<img>` |
| `format` | `{ name, w, h, safe:{x0,y0,x1,y1}, crop34 }` |
| `variant` | `'a'` or `'b'` from the client token/roster. Variants must **re-compose** (move the focal element, change the chart orientation, re-anchor the headline), never just mirror: the near-dup gate compares mirrored images too |
| `index`, `total`, `isFirst`, `isLast`, `isSingle`, `folio()` | Position in the carousel |
| `client` | `{ id, name, initials, city, province, seed }`. Never print the broker's name as a logo or signature; the compliance slot carries it |
| `spec` | `{ id, title, series, date, reviewBy }` |
| `palette` | Resolved hex colours (for SVG you build in Node) |
| `rng()` | Seeded random in [0,1), stable per client + post + slide |
| `money`, `moneyK`, `pct`, `words` | Formatting helpers |

## Slide vocabulary (specs are style-agnostic)

| type | Fields (`*` required) | Notes |
|---|---|---|
| `cover` | `kicker`, `headline`*, `dek`, `figure`, `figureLabel`, `cue`, optional art hooks: `photo`/`photoLabel`, `doc`, `map`, `scene`, `annotations` | Slide 1. Swipe cue. Headline readable at 260 px wide and inside the 3:4 crop |
| `point` | `eyebrow`, `text`*, `note`, `figure` | One idea, ≤ about 25 words |
| `number` | `label`, `title`*, `calc`*, `rowLabels`, `callout`, `calloutSub`, `takeaway`, `assumptions`* | Chart from `ctx.calc.chart`. Bars/areas start at zero. Assumptions in `data-role="fine"` |
| `compare` | `label`, `title`*, `left`* `{label, value, note}`, `right`*, `verdict` | Two options side by side |
| `steps` | `label`, `title`*, `items`* `[{text, tag}]` | A real sequence: numbering allowed |
| `recap` | `label`, `title`*, `items`*, `note` | Save-worthy summary (second-to-last slide) |
| `myth` | `label`, `myth`*, `fact`*, `note` | Struck claim, then the fact |
| `quote` | `quote`*, `by` | Client story typography; real quotes need written consent |
| `stat` | `kicker`, `headline`*, `figure`, `figureLabel`, `facts` `[{label, value, note, emphasis}]`, `note`, `calc` | A single static post (tip card, deadline card, dashboard) |
| `cta` | `headline`*, `sub`, `keyword`, `action` (`send`/`save`/`comment`) | Exactly one action. Compliance block |

A style may render a type it does not specialise by falling back to a close layout (myth → compare), but every type in its `types` list must look designed. Unknown art hooks (`doc`, `map`, `scene`, `annotations`) are ignored by styles that don't use them.

Overrides inside a slide: `byGroup`, `byStyle`, `byFormat`, `byClient` (applied in that order). Copy that differs per client goes in `byClient` (Instagram originality rules). Numbers come from `calc` and `{tokens}`; a leftover `{token}` stops the render.

## Markup conventions (the QA reads these)

- `data-role="display|body|label|fine"` on any element: minimum sizes 28 / 28 / 20 / 18 px at 1080 wide. Default is body. Folio, compliance and assumptions are `fine`.
- `data-block="name"` on each major text block: QA fails if two blocks overlap.
- `data-fit="box"` shrinks type until it fits its own box (needs a definite height) and/or `data-max-lines="N"`; `data-fit-min` sets the floor. `data-fit="width"` sets one line to fill its parent's width (`data-fit-max` caps it). A fit that fails is a QA fail.
- `data-bleed` on decorative type that deliberately crosses the safe box or the canvas edge. It must also be `aria-hidden="true"` unless the same words appear readable elsewhere.
- `data-noword` excludes chrome (series label, folio) from the word count.
- `aria-hidden="true"` hides decoration from QA (and the word count). Never hide real copy.
- `data-illustrative` on the "Illustrative / sample" mark of document styles.
- `[data-photo-placeholder]` is produced by `ctx.photo()`; don't fake one.

## Hard rules

1. **No AI images, no stock, no downloads.** Imagery is code: SVG, CSS, canvas (`page.js`), three.js, charts from `calc`. Textures are procedural (`var(--grain-img)` is a feTurbulence grain; build paper, halftone, newsprint, wood the same way). Client photos only through `ctx.photo()`.
2. **Every word is live type** (HTML or SVG `<text>`), never drawn into a canvas or baked into an image. QA can't check what it can't read.
3. **Fonts:** only OFL/free fonts in `fonts/`, declared in `style.json`. Each style owns its typography; check `STYLES.md` so two styles don't share a display face.
4. **Text inside the safe box** of the format (`format.safe`): feed x 64–1016, y 56–1294; story x 65–1015, y 270–1248 (the cover headline then also sits in the 3:4 band, y 240–1680); square x 64–1016, y 64–1016. Backgrounds and decoration may bleed.
5. **Contrast** is measured on the real pixels behind each run: 4.5:1, or 3:1 for text ≥ 24 px (or ≥ 18.66 px bold). Put text on flat zones or panels, not on busy art.
6. **Compliance slot on every slide.** Placeholders render as `BROKERAGE NAME · LIC. #——` with a red tag; never invent a name, licence or title.
7. **No real banks or lenders**, no banking UI (sign-in, account numbers). Documents say "Your lender" and carry an ILLUSTRATIVE mark.
8. **Numbers:** bars and areas start at $0; shown figures come from `calc` fills; deltas between two shown figures use `{delta}` (from the rounded figures) or show cents; every number slide states its assumptions; rates are dated.
9. **AI-look bans** (QA fails most of these): gradient fills and blobs, blur blobs, glassmorphism, coloured glow, gradient text, emoji, generic 3D emoji/clay icons, glossy stock smiles, thin interchangeable line icons, three identical rounded cards with soft grey shadows, centred-everything layouts, purple/teal palettes, warm-cream-plus-terracotta defaults, a tracked-caps eyebrow over every block, `→` on every label.
10. **Copy:** no banned phrases from playbook/PLAYBOOK.md (QA lint), no "best/lowest rate", no guarantees, ≤ about 40 words a slide.

## page.js (canvas / WebGL)

```js
// library/<slug>/page.js — loaded as a module after fonts, before fit/marks/QA.
window.STYLE_RUN = async (data) => {
  const THREE = await import(`${window.VENDOR}/three.module.min.js`); // only if you need it
  const canvas = document.querySelector('.bg canvas');
  // draw deterministically from `data` (seeded); for WebGL use preserveDrawingBuffer: true
  // and render once; resolve only when the frame is on screen.
};
```

Canvases live in `.bg`. Size them at 2× the CSS size for crisp 2x masters. Never draw copy into them; position HTML labels over the scene instead (project 3D points to screen in `page.js` and set `style.left/top` on labels you emitted in `html`).

## Review loop (required)

1. Render the demo specs for your style in feed, then the cover in story and square.
2. `Read` the `contact.jpg`, then **every** `NN.jpg` at full size. Look for: kerning and tracking at display sizes, widows and orphans, ragged rags, cramped margins, weak hierarchy (one focal point per slide), cropped or colliding text, marks that miss their word, charts whose numbers don't add up, empty dead zones, anything that reads as template or AI.
3. Fix and re-render (`--only 2,5` re-renders some slides). Aim for **0 fail**. `todo` (compliance placeholder, photo placeholder, `[brokerage to confirm]`) is expected until the client supplies assets. Read every `warn`.
4. Compare your two clients side by side: they must look like two different accounts.

---

## STYLE.md template

Each style's `STYLE.md` (6–10 KB) holds only what stays true for every post in that style. Section numbers are fixed.

```
# <Name> — Still Style

> One or two sentences: what the medium is and what it does for a mortgage post.
> References (grammar only): two or three traditions, designers or artefacts, and what to learn from each. Never copy their layouts, typefaces or marks.

## 1. Essence, and what it is not
## 2. Materials & rendering        (how code imitates the medium; what is procedural)
## 3. Colour logic                  (rules, how the client accent is used, one example palette at most)
## 4. Type                          (faces, roles, size ranges, what never happens)
## 5. Grid & composition            (grid, margins, focal rules, variant a vs b)
## 6. Signature device              (the one memorable thing, and how it carries data)
## 7. Slide grammar                 (cover, point, number, compare, steps/recap, myth, quote, stat, cta)
## 8. Formats                       (feed, story, square: what moves)
## 9. Best for / avoid for          (topics and post types; group and client fit)
## 10. Do / don't
## 11. Pitfalls & QA notes          (medium-specific failure modes and their fixes)
## 12. Demo                         (spec ids, clients, output paths)
```
