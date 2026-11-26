# Terminal Card — Still Style

> A generic market-terminal panel, frozen at the moment the number changes: warm near-black ground, one monospace used wide and narrow, a command-line headline, dated data, and zero-based charts with a crosshair readout. For rate calls, odds, prime and bond moves, anything where "as of" matters.
> References (grammar only): trading-desk terminals (dense dated rows, function-key discipline, reverse-video alerts; never their trade dress, colours or tickers); Unix shells (prompt, cursor, diff, comments); Edward Tufte's sparklines and data-ink ratio (every pixel is data or structure). Copy no product's layout, typeface or logo.

## 1. Essence, and what it is not

- **A screen that tells the time.** Every slide carries a path line (`~/rate-desk/<series>`) and `as of <date>`; numbers feel logged, not shouted.
- **One monospace, two widths.** Figures in the widest cut, labels in the narrowest; nothing else.
- **Amber is data, warm white is copy, the client colour is the one alert,** printed as reverse video (a filled block with knocked-out text).
- **Charts are honest instruments:** bars from $0, a dashed crosshair at the value that matters, a readout tag on it.

Not a hacker/Matrix cliché (no green rain, no glitch, no CRT glow, no scanlines, no fake window chrome or traffic-light dots). Not a dark SaaS dashboard (no cards, no gradients, no rounded panels). Not a real terminal brand: no orange-on-black function bars, no real tickers, no exchange or lender names.

## 2. Materials & rendering

- Ground: flat warm near-black with a faint character-cell dot grid (SVG pattern, 24 × 36 px cells, rule colour at ~55%). No noise, no vignette.
- Rules: 2 px solid for structure (under the path line, above the status bar), 2 px dotted for rows. No boxes with shadows.
- The block cursor is a CSS rectangle in amber, inline after the headline's last word. The prompt `>` hangs in the left margin.
- Charts are SVG built in Node from `ctx.calc.chart` (exact geometry, live `<text>` labels). The readout tag is HTML positioned on the crosshair.
- Story covers: a ghost of the hero figure, outlined in the dim rule colour, fills the band below y 1248 (decorative, `aria-hidden`, sized so the whole figure fits and never crops into a different number).

## 3. Colour logic

- Five roles: ground (`paper`, warm near-black), `panel` (slightly lifted, for compare panels and the diff's added line), `ink` (warm white copy), `amber` (data figures, kicker, prompt, cursor, highlighted bar), client `accent` (alert only).
- The accent appears **at most twice per slide**: as the reverse-video readout or panel header (raw accent + `on-accent` text), and as the change segment of a bar or the hike line (`accent-ink`, lightened for the dark ground so it holds 3:1 as a graphic).
- `ink-soft` for notes, ticks and fine print (≥ 6:1 on the ground). The dim rule colour is never used for text.
- Example palette (the default): ground `#15130F`, panel `#1D1A15`, ink `#EFE8D9`, ink-soft `#ABA290`, rule `#3D372E`, amber `#F4B53F`.

## 4. Type

- **Martian Mono** (OFL), variable width 75–112.5, weight 100–800.
  - Figures: wdth 112.5, weight 800, tracking −0.06em, set with `data-fit="width"` (cap 230 px feed, 170 story/square).
  - Headline: wdth ~84, weight 700, 86 px feed / 66 px story-square, tracking −0.035em, line-height 1.07.
  - Statements 58–64 px, list rows 44 px, notes 28 px, labels 20–26 px at wdth 75–82, fine print 19 px.
- Monospace word spaces are a full cell: word-spacing −0.2em on display and body sizes, −0.42em inside figures with spaces ("2 in 3"). Ligatures off.
- Sentence case everywhere. The only "code" decoration: `>` prompt, `#` before a section label, `note` before a note, `−`/`+` in a diff. Never more.
- The font has no check marks or box glyphs: ticks and boxes are drawn in CSS.

## 5. Grid & composition

- One column on the safe box; the path line at the top, the status bar (compliance left, folio right) at the bottom, both ruled.
- One focal element per slide: the readout figure, the crosshair tag, or the statement. Nothing competes with it in amber.
- **Variant a:** headline → readout → fork chart (cover); horizontal meter with a vertical crosshair (number); side-by-side panels (compare); figure top, statement bottom (point); prompt title then list (recap); CTA centred.
- **Variant b:** readout first, headline under it, chart at the foot (cover); zero-based columns with a horizontal crosshair (number); stacked order-book rows (compare); statement top, figure bottom (point); list first, closing prompt below it (recap); CTA low with its sub-line above. Variants re-compose; they never mirror.

## 6. Signature device

**The crosshair readout.** On the cover of a payment comparison, a *fork chart*: the change in the monthly payment, zero-based, flat at +$0 until the decision date, then forking into *hold* (amber, stays on $0) and *hike* (accent, steps up by the exact delta). On number slides, a meter (bars or columns from $0) with a dashed crosshair at the highlighted value and a reverse-video tag carrying the callout and its sub-line. Rows after the highlight are drawn as dashed outlines (a projection, not a fact); a highlighted row shorter than the base shows the saved span as a dashed accent outline.

## 7. Slide grammar

- **cover:** path line, kicker (amber), prompt headline with cursor, readout (figure + label), fork chart when the calc is a payment comparison, dek, status bar with "swipe →".
- **point:** `# eyebrow`, figure (wide amber), statement, `note` line.
- **number:** `# label`, title (no prompt), meter with crosshair tag (callout + calloutSub), assumptions as fine print.
- **compare:** two panels; the right panel's header is the reverse-video alert; values in wide figures.
- **steps / recap:** prompt title, dotted log rows; steps numbered `01…`, recap with drawn check boxes.
- **myth:** a diff: the claim on a `−` line struck in accent, the fact on a `+` line on the panel colour.
- **quote:** a prompt quote, attribution in amber. Real quotes need written consent.
- **stat:** prompt headline, readout, a fact table with the emphasised row in reverse video.
- **cta:** a large prompt headline with cursor, sub-line, compliance block.

## 8. Formats

- **Feed:** as above; fork chart 952 × 350 (470 in variant b), meter 952 × 660.
- **Story:** text inside y 270–1248; headline 66 px; charts shrink (fork 270, meter 470 tall); the band below 1248 carries the outlined ghost figure so the 3:4 profile-grid crop isn't half empty.
- **Square:** same sizes as story; charts 250/450 tall. Three-row meters keep ≥ 44 px between a label and the bar above it.

## 9. Best for / avoid for

- Best: Bank of Canada days, hike-or-hold explainers, odds and dated market pricing, bond-yield and prime moves, HELOC and variable payment changes, anything with "as of".
- Good for Group 1 (Ledger) clients who want precision: see `library/roster.json`.
- Avoid: warm human stories, family money, first-time-buyer reassurance (use Bento, or a Group 2 style), and any post without a number or a date.

## 10. Do / don't

- Do date every slide (`as of`), and source odds and rates in the note line.
- Do keep amber for data and the accent for the single alert.
- Do let bars start at $0 even when the difference is a sliver: the sliver is the story.
- Don't add glow, scanlines, flicker, glitch, matrix rain, window dots, function-key bars or tickers.
- Don't put copy on the dim rule colour or inside the cell grid's contrast range.
- Don't set more than one prompt per slide (titles on number and compare slides have none).

## 11. Pitfalls & QA notes

- Monospace display type looks gappy: keep the negative word-spacing rules.
- Value labels inside bars only for filled rows before the highlight; outlined (projected) rows get their label outside, or it vanishes (QA contrast 1.0).
- Dark accents (oxblood, navy) disappear as lines on the ground: lines and markers use `accent-ink`; fills use the raw accent with `on-accent` text.
- The engine fails a spec headline containing `{keyword}` before the style sees it: write the keyword into the copy.
- Martian Mono lacks ✓ □ ▸ █: draw them.

## 12. Demo

- Try it on the example client: `node render.mjs specs/library/dec9-variable.json --client northline-mortgages --style terminal` (add `--variant b`, or `--format story --only 1` / `--format square --only 1` for covers). Output: `out/dec9-variable--terminal[--<format>]/northline-mortgages/`.
- Engine: `engines/stills/library/terminal/style.mjs` (`forkChart`, `meter`, `niceStep`), `style.css`, `style.json`.

