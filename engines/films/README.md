# Studio Films

**98 film styles for your coding agent. Pick one, bring your story, and the agent makes the film, entirely in code.**

Studio Films is the film engine of Studio. Each style has a `styles/<slug>/STYLE.md` (what the style looks and sounds like) and a demo made in code (`DEMO.md` and `demo/`). An agent reads the guides, directs a film about your topic in that style, and renders it frame by frame: canvas and WebGL pages, original scores from free sample libraries, text-to-speech narration. No video generation, no stock footage.

Adapted from [Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar) by Lemomo (LemoLab); see [`NOTICE.md`](NOTICE.md) for credits, licences and what changed.

## Install

You need Node 20+, ffmpeg 7+ and Python 3.11+ (or [uv](https://docs.astral.sh/uv/)). From the Studio repo root:

```sh
sh engines/films/setup.sh deps          # core: npm packages, headless browser, .venv, sample libraries
sh engines/films/setup.sh deps voice    # + Kokoro TTS (offline English), edge-tts, Whisper voice check
sh engines/films/setup.sh deps music    # + numba, for plucked strings (pluck.py)
sh engines/films/setup.sh               # what's installed, what's missing; prints LIB=<path>
```

`setup.sh` works from any folder and any clone location. The sample libraries (about 1.4 GB), the HDRIs and the Kokoro model are not in git: `setup.sh deps` downloads the missing ones with `tools/fetch.sh` from the upstream project's asset release (`FILMS_FETCH=0` skips that).

## Make a film

In Claude Code, from the Studio repo, use the `films` skill (`.claude/skills/films/`), or just ask:

> Make a 45-second film in the **watercolor** style about the coffee farm my family runs. Warm female narrator.

Name the style in English or Chinese, or by its folder; the [style index](styles/README.md) lists them all. Other agents: point them at [`AGENTS.md`](AGENTS.md).

The agent asks you once, up front, about anything it can't decide (facts, your own voice, music or material, whether you want a storyboard first), then works through three guides:

| File | What it gives the agent |
|---|---|
| [`DIRECTOR.md`](DIRECTOR.md) | how to direct: story, sound, rhythm, camera, performance, self-checks |
| [`TECHNIQUE.md`](TECHNIQUE.md) | how to build: frame-by-frame rendering, voice, music, mixing |
| `styles/<style>/STYLE.md` | what the style looks and sounds like; the story is yours |

Tool commands and flags: [`core/README.md`](core/README.md). To change a style into your own or start one from a blank page: [`MY-STYLES.md`](MY-STYLES.md) (kept styles live in `~/studio-films-my-styles/`).

### Before you start

- A film takes an agent about 30–60 minutes and a fair amount of tokens.
- Three styles draw their characters with an image generator you bring (Manga Panels, Text Flash Cuts, Comic History Cartoon; marked ✦ in [the style list](styles/README.md)). Every other style works without one.
- Default output 1920×1080 at 24 fps; other sizes (1080×1920, 1080×1350 for Instagram) on request.
- The demo films themselves are not shipped here. To watch them, see the upstream gallery: https://lemomo-ai.github.io/lemo-opuscar/

## Folder layout

| Path | What |
|---|---|
| `AGENTS.md`, `CLAUDE.md` | instructions for agents (start here) |
| `DIRECTOR.md`, `TECHNIQUE.md`, `MY-STYLES.md` | the guides |
| `styles/<slug>/` | one style: `STYLE.md`, `DEMO.md`, `style.json`, `demo/` (code, `CREDITS`) |
| `core/` | shared tools: render, events, mux, TTS, speech check, sampler, sfx, fonts |
| `tools/fetch.sh`, `tools/assets.json` | downloads the big assets |
| `setup.sh` | install and status |
| `films/<name>/` | films you make inside the library (ignored by git) |

## Licence

[`LICENSE`](LICENSE) says which licence applies to which file; the full texts are in [`LICENSES/`](LICENSES), and [`REUSE.toml`](REUSE.toml) gives the same rules file by file. In short: code MIT; docs and prompts CC BY-NC 4.0 with an additional permission to use them for your own and client films; demo subtitles, posters and stills CC BY 4.0; third-party material keeps its own licence (each demo's `CREDITS`). Films you make are yours, commercial films included. Details and credits: [`NOTICE.md`](NOTICE.md).

You are responsible for the materials you use in your films.
