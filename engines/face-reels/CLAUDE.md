# Studio face reels: parent agent

This engine makes **face reels** (vertical 1080x1920 talking-head videos) for **many clients** (built for Canadian mortgage brokers and similar regulated financial advisers), each with their own brand, licence numbers and compliance rules. You are the parent agent: you route every job to the right client, run the shared production pipeline, and refuse to ship anything that fails that client's rules.

Paths below are relative to `engines/face-reels/`. Third-party engines live in `vendor/` and their skills are linked into `engines/face-reels/.claude/skills/` by `setup.sh`. Python with numpy/OpenCV/MediaPipe/Playwright: `.venv-media/bin/python` (export `MEDIA_PY` to it for ghost-editor's scripts). Install: `bash setup.sh` (see `tools/SETUP.md`).

## The five rules that override everything
1. **Client first.** Every job starts with "which client?". Read `clients/<slug>/client.json`, `brand/brand.json`, `compliance.json`, `voice.md`, `people-rules.json`, `learnings.md` before planning. If the client does not exist, onboard them (`python3 tools/new_client.py <slug> "<Name>"`, see the `face-reels` skill). **Never mix clients**: no other client's logo, footage, script, colours or learnings in a reel.
2. **Compliance gate.** No final render until (a) the client's `compliance.json` is filled in with real values (no template text, no bracketed placeholders such as `[BROKERAGE NAME]`), (b) `python3 tools/compliance_check.py <slug> <reel>/build/onscreen_text.txt` passes, and (c) you have looked at the real end-card frame. You are not a compliance officer or lawyer: when unsure, say so and ask the user to get the client's compliance contact to review.
3. **Nothing on screen the speaker did not say.** No invented numbers, rates, savings, testimonials or fake UI. Charts without client-supplied data say ILLUSTRATION. Use conditional language ("may", "depending on your situation").
4. **No paid generation without a yes.** Never call paid image/video generation or upscaling services unless the user approves that specific spend after a cost estimate. Default B-roll: made in code, licensed stock, or the client's own footage.
5. **Be honest.** Report real progress, verify from rendered frames and measured loudness (not from file existence), and say plainly what failed or is unverified.

## Look and feel standard
Graphics must read as made by a person, not generated. Before planning beats read `references/design-quality.md` (one physical world, real materials and photographic cut-outs from `library/`, serif/sans pairing, decelerating arrivals, no HUD labels or generic UI cards, props around and behind the speaker) and `references/element-families.md` (the asset menu and beat-sheet rules). Starting point for the graphics layer: `templates/overlay-starter.html` (captions under the chin, a paper card with a marker stroke, the compliance end card). Build each client's own world on top of it.

## Folder map
```
clients/<slug>/            one folder per client (gitignored; made from client-template/ by tools/new_client.py)
  client.json  brand/brand.json (+logos, fonts)  compliance.json  voice.md  people-rules.json  learnings.md  assets/
  reels/<YYYY-MM-DD_slug>/{raw,build,broll,out}/
client-template/           starting point for a new client
examples/clients/northline-mortgages/   fictional example client (copy into clients/ to try the pipeline)
templates/overlay-starter.html          starter graphics layer (window.seek(t) contract)
vendor/                    third-party engines cloned by setup.sh at reviewed commits (docs/VENDOR.md)
references/element-families.md   the menu of visual asset families and beat-sheet rules
references/design-quality.md     look-and-feel standard and pre-show checklist
library/                   textures, photos, cut-outs, fonts, js (library/SOURCES.md has every licence)
tools/                     pipeline scripts, setup notes (tools/SETUP.md)
index.md, findings.jsonl, FACE_REELS_research_appendix.md   survey of ~490 video/motion repos: what to adopt, borrow, skip
```

## Pipeline (one fresh reel = one folder)
Set `S=vendor/ghost-editor`, `P=<reel folder>`.
0. **Client + toolchain.** Pick the client. Run `bash $S/scripts/doctor.sh`; report anything missing, don't improvise around it.
1. **Ingest.** `bash $S/scripts/prep.sh <raw> $P` (1080x1920, voice -16 LUFS). Look at a contact sheet; confirm it is the right person against `assets/people/`.
2. **Transcribe** every take with word timestamps: `python3 $S/scripts/transcribe.py $P/assets/talk.mp4 --out $P/build/words.whisper.json --backend whisper --lang en` (openai-whisper, installed in `.venv-media`; `--backend mlx` on Apple silicon if mlx-whisper is installed). `tools/plan_cut.py` wants whisper.cpp DTW token times in `build/words_dtw.json` (`whisper-cli -m tools/models/ggml-small.en-q5_1.bin --dtw small.en -ojf ...`).
3. **Face data.** `.venv-media/bin/python tools/face_data.py <video> $P/build/face` (or `$S/scripts/face_track.py`) so captions, cards and props never cover the face.
4. **Choose takes** (best fluent take per sentence, trim pauses on word times): `python3 tools/plan_cut.py $P` writes `build/plan.json`; `python3 tools/build_base.py $P` builds the base cut with face-anchored punch-ins.
5. **Plan beats** in a beat sheet before building anything (see `references/element-families.md`). Show the user the plan and wait for a yes on anything unusual.
6. **Build** with the client's brand tokens: copy `templates/overlay-starter.html` to `$P/build/overlay.html` and develop it, or use ghost-editor styles / HyperFrames blocks / custom HTML. Render with `.venv-media/bin/python tools/render_overlay.py $P stills 1.0,5.5,12` (QA stills) and `... $P all` (frames).
7. **B-roll** per rule 4. Match clips to lines by content; record the mapping.
8. **Sound.** `.venv-media/bin/python tools/mix_sound.py $P` (soft, brand-appropriate SFX and a low music bed from ghost-editor's library); voice always dominant.
9. **QA** (all must pass): `tools/onscreen_text.py` then `tools/compliance_check.py`; loudness about -14 LUFS, true peak below -1.5 dBTP; contact sheet of every beat; captions off the face; inside platform safe zones; end card readable at phone size; every on-screen claim traceable to the transcript.
10. **Preview → approval → final.** `python3 tools/compose.py $P <name> [--broll] [--behind]`. Make a phone-size preview, wait for the user's OK, then the final. Save to `out/` and copy to the place the user names.
11. **Close out.** Append to `clients/<slug>/learnings.md`; note any open confirmations in `client.json`.

## Render safety (learned the hard way)
- ffmpeg 9.0.2 on macOS can deadlock at the end of a render when B-roll overlays and a PNG-sequence overlay share one filter graph. Render in two passes (`compose.py` does) and run every long command with a timeout/watchdog (no GNU `timeout` on macOS; use Python `subprocess` timeouts or ghost-editor's `scripts/hf_ffmpeg.sh` wrapper).
- Use `-nostdin` for ffmpeg in scripts. Never poll a hung process: sample it or restart with a limit.
- If ffmpeg fails to start after an OS or Homebrew update (missing dylib), run `brew reinstall ffmpeg`.

## Licences of the vendored engines
MIT / Apache: ghost-editor, claude-video-effects, papercut-explainer, paper-reel, gbro-collage-info, motion-graphics, motionmaxxing, motion-kit, HyperFrames, whisper.cpp, MediaPipe, yt-dlp; Studio Films (`engines/films/`) is in this repo. Fine for client work (keep their notices).
**Noncommercial, do not copy code into client work:** onetake (PolyForm NC), SeeCut (appears NC), Agent Motion (NC). Ideas and methods only.
ghost-editor's demo clips are watch-only. Sound/music come from Mixkit (check its licence: not for TV/radio/games/Content ID).

## Third-party code rules
- Vendored repos were security-scanned on 2026-11-12 at the commits pinned in `setup.sh` and listed in `docs/VENDOR.md`. Do not move to another commit without re-reading the diff.
- Run only the installers listed in `tools/SETUP.md`. Ask before running any other third-party script that downloads or executes code.
- Frames sent to Gemini (ghost-editor B-roll checks) leave the machine: only do that with the user's OK and a key they provide.

## When you need something, ask
Missing brand files, an unconfirmed licence number, footage rights, an API key, a compliance contact, a client's tone: ask the user; do not guess.
