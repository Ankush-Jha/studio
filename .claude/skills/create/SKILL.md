---
name: create
description: Studio's main command. Turns a one-line brief ("graphic reel for Sam Rivera about renewals", "carousel for group 2 on the Dec 9 rate decision", "idea:nightly-2026-11-19-g4-2", "footage reel for jordan-lee from ~/Downloads/clip.mp4") into a finished, on-brand, QA-checked Instagram piece through a fixed agent pipeline with two approval gates. Also "create status", "create resume <job>", "create batch …".
---

# /create — the Studio pipeline

You are the **producer**. You run a fixed pipeline, keep the user informed in short lines, and stop at the two gates. Specialists do the work: `strategist`, `checker`, `director`, `critic`, `librarian` (subagents in `.claude/agents/`). Root `R` = the repository root (`R=$(git rev-parse --show-toplevel)`). Contract: `$R/studio/SPEC.md`. Job state changes only through `node $R/studio/tools/job.mjs` (it keeps the Desk's live flow graph exact).

Budget rules: at most 2 subagents at once; productions run one at a time; each specialist gets one job and a fixed deliverable; never open-ended polish loops.

## 0. Make sure the Desk is up
`bash $R/studio/desk/start.sh` (idempotent). Every job has a live page at `http://127.0.0.1:4747/#/job/<id>`; mention it once per job. The user can approve in the Desk or in chat — both work.

## 1. Intake (you)
Parse the brief into: client(s) · format (graphic reel, short reel, carousel, static, cover, story, gif, footage reel, animated carousel) · topic · optional length, style, engine, voice, language, source (`idea:<id>` = `$R/graphic reels/content-desk/runs/*/ideas_out/<id>.json`; a script file; a footage file) · batch target (`group N`, a list of clients).
- **Client:** match against `$R/kits/_index.json` (names, aliases, first names, brand names like "an earlier client"). Ambiguous → ask once with the candidates. Read `assets/<slug>/profile.md` if present (standing brief that steers style, tone and topic) and `kit.json`: if `video:false`, no face/footage formats; QC → French version required; note `missing`/`flags` that block posting (e.g. Ontario without complianceLine → proof only) and tell the user in one line, but continue.
- **Missing topic:** offer 3 options as a short list: this week's plan for the client's group (`$R/engines/stills/research/weekly_*.json` newest) and the strongest relevant Radar outliers (`$R/radar/posts.jsonl`). Missing format → suggest from topic + group. Ask only what you truly need; otherwise decide and say what you decided.
- Create the job: `id=$(node $R/studio/tools/job.mjs new --client <slug> --format <f> --topic "<t>" --brief '<json of everything parsed>')`, then `node … node $id intake done --summary "<client · format · topic · key constraints>"`.

## 2. Concepts → Gate 1
- Spawn `strategist` with: `concepts <id>`. Wait.
- Present Gate 1 compactly in chat: for each concept one line — **A · title** — hook — style/engine — device — novelty score; plus the Desk link where the cards show style previews and storyboards. Ask: pick A/B/C, mix ("B with A's hook"), or revise with notes.
- Record the answer: if the user decided in the Desk, `job.json.gates.g1` is already set (read it). If in chat: `node … gate <id> g1 --decision pick|revise --choice <X> --notes "<their words verbatim>" --by chat`. Revise → spawn strategist again with the notes (max 2 revisions, then ask how to proceed).

## 3. Script and check
- Spawn `strategist` with `script <id>`; then spawn `checker` with `check <id>`. If `check.json.blocking` is non-empty, show it and ask; `proofOnly` → continue but label every deliverable PROOF.

## 4. Production
- Spawn `director` with `produce <id>`. Productions are long (stills ~5–15 min, short loops ~10–20 min, films reels 30–75 min). Give the user one line when it starts and point to the Desk flow view.

## 5. QA (max 2 rounds)
- Spawn `critic` with `review <id> round 1`. Fail → spawn `director` with `fix <id>` + the path `qa/critique.json` → `critic` `review <id> round 2`. Still failing → go to Gate 2 anyway, with the open issues listed honestly.

## 6. Gate 2
- Show: the deliverables (paths), length/slide count, QA summary (pass/warn/fail counts and the top 3 issues), the caption, and the Desk link (phone-frame player, safe-zone + grid-crop overlays). Ask: approve, or revise with notes.
- Record via Desk or `node … gate <id> g2 --decision approve|revise|reject --notes "…" --by chat`. Revise → `director fix <id>` with the notes → `critic` → Gate 2 again.

## 7. File and deliver
- Spawn `librarian` with `file <id>`.
- Final message (short): the out/ folder and files, caption ready to paste, reminders (Instagram AI label when a synthetic voice or AI imagery is used; set the cover; "Upload at highest quality"), anything still TODO (compliance fields, client confirmations), and lesson suggestions waiting in `$R/library/lessons-pending.md`. Nothing is posted.

## Batch ("for group 2", several clients)
One job per client (`new` per client, same topic). Run concepts for all (two strategists at a time); each client's concepts must differ from the other clients' (the strategist checks `variety.py` and the sibling jobs' concepts.json). Present Gate 1 as a grid in the Desk (`#/batch`), take all picks, then produce one job at a time in order, critic after each, and present Gate 2 for the whole batch.

## Other commands
- `create status` → `node $R/studio/tools/job.mjs list` plus the Desk link.
- `create resume <id>` → read job.json `status`/`nodes` and continue from the first node that is not done. First run `node $R/studio/tools/learn.mjs scan <id>`: if the person edited the delivered files, treat those edits as their notes.
- `create learn` → `node $R/studio/tools/learn.mjs scan && node $R/studio/tools/learn.mjs digest`, then ask the librarian to turn `library/edits-digest.md` into proposed lessons; show them.
- `create lessons` → show `$R/library/lessons-pending.md`; for each accepted lesson, append it to `$R/kits/<slug>/lessons.md` (client) or propose the exact `playbook/PLAYBOOK.md` edit (read-only for the bot: give the user the text to paste).

## Never
Post or upload anything · write in `engines/`, `playbook/`, `assets/`, `clients.json` (a hook blocks it) · invent client facts · use assets marked "check" before the user confirms them in the Desk · spend ElevenLabs or other paid credits without a yes · run more than 2 subagents at once.
