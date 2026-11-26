# Iso Blocks — Still Style

> A quiet architectural model of the money: a three.js isometric scene in matte clay on a flat concrete ground, where every volume that stands for a number is sized from that number, and live type hangs off the model on hairline leaders.
> References (grammar only): architects' white study models and site plinths (matte, honest, one material); Otl Aicher-era information graphics (one family, one accent, labels as part of the drawing); museum-plate captions with leader lines. Copy none of their models, layouts or typefaces.

## 1. Essence, and what it is not

- **True isometric, orthographic.** Camera at equal angles (elevation 35.26°), no perspective, objects aligned to the grid so footprints read as diamonds.
- **Matte clay:** roughness 1, metalness 0, flat colours; form comes from three face tones and one soft shadow, never from gloss or texture.
- **One accent volume.** Everything is off-white stone or mid-grey clay except the one thing the slide is about.
- **Labels are typography, not decals.** Words are HTML around the model, joined by 2 px leaders that end in a ringed dot on the object.

Not a 3D-emoji or "clay icon" render (no cute rounded mascots, no gradients, no bloom, no glossy plastic). Not a dashboard (no cards or UI chrome). Not the Studio Films low-poly island (no terrain, no characters). Not a product render (no studio HDRI, no reflections).

## 2. Materials & rendering

- `library/isometric/page.js` builds the scene from plain data emitted by `style.mjs`: objects placed on a `(u, v)` grid (u runs screen-right, v toward the viewer) with kinds `box`, `plinth`, `house`, `envelope`, `coins`, `bookmark`, `bubble`, `plane` (a folded paper plane: Instagram's send glyph), `trail` (dashed flight path).
- Boxes and plinths are bevelled extrusions (rounded vertical edges, 3-segment bevels) so edges catch light like plaster.
- Light: hemisphere fill (white sky, ground-coloured bounce) plus one key from screen upper-left with a 4096 VSM shadow map (radius 9). Shadows land on a transparent `ShadowMaterial` plane, so the CSS ground colour shows through untouched.
- The camera is fitted so the model's projected bounds fill the `.io-scene` box (pad, horizontal and vertical alignment and label headroom come from CSS custom properties `--scene-pad`, `--scene-align-x|y`, `--scene-pad-top`). Canvas at 2×, MSAA on, rendered once, deterministic.
- Labels marked `data-place="auto"` are positioned by projecting their anchor (top centre of the object) and clamped inside the safe box; `top` labels sit in a band above the model. A label can opt out of its leader with `--leader: none`.
- No text is ever drawn into the canvas.

## 3. Colour logic

- Ground `#D5DAD2` (concrete sage), ink `#1D2630`, stone `#F3F1EB`, stone-2 `#B9C0B6`, slate `#2C3540` for doors, windows, trails.
- The client accent is the single coloured volume (the loan block, the highlighted column, the last stair, the plane).
- When an accent is too light to carry text (the renderer had to darken it to reach 4.5:1, e.g. marigold), the slide gets `io-soft-accent`: big figures set in ink with an accent underline, and the accent stays in the model. A dark accent (ultramarine, crimson) also colours the callout figure.
- Never more than one accent object family per slide; never colour the ground.

## 4. Type

- **Red Hat Display** (OFL): headlines 86–104 px weight 800, statements 52–82 px, figures 120–180 px weight 900, tight tracking (−0.02 to −0.045 em).
- **Red Hat Mono** (OFL): labels, leaders' tags, kicker, folio, tread numbers, fine print and compliance, 19–28 px, sentence case.
- One family pair only. No caps-tracked eyebrows; kickers are mono sentence case.

## 5. Grid & composition

- Safe-box column; type block and model box never overlap. The model box takes the remaining height (`flex: 1`).
- Plinths separate ideas: one plinth per option, spaced so their diamonds never touch.
- **Variant b re-composes:** cover model on top with the headline below; number callout above the columns; compare text above the houses (no leaders); lists put the model on the other side; CTA headline above the model.

## 6. Signature device

**Volumes from the numbers, labelled like a museum model.** Columns share one base and one scale from zero (heights exactly proportional to `calc.chart`); a single value stands next to the house it pays for, so it has a reference; steps become a real staircase with numbered treads; a recap is a stack of slabs, one per item, the last in accent.

## 7. Slide grammar

- **cover:** kicker (hidden when it repeats the series), headline up to 5 lines, the model (two households for two-way stories: a gift envelope with a seal on one plinth, the whole loan as a tall accent block on the other), auto labels above, swipe cue. A cover figure is shown only if the headline doesn't already contain it.
- **point:** eyebrow, optional figure, statement, note, a small token model (slab stack, coins or house, by slide index) in the free corner.
- **number:** title, columns from zero on one plinth with auto labels (value + mono key; a solo column shows only the key because the callout carries the value), callout figure + sub, assumptions in mono.
- **compare:** two plinths each with a house (the right one with an accent roof), labels and values in two columns under them, leaders up to the roofs.
- **steps:** items with mono numbers above a staircase whose treads carry matching numbers. **recap:** items with left rules (last in accent) beside a slab stack.
- **myth:** myth struck with the hand pen, fact as statement, slab token. **quote:** quote in display, house token. **stat:** headline, facts list with rules (emphasised in accent), columns from the stat's calc.
- **cta:** the action as an object: send = a paper plane leaving a house on a dashed trail; save = a standing bookmark; comment = a speech block. Compliance block.

## 8. Formats

- **feed 1080×1350:** as above.
- **story 1080×1920:** headline and compliance line sit in the safe band; the model box runs from below them to about y 1700, bleeding to the canvas edges, with labels kept inside the safe box (y ≤ 1248). The model therefore fills the 3:4 grid crop.
- **square 1080×1080:** headline 72 px (fit floor 54), shorter model box with 52 px label headroom.

## 9. Best for / avoid for

- Best for: "two ways" stories, comparisons of amounts, payments that need a reference object, step-by-step processes, CTAs about sending. Group 3, for clients whose audience likes clean, calm explainers.
- Avoid for: more than three values on one chart, time series (use Terminal or Swiss), posts that need a person, news pegs that need urgency.

## 10. Do / don't

- Do size every data volume from `calc`, from zero, on one shared scale. Do keep one accent object. Do keep leaders short and never across text.
- Don't add props for decoration (plants, cars, people). Don't tilt the camera off true isometric. Don't use gloss, bloom, gradients or coloured light. Don't print numbers on the model.

## 11. Pitfalls & QA notes

- A flat object (envelope, bookmark, bubble) must face `(1, 0, 1)`: rotate +π/4 about Y or it renders edge-on.
- Square plinths span `w·√2` along u: space plinth centres at least `w·√2/2` + a gap apart or they merge.
- Label headroom: auto top labels need `--scene-pad-top` or they collide with a model fitted to the top of its box.
- Leaders run from the label edge facing the anchor; static labels under the model start at their top edge.
- WebGL uses Metal on macOS (`--use-angle=metal`); on a virtual GPU set `STATICS_ANGLE=swiftshader` (slow but correct).
- Render time: about 0.4–1 s a slide including the shadow pass.

## 12. Demo

- Try it on the example client: `node render.mjs specs/library/dec9-variable.json --client northline-mortgages --style isometric` (add `--variant b`, or `--format story --only 1` / `--format square --only 1` for covers). Output: `out/dec9-variable--isometric[--<format>]/northline-mortgages/`.

## Round 2 (thumb-stop) changes, 2026-11-16
- The ground is now a loud field (`palette.paper` `#F6B93B` sunflower), not concrete grey. The clay models and the client-colour volumes read at thumbnail size.
- When the client accent sits close to the field (a marigold accent on sunflower), override the field per client in `tokens/clients/<id>.json` → `byStyle.isometric.color.paper`. For example, a marigold client gets sky `#8EC5EE`.
