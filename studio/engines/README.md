# Studio engines

One adapter per render engine. The director picks the engine from the table below (or the one the chosen concept names), reads that adapter top to bottom, and follows it literally: every command is absolute-pathed and writes only into `$R/jobs/<id>/project` (work) and `$R/jobs/<id>/out` (deliverables). `$R/engines/` (stills, motion, films, face-reels, including the fetched `engines/face-reels/vendor/`) and `$R/playbook/` are never edited (a guard hook enforces it); engines that write into their own folder are run from a per-job shadow copy (`bin/shadow.sh` → `$P/engines/{stills,motion}`). The only engine paths a job writes into are the face-reels reel folders `engines/face-reels/clients/<slug>/reels/` and `engines/face-reels/inbox/` (gitignored client data; see `face-reels.md`). Install everything on a fresh clone with `sh $R/setup.sh` (`--no-engines` skips the films voice/music packs and the face-reels engines and models); `sh $R/studio/tools/doctor.sh` checks the result.

**Add a new engine = install it + write one adapter in this folder with the SPEC sections** (Best for · Formats and sizes · Inputs it needs · Setup check · Run · Branding · Outputs to collect · Time and usage · Built-in QA vs what Studio's gate adds · Pitfalls · Picking a style against the client's history).

## Routing

| Format | Default engine | Alternatives | Notes |
|---|---|---|---|
| Graphic reel (30–60 s, narrated) | `films.md` | `hyperframes.md` (fast kinetic type) · `motion.md` (≤ 15 s loop) | house look; 98 styles; original score |
| Short reel / trial reel (6–15 s, one number) | `motion.md` | `hyperframes.md` · `films.md` | `byClient` variants per account |
| Carousel (8–10 slides) | `stills.md` | `custom-html.md` (hero / no style fits) · `hyperframes.md` (animated slides) | footer band under every slide |
| Static (single post) | `stills.md` | `custom-html.md` | |
| Reel / story cover | the engine that made the reel (`poster.jpg`) | `stills.md --format story` (matching still style) | headline in y 240–1680 |
| GIF | `motion.md --gif` | `hyperframes.md --format gif` | 540 px, 15 fps |
| Story (9:16) | `stills.md --format story` (still) / `motion.md` (loop) | `hyperframes.md` | text in y 270–1248 |
| Footage reel (client on camera) | `face-reels.md` | `hyperframes.md` (`/embedded-captions`, `/talking-head-recut`) · `films.md` (news-package around footage) | keep every spoken word |
| Captions only on client footage | `hyperframes.md` (`/embedded-captions`) | `face-reels.md` | |
| Overlay for client footage | `motion.md --alpha` | `hyperframes.md --format mov` | ProRes 4444 / transparent |
| Anything in Remotion | `remotion.md` | – | **OFF** until the user confirms a licence |
| Voice, music, loudness (all engines) | `voice-music.md` | – | Kokoro default; ElevenLabs only with a yes |

## Time estimates (agent time + render, per piece)

| Engine | Typical | Render alone (measured 19 Nov 2026 unless marked) |
|---|---|---|
| films | half a day to a day per 45–60 s reel (2D); longer for 3D | 2D: 1,605 frames 1080×1920 in 19 s (heloc-five-years); 3D: UNVERIFIED |
| stills | 30–60 min per carousel (copy + human pass) | 5–11 s per format per client |
| custom-html | 1–3 h per premium carousel | ≈ 1 s per slide |
| motion | 20–40 min data file + review | draft 15 s loop 27.9 s; final ≈ 95 s; object-3d ≈ 5 min (DECISION.md) |
| hyperframes | 1–2 h kinetic reel; ≈ 1 h captions on footage | 4 s draft in 17 s wall time |
| face-reels | 2–4 h per reel (single take); more for multi-take | UNVERIFIED (pipeline not yet run end to end) |
| remotion | – (off) | – |

## Shared helpers (`bin/`, all tested 19 Nov 2026)

| Script | Does |
|---|---|
| `bin/shadow.sh <project>` | private writable copy of `$R/engines/stills` + `motion` at `<project>/engines/{stills,motion}` (each `node_modules` symlinked read-only to the engine's own; no `out/` or `.venv`) |
| `bin/kit_tokens.py <kit dir> <shadow stills>` | writes the client's compliance, accent and photo from `kit.json` into the shadow tokens; prints the `--client` id |
| `bin/footer_compose.py <square renders> <footer.png> <out>` | 1:1 slides + the kit footer → 1080×1350 feed posts |
| `bin/deliver.sh <master.mp4> <out.mp4>` | PLAYBOOK delivery: H.264 yuv420p BT.709 30 fps, AAC 128k **CBR** 48 kHz (AudioToolbox `aac_at`; ffmpeg's native `aac` is ABR and measured 131-132 kbps), −14 LUFS, TP < −1 dBTP, faststart; exit 1 if it misses |
| `bin/custom_html_skeleton.mjs` | starting `build.mjs` for `custom-html` (footer + compliance + safe-box check; playwright-core and sharp from `$R/studio/lib`) |

## House rules every adapter applies

- `$R/playbook/PLAYBOOK.md`: safe zone x 65–1015 / y 270–1248, frame-1 hook, no end card unless the client's kit says otherwise, delivery spec H.264 yuv420p BT.709 30 fps AAC 128k, −14 LUFS, cover poster 1080×1920 with the headline in the centre 3:4 band.
- Branding default: every piece carries the client's footer/logo and compliance line from `kits/<slug>/kit.json`. Statics: the 1080-px footer image at the bottom. Reels: the compliance line inside the safe zone on the payoff beat and in caption lines 1–2; the footer/outro image only where a kit rule asks.
- Client facts come only from the kit. Missing facts stay visible placeholders; the piece is then a proof.
- AI-voice label line in every delivery that uses TTS (`voice-music.md`).
- Nothing leaves the machine without a yes: no ElevenLabs generation, Gemini frame checks, HyperFrames feedback/cloud, or paid generation (Higgsfield/Magnific) unless the user approves.
