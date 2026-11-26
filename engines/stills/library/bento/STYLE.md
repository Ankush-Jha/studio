# Bento Ledger — Still Style

> A ledger-dashboard of unequal, square-cornered tiles on cool stone: one hero tile in the client's colour, one ink tile, paper tiles, every tile one number with a micro-visual, and every bar on a slide drawn on one shared scale. For deadlines, rule summaries and single-post tip cards that people save.
> References (grammar only): printed annual-report dashboards and statistical yearbooks (one number per cell, one scale per page); Otl Aicher-era information systems (modular fields, colour as category); Japanese bento boxes (unequal compartments that still read as one meal). Copy no app's UI, icon set or layout.

## 1. Essence, and what it is not

- **Unequal tiles, one meal.** A 12-column grid with 12 px gutters; one hero tile spans at least a quarter of the grid; the rest vary in width.
- **Three tones only:** accent (hero), ink (at most one per slide), paper (everything else), on a cool stone ground.
- **One number per tile,** label top, number bottom, micro-visual between or under.
- **One scale per slide:** every bar compares against the same maximum, so tiles can be read against each other.

Not the SaaS card kit: no rounded corners, no drop shadows, no gradients, no glassmorphism, no thin line icons, no identical cards in a row. Not a fake banking app: no account UI, no logos, no "balance" widgets. Not a cream editorial page.

## 2. Materials & rendering

- Flat colour only; the gutters separate tiles (no strokes, no shadows, radius 0).
- Micro-visuals are HTML/SVG built from the numbers on the slide:
  - **share bar** (16 px track, fill on the shared scale; a change segment in the accent);
  - **segmented ring** for the largest value when it divides into whole units of the smallest (e.g. a $40,000 lifetime limit as five $8,000 segments, the emphasised value filled), captioned "$8,000 per segment";
  - **stop mark** for "none / deadline" facts (cells ending in an accent bar);
  - figure-derived marks on point slides: "2 in 3" → three cells, two filled; "Nov 18" → that month as a cell calendar, the day ringed, past days faint; "15%" → a 10 × 10 field.
- All micro-visuals are `aria-hidden` and add no words.
- Story covers and statics: a decorative accent tile fills the band below y 1248 with a ghost of the hero figure (16% on-accent), sized to fit whole.
- Every tile is a clip detector (`data-fit="box"` with an unreachable minimum): if content doesn't fit, QA fails it instead of cutting it off.

## 3. Colour logic

- Ground `paper` (cool stone), tiles `tile` (near-white), `inktile` (near-black), client `accent` for the hero tile only (plus its change segments and list numerals as `accent-ink`).
- Text on accent uses `on-accent`; on ink uses the tile colour; on paper uses ink and ink-soft (≥ 7:1).
- No second accent, no tints as fills. The accent tint appears only as the change segment on an ink tile's bar.
- Example palette (default): stone `#E3E5E0`, tile `#F9F9F6`, ink `#121513`, ink-soft `#4F5652`, rule `#C6CAC3`, inktile `#1A1D1B`.

## 4. Type

- **Mona Sans** (OFL), variable width 75–125, weight 200–900. The file's default weight is 200: always set weights.
  - Hero figure: wdth 125, weight 880, tracking −0.055em, fit to the tile width (`data-fit="width"`).
  - Tile values: wdth 108–118, weight 800–820, 46–64 px; narrow tiles 46 px; story/square 38–50 px.
  - Headline: wdth 106, weight 790, 70–78 px feed, 58–62 px story/square; tracking −0.03em.
  - Tile labels: wdth 88, weight 640, 23 px, sentence case. Notes 28 px.
- **Proportional figures only.** Mona Sans's tabular figures switch to a slashed zero ("$Ø" reads as "no money"); never enable `tabular-nums`.
- "/mo" suffixes are labels (22 px), not body text.

## 5. Grid & composition

- 12 columns on the safe box; area rows written compactly (`'h:6 a:6'`). Plain four-token rows (`'h h a a'`) are widened ×3.
- Headline sits on the ground above the grid; compliance and the note sit on the ground below it. The grid takes the remaining height.
- **Variant a:** hero left, facts right; value tiles right of the chart; first list item big on the left; CTA tile on top.
- **Variant b:** hero right; value tiles left of the chart; compare stacked as two full-width rows; point statement full-width on top with figure and note under it; first list item big on the right; CTA tile below its sub-line.
- Square statics with five facts drop to a 3 × 2 grid (hero the size of a fact tile): there's no height for a 2 × 2 hero.

## 6. Signature device

**One scale, many tiles.** The largest money value on the slide sets the scale; every other money tile draws its bar against it, so $8,000, $16,000, $32,000 and $40,000 visibly sit at 20 / 40 / 80 / 100%. Number slides put a zero-based column chart in a wide tile, one value tile per row (lettered A, B, C to match the columns) and the callout in a full-width ink tile.

## 7. Slide grammar

- **cover:** kicker + folio, headline on the ground, hero tile (figure + label), up to two row tiles from the calc (payment at each rate, with bars and the change segment), dek tile, "Swipe →".
- **point:** figure tile (accent or ink, alternating by slide) with its micro-visual, statement tile, note tile.
- **number:** title on the ground; chart tile + value tiles + callout tile; assumptions as fine print.
- **compare:** two tall tiles (paper, accent) or two stacked rows (variant b); verdict on the ground.
- **steps / recap:** the first item is the big ink tile; numbers for steps, checks for recap.
- **myth:** a "Heard" paper tile with the claim struck in accent, a "The numbers" ink tile with the fact.
- **quote:** one accent tile; attribution tile below. Real quotes need written consent.
- **stat (home):** headline; hero tile; up to five fact tiles (emphasised fact = ink tile); note; compliance block.
- **cta:** one large accent tile with the headline; sub-line tile; compliance block.

## 8. Formats

- **Feed:** as above.
- **Story:** text inside y 270–1248, smaller type and padding (18–20 px); the accent ghost band fills y 1290–1920 so the 3:4 grid crop reads as a poster.
- **Square:** tighter grid; stat drops to 3 × 2; rings shrink to 64 px; bars stay 16 px.

## 9. Best for / avoid for

- Best: deadline cards (FHSA, RRSP, renewal windows), rule summaries (stress test, amortization limits), "what changes, what doesn't", side-by-side scenarios, single static tip posts meant to be saved.
- Group 1 (Ledger). Roster: see `library/roster.json`.
- Avoid: stories about people, myth-busting with emotion, news pegs that need urgency (use Terminal or a Group 4 style).

## 10. Do / don't

- Do keep one hero tile and at most one ink tile per slide.
- Do let the gutters separate tiles; keep corners square.
- Do derive every micro-visual from a number already on the slide.
- Don't add icons, emoji, shadows, rounded corners, gradients or blur.
- Don't let a tile hold more than one number.
- Don't enable tabular figures (slashed zeros).

## 11. Pitfalls & QA notes

- Tight-leaded figures: the font's content box runs ~0.3em past the line box. Figure boxes are flex containers (no inline strut), and figure tiles reserve 0.31em under the figure, or QA reports clipping and bad contrast.
- Specs with many facts (the FHSA static has 73 words) trip the ≤ 40-word warning; that is a copy decision for the writer, not a layout fix.
- A long figure in a narrow tile: values in tiles narrower than six columns drop to 46 px.
- Story/square rows are short: tile children never shrink (`flex-shrink: 0`), so overflow is caught, not squashed.

## 12. Demo

- Try it on the example client: `node render.mjs specs/library/dec9-variable.json --client northline-mortgages --style bento` (add `--variant b`, or `--format story --only 1` / `--format square --only 1` for covers). Output: `out/dec9-variable--bento[--<format>]/northline-mortgages/`.
- Engine: `engines/stills/library/bento/style.mjs` (`expand`, `bar`, `ring`, `figVisual`), `style.css`, `style.json`.

