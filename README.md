# Studio

Studio turns a one-line brief into a finished, on-brand Instagram piece for a client: a graphic reel, a carousel or static, a cover, a story, a GIF, or a reel cut from the client's own footage. A team of Claude Code agents does the work, with two approval gates for a person. Studio learns from every approval, note and edit.

```
/create carousel for Sam Rivera about renewing in 2027
```

That brief goes through strategist → **Gate 1** (you pick one of 3 concepts) → checker → director → critic → **Gate 2** (you approve the final) → librarian. You get numbered slides or an MP4, a cover, a caption and an .srt in `jobs/<id>/out/`. Studio never posts anything.

## What's inside

| Folder | What it is |
|---|---|
| `.claude/` | The bot: agents (strategist, checker, director, critic, librarian), the skills `/create`, `/desk`, `/radar`, `films`, `stills`, `face-reels`, and the safety guard hook |
| `studio/` | The machinery: job state (`tools/job.mjs`), QA gate (`tools/qa/`), learning loop (`tools/learn.mjs`), engine adapters (`engines/*.md`), critic rubric, evals and scorecard, the Desk (visual control room), radar (competitor research through official APIs) |
| `engines/films` | **Studio Films**: 98 film styles made entirely in code (graphic reels) |
| `engines/stills` | **Studio Stills**: code-rendered carousel, static and cover styles |
| `engines/motion` | Short motion templates (hooks, GIFs) |
| `engines/face-reels` | Reels cut from a client's own footage (captions, grade, b-roll) |
| `playbook/` | House rules every piece follows (hooks, pacing, compliance, banned AI phrases) |
| `examples/` | One fictional client (Sam Rivera, Northline Mortgages), so a fresh clone runs end to end |
| `private/` | Your client data: the private `studio-clients` repo, cloned here (not part of this repo) |

How it all fits together, and how it learns: [ARCHITECTURE.md](ARCHITECTURE.md).

## Setup (macOS)

You need [Homebrew](https://brew.sh) and [Claude Code](https://claude.com/claude-code) (a Claude subscription or API access).

```sh
git clone https://github.com/Ankush-Jha/studio.git
cd studio
brew bundle --file=Brewfile          # node 25, uv, ffmpeg, tesseract, whisper-cpp, git, gh

# Agency team only: plug in the real client data (needs access to the private repo)
git clone https://github.com/Ankush-Jha/studio-clients.git private

sh setup.sh                          # Python + Node deps, engines, voice and music packs (~2 GB), then the doctor
```

Without `private/`, setup copies the example client into place and everything still works.

Setup finishes with `sh studio/tools/doctor.sh`, which checks this laptop against the pinned setup (Node and Python versions, Python packages, engines, client data, guard hook). Run it any time something seems off.

Keys are optional; only `/radar` needs them. Copy `studio/.env.example` to `studio/.env` and follow `studio/radar/SETUP.md` for the YouTube Data API key and the Instagram Business Discovery token.

## Use

Open Claude Code in the repo folder (`claude`), then:

- `/create <brief>`: make a piece, for example `/create graphic reel for Northline on fixed vs variable at renewal, 40 s`.
- `/create status`, `/create resume <job-id>`
- `/create learn`: turn your edits and notes into proposed lessons. `/create lessons` accepts them.
- `/desk`: the visual control room at http://127.0.0.1:4747 (jobs, gates, library, radar wall, clients, scorecard).
- `/radar`: refresh competitor and client-account posts (official APIs and RSS only).

Add a client: put their details in `private/clients.json`, their photo, logo and footer in `private/assets/<slug>/`, an optional standing brief in `private/assets/<slug>/profile.md` (see `examples/assets/northline-mortgages/profile.md`), and their kit in `private/kits/<slug>/` (copy the example kit).

## Keeping a track record (team)

Two repos, committed separately:

- **`studio` (this repo, public):** the process. Change it when you improve an agent, the rubric, the playbook or an engine.
- **`studio-clients` (private, in `private/`):** client data plus the track record of every job (brief, concepts, script, checks, QA, critique, captions), the library, feedback, edits and lessons.

After a session:

```sh
git -C private add -A && git -C private commit -m "jobs + lessons $(date +%F)" && git -C private push
git add -A && git commit -m "..." && git push      # only if you changed the process
```

Everyone else then runs `git pull && git -C private pull` and gets the same bot, the same clients and everything it has learned.

## Rules the bot keeps

- It never posts or uploads, and never scrapes Instagram, Facebook, LinkedIn, TikTok, Threads, X or Reddit.
- It never invents client facts. Ontario pieces carry the brokerage name and licence number, or stay PROOF.
- `engines/`, `playbook/`, `assets/` and `clients.*` are read-only for the bot (a guard hook enforces it). `assets/<slug>/profile.md` is the exception.

## Credits and licence

Studio Films is adapted from [Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar) by Lemomo (LemoLab). Its code is MIT, its docs are CC BY-NC 4.0, and the films you make are yours. Details are in [engines/films/NOTICE.md](engines/films/NOTICE.md). Fonts and vendored libraries keep their own licences, in the folders next to them.
