# Marker Markup — Still Style

> The broker's own photo (a renewal letter on their table, their street, their desk) marked up the way a person explains something across a kitchen table: one felt-tip, a circle, an arrow, a hand-drawn timeline, two or three words of handwriting on tape. Facts stay in confident set type; the handwriting only says where to look.
> References (grammar only): an editor's markup on a contact sheet (circles and arrows that cross the image edge); a teacher explaining on a printout with one pen; transit and timeline sketches on napkins (a line, ticks, labels). Copy no one's handwriting, layouts or marks.

## 1. Essence, and what it is not

- **One real photo dominates the cover** (`ctx.photo`), or the client's own document. Until it is supplied, a designed placeholder states what to shoot, and QA flags it TODO.
- **One felt-tip colour per client** (`mark-ink`, derived from the accent at ≥ 3:1). Every circle, arrow, tick and timeline uses it.
- **Marks cross boundaries**: from a note on tape on the photo to a tick on the timeline; from a margin note up to a figure.
- **Handwriting is short**: a pointer of 2–8 words ("you can start here"). Numbers, dates, rules and disclaimers are always set type.
- **Inner slides drop the photo** and mark up big set type instead.

Not a whiteboard explainer (no stick figures, no hand-lettered headlines), not a scrapbook (no stickers, washi patterns or doodles), not the paper-trail style (that one renders the document itself; this one marks up a photo of the client's world).

## 2. Materials & rendering

- Paper: a neutral bright white with a 5% multiply grain.
- Marks: `assets/hand.js` marker pen (variable-width filled outlines, seeded per client), drawn after layout from `draws` and inline marks (`((circle))`, `~~strike~~`, `==underline==`, list boxes and ticks).
- Tape: opaque off-white strips (`--color-tape`) with a 1 px edge, rotated ±1.5°. Every note or label that sits on a photo rides on tape, so contrast never depends on the photo.
- The cover timeline: a hand-drawn line with ticks at proportional positions (`annotations` with `day-N` targets map onto a countdown to the due date), tick labels in set type on tape, notes above with arrows down to their ticks.

## 3. Colour logic

- Three colours: paper, ink, and the client's felt-tip. The felt-tip also colours handwriting (`accent-ink`, ≥ 4.5:1) and, inside, the highlighted bar and the right-hand value on compare.
- No fills behind type except tape. No second marker colour.
- Example (a navy client accent, `#1D4E89`): navy felt-tip and notes, ink type on `#F8F8F6`.

## 4. Type

- **Familjen Grotesk** (OFL, 400–700) for everything set: headlines 86 px (cover, feed), 62–80 px statements, 64 px titles, 50 px list items, 30–34 px notes and deks, 24 px labels, 19 px fine print. Tight tracking (−0.02 to −0.03 em) at display sizes, flush left, ragged right.
- **Nanum Pen Script** (OFL) only for handwritten pointers, 56 px. It covers ASCII and curly quotes only: **no French accents, no en or em dash, no ellipsis, no middle dot.** `note()` falls back to set type (Familjen 600 in the felt-tip colour) for any other character and for every French post (`lang: fr`), so Quebec clients never get missing glyphs.
- Hyphenated compounds never break at the hyphen (word joiners), so "mid-March" and "5-question" stay whole.

## 5. Grid & composition

- One column on the safe box; the photo band is full bleed.
- **Variant a**: photo on top (y 0–770 feed), timeline across its lower third, type below on paper. Point slides: figure first, a margin note at the foot whose arrow runs up the free right-hand margin.
- **Variant b**: type on top, photo band below (y 500–1214 feed), footer on paper. Point slides: text first, figure right-aligned below, note bottom-left; compare stacks the options.
- Two or three marks per slide, each pointing at something. One circle per slide at most.

## 6. Signature device

**The hand-drawn timeline over the photo**: a felt-tip line with ticks placed in proportion (Day 120 … Day 21 … Due date), set-type labels on tape under each tick, handwritten notes above with arrows down. It makes a date rule visible in one glance and works for any countdown (renewal windows, FHSA deadline, rate-hold expiry, closing dates).

## 7. Slide grammar

- **cover**: photo band, optional timeline from `annotations`, kicker, headline (a `((circle))` is drawn loose, with extra leading), dek, swipe cue with a marker arrow, compliance.
- **point**: figure circled (5 characters or fewer) or underlined (longer), statement, handwritten note with an arrow that never crosses copy.
- **number**: bars from zero in ink, the highlight bar in the felt-tip, its value circled, callout underlined, assumptions in fine print.
- **compare**: two options with heavy top rules; the right value circled or underlined; the verdict as a handwritten note.
- **steps**: numbers circled in felt-tip. **recap**: hand-drawn boxes with ticks.
- **myth**: the myth struck once in felt-tip, the fact with a bracket. **quote**: bracket down the left.
- **stat**: headline, facts in a 2-column grid, the key fact underlined.
- **cta**: big headline; for a send action, a felt-tip arrow down toward Instagram's send icon; a keyword gets a loose circle; compliance block bottom right.

## 8. Formats

- **feed**: as above.
- **story**: type in y 270–700 on paper; the photo bleeds from y 736 to the bottom; the timeline sits at y 1076; the footer rides on tape over the photo inside the safe box.
- **square**: photo 0–520 (a) or 470–1080 (b, footer on tape); headline 68 px, three lines max.

## 9. Best for / avoid for

- Best: face-led and community accounts (Group 2, Kitchen Table), "look at this letter" posts, renewal windows, deadlines, documents the client can photograph (renewal statement, gift letter, closing calendar). Strong when the broker supplies their own photo.
- Avoid: dense data (use `swiss` or `terminal`), posts with no photo coming for weeks (the placeholder is honest but quiet), anything that needs more than three notes.

## 10. Do / don't

- Do brief the photo in `photoLabel`: subject, light, "no logos visible", "no faces" where needed.
- Do keep notes to pointers; put the fact in set type next to them.
- Do let one mark per slide carry the focus.
- Don't hand-letter numbers that matter, don't circle long words (an ellipse can't close around them without crossing letters: they get an underline), don't stack a circle, an underline and an arrow on the same word.
- Don't draw marks across copy: arrows route around text blocks.

## 11. Pitfalls & QA notes

- **Marks over glyphs fail contrast.** QA measures text against the real pixels behind it, so a felt-tip loop through letters is a fail. Circles get a pad of 0.42 em, padding and margin around the circled words, and 1.18 leading on the line; check every circle at full size anyway, because a loop can still graze a neighbour.
- **A circle around words that wrap** becomes one huge ellipse: circled phrases are `nowrap`.
- **Photos vary in tone**: anything on a photo sits on tape. Don't remove the tape when the real photo arrives.
- **Placeholder brief text** sits top right (bottom on story) so the timeline stays clear; it disappears once `photos.<slot>` is set in the client token file and the file exists under `assets/clients/<id>/`.
- **Nanum Pen Script lacks French and dash glyphs**: see section 4; don't override `note()`.

## 12. Demo

- Try it on the example client: `node render.mjs specs/library/dec9-variable.json --client northline-mortgages --style annotated` (add `--variant b`, or `--format story --only 1` / `--format square --only 1` for covers). Output: `out/dec9-variable--annotated[--<format>]/northline-mortgages/`.
- Engine: `engines/stills/library/annotated/` (`style.mjs`, `style.css`, `style.json`).

## Round 2 (thumb-stop) changes, 2026-11-16
- **No photo yet + `object` in the spec → phone cover.** The cover hero becomes a code-drawn phone on the full client-accent field. It shows a generic lock screen and one notification ("Your lender", no real bank or app names, a visible ILLUSTRATIVE tag). The broker's felt-tip circles the key number in the notification, and one handwritten note on tape points at it. Spec fields:
  - `object: { kind: "phone", app, title, body }`, where `body` may contain `((circle))`;
  - `annotations[0].text`.
- The headline circle is drawn in the on-accent colour. Once `photos.<slot>` is supplied, the photo layout takes over automatically.
- **CTA:** the full accent field (variant a) or ink field (variant b), headline at 124 px, a thick marker arrow to Instagram's send icon.
