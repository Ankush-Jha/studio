# Studio face reels

A parent agent and toolchain for vertical talking-head reels (1080x1920) for many clients, each with their own brand, licences and compliance rules. The client films themselves; this engine cuts the take, adds face-aware captions and paper-collage graphics, mixes sound and gates compliance.

## Use it
1. Install once: `bash engines/face-reels/setup.sh` (system tools check, third-party engines at reviewed commits, model weights, media venv). Details and what is optional: `tools/SETUP.md`.
2. Open `engines/face-reels/` in Claude Code (`cd engines/face-reels && claude`) so `CLAUDE.md` loads, or use the `face-reels` skill from the repo root.
3. New client: `python3 tools/new_client.py <slug> "<Display Name>"`, then fill the files (the skill walks through it). To try the pipeline without a real client: `cp -R examples/clients/northline-mortgages clients/` (fictional; its compliance placeholders make the compliance check fail on purpose).
4. Give the agent a raw clip and the client. It creates `clients/<slug>/reels/<date>_<name>/{raw,build,broll,out}` and runs the pipeline in `CLAUDE.md`.

## Layout
- `CLAUDE.md`: the five rules, the pipeline, render safety, licences.
- `client-template/`: what every client folder starts from (client, brand, compliance, voice, people rules, learnings).
- `examples/clients/northline-mortgages/`: a fictional example client (Northline Mortgages, Sam Rivera, Toronto).
- `templates/overlay-starter.html`: the starter graphics layer (the `window.seek(t)` contract used by `tools/render_overlay.py`).
- `tools/`: `plan_cut.py`, `build_base.py`, `face_data.py`, `render_overlay.py`, `onscreen_text.py`, `mix_sound.py`, `compose.py`, `cutout_image.py`, `compliance_check.py`, `new_client.py`, setup scripts, `SETUP.md`.
- `references/`: `design-quality.md` (look-and-feel standard) and `element-families.md` (asset menu, beat-sheet rules).
- `library/`: CC0 paper/cardboard textures, Pexels object photos and cut-outs, OFL fonts, rough.js (MIT). Licences in `library/SOURCES.md`.
- `docs/VENDOR.md`: every third-party engine `setup.sh` clones, with commit, licence, size and review notes. `docs/design-skills-*`: the optional 95-repo skill collection.
- `index.md`, `findings.jsonl`, `FACE_REELS_research_appendix.md`: a survey of about 490 public video/motion repos (adopt / borrow / future / skip, licence, what to take).
- Gitignored, created locally: `clients/`, `vendor/`, `tools/models/`, `.venv-media/`, `.claude/skills/`.
