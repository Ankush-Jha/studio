# Notice

Studio Films is adapted from Lemo-Opuscar by Lemomo (LemoLab), https://github.com/lemomo-ai/lemo-opuscar. Code: MIT. Docs and prompts: CC BY-NC 4.0 (https://creativecommons.org/licenses/by-nc/4.0/) with the additional permission in LICENSE for making your own and client films. Changed: renamed, rebranded, trimmed and adapted for Studio.

Adapted from upstream commit `00a7f9ec99c8686265a8ca4ed9a3fdaaf27ea6f4` (Lemo-Opuscar 2.0.0).

## Contributed styles

- Memphis Diorama by EianLu, in Lemo-Opuscar by Lemomo (LemoLab) (`styles/memphis-diorama/`).
- Crayon World 3D by 2nd1st, in Lemo-Opuscar by Lemomo (LemoLab) (`styles/crayon-world/`).

## What you may and may not do

Films you make with this toolkit are yours, commercial and client films included, and need no credit (third-party material you put in them, such as CC BY samples, keeps its own terms).
Don't sell the docs and prompts, or redistribute them (whole, in part or adapted) in a commercial product or service, without a commercial licence from Lemomo (lemomo.studio@gmail.com); keep this notice when you share the repo.

## Licences

- `LICENSE` says which licence applies to which file; `REUSE.toml` says the same file by file; the full texts are in `LICENSES/`. These three are kept exactly as published upstream.
- Code (`core/`, `tools/`, `setup.sh`, each demo's code, data and configuration): MIT, `LICENSES/MIT.txt`. The copyright and permission notice stay with it.
- Docs (every `*.md`) and the image-generation prompts (`styles/*/demo/prompts/`, `styles/manga-panels/demo/tools/style_suffix.txt`, `styles/comic-history/demo/tools/sheets.json`): CC BY-NC 4.0, `LICENSES/CC-BY-NC-4.0.txt`, plus the additional permission in `LICENSE`.
- Demo subtitles, posters and stills (`styles/*/*.srt`, `styles/*/poster.jpg`, `styles/*/demo/stills/`): CC BY 4.0, `LICENSES/CC-BY-4.0.txt`.
- Third-party material (fonts, samples, models, textures, data, footage, bundled libraries) keeps its own licence: each demo's `CREDITS` and `REUSE.toml` name it. The sample libraries, HDRIs and the Kokoro voice model are downloaded from the upstream project's `assets` release by `tools/fetch.sh` (their sources and licences: `core/audio/INSTRUMENTS.md`, `core/assets/polyhaven/SOURCES.md`).

## What was left out

- Material that carries no licence upstream: everything that shows Clawd (Anthropic's character) or redraws third-party product interfaces and marks (`LicenseRef-Clawd`, `LicenseRef-ThirdPartyMarks` in `REUSE.toml`). The Mascot Screencast style (`styles/living-screencast/`) is removed whole, because its demo cannot run without those files. `REUSE.toml` and `LICENSE` still mention these paths; they are not in this copy.
- The upstream project's plugin, gallery site (`styleboard/`), README pictures (`docs/`), Chinese README, maintainer guide and release, publishing and directory tools.
- No demo films ship here. The six narration tracks that `LICENSE` excludes from any licence are not included.
