---
name: stills
description: Studio Stills. Make Instagram still images for Canadian mortgage-broker (and similar financial) clients, rendered entirely in code (HTML/CSS/SVG/canvas/three.js through headless Chromium, never an image generator). Covers static posts, carousels, reel and story covers, thumbnails, quote cards, tip and deadline cards, rate-day cards and infographics. Picks one of eleven house styles per client (Swiss Data Poster, Terminal Card, Bento Ledger, Editorial Cover, Marker Markup, Paper Cut-out, Riso Two-Ink, Poster Type, Iso Blocks, Paper Trail, Front Page), writes the spec, renders 4:5, 9:16 or 1:1, and runs the QA gate. Use when someone asks for a static, carousel, cover, thumbnail, quote card or infographic for a broker client, or wants to add or change a still style.
---

# Studio Stills

A library of code-rendered still styles for broker accounts: the still-image partner of Studio Films (`engines/films/`) and Studio Motion (`engines/motion/`). Every word, number and licence line is live type; every chart is computed; every image is code (or the client's own photo). The tooling lives in `engines/stills/` (paths below are relative to the repo root; run render commands from `engines/stills/`). The rules of the house are in `playbook/PLAYBOOK.md` at the project root: the "Statics and carousels", "Carousels", "Copy that reads as AI (banned)" and "Compliance and trust" sections apply to every still.

| You need | Read |
|---|---|
| Which styles exist, who uses which | `engines/stills/STYLES.md` |
| One style's rules (point of view, type, colour, grid, signature, do/don't) | `engines/stills/library/<slug>/STYLE.md` |
| The QA gate and the human pass | `engines/stills/QA.md` |
| Building or changing a style, the render contract, markup conventions | `engines/stills/AUTHORING.md` |
| Install, folder layout, footer bands | `engines/stills/README.md` |

## 1. Take the brief

- Pin down **client**, **idea**, **format** and **deadline**.
  - The client is an id with a token file in `engines/stills/tokens/clients/<id>.json` and an entry in `engines/stills/library/roster.json` (example: `northline-mortgages`, the fictional Northline Mortgages, Sam Rivera, Toronto).
  - The idea comes from the brief, a script file or a research note.
  - The format is a carousel (feed 1080×1350), a single static, a story or reel cover (1080×1920), or a square (1080×1080).
- **Never invent client facts.** That covers brokerage name, licence numbers, approved titles, APR, brand colours, photos and client quotes. Missing ones stay visible placeholders and are listed as TODO at delivery.
- **Rate-based posts expire.** Note the date the rate premise expires (`reviewBy`).

## 2. Pick the style

1. Look the client up in `engines/stills/library/roster.json`. Use their **primary** style, or their **secondary** if the primary ran on this account last time. Never post the same style twice in a row on one account.
2. Check the fit in `STYLES.md` ("Best for"). If the idea fights the style (a rate-day number in Paper Trail, a long checklist in Poster Type), use the client's other style. Cross-group borrowing is only for proofs (`--anyGroup`). Before posting a borrowed style, check that no same-city client owns it.
3. Read that style's `STYLE.md` before writing copy: it says what each slide type looks like and what to avoid.

## 3. Write the spec

Create `engines/stills/specs/library/<id>.json`; copy `dec9-variable.json` or `heloc-paul.json` as a model. Required fields:
- `"engine": "library"`, `id`, `title`, `group`, `series`, `date`.
- `reviewBy` for rate premises.
- `sources`, one per fact (an unverified fact doesn't go on a slide).
- `slides`, using the vocabulary in `AUTHORING.md`: cover, point, number, compare, steps, recap, myth, quote, stat, cta.

Copy rules:
- **Slide 1** is the hook and stops the scroll alone. **Slide 2** is a second hook. The **second-to-last** slide is the save-worthy recap; the **last** asks for exactly one action (send, save, or a comment keyword that delivers something real).
- Keep to about 25 words per idea slide and ≤ about 40 per slide. Plain words, no PLAYBOOK-banned phrases, no "best/lowest rate", no guarantees.
- **Numbers live in `calc`**, never typed in: `payment-compare`, `payment`, `heloc`, `lump-sum`, `down-payment`, `fhsa-room`, `days`, `facts`. Copy uses `{tokens}`: `{deltaCents}`, `{yearlyAbout}`, `{pay1}`… When two rounded figures and their difference share a slide, use `{delta}` (difference of the rounded figures) or show cents. Every number slide has an `assumptions` line covering balance, rate and source date, amortization, compounding and term, plus APR for Ontario. A HELOC is usually interest-only: +0.25% ≈ $21 a month per $100K.
- **Per-client copy** goes in `byClient.<client-id>` (different hook, local angle, CTA). Instagram demotes accounts that post the same thing; each client's version uses at least two facts from their profile (city, community, language, niche). Use `byStyle` for style-specific art hooks: `photo`, `object` (a phone notification), `doc`, `figure`.

## 4. Render

```bash
cd engines/stills
node render.mjs specs/library/<id>.json --client <client-id>                 # roster style, feed
node render.mjs specs/library/<id>.json --client <client-id> --format story --only 1   # reel/story cover
node render.mjs specs/library/<id>.json --client <client-id> --format square
node render.mjs specs/library/<id>.json --client <client-id> --style <slug> --variant b  # override
node render.mjs specs/library/<id>.json --client <client-id> --strict        # refuses while compliance is empty
```

Output goes to `out/<id>--<style>[--<format>]/<client>/`:
- `NN.jpg` (sRGB, q92, 4:4:4, from 2× masters via sharp): upload these;
- `png/NN@2x.png`;
- `contact.jpg`;
- `manifest.json` (QA, maths audit, sources);
- `html/NN.html` (open it to debug).

The console prints each slide's word count, minimum contrast and any FAIL/WARN/TODO.

## 5. QA, then look

1. Fix every **FAIL** the render prints. Usual causes: copy too long for the layout (shorten the copy, don't shrink the type below the floor), text in the story UI zones, contrast on a busy area.
2. Run the gate: `node tools/qa-gate.mjs > out/qa-gate.txt` (`--out <dir>` if you rendered elsewhere) (add `--strict` for anything going to the posting queue). It rechecks the maths in Python, glyph coverage, the roster rules and near-duplicates against every render under `out/`. Details are in `QA.md`.
3. Do the human pass in `QA.md`. `Read` the contact sheet and every slide at full size, and check slide 1 at thumbnail size and as the 3:4 grid crop. Fix and re-render (`--only 2,5`).
4. Proof sheet for many posts: `node tools/library-overview.mjs` → `out/library-overview.jpg`.

## 6. Deliver

Hand over, per client:
- the folder path and the JPEGs in order;
- the caption from the spec, with the search phrase on line 1 and the compliance line in the first lines;
- the gate result;
- the TODO list (compliance fields, APR, client photo, keyword deliverable).

Nothing is posted, scheduled or written to the dashboard by this skill. Anything with an empty compliance field is a proof, not a post: Ontario requires the brokerage's authorized name and licence number on every ad (O. Reg. 188/08 s.6).

## Footer band (optional)

Some accounts put a branded footer image (logo, contact line, licence) under every feed slide. Render with a reserve so the style lays out in the full height above it, then composite:

```bash
cd engines/stills
node render.mjs specs/library/<id>.json --client <id> --style <slug> --reserve <footer px at 1080 wide> --out /path/r
python bin/footer_overlay.py /path/r <footer.png> /path/final --reserve <px>
```

`footer_overlay.py` refuses if the footer is taller than the reserve or anything but paper sits in the reserved band (full-bleed styles such as `swiss` fill it; use a paper-ground style like `broadsheet`, `magazine` or `bento`, or the fallback `bin/footer_compose.py` with `--format square`). `--css <file>` appends job CSS to every slide. Never retype contact details from a footer image. Covers (`story`) get no footer.

## Hard rules

- **No AI images and no stock.** Imagery is code-drawn, three.js, charts from verified data, procedural texture, or the client's own photo in `engines/stills/assets/clients/<id>/` (registered in `tokens/clients/<id>.json` → `photos`). Until a photo arrives, the style shows a code-drawn object or a giant figure, and QA flags any photo placeholder as TODO.
- **Documents and phones stay generic.** "Your lender", masked numbers, a visible ILLUSTRATIVE mark, no real bank names, logos or sign-in screens.
- **Same idea, different clients:** different copy (`byClient`) and, in the same style, a different variant. The near-dup gate fails twins.
- **Fonts:** OFL fonts in `engines/stills/fonts/` only. Check glyph coverage before French posts; the gate catches gaps, and Nanum Pen Script has no accents.
- **Shared engine changes** (`lib/`, `assets/`) affect every style. Re-render the proofs (`./build-library.sh`) and re-run the gate after any change.

## Visual brief (read before designing)
Read `engines/stills/docs/research/visual_brief_for_stills.md`, and the rules with their tests in `engines/stills/docs/research/references_2026-11-16.md`, before writing a spec. In short:
- A cover is one object plus 6 words or fewer.
- The hero number fills at least 70% of the safe width on covers and at least 55% on number slides.
- Maximum 2 typefaces and 3 sizes per slide.
- One accent colour, on 15% of pixels or less.
- Never a blue background by default.
- Small furniture (kicker, labels, compliance line) takes 8% of the slide or less and is never the highest-contrast element.
- Carousels alternate statement and evidence slides.
- Slide 1 crosses the right edge.
