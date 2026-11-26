# Swiss Data Poster — Still Style

> International Typographic Style pushed to poster loudness: a full-bleed colour field that changes on every slide, one grotesk set huge and flush left, and the numbers drawn as exact geometry. The payment is the picture.
> References (grammar only): 1950s–60s Zurich concert and exhibition posters (field colour as structure, type as image, asymmetric balance); museum wayfinding (numerals as landmarks); statistical graphics in the Neurath tradition (quantity shown as area or length, nothing decorative). Copy no poster, layout or logo.

## 1. Essence, and what it is not
- One giant focal element per slide: a number, a statement or a slab chart filling most of the frame.
- Full-bleed fields that change on every swipe: signal colour (client accent), black, paper.
- One family (Archivo) in three widths: condensed for headlines, expanded black for figures.
- A visible 12-column grid: column ticks top and bottom, and a black bar that walks one column per slide (a built-in progress line).
- Geometry that carries data: the cover disc's **area** is today's payment, and the ring around it is exactly the increase.

Not minimal white Swiss (that was the rejected quiet version), not a dashboard (that's bento), not a terminal (that's terminal).

## 2. Materials & rendering
Pure HTML/CSS/SVG. A faint offset-paper grain (`var(--grain-img)`, multiply, 7%) keeps fields from looking like flat UI. No shadows, no gradients, no textures beyond the grain. The disc is an SVG circle on the field layer; its ring is a stroke whose width is `R·√(b/a) − R`.

## 3. Colour logic
- Three grounds only: **accent** (client colour), **black**, **paper** (`#F4F3EF`). Sequence (variant a): accent, ink, paper, accent, ink, paper, accent; variant b starts on black. The cover is accent (a) or black (b); the CTA is always accent.
- Text on the accent field uses the better of black/white (`bestOn`). On black, the signal colour is the accent lifted to 4.5:1 (`ensureContrast`).
- The accent marks the number that matters (callout, hike sliver, the right-hand side of a compare). Never decorative.
- Example: a cobalt client accent `#2148B0` → white type on cobalt, black disc, white ring.

## 4. Type
- Archivo only. Headlines 800–880 at width 86–90%, tracking −0.03em, leading 0.9–0.95. Figures 900 at width 108–115%, tracking −0.045em, set with `data-fit="width"` to fill the measure (feed max 420 px).
- Labels: 600–700 sentence case, 22–30 px. No all-caps eyebrows. Body/notes ≥ 30 px; fine print 19 px.
- `==emphasis==` is an accent underline (0.1em, skip-ink off), never a colour swap.

## 5. Grid & composition
- 12 columns on the safe box; content flush left, ragged right; measures in `ch` for headlines (12–15ch).
- Cover: headline top, giant figure bottom-left, disc behind on the right (variant b: disc bottom-left, figure full measure).
- Number: callout on top (giant), slabs fill the remaining height from $0 (variant b: horizontal bars from a left baseline, the sliver at the bar end).
- Compare: two stacked values; the right/second one on a signal block.
- One focal point per slide; nothing small floats in empty space.

## 6. Signature device
The **proportional disc**. Its area equals the base payment and its ring equals the change, so a 0.25% hike reads as a thin ring around a huge disc: honest, and the scale is the point. Inner slides echo it with slabs from zero where the hike is a signal-colour sliver on top.

## 7. Slide grammar
- **cover**: kicker, 4-line headline, figure (`+{deltaAbout}`), figure label, dek, swipe cue (bar + arrowhead).
- **point**: eyebrow, figure filling the width, then the statement at 56–70 px. Without a figure, the statement itself goes poster-size (104 px).
- **number**: callout and sub, slabs from $0 with values above, labels below, assumptions in fine print.
- **compare**: label, title, two values set to fill (230 px max), notes, verdict.
- **steps / recap**: title at 92 px, items with 88 px numerals in the signal colour.
- **myth**: struck claim (accent line-through) then the fact at 84 px.
- **quote**: 360 px quote mark in the signal colour.
- **stat**: headline, figure plus label, fact grid with the emphasis fact reversed.
- **cta**: a ghosted action word (Send/Save/Comment) bleeding off the top, headline at 128 px, compliance block.

## 8. Formats
- **Feed:** the master.
- **Story:** text in y 270–1248. The walking bar moves to y 180, and the disc sits low (cy 1500), so the field below the text is still designed.
- **Square:** headline 104 px, smaller disc.

## 9. Best for / avoid for
- **Best for:** payment maths, rate-day numbers, before/after, any post whose hero is one number.
- **Avoid for:** emotional client stories (use magazine or cutout) and long checklists (use bento).
- **Group:** 1 (Ledger).
- **Roster:**
  - See `library/roster.json`: in the example roster Northline Mortgages (Toronto) uses it as primary, variant a.

## 10. Do / don't
- **Do:**
  - let the number fill the frame;
  - change the field every slide;
  - keep the disc and slabs exact.
- **Don't:**
  - centre anything;
  - add icons;
  - use a second accent;
  - tint the paper cream;
  - put small copy in the middle of an empty field.

## 11. Pitfalls & QA notes
- `max-width` in `ch` shrinks with the font, so fit.js can't reduce the line count. Use `data-max-lines` with px measures when a headline must shrink.
- Percent units inside `calc()` heights are invalid: slab heights use unitless `--h`.
- On a light accent (ochre, marigold), white type fails. `bestOn` switches to black automatically; check the disc ring colour too.
- Keep the disc below the headline (cy ≥ 1150 on feed) or it cuts through the type.

## 12. Demo

- Try it on the example client: `node render.mjs specs/library/dec9-variable.json --client northline-mortgages --style swiss` (add `--variant b`, or `--format story --only 1` / `--format square --only 1` for covers). Output: `out/dec9-variable--swiss[--<format>]/northline-mortgages/`.

