# Engine: custom-html (hand-built premium carousels and statics)

One-off carousels, statics and covers hand-built in HTML/CSS/SVG (three.js if needed) and rendered with Playwright, the way the an earlier client carousels were made . Use it when no stills style fits, or when a hero piece is wanted. Everything is still code: no AI images, no stock, every word live type.

```sh
R=$(git rev-parse --show-toplevel)
J=$R/jobs/<id>; P=$J/project; O=$J/out
SLUG=<client slug>
GR="$R/graphic reels/content-desk"     # read-only: fonts, playwright-core, sharp
```

## Best for

- Premium carousels (7–10 slides) with one signature visual device across the set (an earlier client C1: "the Declined Pile", every slide a physical object from one desk).
- Clients whose brand needs a look no library style has (their own colours, logo lockups, headshot cut-out as a design element).
- Single hero statics, lead-magnet covers, one-off reel covers.
- Not for: fast repeatable posts (use `stills.md`, which has the full QA gate), anything animated (`hyperframes.md`, `motion.md`).

## Formats and sizes

| Format | Size | Text safe box |
|---|---|---|
| Carousel / static | 1080×1350 (4:5) | x 64–1016, y 56–1294; above the footer when a footer is placed; cover words inside x 60–1020 (3:4 grid crop is x 34–1046) |
| Carousel (3:4) | 1080×1440 | only if not boosted/scheduled via API (PLAYBOOK) |
| Reel/story cover | 1080×1920 | x 65–1015, y 270–1248; headline in y 240–1680 |

Rendered at `deviceScaleFactor: 2`, finished to 1080-wide sRGB JPEG q92 4:4:4 with sharp (an earlier client delivered PNG; JPEG is the statics house format).

## Inputs it needs

- Concept, copy and the maths (`script.json`, `math[]`); every number computed in `build.mjs` and re-checked in Python.
- Kit: `kit.json` (`complianceLine`, `assets.footer`, `assets.logos`, `assets.photo`, `rules`), `tokens.json` (colours, fonts), `voice.md`.
- Brand assets only from the kit paths (`$R/assets/<slug>/…`, read-only). Logos are placed as-is (an earlier client rule: never a plate behind a transparent logo; a logo's own box, like DLC's, stays).
- Fonts: OFL files only, from `$GR/statics/fonts/` (Archivo, Bodoni Moda, Bricolage Grotesque, Fraunces, Geist/Geist Mono, IBM Plex, Instrument Sans, Libre Franklin, Martian Mono, Mona Sans, Newsreader, Young Serif…: `ls "$GR/statics/fonts"`). Max 2–3 families per piece.

## Setup check (exact command)

```sh
node --version && test -d "$R/graphic reels/content-desk/tools/node_modules/playwright-core" \
 && test -d "$R/graphic reels/content-desk/toolchain/node_modules/sharp" \
 && ls ~/Library/Caches/ms-playwright | grep -q headless && echo "custom-html ready"
```

Verified 19 Nov 2026 (playwright-core from `content-desk/tools`, sharp 0.35 from `content-desk/toolchain`, as an earlier client C1 loads them).

## Run (exact commands)

1. Start from the tested skeleton:

   ```sh
   mkdir -p "$P" "$O" "$J/qa" && cp $R/studio/engines/bin/custom_html_skeleton.mjs "$P/build.mjs"
   ```

   It loads playwright-core and sharp by absolute path (`createRequire`), reads the kit and `tokens.json` (accent), loads fonts by `file://` from the statics font folder, places `kit.assets.footer` at the bottom of every slide and the verbatim `complianceLine` just above it, checks every text element against the safe box (and the footer top), renders each slide at 2×, writes `$O/carousel/NN.jpg`, `$J/qa/contact.jpg` and the exact HTML to `$P/html/NN.html`.

2. Design: write the concept in `$P/NOTES.md` first (concept in one line, the signature device, slide-by-slide list, fields, type; an earlier client `C1/NOTES.md` is the model). Then write the `CSS` and `slides` in `$P/build.mjs`. Craft rules from the an earlier client brief: strong hierarchy, real depth (layers, soft shadows, procedural grain via SVG `feTurbulence`), one signature device, covers = the person or a striking object + ≤ 10 words, a number or object as hero where it fits; no glassmorphism, purple, emoji icons, centred-everything, clip-art.

3. Render and look:

   ```sh
   cd "$P" && SLUG=$SLUG node build.mjs
   ```

   Read `$J/qa/contact.jpg` and every `$O/carousel/NN.jpg` at full size (text overflow, collisions, anything cut off, a plate behind a logo, weak hierarchy, the cover in the 3:4 crop at 260 px wide). Fix and re-render: **one build, then at most 2 refinement passes** (an earlier client budget rule).

4. Cover (if wanted): add a 1080×1920 page in a second pass (viewport `1080×1920`), no footer, headline in y 240–1680.

5. Re-check every number in Python (`$R/studio/.venv/bin/python`) and list them with their working in `$P/NOTES.md`.

Verified 19 Nov 2026: the skeleton rendered a 1080×1350 slide for a Sam Rivera test kit with his footer and compliance line, no safe-box warnings.

## Branding

- Footer image (`kit.assets.footer`, scaled to 1080 wide) at the bottom of every slide unless a kit rule says otherwise; the compliance line (verbatim `complianceLine`, ≥ 20 px, readable) directly above it. If the client's footer already carries the full licence line, the text line may move to cover + CTA only, matching the an earlier client minimum ("on every slide or at least on the cover and the CTA slide"); say so in NOTES.md.
- Logos from `kit.assets.logos` only where the design needs a mark (CTA slide), never boxed.
- Headshot: the kit photo only if it is large enough (≥ 600 px short side); a background-removed cut-out may be produced from it locally (no AI generation), and only with the client's own photo.
- Placeholders the client must supply (rates, fees, APR) stay visible as obvious tags; never invented.

## Outputs to collect

| File | kind |
|---|---|
| `$O/carousel/01.jpg … NN.jpg` | carousel |
| `$O/cover.jpg` (optional, 1080×1920) | cover |
| `$O/caption.md` (search phrase line 1, compliance line lines 1–2, 3–5 hashtags) | caption |
| `$J/qa/contact.jpg` | contact |

Keep `$P/build.mjs`, `$P/NOTES.md`, `$P/html/`. Card: `engine: "custom-html"`, `style: "<concept-name>"`.

## Time and usage

- Render: about 1 s per slide. Authoring: 1–3 h for a premium 7-slide carousel including two refinement passes (an earlier client ran six parallel carousel agents, one build + ≤ 2 passes each).
- No paid services.

## Built-in QA vs what Studio's gate adds

Built in: only the skeleton's safe-box/footer check and the font-ready wait. There is no contrast, minimum-size, AI-look or near-duplicate check here.

Studio's gate must add (run it on `$O/carousel/`): WCAG contrast on the rendered pixels, minimum sizes (body ≥ 28 px, fine ≥ 18–20 px), ≤ about 40 words per slide, PLAYBOOK banned copy, maths re-check, near-duplicate check against past posts (the statics `neardup.py` can be run on a copy: see `stills.md` step 4), carousel shape (hook, second hook, recap, one CTA), compliance present, critic rubric.

## Pitfalls

- No QA lint comes for free: look at every slide at full size, the template look ("everything the same", the user's complaint about the first an earlier client round) is the main failure.
- Fonts: a missing `@font-face` silently falls back to a system face; the skeleton waits for `document.fonts.ready` but cannot tell a fallback. Use exact file names from `ls "$GR/statics/fonts"`.
- `<br>`-forced lines plus long words can overflow: the safe-box warning prints the box; fix the copy.
- Images load asynchronously: keep the skeleton's image-complete wait if you add images.
- Never write into `graphic reels/clients/…`: the an earlier client folders are reference only.

## Picking a style against the client's history

There is no style catalogue: each piece is its own concept. Use `history.json` and `$R/studio/.venv/bin/python $R/studio/tools/variety.py --client $SLUG --engine custom-html` (UNVERIFIED: tool being built) to avoid repeating this client's last signature devices and field colours; name the concept (e.g. `declined-pile`) and store it as the card's `style` so later jobs can avoid it.
