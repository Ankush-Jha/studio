# Vendored engines: what `setup.sh` fetches

`vendor/` is not in the repo (about 10 GB on a full install). `setup.sh` clones each engine below at the exact commit that was reviewed. The first seven were security-scanned on 2026-11-12 (pipe-to-shell, eval/exec, credential and SSH access, keychain, persistence, unexpected hosts): nothing malicious, benign hits noted. The skill and motion kits after them were catalogued with `tools/catalog_skills.py` (licence + the same pattern scan) and are used as reference. **Do not move to another commit without re-reading the diff.**

## Core engines (cloned by `setup.sh`)
| Folder | Repo | Commit | Licence | Size | Notes from review |
|---|---|---|---|---|---|
| ghost-editor | kurbaitaev/ghost-editor | ce17272 | MIT | 179 MB | The main talking-head pipeline (prep, transcribe, face track, captions, B-roll, QA, HyperFrames). `osascript` is used only for macOS OCR of local frames (`ocr_text.js`); PyTorch `.eval()`; contacts Mixkit (sounds), Hugging Face (model weights), jsDelivr (JS libs), GitHub (Fluent emoji, MIT), and Google Gemini only if a key is set (frames leave the machine). Demo clips in the repo are watch-only. |
| claude-video-effects | Vibha-Ramprakash/claude-video-effects | a6c05c5 | MIT | 6 MB | No flagged patterns, no external hosts. Free starter of a paid studio. |
| papercut-explainer | 0xS4N4TG/papercut-explainer | ff8223a | MIT | 33 MB | No flagged patterns. Remotion library; 79 synthesised SFX and 8 music beds, no licences to clear. |
| paper-reel | haiderfarooq3/paper-reel | 9c5bc57 | MIT | 11 MB | No flagged patterns; needs whisper.cpp + Kokoro for voice. |
| gbro-collage-info | pyang5166/gbro-collage-info | 0b97a81 | MIT | 5 MB | No flagged patterns; HyperFrames-based halftone paper-collage skill. |
| motion-graphics | Barty-Bart/motion-graphics | 3d83d98 | MIT | 54 MB | One `eval()` of ffprobe's frame-rate fraction in `sound_pass.py` (low risk). |
| skills | anthropics/skills | 2c5958e | per skill (see repo) | 16 MB | Anthropic's public skills (frontend-design, canvas-design, theme-factory...). |

## Motion and design kits (cloned by `setup.sh`, reference)
| Folder | Repo | Commit | Licence | Size |
|---|---|---|---|---|
| gsap-skills | greensock/gsap-skills | aed9cfd | MIT | 0.4 MB |
| kinetic-typography-skills | iart-ai/kinetic-typography-skills | 2b79c81 | MIT | 7 MB |
| motion-kit | hughminhphan/motion-kit | 6173e5c | MIT | 10 MB |
| motion-video-kit | echris6/motion-video-kit | e4b1c00 | MIT | 0.4 MB |
| motionmaxxing | Tejashmakwana/motionmaxxing | 8c8ec0f | Apache-2.0 | 46 MB |
| MotionCraft | ahmdd4vd/MotionCraft | 8f48715 | MIT | 8 MB |
| 30x-video | norahe0304-art/30x-video | 51a6063 | MIT | 112 MB |

Studio Films (the film-style library, MIT) is part of this repo at `engines/films/`; it is not cloned.

## Optional: design-skills collection (`setup.sh --design-skills`, about 9.6 GB)
95 public design/motion skill repos listed in `design-skills-LIST.tsv` (catalogue with licence and scan flags: `design-skills-CATALOG.md`). The biggest are animation pipelines and studios with sample media (several 0.4-3.4 GB each). Reference and ideas only: nothing is linked as a skill or executed.

## Fetched into caches by the heavy installers (`setup.sh --heavy`)
BiRefNet person-matte weights (ZhengPeng7 on Hugging Face, about 2.4 GB, `~/.cache/ghost-matte`), ClearerVoice MossFormer2 weights (alibabasglab on Hugging Face, about 0.9 GB, `~/.cache/ghost-audioqa`), Mixkit SFX and music (about 60 MB, inside `vendor/ghost-editor/library`).

## Noncommercial: not vendored, ideas only
onetake (PolyForm Noncommercial), SeeCut (appears noncommercial), Agent Motion (noncommercial). Do not copy their code into client work.

## Installed outside this folder
HyperFrames (Apache-2.0) runs via `npx hyperframes@<pinned>` (version in `vendor/ghost-editor/scripts/HF_VERSION`). whisper.cpp and yt-dlp via Homebrew. The media venv is `engines/face-reels/.venv-media`; ghost-editor's own venvs go in `~/.venvs/`.
