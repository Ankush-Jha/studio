---
name: films
description: Direct and produce a short film made entirely in code, in one of the styles of the Studio Films library (engines/films/; e.g. Impasto Oil Painting 油画厚涂, Watercolor Brush 水彩笔刷, Ukiyo-e 浮世绘, Swiss Motion Graphics, Satellite Briefing 卫星简报, Exploded Teardown 产品拆解). Use when the user asks for a video, film, short, promo, explainer or animation (视频、短片、动画、宣传片) in a named style, including explainers built from real material such as satellite imagery, laser scans, CAD files or archive scans, and new films cut from real archive footage and documents; when they want a film about their own topic and haven't chosen a style (help them choose); when they want to change a style into their own, make their own style from a blank page, or use a style they saved; when they start the skill without saying what they want; or when they ask which film styles there are. Not for plain editing, trimming or converting the user's existing video files.
---

# Studio Films

The styles, guides and tools live in the Studio Films library, `engines/films/` in this repository (adapted from Lemo-Opuscar; credits and licences in `engines/films/NOTICE.md`). This skill gets it ready and hands you over to it.

1. **Find the library.** It is `engines/films/` under the repository root (`git rev-parse --show-toplevel`). Run `sh engines/films/setup.sh` from the repository root. It lists any missing system tools (Node, ffmpeg, Python), which package tiers are installed, and prints `LIB=<absolute path>` on its last line. Use that path as `$LIB` from here on.
2. **Install the core tools early.** Start `sh "$LIB/setup.sh" deps` right away, in the background if you can: it takes a few minutes the first time (it skips what is already installed and downloads only missing sample libraries). Add `deps voice` or `deps music` later, only if the film needs them (`$LIB/TECHNIQUE.md` §1). Report missing system tools (Node, ffmpeg, Python) in your one round of questions; don't install system software yourself. A style marked ✦ also needs an image generator the user provides (`$LIB/AGENTS.md`, Workflow, Brief). Packages a style needs (its `STYLE.md` lists them) you install yourself, into the project folder.
3. **Follow the library.** Read `$LIB/AGENTS.md` and do what it says, starting with **Start** (the user's own styles in `~/studio-films-my-styles/`; when they started the skill without writing anything, the language question first, then the ways in): finding the style or making their own, the one round of questions, the treatment, production and delivery.

What changes in skill mode:

| | |
|---|---|
| Project folder | `<name>/` in the folder the user started from, or the folder the caller names (for a Studio job: the job's work folder under `jobs/<id>/`). Lowercase letters, digits, hyphens; avoid `#` and `?` in the path. Wherever the guides say `films/<name>/`, read this folder |
| Running tools | from `$LIB`, with the project's absolute path: `cd "$LIB" && node core/render/still.mjs "<project>" 1.5 3` |
| Library files in pages | absolute URLs: `/core/lib.js`, `/node_modules/three/…` (the project is served at `/@film/`) |
| Library files in scripts and `build.sh` | `$LIB/…`, with `LIB=<path>` at the top of `build.sh`; never `../..` |
| Demo source | already in the library: `sh "$LIB/setup.sh" demo <slug>` prints its folder. Read it only after your `TREATMENT.md` is written, to learn its techniques; it is not meant to be rendered for the user's film. An Edit & Documentary style is the exception: use the material tools its `STYLE.md` names in `demo/tools/` before the treatment (`$LIB/AGENTS.md`, "Treatment first") |
| Library folders | never write into `$LIB/styles/` or `$LIB/core/`; copy what you need into the project folder |

Deliver what `$LIB/DIRECTOR.md` §11 lists, in the project folder, and tell the user where it is. Never post or upload the film anywhere.
