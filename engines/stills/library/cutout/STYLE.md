# Paper Cut-out — Still Style

> A commissioned editorial collage made of construction paper: every shape, strip and sheet is torn or cut paper with a white fibre core at the tear and a tight shadow where it sits on the board. Mortgage numbers are pasted on as paper, so a heavy topic feels handled by a person.
> References (grammar only): Henri Matisse's late cut-outs (flat colour shapes with confident, imperfect edges; never copy the forms); ransom-note and zine paste-up (each line a separate slip, so reading order is physical); Eric Carle's layered paper (texture inside a flat shape). Take the material and the layering, not the motifs or palettes.

## 1. Essence, and what it is not

- **Paper all the way down.** Board, strips, sheets, objects and edge scraps are paper with torn (deckled) or scissor-cut edges. Nothing is a vector card or a rounded UI box.
- **Display copy is pasted on.** Each set line of the headline sits on its own torn card strip; the emphasised phrase gets its own accent patch.
- **Three papers plus the client accent** on a neutral board: card (off-white), deep (charcoal), kraft (brown). The accent is the only saturated paper.
- **Objects are flat cut shapes** (house, coins, calendar, envelope, plane, bookmark, speech bubble), built from 2–5 pieces each. Grown-up and exact, like an illustration commissioned for a magazine, never a craft-class cut-out.
- **Scraps cross the slide edges** and continue on the next slide, so the carousel reads as one long table of paper.

Not a 3D render (no bevels, no lighting gradients), not clay or "claymorphism" emoji, not a scrapbook (no stickers, washi-tape clip art, doodles or glitter), not a flat vector illustration with a noise filter on top.

## 2. Materials & rendering

- **Torn edge** (`#ct-torn-a`, `#ct-torn-b`, `#ct-strip` in `style.mjs → defs()`): the shape is displaced twice by fractal noise at slightly different scales; the larger copy is flooded with card colour and sits under the smaller one, so a white fibre core shows unevenly along the tear. Strips use a horizontally stretched noise (long fibres) so their top and bottom edges tear, not their ends.
- **Scissor cut** (`#ct-cut`): a 3 px low-frequency displacement only. Use it for small pieces (windows, doors, coins) so they look cut, not torn.
- **Fibre**: a faint, long-fibre turbulence composited inside each piece (max alpha ≈ 0.15). Anything stronger reads as speckle and lowers contrast measurements on the text that sits on it.
- **Shadow**: two neutral layers, 1.6 px blur / 2.2 px drop at 34% and 5 px blur / 7 px drop at 12%, warm black `#15130E`. Never coloured, never bigger.
- **Board**: flat ground colour + a very low-contrast mottle and fibre streak (`#ct-board`) + the shared grain at 7%.
- **page.js** cuts paper to the type after fitting: one strip per measured line box, an accent patch per `==emphasis==` fragment (covering the full text box, so on-accent ink always has its own ground), and a torn sheet behind every `[data-paper]` block (sheets, slips, bars, tags, the figure patch). Seeds come from the client seed and slide index, so two clients never share edges.
- Every word stays live HTML text over the paper layer; paper is SVG only.

## 3. Colour logic

- Board: neutral grey board (variant a, `#D5D0C5`) or kraft board (variant b, `#C7AC84`). Never cream-white.
- Papers: card `#F7F4ED`, deep `#2B312D`, kraft `#C49B66`, and the client accent. No other hues.
- The accent is for one thing per slide: the figure patch, the highlighted bar, the right-hand sheet, the tab, the plane. It is never a text colour on the board except the callout value on a card (`--color-accent-ink`, contrast-safe on card).
- Text on accent paper uses `--color-on-accent`; text on deep paper uses card.
- Example: a lacquer-red accent `#B4232A` on grey board; a pine accent `#2F6B4F` on kraft (variant b).

## 4. Type

- **Young Serif** (one weight, heavy, soft serifs) for everything pasted on paper: headlines 80–96 px, statements 50–64 px, figures 170–250 px (fit to width), values 80–108 px. Lining figures throughout (`font-variant-numeric: lining-nums`).
- **Rethink Sans** 500–720 for small copy: tabs 26 px, notes 30–33 px, labels 24–29 px, compliance and assumptions 19–20 px.
- Headlines set flush left, sentence case, line-height 1.36 so each slip has board showing between it and the next.
- Never set Young Serif below 40 px or Rethink in caps runs. No italics.

## 5. Grid & composition

- One column on the safe box; strips start at the left margin and end where the line ends, so the right edge of the headline is a ragged stack of slips.
- One focal paper per slide (figure patch, chart, sheets, or the cover object). Small copy sits directly on the board.
- Every slide has a header (series, folio) and a footer (compliance; cue on the cover).
- **Variant a:** grey board; cover object bottom-right, headline top-left; figure patch at the top of point slides with the statement on a pasted card at the bottom; callout card beside the chart; sheets side by side; plane bottom-right on the CTA.
- **Variant b:** kraft board; cover object top-right, headline anchored to the bottom; statement card top-right, figure patch (on deep paper) bottom-right; callout above the chart; sheets stacked and offset; plane top-left with the CTA bottom-anchored.

## 6. Signature device

**Copy on torn strips.** Every display line is a separate paper slip cut to its exact length, slightly rotated, with a torn top and bottom edge and a fibre core. The emphasised phrase is a second, accent-coloured patch laid on top. Numbers get the same treatment: the figure is printed on an accent patch, bars are torn paper columns standing on a deep baseline strip.

## 7. Slide grammar

- **cover:** pinked accent tab (kicker), headline on strips, one motif built from paper (chosen from the copy or `motif`), dek on the board, compliance + swipe cue with a cut arrow.
- **point:** with a figure, the figure on an accent (a) or deep (b) patch, statement and note on a pasted card. Without a figure, the statement itself goes on strips (84 px).
- **number:** title on strips; columns from zero on a deep baseline, value above each in Young Serif, label below; highlighted column in accent; callout value on a card; assumptions in fine print.
- **compare:** two pasted sheets, card and accent; label, value (fit to the sheet), note.
- **steps / recap:** slips stepping down and to the right, each with a punched accent dot (numbered for steps, plain for recap).
- **myth:** myth on strips struck through in accent; "Fact" label and the fact in Young Serif on the board.
- **quote:** a torn accent opening quote mark, the quote on strips, attribution in Rethink.
- **stat:** tab, figure on a patch, headline on strips, facts as torn tags in a 2-column grid, a motif top-right.
- **cta:** headline on strips, sub, compliance block, one action object (plane = send, bookmark = save, bubble = comment).

## 8. Formats

- **Feed 4:5:** as above.
- **Story 9:16:** all copy in y 270–1248; the cover object moves into the lower band (y 1262 on), still inside the 3:4 grid crop; the CTA object likewise. Strip sizes drop to 80 px.
- **Square:** same layout compressed; cover object 280 px, kept clear of the cue.

## 9. Best for / avoid for

Best for money stories and case studies, family money (gifts, co-signing), first-time buyers, renewal explainers that need warmth, seasonal posts. Group 2 (Kitchen Table): warm, human, hand-made. Avoid for rate-day urgency and dense data tables (use a Group 1 style), and for anything that must look official (documents belong to Group 4's Paper Trail).

## 10. Do / don't

- Do keep one saturated paper per slide and let the board breathe.
- Do let a strip or sheet overlap an object: paper layering is the medium.
- Do choose the motif from the topic (house + coins for home equity, envelope for letters, calendar for dates).
- Don't add stickers, tape clip art, hand-drawn doodles or emoji.
- Don't put copy on deep or accent paper unless it uses the matching ink (card / on-accent).
- Don't stack more than five strips in a headline; rewrite the copy instead.
- Don't use the fibre or board texture as decoration on its own: it must stay nearly invisible.

## 11. Pitfalls & QA notes

- **Speckle kills contrast.** Strong fibre noise on card paper makes the pixel-contrast QA fail (dark specks behind red callouts). Keep fibre alpha ≤ 0.15.
- **Class collisions.** Stage classes are `ct-<type>`; never reuse `ct-myth`, `ct-quote` etc. as a class on inner elements (they were renamed `ct-mythline`, `ct-quoteline`).
- **Fit to width needs a full-width parent.** A right-aligned figure must stay a full-width block with `text-align: right`, or fit.js measures the figure's own width and it collapses.
- **Accent patches must cover the whole text box** (1.41 em for Young Serif), otherwise the white on-accent text is measured against card paper. Line-height 1.36 keeps patches off the neighbouring lines.
- **Art behind copy.** Cover objects must not sit under the dek or the cue; check the square and story covers after any art-box change.
- Renders take ~2 s a slide (SVG filters); that is expected.

## 12. Demo

- Try it on the example client: `node render.mjs specs/library/dec9-variable.json --client northline-mortgages --style cutout` (add `--variant b`, or `--format story --only 1` / `--format square --only 1` for covers). Output: `out/dec9-variable--cutout[--<format>]/northline-mortgages/`.
- Code: `engines/stills/library/cutout/` (`style.mjs`, `style.css`, `page.js`, `style.json`).

## Round 2 (thumb-stop) changes, 2026-11-16
- Boards are now saturated construction paper: mustard `#E8A33D` (variant a) and sky `#86B9DC` (variant b, `palette.ground2`), replacing grey and kraft.
- Copy still sits on card strips and patches, so contrast is unchanged. Red accent strips and charcoal objects now carry the thumbnail.
