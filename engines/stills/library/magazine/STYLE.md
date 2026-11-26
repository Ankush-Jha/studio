# Editorial Cover — Still Style

> A carousel set as one issue of a consumer magazine: slide 1 is the cover (a saturated field, a didone masthead, cover lines that point to the pages inside, one hero), the slides after it are editorial spreads, and the last slide is the back cover. It turns a money story into something people save the way they keep a magazine.
> References (grammar only): mid-century American news-magazine covers (one hero, cover lines in a column, a dateline bar under the title); fashion-magazine mastheads in high-contrast didones (title set to the full measure, hairlines kept only at the largest size); Sunday-supplement features (standfirst with a drop cap, a single footnoted chart, folio and running head). Copy none of their titles, logos, layouts or typefaces.

## 1. Essence, and what it is not

- **The masthead is the post's series name** (`spec.series`), set in Bodoni Moda to the full measure. Never a real magazine's name, never the broker's name as a logo.
- **A dateline bar**: month and year from `spec.date` and "<client city> edition". No invented issue numbers, prices or barcodes.
- **Cover lines with page numbers** that map to real slides ("p.3 His minimum, month by month"), read from the spec's other slides.
- **One hero** per cover: the client photo slot, or a typographic figure. Never both, never a stock or generated image.
- **Inside, spreads not covers**: bright paper, running head and folio, a standfirst, one big figure or one chart per page.

Not a newspaper front page (`broadsheet` owns nameplates, columns and newsprint), not a Swiss poster (no visible grid, no geometry-as-data), not the warm-cream-serif-terracotta AI default: the paper is cool and bright and the colour lives in the accent field.

## 2. Materials & rendering

- Offset-printed cover stock: a flat accent field (`.mg-field`) with a 6% multiply grain (`--grain-img`). No gradients, no gloss, no drop shadows on type.
- Inside: `paper` (cool bright white) with the same grain.
- The photo sits in a 10 px white frame on the cover (variant a) or runs full width (variant b). On the story format it leaves the text column and bleeds below the safe box.
- Rules are thin (1.5 px) and few: the dateline bar (3 px over, 1.5 px under), the running head, the footer, one column rule on compare slides, hairlines between list items.

## 3. Colour logic

- Two grounds: **the client accent** (cover, stat card, back cover) and **paper** (spreads). Text on the field is `on-accent` (the better of ink or white; for some accents, ink).
- Inside, the accent is reserved for: the section rule, the big figure, the highlighted bar, the right-hand value on compare, list numerals, the pull figure. Everything else is ink or `ink-soft`.
- Fine print never sits on the field: the compliance line on the cover rides on a paper label.
- Example (a saffron client accent, `#D9480F`): field saffron, masthead and copy in ink, paper `#F4F5F2`.

## 4. Type

- **Bodoni Moda** (OFL, optical sizes 6–96, weights 400–900): masthead (opsz 96, wght 640), headlines (opsz 56, wght 600), standfirsts (opsz 40, wght 500), big figures (opsz 28, wght 640, proportional lining figures), cover lines and captions (opsz 22). Only the masthead keeps the extreme hairline; everything a phone must read uses a sturdier optical size.
- **Schibsted Grotesk** (OFL, 400–900): dateline, kickers, notes, row labels, chart values (data reads in the grotesk), body, compliance.
- Sizes (feed): masthead fitted to the measure (max 190 px), cover headline 94 px (4 lines max, fit floor 64), headline inside 62 px, standfirst 56–74 px, figures fitted to width (max 360 px), notes 31 px, fine 19 px.
- Didone metrics: Bodoni Moda's line box is 1.525 em (ascent 1.125, descent 0.4). Big figures use `line-height: normal` with negative margins so the QA box stays inside the safe area.
- Short words are bound to the next word (`bind()`), and hyphenated compounds never break at the hyphen. A leading + or − on a figure is set in the grotesk (a didone plus sign is a hairline).

## 5. Grid & composition

- One column with a 5/7 split on the cover (cover lines | photo). Margins are the safe box.
- **Variant a**: full accent cover, framed photo right, cover lines left, headline across the bottom. Point slides set the text at the top and the figure at the foot, so the page holds tension top to bottom.
- **Variant b**: an accent band holds only the masthead and dateline; the photo runs full width under it; kicker, headline and a row of three cover lines sit on paper. Point slides put the figure first and the text at the foot; numbers lead with the pull figure, then the chart; compare stacks the two options.

## 6. Signature device

**Cover lines that are a table of contents.** The cover tells you what is on p.3, p.4, p.5, and the folio on each spread confirms it. That turns a carousel into an issue and gives a reason to swipe. The back cover repeats the field and closes the issue with the single action.

## 7. Slide grammar

- **cover**: masthead, dateline, kicker + up to three cover lines, hero, headline (the cover story), dek, "Turn the page" cue, compliance label.
- **point**: running head, section kicker with an accent rule, figure (if any), standfirst (drop cap when there is no figure), note.
- **number**: section kicker, headline, editorial bar chart from zero (one row per value, the highlight row in the accent, values in Schibsted), pull figure with its caption, † footnote with the assumptions.
- **compare**: two columns divided by one column rule; values fitted to the column; italic caption.
- **steps / recap**: Bodoni italic numerals (arabic for steps, roman for a recap) with hairlines between items.
- **myth**: myth in Bodoni italic struck in the accent, fact as a standfirst at the foot.
- **quote**: accent opening quote, Bodoni italic, attribution. Real quotes need written consent.
- **stat**: a single-post cover: masthead, headline, facts as cover lines in a 2-column grid, compliance block on a paper label.
- **cta**: the back cover: field, small masthead line, headline anchored low, the action line, compliance block on a paper label.

## 8. Formats

- **feed 1080×1350**: everything above.
- **story 1080×1920**: masthead at y 270; cover lines become a row; the photo bleeds from y 1296 to the bottom edge (it still shows in the 3:4 grid crop), so all words stay in y 270–1248.
- **square 1080×1080**: two cover lines, masthead max 140 px, headline 70 px, three lines max.

## 9. Best for / avoid for

- Best: money stories and case studies (named illustrative composites), seasonal "issues" (renewal season, year-end), multi-slide explainers where the cover lines sell the inside. Group 2 (Kitchen Table): warm, human accounts.
- Avoid: one-number punches (use `bold-type`), rate-day news (use `broadsheet` or `terminal`), dense comparisons of amounts (use `isometric` or `swiss`).

## 10. Do / don't

- Do keep the masthead short (one to three words); the series name is the brand of the issue.
- Do let one hero carry the cover; give the photo a frame or a full-width band, never a cut-out.
- Do keep page numbers true: cover lines are generated from the slides, so reorder slides and they follow.
- Don't put fine print on the field; don't set chart values in Bodoni at small sizes (a didone 4 and 1 vanish at thumbnail size); don't add a fake barcode, price or issue number.
- Don't repeat the cover inside: spreads are paper, quiet and one idea each.

## 11. Pitfalls & QA notes

- **Hairlines vanish at 260 px wide.** Only the masthead uses opsz 96; figures use opsz 28. Check the cover at contact-sheet size.
- **Didone line boxes are tall.** A figure with tight leading reports a box far beyond its glyphs; keep `line-height: normal` on big Bodoni spans and pull the empty room back with negative margins.
- **Cover lines come from the spec file** (`specs/library/<id>.json` or `specs/<id>.json`, labels of 3–7 words with no `{tokens}`). A spec stored elsewhere renders a cover without them.
- **Placeholder words count**: until the client photo arrives, the placeholder's brief adds about 11 words, so a full cover can warn `too-many-words`.
- **Black or white on the field** is chosen for contrast (`on-accent`). Saffron and other mid-luminance accents get ink, and small text on the field must stay ≥ 24 px.

## 12. Demo

- Try it on the example client: `node render.mjs specs/library/dec9-variable.json --client northline-mortgages --style magazine` (add `--variant b`, or `--format story --only 1` / `--format square --only 1` for covers). Output: `out/dec9-variable--magazine[--<format>]/northline-mortgages/`.
- Engine: `engines/stills/library/magazine/` (`style.mjs`, `style.css`, `style.json`).

## Round 2 (thumb-stop) changes, 2026-11-16
- Until a client photo exists, the cover hero is a giant Bodoni figure. Set `byStyle.magazine: { photo: null, figure: "$7,800" }` in the spec. It sits on the accent field next to the cover lines (variant a), or full measure in the accent colour under the masthead band (variant b). Don't ship the grey placeholder cover.
