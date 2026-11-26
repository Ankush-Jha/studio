# Engine: face-reels (talking-head footage reels)

Footage reels are made by the face-reels engine at `$R/engines/face-reels` (its `CLAUDE.md` five rules and pipeline, the `face-reels` skill, the ghost-editor engine that `setup.sh` clones into `vendor/`). Studio's director follows that pipeline with absolute paths, keeps the reel folder **inside `$A/clients/<slug>/reels/`** (gitignored client data; with `$A/inbox/` the only paths under engines/ the guard hook lets Studio's file tools write. The client files one level up, `$A/clients/<slug>/*.json`, are outside that exception: if step 0 is refused, stop and ask the user), then copies deliverables to the job. Read `$A/CLAUDE.md`, `$A/README.md`, `$R/.claude/skills/face-reels/SKILL.md`, `$A/references/design-quality.md`, `$A/references/element-families.md` and `$S/SKILL.md` (ghost-editor; sections 1–8) before planning.

```sh
R=$(git rev-parse --show-toplevel)
A=$R/engines/face-reels
S=$A/vendor/ghost-editor
MPY=$A/.venv-media/bin/python                     # numpy, OpenCV, MediaPipe, Pillow, Playwright, openai-whisper (made by setup.sh)
export MEDIA_PY=$MPY                              # ghost-editor's doctor.sh and scripts read it
J=$R/jobs/<id>; O=$J/out
SLUG=<client slug>                                # the face-reels client folder uses the same slug
RP=$A/clients/$SLUG/reels/<YYYY-MM-DD>_<short-name>   # the reel folder ($P in ghost-editor's docs)
```

## Best for

- The client's own phone footage (talking head, interview, podcast clip) cut into a 1080×1920 reel: pauses removed, captions off the face, designed cards/props in one built world, soft foley, the voice dominant.
- Re-cuts of a client's long video into reels.
- Not for: graphic-reel pieces without footage (`films.md`), plain captions only with no design (`hyperframes.md` `/embedded-captions` is lighter).

## Formats and sizes

1080×1920, 30 fps (ghost-editor `prep.sh` conforms the source). Previews 720×1280 (~4.5 Mbit/s); final from `finals.py render` (H.264 High@4.2, BT.709, CRF 16 capped at 20 Mbit/s, AAC **256k**), then Studio's `deliver.sh` for AAC 128k and −14 LUFS / TP < −1 dBTP. Captions ≥ 48 px, ≥ 3:1 (ghost-editor QA); text inside x 65–1015, y 270–1248.

## Inputs it needs

- Raw footage: absolute path(s) the user gave (or `$A/inbox/`). Footage rights: the client's own recording; ask if unclear.
- The script, if there is one (take selection uses it).
- Kit: `$R/kits/$SLUG/kit.json` (people, agent, brokerage, `complianceLine`, `rules`, `assets.photo` as the face reference, `assets.logos`, `assets.footer`, contact), `tokens.json`, `voice.md`.

## Setup check (exact command)

```sh
test -d "$S" && test -d "$A/tools/models" && test -x "$MPY" && bash "$S/scripts/doctor.sh"
```

On a fresh clone `vendor/`, `tools/models/` and `.venv-media/` do not exist (gitignored, fetched by setup): the first `test` fails. Then stop and ask the user to run `bash $R/engines/face-reels/setup.sh` (about 1 GB: reviewed third-party engines at pinned commits, model weights, the media venv; `--heavy` adds ghost-editor's matte, audio-QA, Mixkit library and pinned HyperFrames, about 4.5 GB more; details in `$A/tools/SETUP.md`). `sh $R/setup.sh` runs it too. Don't run it yourself mid-job. Report anything doctor flags; don't improvise around it. UNVERIFIED: the engine has not been run end to end on a real sample (`$A/tools/SETUP.md`).

## Run (exact commands)

### 0. Client folder (only if missing, only kit facts)

```sh
test -d "$A/clients/$SLUG" || python3 "$A/tools/new_client.py" "$SLUG" "<kit.json name>"
```

`new_client.py` copies `$A/client-template/` to `$A/clients/$SLUG/` and refuses to overwrite an existing folder. To dry-run without a real client: `cp -R "$A/examples/clients/northline-mortgages" "$A/clients/"` (fictional; its compliance placeholders fail the check on purpose). Then fill the new client's files **only with facts from `kit.json`** (never from memory, never invented):

| face-reels client file / field | from kit.json |
|---|---|
| `client.json` `display_name`, `people[].name`, `people[].role` (= `agent.title`), `people[].licence_no` (= `agent.licence`), `company.legal_name` (= `brokerage.name`), `company.brokerage_licence_no` (= `brokerage.licence`), `company.jurisdiction` (= `province`), `website`/`phone`/`email` (= `contact`), `languages` | the same fields |
| `compliance.json` `require_all_strings` | the brokerage name, the brokerage licence and the agent licence strings exactly as in `complianceLine` |
| `compliance.json` `require_disclaimer` | `complianceLine` (verbatim) unless the kit has a separate disclaimer rule |
| `compliance.json` `regulator` | only if a kit rule or provenance names it; otherwise leave `""` and ask |
| `brand/brand.json` colours, fonts, logo paths | `tokens.json` + `assets.logos` (copy the logo files into `$A/clients/$SLUG/brand/`) |
| `assets/people/<name>.jpg` | `assets.photo` (copy) |
| `needs_confirmation` | every kit `missing` and `flags` entry |

Missing values stay as the template text, which makes `compliance_check.py` fail: that is correct (face-reels rule 2: no final render until compliance is real). Existing clients: read their files and do not overwrite them; report differences from the kit as `needs_confirmation`.

### 1. Reel folder and ingest

```sh
mkdir -p "$RP"/{raw,build,broll,out} && cp "<raw clip>" "$RP/raw/"
bash "$S/scripts/prep.sh" "$RP/raw/<clip>" "$RP"                       # -> $RP/assets/talk.mp4, 1080x1920 30 fps, voice -16 LUFS
ffmpeg -nostdin -v error -i "$RP/assets/talk.mp4" -vf "fps=1/10,scale=216:384,tile=6x3" -frames:v 1 -update 1 "$RP/build/sheet.jpg"
```

Look at the sheet; confirm the person against `$A/clients/$SLUG/assets/people/` (ask on any doubt).

### 2. Transcribe, face, takes

```sh
python3 "$S/scripts/transcribe.py" "$RP/assets/talk.mp4" --out "$RP/build/words.whisper.json" --backend whisper --lang en   # openai-whisper in .venv-media; --backend mlx if mlx-whisper is installed
"$MPY" "$S/scripts/face_track.py" "$RP/assets/talk.mp4" --out "$RP/build/face.json"
python3 "$S/scripts/autocut.py" "$RP/assets/talk.mp4" --noise -30        # single clean take: cuts pauses, keeps every word
```

Multi-take scripted recordings: the raw-cut tools in `$S/references/take-selection.md` (`rawcut_prep.sh` → `vad_pauses.py` → `islands_tx.py` → `takes.py` → `plan_cut.py` → `subcheck.py` → `assemble.py --plan` → `voice_smooth.py --plan` → `qa_cut.py`). Noisy audio: `bash "$S/scripts/denoise.sh" "$RP/assets/talk.mp4" "$RP/build/voice-clean.wav"` (DeepFilterNet3, capped 20 dB); band-limited audio: `voice_enhance.py IN OUT.wav --mode superres`.

**User rule, the client's own voice:** keep every spoken word of the chosen take. Only shorten pauses (PLAYBOOK: cut pauses over 0.3 s; ghost-editor keeps ~0.2 s of breath between sentences) and clean the audio (denoise, enhance, loudness). No re-ordering of words, no cutting sentences, no TTS patch-ins, no "fixing" what they said. Choosing between full retakes of the same sentence is allowed (that is take selection, not word removal); a false start inside a take is kept unless the user says to remove it.

### 3. Beat sheet → user

Write the beat sheet (`$A/references/element-families.md`: 3+ families, none back-to-back) into `$RP/build/beats.md` and copy it to `$J/project/beats.md` for the Desk. Gate 1 in Studio is this beat sheet (with a frame or two from `hf.sh snapshot`).

### 4. Build, approval sheet

```sh
node "$S/scripts/build.mjs" "$RP"                                        # -> $RP/index.html + SFX table + warnings
python3 "$S/scripts/approval_sheet.py" "$RP"                            # build/approval.html: lint, frames at every cut/beat
```

Fix every warning. B-roll: made in code, the client's own footage, or (per `$S/SKILL.md`) Pexels/Wikimedia stock, people-checked; the Studio rule "no stock of people" and the PLAYBOOK "real or licensed photos for any person" apply. **No paid generation:** never call Higgsfield/Magnific (or any paid generator) without the user's explicit yes to that specific spend after a `simulate_cost` check (face-reels rule 4). Gemini steps (B-roll vision checks, `gem_audit.py`, `reference_study.py`) send frames to Google: only with the user's OK.

### 5. Preview, final, QA

```sh
F="python3 $S/scripts/finals.py"; RR="--out $RP/finals --code <code> --style '<style name>' --title '<Short English title>'"
eval $F preview "$RP" $RR       # 720x1280 preview -> Studio Gate 2 (WAIT for the user's OK)
eval $F render  "$RP" $RR       # delivery master
eval $F qa      "$RP" $RR       # render_report.py + broll_qa.py
python3 "$A/tools/compliance_check.py" "$SLUG" "$RP/build"            # reels built with the engine's own overlay tools: run tools/onscreen_text.py first and pass build/onscreen_text.txt
python3 "$S/scripts/qa.py" "$RP" "$RP/build/reel.mp4"
```

Run long renders as tracked background jobs (a HyperFrames render cancels itself when its parent shell exits) and with a timeout/watchdog (ffmpeg 9 can deadlock with B-roll + PNG-sequence overlays in one graph: render in two passes; `-nostdin`). At most 3 fix rounds.

### 6. Deliver into the job

```sh
sh $R/studio/engines/bin/deliver.sh "$RP/finals/<code> - <style name>.mp4" "$O/<name>.mp4"
ffmpeg -nostdin -v error -y -i "$O/<name>.mp4" -frames:v 1 -q:v 2 "$O/poster.jpg"
cp "$RP/build/contact.jpg" "$J/qa/contact.jpg" 2>/dev/null; cp "$RP/finals/"*.qa.json "$J/qa/" 2>/dev/null
```

Do not use `finals.py deliver` (it moves files into a content library with trackers); Studio collects into `$O`. Close out in face-reels: append to `$A/clients/$SLUG/learnings.md`, list open confirmations in `client.json`.

## Branding

- The face-reels compliance gate wants the `require_disclaimer` text on screen with `min_end_card_seconds` (3 s). Studio default: no end card unless the kit says so, so put the compliance line inside the safe zone on the **payoff/closing beat**, held ≥ 3 s, ≥ 24 px (`min_disclaimer_px_at_1080w`), and in caption lines 1–2. That satisfies `compliance_check.py` (it checks the source text) without an outro card.
- Footer/outro image: only where a kit rule asks (e.g. "always use the outro for reels"): then it is the end card.
- Logo, colours, fonts: from `brand/brand.json` (filled from the kit); never another client's assets (face-reels rule 1).
- Nothing on screen the speaker did not say; charts without client data say ILLUSTRATION.

## Outputs to collect

| File | kind |
|---|---|
| `$O/<name>.mp4` (after `deliver.sh`) | video |
| `$O/poster.jpg` (frame 1; check the headline sits in the 3:4 band, else pick another frame) | cover |
| `$O/caption.md` (search phrase line 1, compliance line in lines 1–2, ≤ 5 hashtags; "voice is the client's own", so no AI label unless TTS was added) | caption |
| `$J/qa/contact.jpg`, `$J/qa/*.qa.json` | contact / qa |

The reel folder stays at `$RP` (the source of truth for re-cuts). Card: `engine: "face-reels"`, `format: "footage-reel"`, `style: "<ghost-editor style>"`, `voice: "client"`.

## Time and usage

- 2–4 h of agent time per reel for a single clean take, more for multi-take raw cuts; renders a few minutes each (HyperFrames inside ghost-editor). UNVERIFIED: no end-to-end timing on file.
- Free locally. Paid: Higgsfield/Magnific (only with a yes); Gemini (free tier key exists; frames leave the machine).

## Built-in QA vs what Studio's gate adds

Built in: `compliance_check.py` (required strings, disclaimer, forbidden words, unfilled template), `approval_sheet.py` (lint, taste checks, frames at every cut), `finals.py qa` → `render_report.py` (streams, A/V alignment, loudness, black/frozen frames, silences inside speech, caption safe area, first 1.5 s, SFX levels) + `broll_qa.py` (budgets, grade, captions ≥ 48 px/3:1 via OCR, nothing over a face), `qa.py` (SFX stem vs voice).

Studio adds: `deliver.sh` (AAC 128k, −14 LUFS, TP < −1 dBTP; ghost-editor targets −16 in QA), the word-keeping check (re-transcribe the final and diff against the take transcript: no spoken word missing), PLAYBOOK hook and safe zone, compliance line vs kit, critic rubric.

## Pitfalls

- Creating the client from memory or the sheet instead of `kit.json`; overwriting an existing client folder (`new_client.py` refuses, keep it that way).
- `prep.sh` normalises the voice to −16 LUFS for the SFX levels; the −14 LUFS target is applied at delivery, not before.
- `finals.py render` output carries AAC 256k: always run `deliver.sh`.
- Mixkit music beds are in the library; Studio's music policy is an original score (`voice-music.md`), so use Mixkit SFX only and ask before using a Mixkit music bed.
- Noncommercial vendored repos (onetake, SeeCut, Agent Motion): ideas only, never code in client work.
- Don't `git pull` vendored engines (`setup.sh` pins reviewed commits, `$A/docs/VENDOR.md`); don't run installers not listed in `$A/tools/SETUP.md`.

## Picking a style against the client's history

ghost-editor styles live in `$S/styles/` and `$S/references/styles.md` (plus saved styles via `save_style.py`). Check `$R/kits/$SLUG/history.json`, the client's `learnings.md` and `$R/studio/.venv/bin/python $R/studio/tools/variety.py --client $SLUG --engine face-reels` (its style suggestions are films styles; use only its conflicts and the client's recent pieces here). Don't repeat the last reel's style or element families back to back; keep the caption position constant across the client's series.

## Status (26 Nov 2026, new repository layout)

In the repo (`$A`): `CLAUDE.md`, `README.md`, `setup.sh`, `client-template/`, `examples/clients/northline-mortgages/` (fictional), `templates/overlay-starter.html`, `tools/` (`new_client.py`, `compliance_check.py`, `onscreen_text.py`, `plan_cut.py`, `build_base.py`, `face_data.py`, `render_overlay.py`, `mix_sound.py`, `compose.py`, `SETUP.md`…), `references/`, `library/`, `docs/VENDOR.md`. Not in git, created by `bash $A/setup.sh`: `vendor/` (ghost-editor and the other reviewed engines), `tools/models/` (`ggml-small.en-q5_1.bin`, `face_landmarker.task`, selfie segmenters), `.venv-media/` (numpy, OpenCV, MediaPipe, SciPy, Pillow, Playwright + Chromium, openai-whisper), `.claude/skills/` links, and `clients/`. On this checkout setup has not been run yet, so every `$S/...` command above is UNVERIFIED on the new layout.

Last doctor run on the old machine (19 Nov 2026): **20 ok, 2 missing**, neither on this adapter's path (Studio's gate and `hyperframes.md` captions use whisper.cpp, not ghost-editor's `whisper`):
- **ffmpeg libass** (also no `drawtext` filter): burned-in ASS/subtitle and `drawtext` paths fail. Use HyperFrames captions instead until fixed (`$A/tools/SETUP.md`: text is rendered in Chromium, so this does not matter for the engine's own tools).
- **`whisper` CLI** (openai-whisper): `setup.sh` now installs openai-whisper into `.venv-media`, which should clear it; re-check with doctor.

Warnings and optional (not blocking):
- x264 threads not pinned in 4 spots in the vendored `recipes/seoul-list/seoul.py` (lines 87, 241) and `scripts/open_pause.py` (163, 182): renders there give different bytes per Mac; harmless for delivery. Vendor code is never edited.
- Not set up by default: `ELEVENLABS_API_KEY` (only `tts_elevenlabs.py`), DeepFilterNet (`denoise.sh` installs on first use, needs python3.11 + uv), film-look LUTs, caption-metrics venv, memes pack, the `--heavy` extras (BiRefNet matte, audio-QA venv, Mixkit library, pinned HyperFrames).
- `GEMINI_API_KEY`: only with the user's OK (frames leave the machine).

Still UNVERIFIED: the pipeline has not been run end to end on a real clip, so "doctor ok" means the tools are installed, not that a reel renders.

Commands the user would run (each changes the machine, so say yes first):
```sh
bash $R/engines/face-reels/setup.sh                                         # core install (about 1 GB)
bash $R/engines/face-reels/setup.sh --heavy                                 # optional extras (about 4.5 GB more)
brew reinstall ffmpeg                      # only if ffmpeg will not start; for libass, if the tap build lacks it: brew install ffmpeg-full
bash $R/engines/face-reels/vendor/ghost-editor/scripts/setup_looks.sh      # only for look.film
bash $R/engines/face-reels/vendor/ghost-editor/scripts/setup_captions.sh   # only to add caption fonts
echo 'ELEVENLABS_API_KEY=...' >> $R/engines/face-reels/vendor/ghost-editor/.env   # only if explainer VO is wanted
MEDIA_PY=$R/engines/face-reels/.venv-media/bin/python bash $R/engines/face-reels/vendor/ghost-editor/scripts/doctor.sh   # re-run
```
Caution: `brew reinstall ffmpeg` replaces the ffmpeg Studio's `deliver.sh` relies on (`aac_at`, loudnorm, alimiter); re-run `deliver.sh` on one reel afterwards and check the audio is still 128 kbps CBR.
