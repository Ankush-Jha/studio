# Front Page — Still Style

> A carousel set as one newspaper: slide 1 is the front page, the inner slides are its sections, and every slide jumps to the next ("Continued on slide 3"). News pegs (a rate decision, a budget, a deadline) get the weight of a splash headline, while the honesty lines (an "Illustrative edition" ear, "Chart: computed, illustrative") keep it from posing as real news.
> References (grammar only): mid-century North American broadsheets (nameplate, ears, dateline rule, wood-type splash headlines, jump lines); tabloid "wood" covers (one headline filling the page); newspaper infographics of the 1980s (halftone-filled bars, a ruled source line). Never copy a real nameplate, masthead layout or a paper's typeface.

## 1. Essence, and what it is not

- **A fictional paper named after the series.** The nameplate is the post's `series` in blackletter, prefixed "The" (`The Down Payment File`, `The Dec 9 Countdown`). Never a real paper's name, never "Star", "Sun", "Globe", "Gazette", "Free Press", "Times" plus a real city.
- **Dateline bar:** weekday and date from the spec, the client's city and province in press style (`London, Ont.`, `Montreal, Que.`), and the slide count. Ears say "Illustrative edition" and "No. 01 of 08 · Free".
- **Wood-type headlines** in Libre Franklin 800 that grow to fill the page (`page.js`), Newsreader decks and standfirsts, column rules, a heavy rule over the imprint.
- **The chart is the photo.** Where a paper runs a news photograph, this style runs the post's chart (halftone-filled bars from $0, the highlighted bar in the spot colour), a big figure box, or a reproduced statement line, always captioned "Graphic: illustrative".

Not a website with a "broadsheet look" (hairlines and dense columns of filler): there is no filler text, every word on the page is the post's copy. Not the Swiss poster (no grid ticks, no geometry), not Paper Trail (no desk, no objects, no pencil).

## 2. Materials & rendering

- **Newsprint:** `--color-paper` #ECE8DD, 11 % multiply grain, a slow feTurbulence mottle at 7 %, all procedural. No gradients (the QA rejects them); the story format's fold is a 2 px line plus a flat 3.5 % tint over the folded half.
- **Halftone:** an SVG `<pattern>` of 2.1 px dots on a 7 px grid at 45°, used only inside chart bars. Text never sits on halftone.
- **Rules carry the structure:** 6 px double rule under the nameplate and page heads, 2 px rule under the dateline and headline, 1 px column rules, 4 px rule over the imprint.
- **Growth:** `library/broadsheet/page.js` sizes every `[data-grow]` element (front-page headline, inner wood headlines, the in-brief list, the notice headline) to the largest whole-pixel size that fits its flex box within `data-max-lines`. fit.js then only confirms.
- **No hand marks:** `==` and `((…))` become plain type (`data-mark="bs-em"`), `~~strike~~` stays a typographic strike in the spot colour. A newspaper doesn't scribble on its own headlines.

## 3. Colour logic

- Black ink on newsprint does all the work. The client accent is the **spot colour**: the kicker, the section flags, the highlighted bar, big figures, the jump triangle, the notice label.
- Only one spot colour per paper. No tints of it except the solid bar.
- Grey tint panels (#DCD7C9) behind figure boxes and clippings, with a 1 px ink border, like a screened box.
- Example (a green client accent, #2E6B30): paper #ECE8DD, ink #161513, spot #2E6B30.

## 4. Type

- **UnifrakturMaguntia**: nameplate only (front page 88–104 px, fitted to its column; page heads 38 px). Never for content.
- **Libre Franklin**: headlines 800 (front page grows 66–168 px; wood pages up to 156 px; inner titles 56–72 px), figures 900, labels and flags 600–700 (20–25 px), dateline 600 caps with 0.06 em tracking (the only caps in the style).
- **Newsreader** (optical sizes on): standfirsts italic 38–46 px, decks italic 36–38 px, list text 30–54 px, captions italic 20 px, source lines 19 px. Drop cap (Franklin 800) only when the lead is longer than 22 words.

## 5. Grid & composition

- Front page: masthead (ears + nameplate), dateline, kicker (skipped when it repeats the series), headline, then a 7 : 5 grid (art | standfirst + jump line) above the imprint.
- Inner pages: page head (small nameplate, date, slide number) and a single strong element per page.
- **Variant a:** classic centred nameplate between two ears; headline-led front page; flags above wood headlines.
- **Variant b (re-composed):** left-set nameplate with one ear; photo-led front page (art on top, headline below, standfirst under it); inner wood headlines hang on a spot-colour bar with the flag moved below; graphic pages stack the callout over the chart; point/counterpoint becomes stacked rows; the notice loses its double frame for a spot-colour top rule.

## 6. Signature device

**The jump line.** Every slide but the last ends "Continued on slide N ▸", in Franklin italic with a spot-colour triangle: the newspaper's own swipe cue. With the dateline's "Slide 3 of 8" it turns the carousel into one edition.

## 7. Slide grammar

- **cover:** front page. Art priority: `figure` → big figure box; `calc` chart → chart; `doc` → reproduced statement line with the hit row in bold on a spot-colour bar.
- **point:** wood page: section flag (the eyebrow), optional big figure in the spot colour, a headline that grows to fill, the note as an italic deck anchored above the footer.
- **number:** graphic page: title, halftone bar chart from zero, callout column, "Source and assumptions." line.
- **compare:** point/counterpoint: two columns with reversed labels (ink, then spot colour), big figures, notes.
- **steps / recap:** "In brief" box with a reversed label; items spread evenly down the box.
- **myth:** "Correction" box: "You may have heard:" + struck myth, then the fact in Franklin.
- **quote:** pull quote between a 6 px and a 1 px rule.
- **stat:** front page with a "By the numbers" column of facts.
- **cta:** "Notice to readers" in a double-ruled box; the compliance block as the paper's imprint ("Published by").

## 8. Formats

- **feed:** as above.
- **story:** ears drop, nameplate spans the column; front page fits above the fold; below y 1248 the page folds (line + tint) and faint column rules continue, so the 3:4 crop shows a newspaper, not empty space.
- **square:** same as story without the fold.

## 9. Best for / avoid for

Best for: news pegs and policy changes (Bank of Canada days, budgets, rule changes), deadlines, myth corrections, "what changed and what didn't". Group 4 (Dossier). Roster: see `library/roster.json` (a Quebec client needs French copy before posting).
Avoid for: soft lifestyle posts, client stories that need a face, anything without a real news angle (it then reads as pretend news).

## 10. Do / don't

Do: date every edition; keep "Illustrative edition" in the ear; credit every graphic; let one headline own each page.
Don't: invent quotes, bylines, reporters or "sources say"; use a real paper's name or nameplate; fill columns with dummy text; put text on halftone; add hand marks; use more than one spot colour.

## 11. Pitfalls & QA notes

- Chart labels must carry `data-role="label"` (22 px) or the size check fails them as body text.
- `data-fit="width"` measures the parent's width: put fitted figures in an unpadded inner wrapper or they overflow their boxes.
- Long series names shrink the nameplate; check it stays ≥ 60 px on the front page.
- The story fold and ghost columns must stay solid colour (a `linear-gradient` column rule tripped the AI-look gate once).
- A spec line like "about {yearly} a year" next to a cents callout can disagree by a few dollars ({yearly} comes from the rounded delta): check the arithmetic on the graphic page.

## 12. Demo

- Try it on the example client: `node render.mjs specs/library/dec9-variable.json --client northline-mortgages --style broadsheet` (add `--variant b`, or `--format story --only 1` / `--format square --only 1` for covers). Output: `out/dec9-variable--broadsheet[--<format>]/northline-mortgages/`.

## Round 2 (thumb-stop) and near-dup changes, 2026-11-16
- Variant b sets wood-type statements, the "In brief" box and the "Notice to readers" as reverse-type blocks (paper on ink), so two clients on one post never share a page shape.
- The closing notice also has two treatments picked by a hash of the client id: the boxed notice, or the notice set big in the client colour behind a 26 px accent rule. Two accounts in the same variant therefore never close alike.
