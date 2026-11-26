# Poster Type — Still Style

> A typographic poster in one condensed gothic: every display line is scaled to the full measure, lines stack flush left, and each slide is a single flat colour field that flips as you swipe. The line that matters is printed on a full-bleed band. Built in layers, so the same post can animate line by line.
> References (grammar only): American wood-type and letterpress bills (lines of different sizes justified to one measure); Swiss and Polish political posters of the 1960s–70s (one colour field, huge type, nothing else); protest placards (one claim, read from across the street). Take the measure-filling stack and the restraint, never a specific poster's layout or lettering.

## 1. Essence, and what it is not

- **One typeface, Big Shoulders**, display lines in heavy uppercase at the 72 optical size.
- **Edge to edge:** each display line is sized so it spans the safe width exactly (short lines get big, long lines get smaller), which creates the stacked rhythm.
- **Flat colour fields:** a slide is accent, ink or paper. No images, no texture beyond a faint print grain, no illustration.
- **The band:** an `==emphasis==` phrase becomes its own line(s), printed on a full-bleed bar in a contrasting field colour.
- **Tension of scale:** giant display type against small, sentence-case copy (still ≥ 28 px).

Not a "kinetic typography" template with centred words and gradients, not a quote card with a big serif, not Swiss (no grid furniture, no data geometry), not Riso (no inks, overprint or halftone).

## 2. Materials & rendering

- Pure HTML type on solid fields; grain is the shared feTurbulence image at soft-light 22%.
- **page.js plans every stack in the browser** after fonts load: it measures each word combination at 100 px, searches every break pattern (up to ~22 words; DP beyond), and picks the set that fills the stack's box best while keeping line sizes within about 1.8× of each other, preferring breaks at punctuation and never ending a line on an article or preposition. Sets that are too tall are scaled down evenly (and penalised). Lines are then handed to fit.js (`data-fit="width"`, capped at the planned size), verified against the real layout and shrunk if needed.
- `data-fill` text blocks (point statements, list items) grow to the height their wrapper gives them (binary search).
- Every line and block carries `data-k` (its reveal order) for a motion version.

## 3. Colour logic

- Three fields only: **accent** (client colour), **ink** (`#141414`), **paper** (`#EDEDE7`, cool off-white).
- Sequence by slide: variant a = accent, ink, paper, repeat; variant b = ink, paper, accent. The last slide returns to the first field so the carousel closes.
- Field rules (computed in `style.mjs → fieldVars`, contrast-checked against the client accent):
  - ink field: paper type; band and highlight bars in accent.
  - accent field: type in the better of ink/paper; band in ink with accent (or paper) type.
  - paper field: ink type; band in ink; accent used for numerals only if it passes 3:1 on paper, otherwise ink.
- Example: a furnace-orange accent `#E4572E`; a marigold accent `#E0A100`, where marigold never appears as text on paper.

## 4. Type

- **Display lines:** Big Shoulders 900, `opsz` 72, uppercase, tracking −0.006 em, line-height 0.86, sizes set by the planner (typically 100–330 px feed).
- **Figures:** same weight, fit to width (cap 300 px on covers, 470 px on point slides).
- **Small copy:** Big Shoulders at `opsz` 16–40, weight 600–800, sentence case: kicker 34 px, notes 33 px, labels 24–28 px, statements 52–112 px (filled), fine print 20 px.
- No second typeface, no italics, no letter-spaced caps labels.

## 5. Grid & composition

- One column, flush left, on the safe box. The stack is the slide; everything else is a small block above or below it.
- Header (series, folio) and footer (compliance; cue on the cover) on every slide.
- **Variant a:** stacks top-anchored; figure top with statement filled at the bottom; callout under the chart.
- **Variant b:** cover stacks bottom-anchored with the figure first; statement top with the figure at the bottom; callout above the chart; compare columns side by side.
- Bands bleed to both canvas edges (box-shadow, so they don't create overflow).

## 6. Signature device

**The full-measure stack with one band.** Lines of different sizes, each exactly as wide as the slide, stacked tight, with the key phrase on a full-bleed bar. It reads at thumbnail size, and because each line is its own layer it can be revealed in order in a reel.

## 7. Slide grammar

- **cover:** kicker, headline stack (fills the remaining height), figure + label only if the figure isn't already in the headline, swipe cue.
- **point:** with a figure, figure huge plus a filled statement and note; without, the statement is the stack.
- **number:** title stack (max 4 lines), bars as full-measure bands from a zero rule (highlight bar in the band colour, value inside the bar), a dashed outline marks the gap when the highlight is shorter (time saved), callout figure + sub, assumptions.
- **compare:** title stack; the second option sits on a panel of the next field colour, aligned by page.js to the measured block (horizontal split in a, vertical in b).
- **steps / recap:** title stack; items filled to the space, with giant numerals (steps) or solid squares (recap).
- **myth:** myth as a stack with a band-coloured strike bar on each line, then "Fact" and the fact statement.
- **quote:** giant opening quote mark, quote as the stack, attribution.
- **stat:** kicker, optional figure, headline stack, facts as ruled rows (label left, value right).
- **cta:** headline stack bottom-anchored (keyword on a band when `keyword` is set), sub, compliance block.

## 8. Formats

- **Feed 4:5:** as above.
- **Story 9:16:** the field fills the canvas; the stack plans against the near-square safe box (y 270–1248). Nothing decorative in the UI bands.
- **Square:** same as story, smaller caps (230–270 px).

## 9. Best for / avoid for

Best for hooks, myth-busts, one-number punches, deadlines, CTAs, and carousels meant to become reels. Group 3 (Riso family: loud, print, energetic). Avoid for long explanations (more than ~25 words a slide), tables of more than four numbers, and calm reassurance posts (use Paper Cut-out or Editorial Cover).

## 10. Do / don't

- Do write headlines that break well: short words, a period mid-headline, one emphasised phrase.
- Do let the field change every slide; never two adjacent slides in the same field.
- Do keep one band per slide.
- Don't centre anything. Don't outline type. Don't add icons or photos.
- Don't use the accent as text on paper unless it passes 3:1.
- Don't feed it a 30-word headline; the stack will shrink to body size and lose the poster.

## 11. Pitfalls & QA notes

- **Content box vs line box.** Big Shoulders' content box is 1.2 em tall against a 0.86 em line: QA measures contrast over the content box, so bands carry 0.17 em padding and neighbours keep 0.19 em clearance, and lines with `$ , ; Q` get room below.
- **Flex-end stacks hide overflow** from `scrollHeight`; page.js verifies by summing child heights and re-tags a still-overflowing stack as a fit box so QA reports it.
- **Strut height:** lines are flex rows (`.bt-line { display: flex }`) so the parent's 100 px strut doesn't inflate them.
- **Class collisions:** stage classes are `bt-<type>`; inner stacks use other names (`bt-mythstack`).
- **Short words:** a line under five characters is allowed only when it is a whole segment (an emphasis), otherwise "YOU" ends up 300 px tall.

## 12. Demo

- Try it on the example client: `node render.mjs specs/library/dec9-variable.json --client northline-mortgages --style bold-type` (add `--variant b`, or `--format story --only 1` / `--format square --only 1` for covers). Output: `out/dec9-variable--bold-type[--<format>]/northline-mortgages/`.
- Code: `engines/stills/library/bold-type/` (`style.mjs`, `style.css`, `page.js`, `style.json`).

## Round 2 near-dup change, 2026-11-16
- Variant b now re-composes the plain statement (the stack yields 31% of the measure to a side column holding the note under a heavy rule) and the recap (list first, title stack at the foot under a 14 px rule). Before this change, the two variants hashed as twins on those slides.
