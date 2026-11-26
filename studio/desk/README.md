# Studio Desk

The visual control room for Studio. One local page that shows every job as a live node graph, the competitor Radar wall, client kits, the library, and the two approval gates. It reads the files the agents write (`jobs/`, `kits/`, `library/`, `radar/`) and updates live when they change.

## Start / stop

```bash
studio/desk/start.sh   # idempotent; writes .desk.pid, logs to .desk.log, prints the URL
studio/desk/stop.sh
```

Open http://127.0.0.1:4747. Node 25, no dependencies, no build step. The server binds to 127.0.0.1 only.

Environment (optional): `DESK_PORT` (default 4747), `STUDIO_ROOT` (default `$R`), `DESK_SAMPLE=1` (force the sample jobs, for demos and screenshots; real data untouched).

## Screens

| Key | Screen | What it shows |
|---|---|---|
| F | **Flow** `#/flow` | The whole system as a pannable, zoomable graph read like a stripboard: Radar → Nightly research → Ideas → /create → Intake → Strategist → Gate 1 → Checker → Director → Critic → Gate 2 → Librarian → Library, with the feedback loop back to the Strategist. Running stations pulse green, open gates glow amber, failures go red, frames travel along edges where work is moving. The strip below lists every job; pick one (`#/flow/<job-id>`) to see that job's own graph from `job.json.nodes`, its route drawn in violet, output thumbnails on the nodes. Click any node for a drawer with outputs, log lines and files. Drag to pan, ctrl/⌘ + wheel or pinch to zoom, `0` to fit. |
| N | **New piece** (rail button, top-bar `+` on phone) | Panel that queues `/create` on the runner: client picker with search (or **Batch for a group**), format, topic with suggestions from the newest weekly plan for that client's group and the top on-topic Radar outliers, optional engine / style / length / angle / notes, and a live preview of the exact brief. **Queue it** → the Flow strip shows the run (queued / running) until its job folder exists. |
| R | **Radar** `#/radar` | Masonry wall of competitor posts (YouTube thumbnails, radar thumbs, typographic cards for articles) with platform glyph, outlier badge coloured by strength, format chip, metrics, hook on hover. Filters: Competitors / Our clients / All, platform, region, format, topic, outlier ≥, date range, sort, search. Account rail filters the wall. Click a post for caption, metrics, link out and **Make our version**, which builds a `/create …` command for a chosen client and copies it. **Paste a post** adds a manual Facebook / LinkedIn / TikTok / Instagram URL. **Sources** shows live status from `radar/status.json` (green live, amber token expiring within 7 days, red expired/error, with **Reconnect** opening the matching part of `studio/radar/SETUP.md`); without that file it falls back to key presence. Tabs: **Wall** · **Patterns** `#/radar/patterns` (`radar/patterns.json`: Rising strip, quiet lanes, one card per pattern with example thumbnails, median outlier, format and hook chips, client-fit faces and **Make this for <client>**, which opens New piece with the pattern's angle-for-us as the topic and its mechanism as the angle) · **Clients** `#/radar/clients` (`radar/clients.json`: one row per client with followers, posts in 30 days, median likes / ER, last post, top formats, recent thumbnails). |
| C | **Clients** `#/clients` | Cards with footer banner, headshot, logos, group, completeness ring, colour swatches (provisional ones dashed), rule chips and confirm / reject toggles for items the kit agent flagged. `#/clients/<slug>` shows the whole kit: identity and compliance line, colours with confirm / reject next to the website's own brand colours, assets, to-dos and flags, website facts (bio, specialties, service areas, team, socials, reviews), rules, voice, **Their recent Instagram** (from `radar/clients.json`), and the client's history wall. **New piece for this client** opens the New piece panel for that client (the copy button still copies `/create … for <slug>` for chat). |
| L | **Library** `#/library` | Wall of past pieces; video cards play a muted preview on hover (served with HTTP Range). Filters by format, engine, style, client, status. Click for the treatment, feedback, lessons and files. |
| G | **Gates** `#/gates`, **Job** `#/job/<id>` | Tabs: Gate 1, Gate 2, **Live** (`?tab=live`: every Desk run for this job, the current one streaming tool calls summarised per agent, e.g. `strategist → running`, `director: rendering…`, with **Stop run**), Log & files. Gate 1: the concepts side by side (hook, alt hooks, angle, client facts used, engine + style with preview, storyboard strip, novelty note) with Pick, Mix and Revise + notes. Gate 2: phone-frame preview at true 9:16 (video) or 4:5 (carousel swiper with counter), Instagram safe-zone overlay, profile-grid 3:4 crop, caption with copy, QA checks as pass / warn / fail chips with values, contact sheet, Approve / Revise + notes. |
| B | **Batch** `#/batch`, `#/batch/<topic-or-date>` | Every job at Gate 1 (or Gate 2), one column per client, so a group batch is decided in one screen. |
| S | **Scorecard** `#/scorecard`, `#/scorecard/<suite>` | Studio's quality tests over time (`studio/evals/`, see `studio/evals/TESTS.md`). Overall score with delta and trend, one tile per suite (radar, patterns & intel, kits, creative output, library, pipeline, intake, golden set) with score, a 0–100 sparkline over `history/index.json` and the failing (red) / warning (amber) tests as chips. Click a suite: every test with status, value, target, fail line and a history chart drawn to scale (real date spacing, target and fail lines dashed); click a row for a larger chart plus what it measures, how and why. **Latest orchestrator review** panel reads the newest `studio/evals/reviews/<date>.json`. Updates live when `scorecard.py` writes `history/` or a review lands. |

Gate bars have **Continue automatically** (on by default, remembered per browser): after Pick / Revise at Gate 1 or Approve / Revise at Gate 2, the Desk queues `/create resume <id>` with your notes. Reject never resumes.

Also: a **runner chip** in the top bar (Runner idle / Running · <client> / n queued / Waiting for usage reset · retry HH:MM; click for the runner drawer with the live log, queue, Stop and recent runs), a red **Instagram token expired** chip when `radar/status.json` says so, an activity ticker along the bottom (latest log lines across jobs), a toast for every live update, light / dark theme (`T`), shortcuts overlay (`?`). Phone layout puts navigation in a bottom bar and lays the Flow graph out vertically.

## Sample data

`fixtures/` holds sample jobs (two at Gate 1, a video and a carousel at Gate 2, one producing), sample library cards and a few radar posts. They use existing real media from `graphic reels/`. They render only while the real source is empty and are badged **SAMPLE**; gate decisions on sample jobs stay in memory and never reach `library/feedback.jsonl`. Real files win as soon as they exist. Regenerate with `studio/.venv/bin/python studio/desk/tools/make_fixtures.py`. If `kits/` is empty the Clients screen falls back to the roster in `clients.json` (marked "kit pending").

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/state` | `{jobs, kits:{index, items, source}, library:{cards, sample}, radar:{accounts, posts, summary, sample}, feedback:{count}, system:{nightly}, roster}`. Kit items include `web.json` summary, colours from `tokens.json`, `confirm.json`. Radar summary includes per-platform/per-account counts, latest `radar/runs/*.json`, and source status (key presence only, never values). |
| GET | `/api/job/:id` | `{job, concepts, script, qa, check, dir, files, sample}` |
| POST | `/api/job/:id/gate` | `{gate:'g1'|'g2', decision:'pick'|'revise'|'reject' (g1) or 'approve'|'revise'|'reject' (g2), choice:'A'|'A+C', notes}`. Updates `job.json` gates, node status, job status (g1 pick → `checking`, g2 approve → `approved`, revise → back to `concepts` / `producing`, reject → `parked`), appends a log line, and appends `{job, client, format, engine, style, gate, decision, choice, notes, at, by:'desk'}` to `library/feedback.jsonl`. Bad JSON or values → 400 with a message. |
| GET | `/api/kit/:slug` | Full kit: `kit.json`, `tokens.json`, `history.json`, `confirm.json`, `web.json`, `voice.md`, `lessons.md`. |
| POST | `/api/kit/:slug/confirm` | `{colors?:{role:'#hex'|true|false|null}, assets?:{path:true|false|null}, group?, notes?}` merged into `kits/<slug>/confirm.json`. Nothing else in `kits/` is written. |
| POST | `/api/radar/manual` | `{url, account?, note?}` appended to `radar/posts.jsonl` (platform from hostname, de-duplicated by URL; nothing is fetched). |
| GET | `/api/runner` | Runner status: `{state: idle|running|stopping|waiting, current, waiting, queued[], history[], rate, bin}`. Also included in `/api/state` as `runner`. |
| GET | `/api/runner/lines?run=<id>&since=<i>` | Summarised lines of one run `{run, lines:[{i,t,agent,kind,msg}]}`. |
| POST | `/api/runner/stop` | Kill switch for the current run: SIGTERM to its process group, SIGKILL after 10 s. |
| POST | `/api/runner/cancel/<id>` · `/api/runner/retry/<id>` | Drop a queued run · retry a usage-waiting run now. |
| POST | `/api/runner/check` | Queues the fixed harmless prompt `/create status` (end-to-end check). No endpoint accepts a free prompt. |
| GET | `/api/create/options` | Formats, engines (`studio/engines/*.md`), groups, newest weekly plan posts by group, top on-topic competitor outliers. |
| POST | `/api/create` | `{client | group, format, topic, engine?, style?, length?, angle?, notes?, dryRun?}` → validated, built into one `/create …` brief and queued (`dryRun:true` returns the prompt only). |
| GET | `/api/job/:id/runs` · `/api/job/:id/runs/:n` | Runs for a job (queue + `jobs/<id>/runs/*.log`) · one run's lines. |
| POST | `/api/job/:id/gate` | (as above) plus `resume` (default true): queues `/create resume <id>` unless the decision is reject or the job is a sample. Response carries `resume` (the queued run). Jobs whose id starts with `_` are throwaway tests: no feedback line. |
| GET | `/api/scorecard` | `{index, latest, series:{testId:[{date,value,status}]}, review:{date, rows}, catalogue:{suites, tests}}` from `studio/evals/history/`, `reviews/`, `tests.json`. `/api/state` also carries `scorecard:{date, overall, fails, warns}` for the rail. |
| GET | `/events` | Server-sent events. Recursive `fs.watch` on `jobs/`, `kits/`, `library/`, `radar/` and `studio/evals/` (only `history/*.json`, `reviews/*.json`, `tests.json`), debounced: `event: update {type:'jobs'|'kits'|'library'|'radar'|'evals', id}` (run logs under `jobs/*/runs/` are ignored). Plus `event: runner` (full runner status on every change) and `event: run` (`{run, job, line}` per summarised line). |
| GET | `/file?p=<path>[&w=<px>]` | Media from under `$R` (including `graphic reels/`) only; traversal and symlink escapes are rejected. Range requests for video. `w` returns a cached resized JPEG (sips for images, an ffmpeg frame for video) under `.cache/`. |

## Runner (headless Claude Code from the Desk)

Code in `studio/runner/` (`runner.mjs` queue + process control, `brief.mjs` prompt building). One run at a time; the rest wait in `studio/runner/queue.json` (survives a Desk restart; last 60 finished runs kept). Each run is exactly:

```
env -u ANTHROPIC_API_KEY claude -p "<prompt>" --permission-mode dontAsk \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,Task,Agent,Skill,WebSearch,WebFetch,TodoWrite" \
  --output-format stream-json --verbose
```

run with cwd `$R` (so `.claude/` skills, agents, CLAUDE.md and the guard hook load; no `--bare`). The child environment also drops the variables of whatever Claude Code session started the Desk (`CLAUDECODE`, `CLAUDE_CODE_*` except an OAuth token, `CLAUDE_PID`, …). Binary: `claude` on PATH or `~/.local/bin/claude` (override with `CLAUDE_BIN`).

Verified against the installed CLI (`claude --version` 2.1.296, `claude --help`, 2026-11-19): `-p`, `--permission-mode` choices `acceptEdits | auto | bypassPermissions | manual | dontAsk | plan` (dontAsk = anything not allowed is denied, nobody is prompted), `--allowedTools`, `--output-format stream-json` (requires `--verbose`). The subagent tool is called `Task` in this version (in the init event's tool list), so both `Task` and `Agent` are allowed. The init event reports `apiKeySource: "none"` for these runs, so they use the subscription login, not an API key.

- **Logs:** raw stream-json to `jobs/<id>/runs/<n>.jsonl` plus a human log `<n>.log` (`HH:MM:SS agent kind message`). Until a create run has made its job folder, both live in `studio/runner/logs/<run>-<attempt>.*` and are moved into the job when the producer's `job.mjs new` prints the id (the child keeps writing; the file descriptor follows the rename). stderr: `studio/runner/logs/<run>-<attempt>.stderr`.
- **Restart safe:** the child writes straight to its log file in its own process group, so it keeps running when the Desk stops; on start the Desk re-attaches by pid (checked to be a `claude` process) and keeps tailing from the saved offset. A run that ended while the Desk was down is closed from its log.
- **Kill switch:** `POST /api/runner/stop` (Stop buttons in the drawer and Live tab): SIGTERM to the process group, SIGKILL after 10 s.
- **Usage limit:** detected from the stream's `rate_limit_event` (`status` not `allowed*`, with `resetsAt`) or, for error results / stderr, from limit wording (`usage limit reached|<epoch>`, `hit your limit`, `429` …). The run becomes **waiting for usage reset** and retries at `resetsAt` + 2 min, or after a backoff of 15 min doubling to 3 h when no reset time is known; never sooner than 1 min after a known reset or 15 min otherwise; gives up after 12 attempts. The queue waits behind it (same usage window). A create run that already made its job retries as `/create resume <id>` so it never makes a second job.
- **Prompts are built from fields only** (`brief.mjs`): client must be a slug in `kits/_index.json`, group one of the groups there, format and engine from fixed lists, style `[a-z0-9 -]`, length `5–180 s` or `1–20 slides`; topic (200), angle (240), notes (400) and gate notes (600) are flattened to one line, stripped of control / zero-width / bidi characters, quotes, backticks, brackets and leading command characters, then quoted inside the brief, followed by a fixed instruction that the quoted text is data and the run must stop at the next gate without asking questions. The prompt is passed as one argv element (no shell). No secrets go into prompts; `.env` is never read by the runner.
- **Guard hook still applies:** a headless run told to Write `graphic reels/_runner_guard_test.txt` got `PreToolUse:Write hook error: Studio guard: graphic reels/ is the agency's existing work and is read-only for Studio` and the file was not created. Guard denials show in run logs as red `guard` lines.

Known limits: one run at a time by design; a run started from chat (not the Desk) isn't visible in the runner (its job still shows on the Flow); headless runs can't ask questions, so an ambiguous brief ends the run with the producer's question as the last line (read it in Live, adjust, queue again); a batch run attaches its log to the first job it creates (later jobs list it in their Live tab via the queue); `--allowedTools` doesn't include MCP tools, so connectors (e.g. ElevenLabs) are denied in headless runs; costs shown are the CLI's list-price estimate, not what the subscription charges.

## Files

```
server.mjs          node:http server (API, SSE, media, runner glue)
../runner/          runner.mjs (queue, spawn, tail, stop, usage waits), brief.mjs (whitelisted prompt building), queue.json, logs/
public/index.html   shell
public/css/desk.css all styles (dark + light tokens)
public/js/          app.js (router, store, SSE, ticker), flow.js, radar.js (wall, patterns, clients, sources), clients.js, library.js, job.js (gates, live tab), batch.js, runner.js (chip, drawer, live log, New piece), scorecard.js (quality scorecard), ui.js
public/fonts/       Archivo and Martian Mono (OFL, subset woff2, licences alongside)
fixtures/           sample data (see above)
tools/shoot.mjs     Playwright screenshots of every screen (desktop + phone, dark + light) into shots/
shots/              latest screenshots
```
