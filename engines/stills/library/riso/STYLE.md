# Riso Two-Ink — Still Style

> A post that looks printed on a stencil duplicator: two translucent spot inks on warm paper, halftone ramps on their own screens, plates that never quite line up, and every word printed in the dark ink. It turns a mortgage number into a poster someone would pin up.
> References (grammar only): real riso zines and gig posters (translucent overprint, misregistration, pinholes, feed streaks); Tom Haugomat's two-colour illustration (one big flat shape, one small subject, a third colour made by overlap); Swiss poster numerals set huge and tight. Copy none of their compositions, characters or palettes, and never show the RISO brand or machine.

## 1. Essence, and what it is not

- **Two plates only.** Plate A is the dark ink and carries every word. Plate B is the bright field ink. Paper is the third "colour".
- **Overprint is the payoff.** Where A crosses B (type over a disc, a coin rim over a ramp, the big numeral over the sun) the inks multiply into a deep third colour. Use it on purpose, once or twice a slide.
- **Misregistration.** Plate B sits a few pixels off plate A, seeded per slide. Edges show slivers of paper or a coloured halo.
- **Halftone in steps**, never smooth gradients: ramps are 4–5 bands of rotated dots.
- **Imperfect ink:** blotchy density, faint vertical feed streaks, grain at the dot threshold, rare pinholes in solids.

Not flat vector art with a noise filter (every colour comes from the plates), not CMYK pop-art halftone (no process colours, no black keyline), not the legacy `family-riso` CSS (that was flat fills). Not Poster Type either: riso is about ink and paper, Poster Type is about letterforms filling the frame.

## 2. Materials & rendering

- `library/riso/page.js` is a real print engine on a 2× canvas in `.bg`. It reads every invisible `.rz-shape` box (laid out by CSS, so art follows the layout in every format), paints each plate as a density field, halftones it (plate A at 75°, plate B at 15°, period 14 px at 2×, 7 px in the delivered file), offsets plate B by a seeded 2.5–4.5 px with a whisper of rotation, and multiplies both inks over the paper with fibre noise.
- Art vocabulary: `rect`, `disc`, `path` (SVG path data scaled into the box), stepped `ramp`s, and `knock` (zero ink on named plates: paper windows).
- **Type is live DOM**, `mix-blend-mode: multiply` over the print, roughened by the `#rz-ink` SVG filter (edge wobble, a few pinholes). Never draw copy into the canvas.
- **Double-hit numerals:** the readable numeral in plate A over an `aria-hidden` echo in plate B, offset by the slide's misregistration plus a design offset.
- `==emphasis==` prints a slightly uneven plate-B field behind each line of the phrase; myth strikes print a plate-B bar through the line.
- **Paper windows** (`KNOCK`) sit behind every small label (series, folio, kicker, fine print) and a full-width paper band runs under the footer, so small type always prints on paper.

## 3. Colour logic

- Paper `#F3EEE3`. Inks come only from the fixed ink list in `style.json` (`pinAccent: true`).
- The client accent picks the pair: the nearest ink by Lab distance. A bright accent becomes plate B over federal blue (black when the field is cool: teal, green, blue, aqua). A dark accent (navy, green, burgundy) becomes plate A and gets a bright partner (sunflower, fluorescent orange or bright red, by seed).
- Field inks never carry text (all fail 4.5:1 on paper). Plate A on paper is 4.9–14.7:1.
- Plate-A text over a solid plate-B field reaches about 4.4:1: fine for display and notes (≥ 24 px), never for labels or fine print, which go in paper windows.
- Never put plate-A text over a plate-A tint: the dots of the same ink eat the letters (and QA's pixel contrast fails it).
- Example pair: federal blue `#3D5588` + bright red `#F15060` → overprint about `#3A1B33`.

## 4. Type

- **Bricolage Grotesque** (OFL), 75–85% width, 650–800 weight, optical size 72–96 for display: headlines 92–128 px, statements 58–88 px, numerals fitted to width (up to 470 px on feed). Tight leading (0.88–1.0), slight negative tracking.
- **Space Mono** (OFL) for labels, kicker, folio, chart labels, fine print and compliance: 19–26 px, sentence case, never tracked caps.
- Emphasis phrases never break across lines (`white-space: nowrap`); statements and titles use balanced rags.

## 5. Grid & composition

- Safe-box column, flush left. One big flat shape (disc, bar, half disc) plus one stepped ramp per slide; at most one other small shape.
- A carousel rotates three field compositions by slide index (sun disc + low ramp; tall stepped bar + plate-A dot; rising half disc + plate-A tint disc) so swiping changes rhythm.
- **Variant b re-composes:** the cover puts the headline top and the double-hit numeral bottom over a disc rising from the lower left; fields move to the opposite edge or top; number slides switch to horizontal bars with the callout below; compare stacks the panels; lists swap the right-edge strip for a low sun.
- Footer always on paper; the print stops above it like a sheet margin.

## 6. Signature device

**The double-hit numeral crossing the field.** The slide's one number is set huge in plate A, its plate-B echo offset beneath, and it overprints a solid disc so the inks make the third colour exactly where the money is. On number slides the change itself is printed to scale: a taller highlighted bar prints its extra as overprint; a shorter one leaves the missing part as a plate-B ghost tint (240 vs 218 months shows 22 months of ghost).

## 7. Slide grammar

- **cover:** kicker (window), hero numeral over the disc, headline 3–4 lines, optional dek, coins on the ramp (plate-A rims and tint faces knocked out of plate B), swipe arrow printed in plate A.
- **point:** eyebrow, optional double-hit figure, statement (88 px without a figure, 58 px with), note; field composition by index.
- **number:** title, bars from zero (others: plate-A 42% halftone; highlight: solid plate B with overprint delta or ghost), value labels above, callout double-hit fitted to width, assumptions in Space Mono on paper.
- **compare:** left panel on paper, right panel solid plate B, a plate-A "vs" dot on the seam with the word knocked out.
- **steps / recap:** plate-B dots carrying the numeral (steps) or a plate-A tick (recap), items 48 px, right-edge stepped strip.
- **myth:** myth in plate A struck by a plate-B bar, fact below.
- **quote:** big plate-B quote marks drawn as a path, low ramp.
- **stat:** big double-hit figure beside the headline, the emphasised fact on a solid plate-B band, other facts in a 2-up grid.
- **cta:** headline over a large disc overlapping a plate-A tint disc (third colour in the overlap), compliance block on paper.

## 8. Formats

- **feed 1080×1350:** as above.
- **story 1080×1920:** words stay in y 270–1248; the lower canvas gets its own print (a rising plate-B disc over a stepped plate-A ground) so the 3:4 grid crop is never empty paper. Smaller hero numeral (fit max 380 px) and headline (84 px).
- **square 1080×1080:** numeral fit max 250 px, headline 70 px, tighter kicker and label spacing.

## 9. Best for / avoid for

- Best for: renewal and rate explainers with one strong number, "one day only" or deadline hooks, myth-busts, save-worthy recaps, younger or arts-adjacent audiences. Group 3 (Riso family).
- Avoid for: sombre topics (job loss, arrears), dense tables with more than three numbers, posts that need a client photo (riso halftoning a face reads as a filter).

## 10. Do / don't

- Do let one overprint carry the slide. Do keep fields stepped. Do keep small type in paper windows.
- Don't add a third ink or a smooth gradient. Don't stack two halftoned plates on the same area. Don't put labels on solid plate B. Don't jitter registration per element: one offset per slide.

## 11. Pitfalls & QA notes

- `.fg` must not form a stacking context (`z-index: auto` in style.css), or multiplied type composites against transparency and never overprints.
- `page.js` calls `FIT_RUN()` before painting so the art matches fitted type; echo sizes are copied from the fitted numeral.
- Multiply on a container (not the text element) breaks QA's contrast model for nested backgrounds: only text elements multiply; compliance stays normal.
- Halftone period below 12 px at 2× moirés in the JPEG; above 18 px reads as polka dots.
- Render time is about 1.5 s a slide (CPU print pass over 5.8 M pixels).

## 12. Demo

- Try it on the example client: `node render.mjs specs/library/dec9-variable.json --client northline-mortgages --style riso` (add `--variant b`, or `--format story --only 1` / `--format square --only 1` for covers). Output: `out/dec9-variable--riso[--<format>]/northline-mortgages/`.

