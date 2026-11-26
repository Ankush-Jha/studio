# Engine: hyperframes (HeyGen HyperFrames, Apache-2.0)

HyperFrames renders video from HTML: a composition is an HTML file whose DOM declares timing with `data-*` attributes and whose GSAP timeline is seekable; the CLI lints, checks (layout, motion, WCAG contrast), snapshots and renders with headless Chrome + FFmpeg. Installed as a Claude Code plugin with its skills at `~/.claude/plugins/cache/claude-plugins-official/hyperframes/0.8.61/skills/` (entry: `hyperframes/SKILL.md`; contract: `hyperframes-core/SKILL.md`; commands: `hyperframes-cli/SKILL.md`). Read those three before authoring; load the workflow skill named below for the job type.

```sh
R=$(git rev-parse --show-toplevel)
J=$R/jobs/<id>; P=$J/project; O=$J/out; H=$P/hf
SLUG=<client slug>
HF="env -u GEMINI_API_KEY npx -y hyperframes@0.8.61"   # pinned version; GEMINI key removed so no frame leaves the machine
export HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1 HYPERFRAMES_SKIP_SKILLS=1
```

**Version pin:** always `hyperframes@0.8.61` (the plugin's skills are 0.8.61; npm's latest was 0.9.70 on 19 Nov 2026). Do not run `upgrade` or `@latest` inside a job; a version bump is a separate, tested change to this adapter. (FACE_REELS' ghost-editor pins its own HyperFrames, 0.8.159, in `vendor/ghost-editor/scripts/HF_VERSION`; leave that alone.)

**Privacy:** telemetry off (env above). `snapshot` sends every captured frame to Google Gemini by default whenever `GEMINI_API_KEY` is set (it is set in this user's shell for FACE_REELS): the `env -u GEMINI_API_KEY` in `$HF` plus `--describe false` stop that (verified 19 Nov 2026). Never run `hyperframes feedback`, `--file-issue`, `publish`, `cloud`, `lambda` or `cloudrun` (they send data or files off the machine) unless the user says yes. Don't use `media-use resolve` for music, images or SFX (HeyGen catalog/stock; needs a HeyGen login; conflicts with the music and no-stock policies).

## Best for

- Fast kinetic-type reels (6–30 s) and stat/number hits: `/motion-graphics` workflow, GSAP primitives from `hyperframes catalog`.
- Captions on client footage without changing it: `/embedded-captions` (local transcription and subject matting, 35 caption identities; "anchor" rail by default).
- Designed overlay cards on talking-head footage: `/talking-head-recut` (9:16 or 4:5 canvas, clip untouched underneath).
- Animated carousel slides (each slide a short 4:5 video) and GIFs (`--format gif`).
- Not for: the house graphic-reel look with an original score and full story arc (`films.md`), code-rendered statics with a QA gate (`stills.md`).

## Formats and sizes

| Deliverable | Composition | Render |
|---|---|---|
| Reel / story | `init --resolution portrait` (1080×1920) | `--fps 30` mp4 |
| Square | `--resolution square` (1080×1080) | mp4 |
| 4:5 carousel video slide | set `data-width="1080" data-height="1350"` and `<meta name="viewport" content="width=1080, height=1350">` by hand | mp4. UNVERIFIED: custom 1080×1350 not test-rendered |
| GIF | any of the above | `--format gif --fps 15` (no audio, loops forever by default) |
| Overlay for footage | any | `--format mov` or `webm` (transparency) |

Reel text safe zone: x 65–1015, y 270–1248.

## Inputs it needs

- Concept + copy (`script.json`), maths with working.
- Kit: `kit.json` (`complianceLine`, `assets.logos`, `assets.footer`, `rules`), `tokens.json` (colours, `font.display`, `font.body`).
- Font files (OFL) to copy into the project: from `$R/engines/stills/fonts/` (read-only source).
- GSAP copied locally: `$R/graphic reels/content-desk/toolchain/node_modules/gsap/dist/gsap.min.js` (the scaffold links GSAP from jsDelivr; local is deterministic and offline).
- Audio: a voice WAV and/or original score WAV (`voice-music.md`), or client footage (absolute path).

## Setup check (exact command)

```sh
cd /tmp && HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1 npx -y hyperframes@0.8.61 --version && node --version && ffmpeg -version | head -1
```

Verified 19 Nov 2026: `0.8.61`, Node v25.5.0 (HyperFrames needs ≥ 22; 25 is newer than its tested range), ffmpeg 9.0.2. `doctor --json` reports `ok: false` on this machine only because of optional parts (Version: not the latest release; Kokoro TTS; MusicGen BGM; Docker): not a blocker for local renders (verified 19 Nov 2026).

## Run (exact commands)

### 1. Scaffold in the job

```sh
mkdir -p "$P" "$O" && cd "$P" && $HF init hf --resolution portrait --non-interactive
mkdir -p "$H/assets/fonts" "$H/assets/brand" "$H/vendor"
cp "$R/graphic reels/content-desk/toolchain/node_modules/gsap/dist/gsap.min.js" "$H/vendor/gsap.min.js"
cp "$R/engines/stills/fonts/<Family>[wght].ttf" "$H/assets/fonts/<Family>.ttf"   # each family used
cp "$R/<kit.assets.logos[0]>" "$H/assets/brand/logo.png"                                        # only if a logo is used
```

`init` writes `index.html`, `hyperframes.json`, `package.json` (scripts pinned to 0.8.61), `AGENTS.md`/`CLAUDE.md`, `meta.json`; with `HYPERFRAMES_SKIP_SKILLS=1` it does not touch `~/.claude` (verified). For a workflow-owned project use `--skill=<workflow>` (e.g. `motion-graphics`).

### 2. Inject client tokens and fonts

Write `$H/tokens.css` from `kits/<slug>/tokens.json` (one block, regenerated, never hand-edited):

```css
:root { --accent:#2E6B30; --ink:#111111; --paper:#EFEDE8; --font-display:'Archivo'; --font-body:'Archivo'; }
@font-face { font-family:'Archivo'; src:url(assets/fonts/Archivo.ttf) format('truetype'); font-weight:100 900; font-display:block; }
```

Link it in `index.html` (`<link rel="stylesheet" href="tokens.css">`) and replace the CDN script with `<script src="vendor/gsap.min.js"></script>`. Every named `font-family` needs an in-file `@font-face` to a local file (lint `font_family_without_font_face`). For per-client text without editing HTML, declare variables on `<html data-composition-variables='[…]'>`, bind with `data-var-text="hook"` / `data-var-src="logo"`, and render with `--variables-file "$P/vars.json"` (or `--batch rows.json` for several clients, one row each). Compliance text bound this way must equal `kit.complianceLine` exactly.

### 3. Author, lint, check, snapshot

Follow `/hyperframes-core`: root `<div id="root" data-composition-id="main" data-width="1080" data-height="1920" data-duration="…">`, timed elements with `data-start`/`data-duration`, one `gsap.timeline({paused:true})` registered at `window.__timelines["main"]` after the build, no clocks or unseeded random, no `repeat:-1`, no tween of `visibility`/`autoAlpha` on a `.clip`. Search the catalog before hand-writing motion: `$HF catalog --query "<the beat in plain English>"`.

```sh
cd "$H" && $HF lint && $HF check && $HF snapshot --frames 8 --describe false
```

`check` must report 0 issues (layout, motion, contrast); a lint **error** silently switches off the layout and contrast audits. Look at the snapshot PNGs. (Studio does the review at its gates; `preview --background` is optional for the user.)

### 4. Render, audio, delivery

```sh
cd "$H" && $HF render --quality draft --fps 30 --output "$P/drafts/draft.mp4"                 # iterate
cd "$H" && $HF render --quality delivery --fps 30 --strict --output "$P/out/video.mp4"         # final picture
LEMO_COLOR=bt709 sh $R/engines/films/core/render/mux.sh "$P/out/video.mp4" "$P/out/mix.wav" "$P/out/master.mp4" 30 0
sh $R/studio/engines/bin/deliver.sh "$P/out/master.mp4" "$O/<name>.mp4"
ffmpeg -nostdin -v error -y -ss 0 -i "$O/<name>.mp4" -frames:v 1 -q:v 2 "$O/poster.jpg"        # cover = frame 1 (check the 3:4 band)
cd "$H" && $HF render --format gif --fps 15 --output "$O/<name>.gif"                          # GIF deliverable
```

- Audio: either place `<audio id="vo" src="assets/vo.wav" data-start="0">` tracks in the composition (every `<audio>` needs an `id`, or it is silently dropped) and skip `mux.sh`, or render silent picture and mux the Studio mix as above. `deliver.sh` needs an audio stream; a reel always has sound.
- Verified 19 Nov 2026: a 4 s 1080×1920 branded test (local Archivo font, kit logo, compliance line, accent) passed `lint` (1 warning: nested structure → sub-composition) and `check` (0 layout issues, 15/15 WCAG checks), draft render 17 s wall time, output H.264 yuv420p tv/bt709/bt709, 30/1.

## Branding

- Compliance line: verbatim `kit.complianceLine` inside the safe zone (≥ 24 px at 1080 wide, ≥ 4.5:1) on the payoff beat; in caption lines 1–2. Use a variable only if its value is the kit string.
- Logo: none on frame 1; only if the kit/brief wants it (e.g. CTA beat), from `kit.assets.logos`, never boxed.
- Footer/outro image: only where a kit rule asks; as a final timed clip (≤ 3 s).
- Captions on client footage (`/embedded-captions`): caption font and accent from the kit tokens.

## Outputs to collect

| File | kind |
|---|---|
| `$O/<name>.mp4` (after `deliver.sh`) | video |
| `$O/poster.jpg` | cover |
| `$O/<name>.gif` | image |
| carousel: `$O/carousel/NN.mp4` (one render per slide composition) | carousel |
| `$O/caption.md` | caption |
| snapshots → `$J/qa/frames/` | contact |

Keep `$H` (the project) for re-renders. Card: `engine: "hyperframes"`, `style: "<workflow or catalog primitive>"`.

## Time and usage

- Draft render of a 4 s composition: ≈ 6 s render, ≈ 17 s including npx start-up (measured). 30 s reels: a few minutes per delivery render (UNVERIFIED).
- Authoring a kinetic-type reel: 1–2 h. Captions on footage: about 1 h plus transcription.
- Free and local (Apache-2.0). Cloud/Lambda render paths cost money and upload files: not used.

## Built-in QA vs what Studio's gate adds

Built in: `lint` (structure, determinism, fonts, media rules), `check` (runtime errors, failed requests, layout overflow, `*.motion.json` assertions, WCAG contrast), `snapshot` frames, render summary (`beginframe` vs `screenshot`, GPU).

Studio adds: PLAYBOOK safe zone (HyperFrames checks overflow, not Instagram's UI zones), frame-1 hook, banned copy, maths re-check, loudness/true peak and AAC 128k (`deliver.sh`), compliance present, AI-label note, originality vs history, critic rubric.

## Pitfalls

- `init` without `HYPERFRAMES_SKIP_SKILLS=1` checks/installs AI coding skills from GitHub.
- The scaffold loads GSAP from jsDelivr: replace with the local copy.
- CSS `transform` on an element that GSAP also tweens → `gsap_css_transform_conflict`; set initial state in `fromTo`.
- No `crossorigin` on `<video>`/`<audio>`; `<audio>` without `id` renders silent.
- A timeline registered before an async build renders blank.
- The CLI prints "This project pins hyperframes@0.8.61 (latest …)": ignore inside jobs (pin on purpose).
- Default output path is timestamped under `renders/`: always pass `--output`.
- `slideshow` produces a navigable deck, not an MP4: not an Instagram deliverable.

## Picking a style against the client's history

HyperFrames has no fixed style list: the look is the composition plus catalog primitives and the 35 caption identities (`/embedded-captions`). Record the primitive/identity names as the card's `style`. Check `history.json` and run `$R/studio/.venv/bin/python $R/studio/tools/variety.py --client $SLUG --engine hyperframes` (UNVERIFIED: tool being built); don't repeat the caption identity or motion primitive this client used last; keep one caption position and one number-reveal method per client series (PLAYBOOK brand consistency).
