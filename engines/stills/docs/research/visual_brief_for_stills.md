# Visual brief for the stills library (2026-11-16)

This brief is for `.claude/skills/stills/` and `engines/stills/`. It adds scroll-stopping rules on top of playbook/PLAYBOOK.md and each `STYLE.md`; it doesn't replace them. The rule numbers match the 24-rule brief in `references_2026-11-16.md`, and reference ids (such as `ws-3numbers`) point to entries there. Reference designs are for grammar only: never copy a layout, illustration or wording.

## What to fix first

I measured `engines/stills/out/library-overview.jpg` against the board.

1. **Covers are too wordy.** Most slide 1s carry 12–20 words: headline, number, sub-line and furniture. Target: one object + 6 words or fewer (rule 2).
2. **Hero numbers are about 45–60% of the width** (Editorial Cover $7,800, Swiss +$80, Iso Blocks headline). Target: ≥ 55% on every number slide, ≥ 70% of the safe width on covers (rule 1).
3. **Objects are scarce and small.** Only Paper Cut-out (the house), Iso Blocks and Paper Trail have one. Every style needs a hero object or the number as object (rules 15–16).
4. **Furniture competes.** The label row, kicker, page counter, and red compliance tag sit on every slide at similar weight. Furniture combined should take ≤ 8% of the area and never be the highest-contrast element (rule 19).
5. **The blue default.** Swiss, Marker Markup, Paper Trail and Paper Cut-out all render on navy or mid-blue in the overview, which is the category default (the Dribbble anti-board). Give each of these a non-blue field option and make it the default unless the client's brand is blue (rule 7).
6. **Nothing crosses the slide edge.** Add one seamless join per carousel (rule 13) and an edge-crossing swipe cue on slide 1 (rule 12).

## House rules for every style

| Rule | Test |
|---|---|
| Hero ≥ 55% of width on number slides; ≥ 70% of the safe width on covers | bbox ÷ canvas width in the QA gate |
| Slide 1: headline ≤ 6 words, kicker ≤ 4, no sub-line; object ≥ 30% of area | word count + object bbox (`data-role="hero-object"`) |
| ≤ 2 typefaces, ≤ 3 sizes per slide with ≥ 1.6× steps | computed styles |
| One accent region per slide, ≤ 15% of pixels | hue histogram |
| ≤ 4 colours per post including ink and paper | palette clustering |
| ≥ 60% of each slide is one flat field; no gradients > 2 stops, no glow, no glass | modal-colour share + CSS lint |
| Slide-1 headline ≥ 88 px, hero ≥ 220 px (survives the 270 px profile grid) | downscale check |
| Chart titles are conclusions with a digit; one accent series; direct labels; source line | chart spec lint |
| Alternate statement and evidence slides; never 3 identical layouts in a row | layout sequence |
| One seamless join per carousel; an edge-crossing element on slide 1 | boundary-column diff on a 2-slide strip |
| One emphasis device per headline | markup count |
| Furniture ≤ 8% of area, compliance line ≥ 20 px and 4.5:1 | DOM area + existing contrast gate |
| Tabular lining figures; currency sign 55–65% of numeral size | `tnum` + format lint |
| One local, specific detail per post | reviewer |

## Per style: rules and three references each

### Swiss Data Poster (`swiss`)
- Make the data geometry the hero: a bar or area sized from the number that runs edge to edge and crosses into slide 2 (the walking black bar can become the seamless join).
- Accent only on the one bar or figure; everything else in ink at 20–40%. Keep the visible grid, but it must be data, not decoration (a plain "Swiss template" is now a commodity).
- Offer a paper field (#F5F4F0 family) as the default instead of royal blue.
- References:
  1. `economist-ig`: one chart, one message, red only on the key series.
  2. `visualize-value`: one geometric idea per slide, one font.
  3. `ws-4charts`: CHART n kicker and conclusion-titles on white evidence slides.

### Terminal Card (`terminal`)
- Amber or phosphor on black, with green/red strictly for up/down. The cover hero is one huge monospaced figure (≥ 70% safe width) with a blinking-cursor caret as the only ornament.
- Use a dated table row as the "proof object". Scanlines at 3%, never under small text.
- References:
  1. `bloomberg-terminal`: amber base colour as the hallmark.
  2. `ramp-brand`: monochrome plus one signal colour.
  3. `ronmortgageguy`: an opinion stated as odds ("80%") makes a natural terminal hero.

### Bento Ledger (`bento`)
- Use it only when there are 6–9 parallel facts. One hero tile ≥ 45% of the slide holds the number at full tile width; other tiles hold one figure each.
- Tiles get flat fields from the 4-colour set, not white cards with shadows. One tile may bleed off the right edge as the swipe cue.
- References:
  1. `apple-bento`: one idea per tile, numbers legible at thumbnail.
  2. `ws-realtor`: ✓/✗ pill rows as a tile system.
  3. `bento-dirtybarn`: hero tile plus stat tiles.

### Editorial Cover (`magazine`)
- The cover is one object or client photo filling ≥ 50% of the area, the masthead word and one cover line of ≤ 6 words. Cover lines move to slide 2.
- Emphasis comes from an italic swap in the serif. Money figures are set huge in Bodoni with the currency sign raised.
- Use a paper or Fire/coral field rather than white.
- References:
  1. `mwk-social`: serif with italic swaps, highlighter behind one phrase, photo crops inline.
  2. `bbw-covers`: one visual gag per cover, type as image.
  3. `mercury-instrument`: still-life object treated like a luxury product.

### Marker Markup (`annotated`)
- Show the real thing (a client photo, a renewal letter, a rate screenshot recreated in code) at ≥ 60% of the slide. Add at most 3 marks: one circle, one arrow, one margin note.
- Strokes come from seeded points through perfect-freehand (gap tool), so they taper like felt tip. Keep the existing pad rule around circled words.
- Strike-and-replace is the signature move: the old figure is struck in marker and the new figure written beside it.
- References:
  1. `mwk-social`: strikethrough "CHOICE → Equality" and highlighter.
  2. `canva-imperfect`: hand marks on precise content signal a human hand.
  3. `pc-jolicoeur`: the face and a real dollar figure as the hook.

### Paper Cut-out (`cutout`)
- Torn strips and layered card with real contact shadows. One paper object (house, door, key, envelope) at ≥ 35% of the area, cropped by an edge.
- Use a warm field (Cashmere, Latte, grass green) instead of the current sky blue as the default.
- Grain is a paper texture at 3–5%; edges get a 3–6 px white "sticker" lip where pieces overlap.
- References:
  1. `vox-collage`: sticker edges, halftone cut-outs, one hot accent.
  2. `ws-realtor`: a single object (the door with a bow) on a saturated field.
  3. `pg-paper`: real paper layering and shadow depth.

### Riso Two-Ink (`riso`)
- Two inks, with the overprint making the third colour. The hero number is printed in ink A over a halftone shape in ink B, misregistered 2–3 px.
- Fluorescent pink + blue, or yellow + teal, on cream stock. No third ink, and no black unless it is one of the two.
- Halftone the object, not a background overlay. Dot size encodes the data where possible.
- References:
  1. `pin-riso-zine`: overprint pairs and drift.
  2. `riso-windowseat`: procedural plates and halftone in code.
  3. `spotify-wrapped-2025`: monochrome base, colour only on the reveal.

### Poster Type (`bold-type`)
- Already strong. Add **number as object** once per carousel: extrude the hero numeral (opentype.js outline → three.js, installed) standing on a ground plane, cropped by the frame.
- Fields flip per slide (keep this). The last slide returns to the first field.
- References:
  1. `ws-3numbers`: giant 3D numerals as the slide.
  2. `kinetic-kalok`: one face, B/W, loop logic for the motion version.
  3. `joeyemond`: question + number + one-word answer as a cover.

### Iso Blocks (`isometric`)
- Volumes sized from the numbers, with the same camera on consecutive slides so the swipe is the comparison. Highlight one volume in the accent; the rest is pale clay.
- Use path-traced stills (three-gpu-pathtracer, gap tool) for soft global illumination and real contact shadows. This is the single biggest quality jump for a still 3D style.
- References:
  1. `ws-floorplans`: one highlighted volume, same block, two slides.
  2. `viscap-housing`: 3D bar map of income needed per metro.
  3. `ws-buck-3d`: matte, soft-lit 3D objects as metaphors.

### Paper Trail (`paper-trail`)
- The document is the hero at ≥ 60% of the slide and cropped off one edge, with one red-pencil mark and the ILLUSTRATIVE stamp.
- Set it on an FT-paper or kraft field instead of navy.
- Add a receipt variant (thermal paper, mono, dotted rules, a TOTAL line) for cost breakdowns: closing costs, CMHC premium, penalty maths.
- References:
  1. `receiptify`: a familiar document format reused for new data.
  2. `ft-paper`: a tinted paper ground reads as finance.
  3. `vox-collage`: documents as paper objects with shadows.

### Front Page (`broadsheet`)
- One headline across the full measure (≤ 8 words, ≥ 120 px). The chart is the photo, with a caption.
- A cream or FT-paper field, a nameplate and a dateline. Columns are evidence slides only; covers carry no columns.
- References:
  1. `semafor`: cream floor and one serif family.
  2. `ft-paper`: claret/oxford accents on paper.
  3. `carousel-trends-2026`: the newspaper-style carousel trend.

### Transit Map (`mapcard`)
- 45/90-degree routes and white stops with ink rings. The data sits at the stops (price, rate or commute).
- Draw real regions from Statistics Canada boundary files (Open Government Licence) with d3-geo (installed) + topojson-client (gap), simplified to a diagram. Label it "schematic, not to scale".
- One route can continue across the slide seam.
- References:
  1. `vignelli-subway`: dot-to-dot diagram logic.
  2. `viscap-housing`: a metro-by-metro income map.
  3. `tinder-swipe-type`: local vernacular type references place.

## Never (from the board's anti-references)

- House-roof logos or icons as the hero; stock couples; handshake/keys stock.
- Navy-and-gold luxury templates; purple/teal gradients; aurora glow; glass cards; glossy 3D blobs.
- Centred heading with three icons; "5 tips" text walls.

The anti-boards are `dribbble-mortgage-anti`, `virallized-30` and `mortgage-alliance`.
