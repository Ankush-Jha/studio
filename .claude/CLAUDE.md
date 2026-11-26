# Studio (agency creative bot)

This repository is Studio: the agency's bot that turns a one-line brief into finished, on-brand Instagram content for its clients (Canadian mortgage brokers plus a few financial clients).

- `/create <brief>` makes a piece (reel, carousel, static, cover, story, GIF, footage reel) through strategist → Gate 1 → checker → director → critic → Gate 2 → librarian. `/desk` opens the visual control room at http://127.0.0.1:4747. `/radar` refreshes competitor and client-account posts.
- Contract and folder layout: `studio/SPEC.md`. Engine adapters (how the bot drives each engine): `studio/engines/`. The engines themselves: `engines/films` (Studio Films, code-made graphic reels), `engines/stills` (Studio Stills, carousels/statics/covers), `engines/motion` (short motion templates), `engines/face-reels` (reels cut from client footage). House rules for every piece: `playbook/PLAYBOOK.md`.
- Setup on a new machine: `README.md` and `sh setup.sh` (Mac, after `brew bundle`); Windows runs inside WSL Ubuntu with `sh install-wsl.sh`. On Windows, footage reels need whisper.cpp built by hand (not covered yet).
- Client truth: `kits/<slug>/` (built from `clients.json`, the client sheet, client websites and `assets/` by `studio/tools/import/build_kits.py`, a one-time importer). Past work: `library/`. Jobs: `jobs/<id>/` (state only via `node studio/tools/job.mjs`).

Plain phrases (people using Studio may not know git or the terminal; the guide at https://ankush-jha.github.io/studio/guide.html tells them to say these). Explain what happened in one or two plain sentences, no command output:
- "get the latest" / "update Studio" → `git pull` in the repo and `git -C private pull`; if setup files changed (package-lock, requirements, setup.sh), run `sh setup.sh`.
- "save today's work" / "sync" → commit and push `private/` (jobs, lessons, client changes) with a dated message. Only commit the public repo if they changed the process and say so.
- "check my setup" / "something's wrong" → run `sh studio/tools/doctor.sh` and fix what it reports (run `sh setup.sh` for missing installs).
- "show me the styles" → point to the Film Directory, https://ankush-jha.github.io/studio/.
- "where are my files?" → the job's `out/` folder; open it: macOS `open jobs/<id>/out`, Windows (WSL) `explorer.exe "$(wslpath -w jobs/<id>/out)"`.
- "set up footage reels" → `bash engines/face-reels/setup.sh` (about 1 GB), then `sh studio/tools/doctor.sh`.
- "continue the <client> reel" → find that client's newest unfinished job (`node studio/tools/job.mjs list`) and `/create resume <id>`.

Rules:
- `engines/films|stills|motion`, `playbook/`, `assets/`, `clients.json|csv|jsonl` and `assets_manifest.csv` are read-only (a guard hook enforces it). One exception: `assets/<slug>/profile.md`, a hand-written standing brief per client that every agent reads first.
- This repo holds real client data (contact details, licence numbers, photos). Keep it private; never paste client data into outside services.
- Never post or upload anything. Never scrape Instagram, Facebook, LinkedIn, TikTok, Threads, X or Reddit; use official APIs with the user's keys and manual entries.
- Never invent client facts. Ontario pieces need the brokerage name + licence number. Assets marked "check" are used only after the user confirms them in the Desk.
- Budget: at most 2 subagents at once, one production at a time, Opus for creative work, Sonnet for checking, Haiku for filing.
