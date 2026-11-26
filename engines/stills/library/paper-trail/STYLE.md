# Paper Trail — Still Style

> Document realism, kept honest. Every slide is a top-down look at one desk: a rendered document (statement, gift letter, withdrawal slip, bill of sale, worksheet, index card, file folder) stamped ILLUSTRATIVE and marked in the broker's red pencil, with the post's point set large on the desk beside it. It turns "what paperwork do I need?" into something you can see.
> References (grammar only): evidence photography in investigative journalism (one object, flat light, shot from above, a label beside it); bank and government forms of the 1980s–90s (ruled fields, typed entries, perforations); a reporter's or underwriter's desk (paper clip, typed slip, grease pencil). Copy no real form, no bank's layout, no logo, no typeface of a real institution.

## 1. Essence, and what it is not

- **One desk, one document, one mark.** The desk is a flat field of the client's accent taken almost to black; the document lies on it with a slight rotation, a fold crease and a tight, believable contact shadow.
- **The words of the post live on the desk** (Plex Sans Condensed, large, light on dark). The words *of the document* are typed (Courier Prime) or printed (Plex Sans Condensed tables).
- **Red pencil on paper, yellow china marker on the desk.** The red pencil circles the line that matters on a document; any emphasis in the post's own words becomes one yellow underline.
- **Always illustrative.** Every document says "Your lender" or "Your institution", masks numbers (`···· 0000`), and carries a rotated ILLUSTRATIVE stamp (`data-illustrative`, QA-enforced).

Not a skeuomorphic app screen, not a mock-up of a real bank statement, not a flat-lay stock photo (no plants, coffee cups, laptops, hands), not the Dossier legacy family (grid paper, memo tables). It never looks like it could be submitted to a lender.

## 2. Materials & rendering

- **Desk:** a flat colour computed in `style.mjs` (`deskOf`): an sRGB mix of the client accent toward near-black (`#1C1D1F`, from 74 % upward) until desk-ink reaches 11:1. Grain: `var(--grain-img)` at 55 % in `soft-light`. No vignette (that would be a gradient).
- **Paper:** `--color-paper` (#F6F3EB), 7 % multiply grain, a 1 px crease line with a 1 px highlight under it, three stacked box-shadows (contact, short, long; black only, never coloured).
- **Documents are HTML**, sized in px (never scaled with `transform: scale`, which would fool the size check), rotated −4° to +2.4°. Data inside documents is generated and consistent: statement balances are computed row by row in code, so every running balance adds up; story and square formats drop whole rows **before** the balances are computed, never hide them afterwards.
- **Evidence pairs** (`pair()`): the paper that explains the money (gift letter, withdrawal slip, bill of sale) lies on the paper that shows it (transfer receipt, statement). The back document is `aria-hidden` and partly covered; the front one carries the mark and the stamp. `flip` puts the back sheet on the right when the covered column matters (the matching deposit must stay visible).
- **Furniture:** a typed slip held by a code-drawn paper clip (the slide's note), a typed label strip (the eyebrow), a manila folder (CTA), a pencil and folder edge filling the story format's lower zone. All SVG/CSS.
- **Marks:** hand.js `pencil` pen at weight 5.2 (red, `--color-mark`); desk marks are forced to `marker` in `--color-grease`. Circles get `data-mark-pad` 16–22 and horizontal padding on the span so the overshoot never crosses a digit.

## 3. Colour logic

- Desk = client accent near black: navy accent → ink-blue desk, rust → oxblood desk, green → bottle-green desk. This is the main per-client difference.
- Paper, ink and red pencil are fixed. The accent itself appears once on paper: the highlighted bar of a worksheet chart.
- Yellow (`--color-grease`) only for marks on the desk and the CTA keyword. Red only for pencil marks and the stamp.
- Example (a navy client accent, #1C3F94): desk #202536, paper #F6F3EB, ink #1C1B19, pencil #B8322A, grease #F2C94C.

## 4. Type

- **IBM Plex Sans Condensed SemiBold** for the post's words on the desk: cover 92–100 px, points 54–62 px, titles 56–70 px, figures 116–150 px. Regular for desk notes (29 px, `--color-desk-soft`) and compliance (20 px).
- **Courier Prime** for anything typed: labels, slips, letters, form entries, the folio ("File 03 / 08"), the stamp. 23–36 px.
- **Plex Sans Condensed** for printed document text: statement tables 24 px, headers 34 px, footnotes 19–21 px (role `fine`, ≥ 18 px).
- Never all-caps except the stamp. No italics in headlines. No third family.

## 5. Grid & composition

- Stage column: label + folio, the post's words, the art area (flex), footer (compliance + "Turn the page" cue on covers).
- The document always sits **between** the words and the footer, never under the words, so contrast is measured against flat desk or clean paper.
- **Variant a:** words on top, document below and right of centre, slip at bottom-left.
- **Variant b (re-composed):** document on top, words at the bottom; slip at bottom-right; stamp moves to the other corner; recap card above its title; CTA folder above the headline.

## 6. Signature device

**The marked document.** One real-looking but generic document per slide, the line that matters circled in red pencil, a typed slip clipped to it saying what to do. The data on it is the post's own (the $8,000 deposit, the $8,000 bill of sale, a savings balance that climbs to $8,000), so the image proves the copy.

## 7. Slide grammar

- **cover:** label, headline on the desk, the document the story is about (spec `doc: {kind:'statement-line', amount, date, label}` puts the circled line in), the dek as a typed slip, cue.
- **point:** document inferred from the words (`docFor`): gift → letter on a transfer receipt; RRSP/FHSA → withdrawal slip on a statement; sold/car → bill of sale on a statement (flipped); savings → savings statement climbing month by month; "90 days" → three-statement stack; otherwise a typed "Note to file". The note is the clipped slip.
- **number:** a printed worksheet: bars from $0 (or 0 months) in ink, the highlighted row in the client accent, the callout circled, assumptions as the worksheet's footnote.
- **compare:** two notice cards, the right one circled; verdict as a desk note.
- **steps / recap:** an index card typed on its own blue rules, pencil ticks or typed numbers.
- **myth:** a yellow sticky note with the myth struck in pencil; the fact on the desk.
- **quote:** a typed letter excerpt.
- **stat:** a summary document with emphasised facts circled.
- **cta:** the closed file: a manila folder with the licence label (the compliance block) and an ILLUSTRATIVE FILE stamp; headline on the desk.

## 8. Formats

- **feed:** as above.
- **story:** words and documents shrink (cover 78 px), statements lose their optional rows (computed, so they still add up); the lower UI zone continues the desk with a folder edge and a pencil, so the 3:4 grid crop isn't empty.
- **square:** same sizes as story, no extra furniture.

## 9. Best for / avoid for

Best for: documentation (down payment proof, gift letters, HBP/FHSA withdrawals), renewal letters and statements, "what the lender sees", fees and line items. Group 4 (Dossier). Roster: see `library/roster.json`.
Avoid for: rate-day news (use broadsheet), local market (mapcard), anything where there is no document to show; never for a real client's real paperwork.

## 10. Do / don't

Do: compute every figure on a document; keep "Your lender"; let the circle and the slip carry the story; keep one document in focus.
Don't: show a logo, a real bank name, a full account number, a sign-in screen or a signature; put the post's words over document text; use more than two documents; tilt more than 5°; add props that aren't paper.

## 11. Pitfalls & QA notes

- The stamp must stay visible: QA only checks it exists and has width, so look for slips covering it (flip pairs move it to the other corner).
- Marks on an `aria-hidden` back document still draw on top of everything; only mark lines that stay visible.
- Circles around large desk type cross the next line of tight leading and fail pixel contrast: desk emphasis is therefore always an underline.
- Index cards use a hard-stop `repeating-linear-gradient` for ruled lines, marked `data-allow="gradient"` (ruled paper, not a gradient fill).
- Slip text in story/square must stay ≥ 28 px.
- Watch "cropped text": back documents may be covered, front documents never.

## 12. Demo

- Try it on the example client: `node render.mjs specs/library/dec9-variable.json --client northline-mortgages --style paper-trail` (add `--variant b`, or `--format story --only 1` / `--format square --only 1` for covers). Output: `out/dec9-variable--paper-trail[--<format>]/northline-mortgages/`.

