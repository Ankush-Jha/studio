# Engine: films (Studio Films film styles)

Graphic reels made entirely in code in one of the 99 Studio Films styles: a page with `render(t)`, Kokoro voice, an original synthesized score, procedural foley, rendered frame by frame in headless Chrome and mastered with ffmpeg. This is the house engine for graphic reels (`heloc-five-years`, `keep-your-rate`, `heloc-rules`, `mortgage-insurance`, `heloc-piggy-bank` and `portfolio-failing` were all made with it).

Variables used below (set them first in every shell):

```sh
R=$(git rev-parse --show-toplevel)
LIB=$R/engines/films
PY="$LIB/.venv/bin/python"
J=$R/jobs/<id>            # the job folder
P=$J/project              # the film's project folder (the library's "films/<name>/")
O=$J/out                  # deliverables
SLUG=<client slug>        # kits/<slug>/
NAME=<short-film-name>    # lowercase letters, digits, hyphens
```

The library's own guides are the authority for directing and building. Read them in this order before the treatment: `$LIB/AGENTS.md` (workflow), `$LIB/DIRECTOR.md` (story, sound, rhythm, camera, delivery list), `$LIB/TECHNIQUE.md` (page contract, voice, music, mix), `$LIB/core/README.md` (every tool flag), then the chosen `$LIB/styles/<slug>/STYLE.md`. This adapter adds the Studio rules on top: vertical 30 fps, the PLAYBOOK, client branding, job folders.

## Best for

- Graphic (non-footage) Instagram reels, 30–60 s, narrated, one visual metaphor carried through the whole reel: payment maths, rule explainers, myth → truth, mistake → fix, rate-day stories.
- Hero pieces where the look itself must stop the scroll (3D brick toy, painted, printed, diagram styles).
- Footage-based "news package" reels when the client supplies talking-head footage and wants designed graphics around it (the `portfolio-failing` pattern: Edit & Documentary styles). For plain caption-on-footage work prefer `face-reels.md` or `hyperframes.md`.
- Not for: statics/carousels (`stills.md`, `custom-html.md`), 6–15 s data loops (`motion.md`), a quick kinetic-type reel in under an hour (`hyperframes.md`).

## Formats and sizes

| Deliverable | Size | fps | Notes |
|---|---|---|---|
| Reel | 1080×1920 | 30 | Library default is 1920×1080 at 24 fps; Studio always overrides (below) |
| Reel cover | 1080×1920 `poster.jpg` | – | headline inside the centre 3:4 band, y 240–1680 |
| Story | 1080×1920 | 30 | same build, shorter cut |

**How to make it vertical (every time, no exceptions):**

1. Pass `--size 1080x1920` to every page tool: `still.mjs`, `video.mjs`, `events.mjs`, `readcheck.mjs`.
2. Pass `--fps 30` to `video.mjs` and `30` as the 4th argument to `mux.sh`.
3. In the page, lay out from `innerWidth` × `innerHeight` (1080×1920), and size the canvas `width="1080" height="1920"`. Never crop a 16:9 layout: STYLE.md grids are written for 1920×1080, so re-derive the grid for the tall frame ("Vertical 9:16 is a different layout, not a crop", caption-news STYLE.md).
4. Frame rate vs the style: if `STYLE.md` sets 24 fps with characters "on twos" (12 drawings/s), render at 30 fps and step drawings at **15 per second** (every 2nd frame) while the camera moves every frame (house rule: "paper pieces still move on twos = 15 drawings/s"). Quantize with `Math.floor(t * 15) / 15` for stepped elements only. Styles native at 60 fps (stick-explainer, memphis-diorama, paper-popup) render at 30. UNVERIFIED: no Studio reel has yet been rendered at 30 fps from a 60 fps-native style.
5. All readable text inside **x 65–1015, y 270–1248**. Below y 1248 only decoration, no information (Instagram's UI covers it). Write `window.TEXTS(t)` so `readcheck.mjs` can time every text.

## Inputs it needs

- From the job: `job.json`, the chosen concept in `concepts.json` (hook, beats, style, device), `script.json` (VO lines, `math[]` with working, caption, cta).
- From the kit (`$R/kits/$SLUG/`): `kit.json` (`complianceLine`, `rules`, `assets.footer`, `assets.logos`, `languages`, `province`), `tokens.json` (`color.accent`, `color.ink`, `color.paper`, `font.display`, `font.body`), `voice.md`, `history.json`, `lessons.md`.
- Voice: Kokoro by default (see `voice-music.md`); the client's own recording when supplied (then keep every word, see `voice-music.md`).
- For Edit & Documentary styles: the client's footage/documents (absolute paths), plus the style's material tools (`setup.sh demo <slug>` first, AGENTS.md "Treatment first").
- ✦ styles (`text-flash-cuts`, `comic-history`, `manga-panels`) need an image generator. Studio's rule is "no AI images" for client work: **do not pick ✦ styles**.

## Setup check (exact command)

Read-only check (does not update the library; `setup.sh` with no arguments does `git fetch` + `reset --hard`, so do not run it in the middle of a job):

```sh
cd $R/engines/films && node --version && ffmpeg -version | head -1 \
 && test -f core/render/video.mjs && test -d node_modules/playwright-core \
 && .venv/bin/python -c "import numpy, scipy, soundfile, kokoro_onnx, faster_whisper; print('core+voice ok')" \
 && test -f core/tts/kokoro-v1.0.onnx && test -f core/tts/voices-v1.0.bin && echo "films ready"
```

Verified 19 Nov 2026: Node v25.5.0, ffmpeg 9.0.2, core + voice tiers installed. Installed Kokoro voices on this machine (only these 8): `af_bella af_heart am_adam am_liam am_michael am_onyx bm_george bm_lewis`. The music tier (`numba`, for `pluck.py`) is only needed for plucked strings: check with `.venv/bin/python -c "import numba"` before writing a pluck score.

## Run (exact commands)

### 0. Folders

```sh
mkdir -p "$P/voice" "$P/out" "$P/fonts" "$P/tools" "$P/previews" "$O"
```

Never build inside `$LIB/styles/` or edit `$LIB/core/`. Copy what you need into `$P`. Pages reach library files with absolute URLs (`/core/lib.js`, `/node_modules/three/build/three.module.js`); the project is served at `/@film/`. Avoid `#` and `?` in paths (spaces are fine: verified).

### 1. Pick the style (section "Picking a style against the client's history" below), then write `$P/TREATMENT.md`

DIRECTOR.md §4: three candidate structures and the choice, logline/arc, benchmark (learn / don't take), shot list, second-by-second beat sheet, cue map, sound design table, subtitle/title design. Add a Studio section: **layout table for 1080×1920** (zone, y range, content; all text in y 270–1248, like `graphic reels/heloc-five-years/TREATMENT.md` §4) and **branding** (where the compliance line and any outro go, from the kit). Open the style's demo (`DEMO.md`, `setup.sh demo <slug>`) only after the treatment exists.

### 2. Gate 1 previews (cheap key frames with `still.mjs`)

For each concept that is shown at Gate 1, build a minimal `index.html` + `main.js` in `$P/previews/<A|B|C>/` that draws the concept's frame 1 (the hook) and one key beat with the real drawing code (fonts and colours from the kit). Then:

```sh
cd "$LIB" && node core/render/still.mjs "$P/previews/A" 0 6 --size 1080x1920 --prefix A_ --out "$P/previews"
cd "$P/previews" && "$PY" "$LIB/core/render/sheet.py" "$P/previews/A.jpg" A_*.jpg --cols 2 --w 540
```

Verified 19 Nov 2026 on `graphic reels/heloc-five-years`: two 1080×1920 stills in under 1 s total. Put `project/previews/A.jpg` into the concept's `preview` field. A still-frame preview takes about 10–20 min of authoring per concept; skip it (`preview: null`) when the brief is a rush.

### 3. Voice: lines, Kokoro, ASR check

`$P/voice/lines.json` = `[{"id":"L01","text":"…","voice":"af_bella","speed":1.0,"asr":"…"}]`. Spell numbers and acronyms for the ear in `text` ("heelock", "fifty thousand dollars"), and put what Whisper should hear in `asr` (e.g. `"$50,000"`, `"HELOC"`). Then:

```sh
cd "$LIB" && "$PY" core/tts/tts.py "$P/voice/lines.json" "$P/voice"
cd "$LIB" && "$PY" core/tts/asr_check.py "$P/voice/lines.json" "$P/voice"     # must exit 0; writes voice/words.json
```

Re-generate any failed line (change wording or `asr`), never skip the check. Voice routing (Kokoro vs ElevenLabs vs the client's own voice) is in `voice-music.md`.

### 4. Picture, events, readcheck

Write `$P/index.html` + `main.js` exposing `window.DUR`, `window.render(t)`, `window.READY`, `window.EV` (sound events), `window.TEXTS(t)` (TECHNIQUE.md §2). Deterministic only (`mulberry`/`hash` from `/core/lib.js`, no `Date.now()`, no unseeded `Math.random()`). Burn captions into the page in 3–5-word chunks with one highlighted keyword (PLAYBOOK).

```sh
cd "$LIB" && node core/render/events.mjs "$P" --size 1080x1920
cd "$LIB" && node core/render/readcheck.mjs "$P" --size 1080x1920
cd "$LIB" && node core/render/still.mjs "$P" --range 0:<DUR>:2 --size 1080x1920 --prefix s_ --out "$P/out/sheet"
cd "$P/out/sheet" && "$PY" "$LIB/core/render/sheet.py" "$P/out/contact.jpg" s_*.jpg --cols 6 --w 300
```

Look at `contact.jpg` and 0.2 s strips of key actions (TECHNIQUE.md §8) before the full render.

### 5. Score and mix

- `$P/music.py`: original score in numpy (and/or `core/audio/sampler.py` instruments), from the cue map, written to `$P/out/score.wav` (48 kHz stereo). Model: `graphic reels/heloc-five-years/music.py` (synthesized motorik marimba, no downloads). Sampled instruments: put `"$PY" "$LIB/core/audio/sampler.py" --need "$P/mix.py"` at the top of `build.sh` so libraries download before the long render.
- `$P/mix.py`: voice WAVs placed at the VO times + foley from `events.json` via `core/audio/sfx.py` + score, music ducked fast to sit 18–25 dB under the voice, voice compressed first; writes `$P/out/mix.wav`. Model: `graphic reels/heloc-five-years/mix.py` (imports `sfx` from `$LIB/core/audio`).

```sh
"$PY" "$P/music.py" && "$PY" "$P/mix.py"
```

### 6. Final render, master, delivery pass, poster

```sh
cd "$LIB" && node core/render/video.mjs "$P" --fps 30 --workers 3 --size 1080x1920 --out "$P/out/video.mp4"
cd "$LIB" && LEMO_COLOR=bt709 sh core/render/mux.sh "$P/out/video.mp4" "$P/out/mix.wav" "$P/out/master.mp4" 30 0
sh $R/studio/engines/bin/deliver.sh "$P/out/master.mp4" "$O/$NAME.mp4"
cd "$LIB" && node core/render/still.mjs "$P" <cover-t> --size 1080x1920 --q nocap=1 --prefix poster_ --out "$P/out"
cp "$P/out/poster_<cover-t>.jpg" "$O/poster.jpg"
```

- `mux.sh` (with `LEMO_COLOR=bt709`, grain `0` for vector/flat styles, `1` for print/paper styles) writes limited-range BT.709 H.264 at CRF 19 with AAC **256k**, two-pass loudnorm to −14 LUFS, true peak ≤ −1 dBTP.
- `deliver.sh` applies the PLAYBOOK delivery spec on top: copies the video when it is already h264/yuv420p/tv/bt709/30 fps (else re-encodes CRF 17), re-encodes audio to **AAC-LC 128 kbps 48 kHz** through a two-pass loudnorm + 4× oversampled limiter, `+faststart`, `-shortest`; prints the stream check and exits 1 unless the file measures −15 to −13 LUFS with true peak under −1 dBTP. Verified 19 Nov 2026 on `heloc-five-years/out/master.mp4`: −14.1 LUFS, −1.7 dBTP, H.264 High yuv420p tv/bt709, 30/1, AAC 128k.
- Cover: your page should support `?nocap=1` (hide burned captions), as heloc-five-years and keep-your-rate do. Pick `<cover-t>` where the hook headline is fully settled and sits inside y 240–1680; frame 1 (`0`) is the default since frame 1 is the hook.
- Subtitles: `"$PY" "$LIB/core/render/srt.py" "$P/out/srt.json" "$O/subtitles_en.srt"` (captions are burned in, so name it `subtitles_<lang>.srt`, DIRECTOR.md §11).

### 7. One-command rebuild

Write `$P/build.sh` with `LIB=$R/engines/films` at the top and the steps 3–6 in order, as in `graphic reels/heloc-five-years/build.sh` (with `STOP_BEFORE_VIDEO=1` to stop after sound). Deliver it with the film.

## Branding

- **Compliance line** (`kit.json.complianceLine`, verbatim, never retyped from a footer image): on screen inside the safe zone (y ≤ 1248, ≥ 24 px at 1080 wide, contrast ≥ 4.5:1) on the **payoff beat**, held at least as long as readcheck requires for its letter count (DIRECTOR.md §7 formula: letters ÷ 15 + 1.5 s); and in caption lines 1–2. Report it in `window.TEXTS` so readcheck times it. If `complianceLine` is empty or the kit lists missing licence fields, render a visible `[compliance line: TODO]` placeholder and mark the job output as a proof (never invent).
- **Logo**: none by default (PLAYBOOK: no logo bumper, frame 1 is the hook). Only where a kit rule asks for it.
- **Footer / outro image** (`kit.json.assets.footer` or an outro asset): only where a kit rule asks (e.g. `kind: "outro"`, "Always use Jim's Outro for Reels"). Then it is the one allowed end card: append it after the payoff (≤ 3 s), scaled to 1080 wide, and keep the loop on the last frame before it. Without such a rule: no end card.
- **Colours and type**: one typeface in two weights, 3–4 colours (PLAYBOOK). Use the kit accent (`tokens.json color.accent`) as the style's signal colour only when the style's colour logic allows a free signal colour (Swiss, Bauhaus, Pop Art…); otherwise keep the style palette and put the accent in captions/keyword highlights. Fonts must be OFL: copy the file into `$P/fonts/` and load it with `@font-face` (TECHNIQUE.md §11).
- AI voice: every delivery note says "apply Instagram's AI label" when Kokoro or ElevenLabs is used.

## Outputs to collect

Into `$O/` (write their relative paths into `job.json.outputs`):

| File | kind |
|---|---|
| `$O/<name>.mp4` (from `deliver.sh`) | video |
| `$O/poster.jpg` (1080×1920) | cover |
| `$O/subtitles_en.srt` | caption |
| `$O/caption.md` (caption with search phrase on line 1, compliance line in lines 1–2, ≤ 5 hashtags, AI-label note) | caption |
| `$P/out/contact.jpg` copied to `$J/qa/contact.jpg` | contact |

Keep in `$P`: `TREATMENT.md`, `CREDITS` (Kokoro voice, sample libraries via `sampler.py credits(names)`, fonts), `build.sh`, sources. Library card fields: `engine: "films"`, `style: <slug>`, `fps: 30`, `size: "1080x1920"`, `voice: "kokoro:<voice>"`, `music: "original synth"`.

## Time and usage

- 2D canvas styles: picture render is fast (heloc-five-years: 1,605 frames at 1080×1920 in 19 s with 3 workers). The real cost is authoring: a 45–60 s reel is typically a half-day to a day of agent work (treatment, page, score, mix, one fix round).
- 3D / WebGL styles (brick-toy, paper-popup, data-physical, tilt-shift, lowpoly-island): much slower renders; use `--workers 2` like keep-your-rate. UNVERIFIED: no measured timing on file.
- Kokoro TTS + ASR: about a minute for 13 lines (first ASR run downloads a ~145 MB Whisper model).
- No paid services. Everything runs locally. Free licences: CC BY 4.0 library material, OFL fonts, CC0/CC BY samples (credit in `CREDITS`).

## Built-in QA vs what Studio's gate adds

Built in (run them, fix to 0): `asr_check.py` (every line transcribes back), `readcheck.mjs` (every text stays long enough), page-error exit codes on all render tools, `mux.sh` loudness/true-peak mastering, the DIRECTOR.md §11 checklist (contact sheets, 0.2 s strips, "not the demo again" comparison, no LemoLab sign-off grep: `grep -rniE "lemo ?lab|opus 5\.5" "$P"`).

Studio's gate adds: PLAYBOOK safe zone on rendered frames (text inside x 65–1015, y 270–1248), frame-1 hook alignment (voice, text, visual), banned copy phrases, math re-check against `script.json.math[]`, compliance line present and legible on the payoff beat, no end card unless a kit rule asks, delivery spec (H.264 yuv420p BT.709 30 fps, AAC 128k, −14 LUFS, TP < −1 dBTP, < 25 Mbps), cover headline in the 3:4 band, client-originality (not a twin of another client's piece), AI-label note, critic rubric.

## Pitfalls

- Forgetting `--size 1080x1920` on one tool: events/readcheck then measure a 1920×1080 page and the timings or layout checks are wrong.
- `mux.sh` alone writes AAC 256k and, without `LEMO_COLOR=bt709`, full-range `yuvj420p`/bt470bg tags: always `LEMO_COLOR=bt709` + `deliver.sh`.
- Text drawn below y 1248 (the first three reels ran captions to y ≈ 1480; PLAYBOOK flags it).
- A recap, "follow for more" or a generic "Message me" end card: cut it, end on the payoff and loop to frame 1.
- Kokoro mispronounces acronyms: respell in `text`, keep the real spelling in `asr` and on screen.
- Only 8 Kokoro voices are installed (list above); `tts.py` prints the list on an unknown voice. Don't reuse the voice the client's last reel used unless the kit says so.
- Copied demo code reaching the library with `../..`: replace with `$LIB` or absolute URLs.
- STYLE.md bilingual stacks (Chinese above English) are the demos' languages: a one-language film sets one line (DIRECTOR.md §1).
- The library's China/map rules (DIRECTOR.md §13) apply to any map frame.
- `setup.sh` (no args) resets the library to upstream main: never mid-job.
- Rate premises expire: date-stamp on screen ("rates as of …") and note the review date in `job.json`.

## Picking a style against the client's history

1. **Read history first.** `$R/kits/$SLUG/history.json` (`pieces[].style`, `lastStyle`) and the library cards `$R/library/index.jsonl` filtered by `clients` containing the slug. Then call the variety tool:

   ```sh
   $R/studio/.venv/bin/python $R/studio/tools/variety.py --client $SLUG --engine films
   ```

   UNVERIFIED: `variety.py` is being built; its flags and output are not final. Until it exists, apply its intent by hand: exclude every style this client used in its last 5 pieces and the style of its most recent piece in any engine family that looks alike (e.g. after `swiss-motion` avoid `bauhaus-shapes`); also avoid the style another client in the same city used in the last 30 days.
2. **Read "best for".** Each style's gallery tags are `uses` in `$LIB/styles/<slug>/style.json`; the binding definition is `STYLE.md` §1 "Essence, and what it is not" plus its pitfalls. Quick list of all tags:

   ```sh
   cd $R/engines/films/styles && python3 -c "import json,glob; [print(d['slug'],'|',', '.join(d.get('uses',[])),'|',d.get('needs','')) for d in (json.load(open(f)) for f in sorted(glob.glob('*/style.json')))]"
   ```
3. **Match the story, not the topic.** Pick the style whose native move *is* the beat (heloc-five-years chose Swiss because "a number that refuses to move inside a grid that keeps changing" is the Swiss signature). Write two rejected styles and why into TREATMENT.md §0 and into the library card's `rejectedStyles`.
4. **Phone legibility check.** Reject styles whose information lives in small chrome (spreadsheet cells, UI labels) unless you enlarge it beyond the style's defaults.
5. Never a ✦ style (image generator). Prefer the user's own styles in `~/lemo-my-styles/` when one exists (none exist as of 19 Nov 2026).

### Styles that suit finance and mortgage explainers in 9:16

Verified against each `style.json` `uses` and `STYLE.md` essence (19 Nov 2026). "Used" = already used by an agency reel (check the client's own history before reusing).

| Style (folder) | Good for | Native fps / note |
|---|---|---|
| Swiss Motion Graphics (`swiss-motion`) | One giant number held still in a grid that changes: "five years paid, still $50,000" | 30 in our build; used: heloc-five-years |
| Bauhaus Shapes (`bauhaus-shapes`) | Amounts drawn to scale as circles/squares (area = amount): ratios, compounding, down-payment splits | 30 fps; tagged "Finance and economics explainers" |
| Marker on Paper (`marker-paper`) | Worked payment problems one sheet at a time: blue = what we know, red = what we want | 24, drawings on twos |
| Chalkboard (`chalkboard`) | Myth → truth: write the myth, wipe it, write the fact in the same place | 30 fps |
| Whiteboard Explainer (`whiteboard`) | Walk-throughs with a camera travelling across one board: amortization, renewal timeline | – |
| Sketchnote (`sketchnote`) | One-page visual summary that grows: "5 things to check before renewal" recap reels | 24 |
| Stick-figure Explainer (`stick-explainer`) | People and comparisons on a system line: co-signers, who qualifies, before/after | 60 native, render 30 |
| Isometric People Scene (`isometric-picture-book`) | An everyday rule shown in one real place: mortgage insurance, closing day | 30 fps; used: mortgage-insurance |
| Isometric Infographic (`iso-infographic`) | A system diagram that opens up: how a HELOC or a renewal works inside | people on 12 fps |
| Pictogram Motion (`pictogram-motion`) | Explainers told through signs and objects, beat-locked: rules, steps, public programmes (FHSA) | 24 |
| Instruction Manual Art (`instruction-manual`) | Step-by-step guides with do/don't boxes: documents to gather, renewal steps | 30 fps |
| Mid-century Cartoon (`midcentury-toon`) | Calm "follow along" how-to with a narrator: rules cards, checklists | 24, on twos; used: heloc-piggy-bank |
| Tablet Sketch Explainer (`ipad-sketch`) | Friendly how-to sketched live: first-time buyer basics, lifestyle money tips | 24 |
| Engineering Briefing Board (`briefing-board`) | Option comparisons on a real whiteboard wall: fixed vs variable, refinance vs HELOC | 24 |
| Data Storytelling (`dataviz`) | Real data drawn mark by mark with notes: prime-rate history, BoC decisions (needs sourced data) | 24 |
| Data Physicalization (`data-physical`) | Statistics as stacked real objects shot like product photos (needs published stats; slow 3D) | 24, 3D |
| Spreadsheet Film (`spreadsheet`) | "I ran the numbers" inside one sheet; only if cells are enlarged for a phone | 24; tagged "Finance & costs" |
| Pop Art (`pop-art`) | One-number punches and small data stories as screen-print posters | 24 |
| Halftone Dossier (`halftone-dossier`) | A "case file" read one exhibit at a time: a costly mistake, a renewal letter | 30 fps |
| Caption News (`caption-news`) | Sound-off news shorts: huge captions over footage/documents for BoC days and policy changes | 30; vertical layout given in STYLE.md |
| Broadcast News Package (`news-package`) | Rate-day round-ups, market bulletins with split-flap boards; works around client footage | used: portfolio-failing (Jordan Lee) |
| Transit Map (`transit-map`) | A journey drawn as a metro line: pre-approval → offer → keys, the renewal route | 30 fps |
| Tilt-Shift Miniature (`tilt-shift`) | A real-looking town as a model: local market and neighbourhood angles | 3D |
| Brick Toy (`brick-toy`) | Physical stakes you can see: a mortgage "built brick by brick", a wrecking-ball refinance | 24, 3D, slow; used: keep-your-rate |
| Blob Simulation (`pip-simulation`) | A computed simulation with crowds of Pips: rate shocks across many households, queues | 24 |
| Vintage Engraving Collage (`vintage-collage`) | Magazine-style explainers and broker origin stories from cut-out engravings | 30 in our build |
| Rhythm Game Show (`game-show`) | Year-in-review and timelines on a beat: "2026 in rate moves" | – |
| Tabletop App Flythrough (`desktop-flythrough`) | A workflow from card to card: the path of a mortgage application's documents | 30 fps |
