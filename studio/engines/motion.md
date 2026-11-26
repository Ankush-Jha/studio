# Engine: motion (data-driven short loops)

Template reels in `$R/engines/motion/` (docs: `$R/engines/motion/README.md`, `DECISION.md`; skill: `$R/.claude/skills/motion/SKILL.md`): a data file (one idea, checked maths, per-client copy) + a template + a client produce an Instagram-ready MP4, poster, frame strip and manifest. GSAP timeline in headless Chromium, ffmpeg encode, synthesized SFX. It was paused on 16 Nov 2026 ("reels strictly with Studio Films"); the user has since allowed every installed engine, so it is back in use for short loops and GIFs. Don't extend the original folder.

The renderer writes `.work/`, `.cache/` and (by default) `out/` inside its own folder and reads client tokens, fonts and maths from the sibling stills engine (`../stills/`, or `$STUDIO_STILLS`), so Studio always runs it from the job's **shadow copy** (`bin/shadow.sh` makes `$P/engines/motion` next to `$P/engines/stills`), never from `$R/engines/motion` (read-only).

```sh
R=$(git rev-parse --show-toplevel)
J=$R/jobs/<id>; P=$J/project; O=$J/out
SLUG=<client slug>
M=$P/engines/motion          # shadow motion (renderer)
ST=$P/engines/stills         # shadow stills (tokens, fonts, maths it imports)
export STUDIO_FILMS=$R/engines/films   # only for --engine films: the shadow has no films sibling
```

## Best for

- 6–15 s seamless loops built around one computed number: hook → rise → stack → fix → loop (`pop-hook`), phone notification POV (`phone-pov`), a 3D house/cash stack (`object-3d`), calm editorial kinetic type (`kinetic-hook`).
- The "GIF" format (`--gif`), story loops, trial-reel variants of one idea for several clients (`byClient`).
- Transparent overlays for client footage (`--alpha`, ProRes 4444).
- Not for 30–60 s narrated reels with a story arc (use `films.md`) or carousels (`stills.md`).

## Formats and sizes

| Template | Size | Length | Notes |
|---|---|---|---|
| `pop-hook` | 1080×1920 | 12–15 s loop | Bold Pop, recommended default |
| `phone-pov` | 1080×1920 | 12–15 s loop | generic bank app on a CSS-3D phone (generic only, never a real bank) |
| `object-3d` | 1080×1920 | 12–15 s loop | three.js; ~5 min per final render |
| `kinetic-hook` | 1080×1920 | 6–12 s loop | quiet accounts, uses the `kinetic` block |
| `film-game-show`, `film-pop-art`, `film-thermal` | 1080×1920 | – | Studio Films styles (Rhythm Game Show, Pop Art, Thermal Camera) as data-driven templates (README "Renderer CLI"); UNVERIFIED: not test-rendered by Studio; `film-thermal` has no `timeline.js` |

All at 30 fps; safe zone x 65–1015, y 270–1248; poster headline in the 3:4 band. GIF: 540 px wide, 15 fps by default (`--gif-width`, `--gif-fps`).

## Inputs it needs

- A data file in the job: `$P/motion.json` (model: `$M/data/heloc-paul.json`).
- Kit → shadow tokens (compliance, accent) via `kit_tokens.py`.
- Optional: `--voice` WAV (see `voice-music.md`), `--music` WAV (original score per `voice-music.md`; the README's "Meta Sound Collection" bed is added in-app at posting, not here).

## Setup check (exact command)

```sh
cd "$R/engines/motion" && node --version && test -d node_modules/playwright-core \
 && test -d node_modules/gsap && test -f vendor/three.iife.js && ls ~/Library/Caches/ms-playwright | grep -q chromium_headless_shell-1243 \
 && test -f ../stills/lib/mortgage.mjs && ffmpeg -version | head -1 && echo "motion ready"
```

If it fails on a fresh clone: `sh $R/setup.sh --no-engines` (runs `npm ci` + `npm run setup` in `engines/motion` and `engines/stills`), or `cd $R/engines/motion && npm ci && npm run setup`. playwright-core 1.63 uses `chromium_headless_shell-1243`.

## Run (exact commands)

### 1. Shadow and tokens

```sh
sh $R/studio/engines/bin/shadow.sh "$P"
CID=$($R/studio/.venv/bin/python $R/studio/engines/bin/kit_tokens.py $R/kits/$SLUG "$ST"); echo "client id: $CID"
```

### 2. Author the data file `$P/motion.json`

Copy the shape of `heloc-paul.json`:

- `id`, `title`, `asOf` (rate date), `group`, `series` (the label row, e.g. `"HELOC · London"`: **per client**; the model file says "Toronto"), `tag`, `sources[]` (one per fact).
- `calc`: `{"kind": "heloc-interest-only" | "amortizing-compare", "inputs": {…}}`; all figures come from it.
- `expect[]`: every claim from `script.json.math[]` as `{key, shown, claim}`; a mismatch stops the render (that is the point).
- `assumptions` with `{tokens}` (`{spread}`, `{rateNow}`, `{primeNow}`, `{apr}`); `apr: null` renders a red APR placeholder and blocks `--strict`.
- Template blocks: `story` (`pop-hook`, `phone-pov`, `object-3d`: `hook`, `beats[]` rise/stack/fix) and/or `kinetic` (`cards[]`).
- `byClient.<CID>`: per-client `series`, `calc`, `expect`, `assumptions`, `story`/`kinetic` (PLAYBOOK originality: different opening line, numbers and stamp per client; never only the city swapped).

### 3. Draft, then final

```sh
cd "$M" && node render.mjs templates/pop-hook --data "$P/motion.json" --client $CID --quality draft --out "$P/drafts/pop-hook.mp4"
cd "$M" && node render.mjs templates/pop-hook --data "$P/motion.json" --client $CID --strict --out "$O/<name>-master.mp4" [--gif] [--loops 2] [--voice "$P/voice/vo.wav"] [--music "$P/out/score.wav"] [--alpha]
sh $R/studio/engines/bin/deliver.sh "$O/<name>-master.mp4" "$O/<name>.mp4"
```

Flags (from `render.mjs`):

| Flag | Effect |
|---|---|
| `--strict` | refuse to export while compliance fields, the APR or QA issues are open (exit 2). Use for every final |
| `--quality draft` | 1 sample/frame (default `final` = 4-sample motion blur); `--mb N` overrides |
| `--gif` | also `<out>.gif`, loops forever (`--gif-width 540`, `--gif-fps 15`) |
| `--loops N` | repeat the loop N times in the MP4 |
| `--voice f.wav` | voice-over; SFX and music sit under it |
| `--music f.wav` | music bed, ducked under the voice |
| `--audio f.wav` | a finished pre-mix replaces the SFX bus |
| `--silent` | no SFX |
| `--alpha` | also `<out>.alpha.mov` (ProRes 4444, transparent) to overlay on client footage |
| `--guides` | draw the safe zone (review renders only) |
| `--workers N`, `--scale N`, `--group N`, `--keep`, `--no-strip`, `--engine films` | capture workers, supersample, family override, keep `.work`, skip strip, capture with Studio Films tools (`$R/engines/films/core/render`; needs `STUDIO_FILMS` from the shadow) |

`deliver.sh` is required: verified 19 Nov 2026, the motion MP4 measured −14.4 LUFS but a true peak of **+2.1 dBTP** (its SFX bus), which fails the PLAYBOOK; `deliver.sh` brought it to −14.0 LUFS / −1.5 dBTP with AAC 128k, video copied.

### Test render (19 Nov 2026)

`pop-hook` + `heloc-paul.json` for `northline-mortgages` (test kit), draft + `--gif`, from the shadow copy: 448 frames, 5 workers, **27.9 s** total; H.264 High yuv420p BT.709 tv 30/1, 14.93 s, 0 QA issues, seam check done; outputs `.mp4`, `.gif` (2.3 MB), `.poster.jpg`, `.strip.jpg`, `_frames/`, `.manifest.json`. The compliance line came from the shadow token (`SAM RIVERA, LICENSED MORTGAGE BROKER · [BROKERAGE NAME] · LIC. #[LICENCE]`). Warnings it printed: "stack scene: paid row is close to the foot", "read: fix: chip 0.33 s/word". Nothing was written inside the engine folder. Re-verified 26 Nov 2026 on the new layout: `kinetic-hook` draft from `$P/engines/motion` with the example token, 370 frames in 21.4 s, 0 QA issues, seam identical.

## Branding

- Every template draws a label row, the compliance line (from the shadow token: agent name, title, brokerage, licence) and the assumptions line inside the safe zone on every frame. The full `kit.complianceLine` (with the agent licence) goes into caption lines 1–2.
- Footer/outro image: only where a kit rule asks; append it after the loop with ffmpeg (it breaks the loop, so say so at Gate 2).
- Colours: client accent from the shadow token; group family type from `$ST/tokens/group-N.json`.
- AI label when `--voice` is TTS.

## Outputs to collect

| File | kind |
|---|---|
| `$O/<name>.mp4` (after `deliver.sh`) | video |
| `$O/<name>-master.gif` | image (GIF format) |
| `$O/<name>-master.poster.jpg` → copy to `$O/poster.jpg` | cover |
| `$O/<name>-master.alpha.mov` (if `--alpha`) | video |
| `$O/<name>-master.strip.jpg` → copy to `$J/qa/contact.jpg` | contact |
| `$O/<name>-master.manifest.json` → copy to `$J/qa/motion-manifest.json` | qa |
| `$O/caption.md` | caption |

Delete `$O/<name>-master.mp4` after `deliver.sh` succeeds (keep only the delivered file). Card: `engine: "motion"`, `style: "<template>"`.

## Time and usage

- Draft 15 s loop: ≈ 30 s (measured 27.9 s). Final with 4-sample motion blur: ≈ 95 s (DECISION.md). `object-3d` final: ≈ 5 min.
- Authoring the data file: 20–40 min (maths + per-client copy).
- No paid services; GSAP standard no-charge licence (don't build a Webflow competitor), three.js MIT, Playwright Apache-2.0.

## Built-in QA vs what Studio's gate adds

Built in: `expect` maths check (stops the render), keyframe QA (safe zone, cropped glyphs, contrast, minimum size, overflow), reading time per text group (≥ 0.25 s/word, warns under 0.34), loop-seam PSNR, out-of-order determinism, ffprobe + delivery gate, `--strict` compliance/APR block. Everything is in `.manifest.json`.

Studio adds: true-peak/loudness fix (`deliver.sh`), originality across clients (different `byClient` copy and numbers), the frame-1 hook check, PLAYBOOK banned copy on the data file text, the critic rubric, AI label note.

## Pitfalls

- Running `render.mjs` in the original folder writes `.work/`, `.cache/` and `out/` into `$R/engines/motion` (read-only for Studio). Always `cd "$M"` (shadow).
- `--engine films` from the shadow fails with "Studio Films not found" unless `STUDIO_FILMS=$R/engines/films` is exported (variables block above).
- The data file's `series`, `tag` and stamp text are on screen: rewrite them per client (the model file says Toronto).
- `--strict` exits 2 while `apr` is `null` on an Ontario rate post: get the APR wording from the brokerage or drop the rate.
- `--alpha` and `--gif` are not available with `--engine films`.
- Rate premises expire: `asOf` on screen; review after 30 days.
- The `--music` slot in the README names Meta Sound Collection/licensed beds: Studio policy is an original score (`voice-music.md`), Sound Collection music is added in the Instagram app at posting.

## Picking a style against the client's history

Templates are the "styles". Check `history.json` and run `$R/studio/.venv/bin/python $R/studio/tools/variety.py --client $SLUG --engine motion` (prints JSON conflicts and suggestions; it suggests films and stills styles only, so pick the template by hand from the rules below). Rotate templates per account (never the same template twice in a row); within one template, change the hook, numbers and stamp per client; `kinetic-hook` for quieter accounts and series, `pop-hook` for thumb-stop trial reels, `phone-pov` for "look at this notification/letter" ideas, `object-3d` when the idea is a physical stack.
