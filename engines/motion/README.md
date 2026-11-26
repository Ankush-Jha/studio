# Studio Motion: template-driven reels, rendered in code

The After Effects-style layer of Studio, next to Studio Stills (`engines/stills/`) and Studio Films (`engines/films/`). A data file (one idea, checked math, per-client copy) plus a template plus a client slug produce an Instagram-ready MP4, poster, frame strip and manifest. No AE, no AI imagery: every word and number is live type, and every number is computed.

The engine choice and Remotion licence notes are in `DECISION.md`.

## Quick start

```bash
cd engines/motion
npm install                     # project-local: playwright-core, gsap, three, lottie-web, esbuild (dev)
npm run setup                   # Chromium headless shell for playwright-core (shared Playwright cache)
node render.mjs templates/pop-hook --data data/heloc-paul.json --client northline-mortgages
node render.mjs templates/pop-hook --data data/heloc-paul.json --client northline-mortgages --quality draft
node render.mjs templates/kinetic-hook --data data/heloc-paul.json --client northline-mortgages --gif --loops 2
./demo.sh --quality draft       # three directions + GIF + overview sheet
node tools/overview.mjs out/directions-overview.jpg "A=out/…/a.mp4" "B=out/…/b.mp4"
```

Requirements:
- **Studio Stills next door** (`engines/stills/`, or set `STUDIO_STILLS`): motion reads its client tokens, group families, roster, fonts and colour/mortgage maths, so a client's reels and stills agree to the cent and the colour. `northline-mortgages` is the fictional example client defined there.
- **ffmpeg and ffprobe** on PATH (macOS: `brew install ffmpeg`; if ffmpeg fails to start after an OS update, `brew reinstall ffmpeg`).
- Optional: `ffmpeg-normalize` (`pip install ffmpeg-normalize` into `engines/motion/.venv` or `<repo>/.venv`, or set `FFMPEG_NORMALIZE`) for two-pass EBU R128 loudness; otherwise single-pass `loudnorm` is used.
- `npm run vendor` rebuilds `vendor/three.iife.js` (three.js, MIT, licence comments inlined).

## Templates

| Template | Format | What it is |
|---|---|---|
| `pop-hook` | 1080×1920, 12–15 s loop | **Bold Pop** (recommended default). Saturated client-colour fields, a giant number at about 85% of the safe width, snap-zoom cuts on whooshes, a stuck progress bar, payment slips raining down, a stamp, a slider, counters on ticks. Story: hook → rise → stack (pattern interrupt ~41%) → fix → loop. |
| `phone-pov` | 1080×1920, 12–15 s loop | **Phone POV**. A CSS-3D phone on a dark set, with a generic bank app, notification stacks, a snap zoom into the balance, and the payment retyped. |
| `object-3d` | 1080×1920, 12–15 s loop | **3D Object** (three.js). House + cash stack, coins into the chimney, a bird's-eye pattern interrupt, the stack finally shrinking. About 5 min per final render. |
| `kinetic-hook` | 1080×1920, 6–12 s loop | Calm editorial kinetic type in the group family: masked line reveals, family marks, rolling numerals. For quieter accounts and series. |

All templates share:
- a label row and a compliance line inside the safe zone;
- the assumptions line, with an APR placeholder until the brokerage confirms it;
- word-by-word captions, counters and sound cues.

## Renderer CLI

`node render.mjs templates/<t> --data <motion.json> --client <slug> [--out file.mp4]`

Templates `film-game-show`, `film-pop-art` and `film-thermal` are Studio Films styles (Rhythm Game Show, Pop Art, Thermal Camera) rebuilt as reusable data-driven templates. `--engine films` captures and muxes with Studio Films' own render tools (`engines/films/core/render`: `video.mjs`, `readcheck.mjs`, `mux.sh`; set `STUDIO_FILMS` if it lives elsewhere), then applies the Instagram pass (no motion blur, GIF or alpha on that engine).

| Flag | Effect |
|---|---|
| `--group N` | Render in another group family (default: the client's roster group). |
| `--strict` | Refuse to export while compliance fields, APR or QA issues are open (exit 2). Use this for anything that will be posted. |
| `--quality draft` | 1 sample per frame. The default `final` uses the template's motion-blur samples (4). |
| `--mb N` | Motion-blur samples per frame (overrides `--quality`). |
| `--scale N` | Supersample: render at N× and downscale with lanczos. |
| `--workers N` | Parallel capture pages. |
| `--gif` | Write `<out>.gif` alongside the MP4 (palette dither, loops forever). Size with `--gif-width 540` and `--gif-fps 15`. This is for the "GIF" format. |
| `--loops N` | Repeat the loop N times in the MP4. |
| `--voice f.wav` | Voice-over track. |
| `--music f.wav` | Licensed bed (Meta Sound Collection or a licensed track), ducked under the voice. |
| `--audio f.wav` | A finished pre-mix; replaces the SFX bus. |
| `--silent` | No SFX. |
| `--alpha` | Also write `<out>.alpha.mov` (ProRes 4444, transparent) for overlaying on client footage. |
| `--guides` | Draw the safe zone into the frames (review only). |
| `--keep` | Keep the lossless intermediate segments in `.work/`. |

Outputs, next to `<out>.mp4`:

| File | Contents |
|---|---|
| `.poster.jpg` | Cover. Every template's headline sits inside the 3:4 band. |
| `.strip.jpg` | Settled keyframes taken **from the delivered MP4**, with the safe zone dashed. |
| `_frames/` | Indexed PNGs of those keyframes. |
| `.manifest.json` | See the list below. |

The manifest records:
- data and client token files;
- the maths audit with working;
- the `expect` check;
- QA per keyframe (safe zone, cropped glyphs, contrast, minimum size, overflow);
- reading time per text group (≥ 0.25 s/word; warns under 0.34);
- loop-seam PSNR and the determinism result;
- sound cues;
- the ffprobe summary and the delivery gate result.

### Pipeline
1. **Resolve the client.** Tokens come from `engines/stills/tokens/clients/<slug>.json`, falling back to `engines/motion/tokens/clients/`, then to a provisional accent built from the entry in `engines/stills/library/roster.json`, which also gives the group.
2. **Prepare the data.** Apply `byGroup`/`byClient` overrides, run `calc`, check `expect`, and resolve `{value}` and `@value` references.
3. **Build the page.** One HTML page: fonts, token CSS variables, `runtime/runtime.js` (seek contract, rich text, seeded hand marks, counters, word-pop captions, cues, QA) and the template's `timeline.js`.
4. **Run a QA pass.** Check keyframes, reading time, the loop seam (last frame vs frame 1), out-of-order determinism, and the poster.
5. **Capture.** N workers seek each frame (plus motion-blur sub-frames) and send it over CDP into FFV1 lossless segments.
6. **Build the soundtrack.** Cue-placed SFX (`lib/sfx.mjs`, synthesised in ffmpeg, cached in `.cache/sfx`) plus voice and music, normalised to −14 LUFS / −1.5 dBTP.
7. **Encode.** One concat and one encode of the IG MP4 (BT.709 matrix + tags, `setparams`), then the optional GIF and alpha.
8. **Verify.** Run ffprobe and the delivery gate, extract frames and build the strip.

## Data files (`data/*.json`)

One idea, every format. See `data/heloc-paul.json`:
- `calc` (kind + inputs), and `expect` (claims copied from the idea's `math[]`, each a `key` and `shown` value; a mismatch stops the render);
- `assumptions` (the fine line; `{apr}` renders a red placeholder until `apr` is filled);
- blocks per template: `story` (pop-hook, phone-pov, object-3d) and `kinetic`;
- `byClient.<slug>`, which gives each account its own numbers, opening line and stamp. `playbook/PLAYBOOK.md` originality: never the same post with only the city swapped.

Calc kinds: `heloc-interest-only` (interest-only payments, before/now/next, per-$100K rule, self-set paydown simulated month by month) and `amortizing-compare` (Canadian semi-annual compounding, via `engines/stills/lib/mortgage.mjs`). Deltas and totals use the shown figures, so the screen always adds up.

## Writing a template
`templates/<id>/template.mjs` exports `meta` with these fields:
- `id`, `block`, `width`, `height`, `fps`;
- `duration {min, max}`, `safe {x0, x1, y0, y1}`, `loop`, `motionBlur`, `chromeFlags`;
- `scripts` (optional, e.g. `['vendor/three.iife.js']`);
- `prepare()` (optional), for validation.

`timeline.js` sets `window.TEMPLATE = { build(MT, M, tl) { … return { duration, keyframes, holds, poster, warnings } } }`.

Rules (determinism):
- Use one paused timeline and `fromTo` with `MT.IR`.
- Declare every t = 0 state with `tl.set(…, 0)`.
- Draw randomness only from `MT.rng(key)`.
- Never use clocks or CSS animations.
- Write changing text only with `MT.counter`, and redraw 3D in `MT.after(() => renderer.render(...))`.
- To stay byte-exact, a move that must not touch frame 1 starts one frame after 0. Frames render at t + 1e-4.
- GSAP gotcha: in `fromTo`, a "from" property missing from the "to" vars is ignored.

Sound: `MT.cue(t, name, gain)` with any of these: `whoosh`, `whoosh-short`, `swish`, `tick`, `pop`, `click`, `thud`, `cash`, `rise`, `glitch`, `stamp`, `paper`.

## AE bridge: designers on After Effects

Designers can keep working in AE on another machine. Their templates come into this pipeline as **Lottie (Bodymovin) JSON** that we fill per client. `lottie-web` 5.13 (MIT) is installed here and plays Bodymovin exports in the same deterministic page: `anim.goToAndStop(frame, true)` inside `MT.after`.

### Export rules for designers
1. **Composition:** 1080×1920 (or 1080×1350) at 30 fps. Keep all type inside x 65–1015, y 270–1248. Make the last frame equal the first.
2. **Text that changes per client or per idea:** live AE text layers named `txt_<field>` (e.g. `txt_hook`, `txt_number`, `txt_caption`). Use only fonts from `engines/stills/fonts` (Archivo, Fraunces, Instrument Sans, Bricolage Grotesque, Newsreader, IBM Plex), and turn **off** "Glyphs" in Bodymovin, so text renders as live type with our @font-face.
3. **Brand colours:** fills and strokes named `col_accent`, `col_ink`, `col_paper` (shape layer > Fill named that way). They map to the client's tokens.
4. **Numbers:** put the final value in `txt_number`. Counting is done by the pipeline, which writes `{value}` from `calc`, never typed.
5. **Allowed features** (lottie-web SVG renderer): shapes, masks, track mattes, trim paths, transforms and text animators. **Avoid** AE effects such as Glow, Gaussian Blur and CC plugins, expressions that need the AE engine, 3D layers and raster images. Bake anything else into shapes.
6. **Export** with Bodymovin (or LottieFiles for AE) as plain JSON, assets embedded, and check it in the LottieFiles preview before handing it over.

### How the pipeline fills it
A `lottie` template loads the JSON and does four things:
- replaces each `txt_*` layer's `t.d.k[0].s.t` with the data field;
- swaps the `c.k` colour of each `col_*` fill and stroke for the client token;
- forces fonts to our local families;
- adds the label row, compliance line and assumptions line in HTML on top, so compliance is never baked into a designer file.

Everything else in this README applies to it: QA, safe zone, sound cues by marker name, encode and gate. The loader is not built yet, because there is no designer file to prove it on. Build it alongside the first real Bodymovin export, and use the rules above as the handover spec.

### When nexrender makes sense
[nexrender](https://github.com/inlife/nexrender) drives real AE (`aerender`) from JSON jobs. Use it only when designers' projects rely on things Lottie cannot play: AE effects, 3D layers, Element 3D/Trapcode, or footage-heavy comps. That needs an AE licence on the render machine (Adobe's terms on server rendering apply) and a Windows or macOS box. It can sit beside this pipeline: same data files, with nexrender filling `txt_*` and `col_*` through its `data` assets, and our `encodeMP4` step for the IG delivery spec (AE's H.264 output still needs the BT.709/yuv420p/faststart re-encode).

## What you must still provide per client
- **Compliance:** the brokerage's authorised name and FSRA licence number, each agent's licensed name and approved title, and the APR/term wording for any rate shown. Until then, renders carry red placeholders and `--strict` refuses to export.
- **Brand colours** for clients whose accent is marked provisional in `engines/stills/tokens/clients/*.json`.
- **Music:** a licensed bed per post (Meta Sound Collection for business accounts), passed with `--music`.
- **Voice:** a VO (broker-recorded, or TTS with Instagram's AI label), passed with `--voice`.
- **Client footage or photos** for face reels and covers (composite over `--alpha` renders).
