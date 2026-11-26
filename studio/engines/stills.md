# Engine: stills (code-rendered statics, carousels, covers)

The agency's eleven-style still library in `$R/engines/stills/` (skill: `$R/.claude/skills/stills/SKILL.md`). Every word, number and licence line is live type; every chart is computed by `lib/calc.mjs`; rendered in headless Chromium at 2× and finished to sRGB JPEG.

`$R/engines/` is read-only for Studio (the guard hook blocks writes). The renderer reads client tokens, the roster and client photos **only from its own folder** (`tokens/clients/<id>.json`, `library/roster.json`, `assets/clients/<id>/`; there is no CLI flag or environment variable to point it elsewhere). So every job renders from a **private shadow copy** of the stills code inside the job (`$P/engines/stills`), with the client's tokens written there from the kit. No stills code is modified.

```sh
R=$(git rev-parse --show-toplevel)
J=$R/jobs/<id>; P=$J/project; O=$J/out
SLUG=<client slug>
ST=$P/engines/stills            # the shadow copy (made in Run step 1)
SRC=$R/engines/stills           # read-only original
export STATICS_PYTHON=$R/engines/stills/.venv/bin/python    # Pillow, numpy, fontTools (JPEG fallback, gate)
# sharp + playwright-core: the shadow's node_modules is a symlink to $R/engines/stills/node_modules (no env var needed)
```

Read before writing copy: `$R/.claude/skills/stills/SKILL.md`, `$SRC/STYLES.md`, `$SRC/QA.md`, `$SRC/AUTHORING.md` (slide vocabulary, calc kinds, markup), the chosen `$SRC/library/<slug>/STYLE.md`, and `$SRC/docs/research/visual_brief_for_stills.md`.

## Best for

- Feed carousels (8–10 slides) and single statics for broker clients: payment maths, rate-day numbers, deadlines, myths, checklists, local-market news pegs.
- Reel/story covers (1080×1920) that match a client's still style.
- Fast, repeatable, QA-gated output (one render ≈ 5–11 s) with computed numbers and an independent maths re-check.
- Not for: one-off hero designs that no library style fits (use `custom-html.md`), anything animated (`motion.md`, `hyperframes.md`).

## Formats and sizes

| `--format` | Size | Safe box (all text) | Use |
|---|---|---|---|
| `feed` (default) | 1080×1350 (4:5) | x 64–1016, y 56–1294 | carousel / static with no footer image |
| `square` | 1080×1080 | x 64–1016, y 64–1016 | **Studio default for footer clients**: square + footer band = 1080×1350 (Run step 5) |
| `story` | 1080×1920 | x 65–1015, y 270–1248; cover headline also in y 240–1680 | reel cover, story |

Output JPEGs: sRGB, q92, 4:4:4, from 2× PNG masters.

## Inputs it needs

- The idea and copy (concept + `script.json`), with every fact sourced; numbers as `calc` inputs, never typed.
- Kit: `$R/kits/$SLUG/kit.json` (agent, brokerage, `complianceLine`, `assets.footer`, `assets.photo`, `stills.primary/secondary/variant`, `rules`, `aliases`), `tokens.json` (`color.accent`).
- The spec, written by the director at `$P/spec.json` (style-agnostic JSON, `"engine": "library"`; models: `$SRC/specs/library/heloc-paul.json`, `dec9-variable.json`).

## Setup check (exact command)

```sh
cd "$R/engines/stills" && node --version \
 && test -f node_modules/playwright-core/index.js && test -d node_modules/sharp \
 && ls ~/Library/Caches/ms-playwright | grep -q chromium_headless_shell \
 && .venv/bin/python -c "import PIL, numpy, fontTools; print('stills ready')"
```

The renderer finds playwright-core and sharp in its own `node_modules` (in the shadow: the symlink `shadow.sh` makes). If the check fails, install (fresh clone): `sh $R/setup.sh --no-engines` (runs `npm ci` + `npm run setup` in `engines/stills` and builds `engines/stills/.venv` from `requirements.txt`), or by hand: `cd $R/engines/stills && npm ci && npm run setup && uv venv .venv && uv pip install --python .venv/bin/python -r requirements.txt`.

## Run (exact commands)

### 1. Shadow copy and client tokens

```sh
sh $R/studio/engines/bin/shadow.sh "$P"
CID=$($R/studio/.venv/bin/python $R/studio/engines/bin/kit_tokens.py $R/kits/$SLUG "$ST"); echo "client id: $CID"
```

- `shadow.sh` copies stills (≈ 14 MB, no `out/`, `node_modules` or `.venv`) and motion into `$P/engines/{stills,motion}`; each copy's `node_modules` is a symlink to the engine's own (read-only). Re-running refreshes code and keeps the tokens you wrote.
- `kit_tokens.py` writes `$ST/tokens/clients/<CID>.json`: compliance `agentName`, `title`, `brokerage`, `licence` (leading `#` stripped, the renderer prints `LIC. #…`) **only from kit.json**, accent from `kits/<slug>/tokens.json`, and the kit photo as slot `portrait` only if its short side is ≥ 600 px. `CID` is the existing token id among the slug and its aliases (e.g. a kit `northline-mortgages` with alias `northline` resolves to whichever of `northline-mortgages.json` / `northline.json` exists in `$ST/tokens/clients/`), so the roster's primary/secondary style still resolves. Empty kit fields stay empty: renders show the red placeholder and `--strict` refuses.
- Verified 19 Nov 2026 with a test kit for `northline-mortgages`: the shadow render printed `[BROKERAGE NAME] · LIC. #[LICENCE]` and passed `--strict`. Sam Rivera's kit photo is 176×195 px, so it was correctly not registered. Re-verified 26 Nov 2026 on the new layout with the example kit `$R/examples/kits/northline-mortgages` (`CID` = `northline-mortgages`).

### 2. Write the spec

`$P/spec.json` (any location works: fonts and assets resolve from the renderer's own folder, verified by rendering `heloc-paul.json` and `dec9-variable.json` from a job folder; models in `$SRC/specs/library/`). Required: `engine: "library"`, `id` (`[a-z0-9-]`), `title`, `group` (kit group), `series`, `date`, `reviewBy` for rate premises, `sources` (one per fact), `slides`, `caption`. Per-client copy in `byClient.<CID>` (≥ 2 profile facts per client). A client photo goes in with `"photo": "portrait"` on the slide (only styles `magazine`, `annotated` and `cover` slots use photos).

### 3. Render

```sh
cd "$ST" && node render.mjs "$P/spec.json" --client $CID --style <slug> --format square --strict
cd "$ST" && node render.mjs "$P/spec.json" --client $CID --style <slug> --format story --only 1 --strict   # reel/story cover
```

- Render **without** `--out`, so files land in the shadow's own `out/<id>--<style>[--<format>]/<CID>/`, where the gate can read them. (`--out` works too, verified, but the gate only scans `$ST/out`.)
- Without `--style`, the roster primary is used (secondary with `--slot secondary`). Same-group rule: a warning `Style … is not in group N's roster` means you borrowed a style; check same-city clients before using it.
- Fix every `FAIL` the console prints (shorten copy; never shrink type below the floor). Re-render single slides with `--only 2,5`.
- Clients with no footer rule and no footer asset: use `--format feed` and skip step 5.

### 4. Gate (QA + near-duplicates against the agency's history)

```sh
[ -d "$SRC/out" ] && rsync -a --include '*/' --include '[0-9][0-9].jpg' --exclude '*' "$SRC/out/" "$ST/out/_agency/"    # past renders for the near-dup check (empty on a fresh clone)
cd "$ST" && node tools/qa-gate.mjs --strict --json "$J/qa/stills-gate.json" > "$J/qa/stills-gate.txt"; echo "gate exit $?"
cd "$ST" && "$STATICS_PYTHON" tools/neardup.py "$ST/out" --json "$J/qa/neardup.json"
$R/studio/.venv/bin/python -c "import json; d=json.load(open('$J/qa/neardup.json')); bad=[f for f in d['fails'] if not (f['a'].startswith('_agency/') and f['b'].startswith('_agency/'))]; print(len(bad),'near-dup fails involving this job'); [print(' ',f['a'],'~',f['b'],f['dhash'],f['phash']) for f in bad]"
```

- The gate can exit 1 because the renders already in `$SRC/out` contain near-duplicate pairs among themselves (40 pairs on 19 Nov 2026; on a fresh clone `$SRC/out` is empty or holds only example proofs, so Studio's own near-dup check against `$R/library/` in the QA gate covers the agency's history). Judge only pairs that involve this job's folders (the fourth command). Glyph coverage and maths re-check need `STATICS_PYTHON` set (otherwise they are skipped with a warning).
- Then the human pass from `QA.md`: Read `contact.jpg` and every `NN.jpg` at full size; slide 1 at 260 px wide and as the 3:4 grid crop.

### 5. Footer band (statics carry the client's 1080-px footer at the bottom)

**Default (since 19 Nov 2026, proven on the Sam Rivera renewal carousel): render the feed at full height with a footer reserve.** `render.mjs` has `--reserve <px>` (and `--css <file>`) built in (`$SRC/README.md`, "Footer bands"), so no patch is needed. The style then lays out in the whole height above the footer, so there is no dead band.

```sh
FOOT="$R/$(python3 -c "import json;print(json.load(open('$R/kits/$SLUG/kit.json'))['assets']['footer'])")"
H=$($R/studio/.venv/bin/python -c "from PIL import Image;i=Image.open('$FOOT');print(round(i.height*1080/i.width))")
cd "$ST" && node render.mjs "$J/project/spec.json" --client $CID --style <slug> --variant <a|b> --format feed --reserve $H --strict --out "$ST/out/<id>--<slug>--r$H/$CID"
$R/studio/.venv/bin/python $R/studio/engines/bin/footer_overlay.py "$ST/out/<id>--<slug>--r$H/$CID" "$FOOT" "$O/carousel" --reserve $H
```

`footer_overlay.py` refuses if the footer is taller than the reserve or if any slide content sits inside the reserved band. A footer taller than about 300 px at 1080 wide crowds the slide: ask for a slimmer footer or use the `footerAlt` asset.

**Fallback (old method, leaves a gap; use only if the reserve render fails):**

```sh
$R/studio/.venv/bin/python $R/studio/engines/bin/footer_compose.py "$ST/out/<id>--<slug>--square/$CID" "$R/$(python3 -c "import json;print(json.load(open('$R/kits/$SLUG/kit.json'))['assets']['footer'])")" "$O/carousel"
```

Each 1080×1080 slide goes on top, the footer (scaled to 1080 wide, alpha kept) flush to the bottom of a 1080×1350 canvas, the gap filled with the slide's bottom-edge colour. It refuses footers taller than 270 px at 1080 wide. Verified 19 Nov 2026: 7 slides of `heloc-paul` in `broadsheet` for Sam Rivera → 1080×1350 with his 1080×195 footer, no overlap. Re-verified 26 Nov 2026 (reserve and fallback) from a job shadow with the example kit's 1080×148 footer.

Covers (`story`) get **no** footer (the grid crops to 3:4 and the bottom is under the UI).

### 6. Collect

```sh
mkdir -p "$O/carousel" && cp "$ST/out/<id>--<slug>--story/$CID/01.jpg" "$O/cover.jpg" && cp "$ST/out/<id>--<slug>--r$H/$CID/contact.jpg" "$J/qa/contact.jpg"
```

(With the fallback footer method, the contact sheet is `"$ST/out/<id>--<slug>--square/$CID/contact.jpg"`.)

Without the footer step, copy `"$ST/out/<id>--<slug>/$CID/"[0-9][0-9].jpg` to `$O/carousel/`.

## Branding

- **Compliance**: the renderer puts the licence slot on every slide (line = `BROKERAGE · LIC. #…`; block on `cta`/`stat` = agent name, title + brokerage line), read from the shadow token written from `kit.json`. The token schema has **no agent-licence field**, so the agent licence (e.g. `Lic. [LICENCE #]`) appears only through the footer image and the caption. The full `complianceLine` goes verbatim into caption lines 1–2.
- **Footer**: `kit.json.assets.footer` under every feed slide (step 5) unless a kit rule says otherwise. Footers can carry contact details that disagree with the sheet (Sam Rivera's footer shows a different phone number from `clients.json`): never retype contact details from a footer; flag the conflict in the kit's `flags` for the user.
- **Logo**: not placed by the renderer (it never prints the broker's name as a logo). Logos arrive via the footer image.
- **Photo**: `ctx.photo('portrait')` only when registered by `kit_tokens.py` (≥ 600 px); otherwise the style shows its code-drawn object and QA flags a TODO.
- **Accent**: the kit accent replaces the style accent unless the style pins it (riso). Derived colours keep contrast.

## Outputs to collect

| File | kind |
|---|---|
| `$O/carousel/01.jpg … NN.jpg` (1080×1350, with footer) | carousel |
| `$O/static.jpg` (single post: the one slide) | image |
| `$O/cover.jpg` (1080×1920 story render, slide 1) | cover |
| `$O/caption.md` (spec `caption`, search phrase on line 1, compliance line in lines 1–2, ≤ 5 hashtags) | caption |
| `$J/qa/stills-gate.txt`, `$J/qa/neardup.json`, `$J/qa/contact.jpg` | contact / qa |

Card fields: `engine: "stills"`, `style: <slug>`, `size: "1080x1350"`.

## Time and usage

- Render: 5–11 s per format per client (7-slide carousel: 11.2 s feed, 5.9 s square; cover 1.8 s).
- Shadow copy: ≈ 1 s, 15 MB; history copy for near-dup: ≈ 56 MB, neardup ≈ 5 s.
- Copy writing and the human pass dominate: about 30–60 min per carousel.
- No paid services.

## Built-in QA vs what Studio's gate adds

Built in (`QA.md`): per-slide safe box, minimum sizes (28/28/20/18 px), WCAG contrast on real pixels, overlap/overflow/fit, compliance slot, photo placeholder TODO, word count, AI-look lint, copy lint (PLAYBOOK banned phrases), page errors; the gate adds independent maths recomputation, glyph coverage, palette, roster same-city clash, near-duplicates (incl. 3:4 crop, mirrored and inverted), `reviewBy` expiry, `--strict` compliance.

Studio adds: the footer band present and unobstructed, the caption (line 1 search phrase, compliance line, ≤ 5 hashtags), PLAYBOOK carousel shape (slide 1 hook, slide 2 second hook, recap second-to-last, one CTA last), originality against the client's own history (variety), critic rubric.

## Pitfalls

- Running `render.mjs` in `$R/engines/stills` without `--out` writes into `$R/engines/stills/out` (engines are read-only for Studio). Always `cd "$ST"` (the shadow).
- Square layouts are tighter: the `broadsheet` number slide failed `overlap` in square on the first try (verified). Shorten copy; if a slide cannot pass in square, render that slide in `feed` without the footer and list it for Gate 2.
- `--format` or `--style` forces library mode; legacy specs (no `engine: "library"`) go through the old families, don't use them.
- French: check glyph coverage (Nanum Pen Script has no accents); the gate catches it only with `STATICS_PYTHON` set.
- Ontario rate/payment slides need term and APR in `assumptions` (O. Reg. 191/08 s.18); an APR placeholder stays visible until the brokerage supplies it.
- Token id vs kit slug: always pass `--client $CID` from `kit_tokens.py`, not the kit slug.
- Leftover `{token}` in copy stops the render: the calc did not produce it.

## Picking a style against the client's history

1. Start from `kit.json.stills` (`primary`, `secondary`, `variant`; mirrors `library/roster.json`). Use the primary unless the primary ran on this account last time: then the secondary ("never the same style twice in a row on one account").
2. Check `history.json` and run `$R/studio/.venv/bin/python $R/studio/tools/variety.py --client $SLUG --engine stills` (prints JSON: conflicts with the client's history and up to 15 unused style suggestions; `--list-styles` lists the style folders in `$SRC/library/`).
3. Check fit in `STYLES.md` "Best for" (e.g. Swiss = payment maths; Paper Trail = documents; Poster Type = hooks/myths; Front Page = news pegs). If the idea fights both of the client's styles, borrow within the group only with `--anyGroup` and check same-city clients, or move the job to `custom-html.md`.
4. Same idea for several clients in one style: different `variant` (a/b) and different `byClient` copy; the near-dup gate fails twins.
