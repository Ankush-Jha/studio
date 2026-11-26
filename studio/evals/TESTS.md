# Studio quality scorecard

One number per part of the bot, every day, so you can see whether Studio is getting better. The tests are listed in `tests.json` (that file is the source; the table at the bottom of this page is generated from it). `scorecard.py` computes them from the files on disk. The Desk shows them at http://127.0.0.1:4747/#/scorecard.

## How a score is made

- Each test gets a value and a status: **pass** (meets target), **warn** (between target and the fail line), **fail** (past the fail line), **info** (shown for context, no threshold), **nodata** (its source file isn't there yet), **pending** (a spot-check or monthly result hasn't been recorded).
- Test points: pass 100, warn 50, fail 0. A suite's score is the weighted mean of its scored tests (`weight` per test in tests.json). Info, nodata and pending tests don't count, so a suite with only pending tests shows no score instead of zero.
- Overall = weighted mean of the suite scores. Suite weights: Creative output 3, Golden set 2, Kits 1.5, Radar 1, Patterns & intel 1, Library 1, Pipeline 1, Intake 0.5. The creative output carries most weight because it is what the clients see.
- Each day's run is saved, so every test has a history and the Desk draws its trend.

| Suite | Tests | Automatic | Spot-check | User signal | Monthly |
|---|---|---|---|---|---|
| Radar | 13 | 13 | | | |
| Patterns & intel | 9 | 8 | 1 | | |
| Kits | 9 | 8 | 1 | | |
| Creative output | 17 | 12 | 2 | 3 | |
| Library & learning | 3 | 3 | | | |
| Pipeline | 10 | 10 | | | |
| Intake | 3 | 3 | | | |
| Golden creative set | 4 | 1 | | | 3 |
| **Total** | **68** | **58** | **4** | **3** | **3** |

## Run it

```bash
cd $R
studio/.venv/bin/python studio/evals/scorecard.py            # all automatic tests, prints a table
studio/.venv/bin/python studio/evals/scorecard.py --offline  # skip the YouTube re-fetch (keeps today's earlier result)
studio/.venv/bin/python studio/evals/scorecard.py --date 2026-11-21 --json
studio/.venv/bin/python studio/evals/scorecard.py --write-catalogue   # after editing tests.json
```

Use the venv Python: the near-duplicate tests need Pillow and imagehash. A run takes about 10 s (the first run hashes the Radar thumbnails and caches them in `history/.cache/`). The only network call is `radar.metric_accuracy`: one YouTube Data API request (1 quota unit) with the key from `studio/.env`, which is never printed. `run_evals.py` is run into a temporary folder, so `report.md` is left alone.

It writes:

- `history/<YYYY-MM-DD>.json`: `{date, at, overall, suites:{<suite>:{name, score, weight, counts, tests:[{id, name, value, display, target, fail, status, detail, method, ...}]}}, review, notes}`. A second run on the same day replaces that day.
- `history/index.json`: `[{date, overall, suites:{<suite>:score}, fails, warns}]`, oldest first. The Desk's sparklines read this.

It writes nothing outside `studio/evals/history/`.

## Nightly

The nightly Radar job should run the scorecard right after the Radar collection, so the morning view has fresh numbers:

```bash
node $R/studio/radar/run.mjs
$R/studio/.venv/bin/python $R/studio/evals/scorecard.py --quiet
```

`--quiet` prints nothing and exits 0. Its failure must not fail the Radar job. This hasn't been added to the scheduler yet: whoever owns the nightly job adds the second line after `run.mjs`.

## Orchestrator spot-checks

Four tests need eyes instead of code: `intel.pattern_precision`, `kits.fact_accuracy`, `creative.critic_agreement`, `creative.concept_distinct`. Once a week (or after a big change to patterns, kits or the critic), the orchestrator (the main Claude Code session, using Sonnet if it delegates) does the checks below and writes `reviews/<YYYY-MM-DD>.json`:

```json
[
 {"test": "intel.pattern_precision", "value": 80, "sample": ["yt-Al9KWhsEu8w", "ig-DfP8imXT4Ps"], "verdict": "8/10 examples match", "notes": "money-number-shock picks up generic rate posts"},
 {"test": "kits.fact_accuracy", "value": 100, "sample": ["northline-mortgages:agent.licence", "alex-tran:brokerage.name"], "verdict": "5/5 match source", "notes": ""},
 {"test": "creative.critic_agreement", "value": 83, "sample": ["2026-11-19-northline-mortgages-renewing-in-2027-in-london:5,6,8"], "verdict": "5/6 within 1 point", "notes": "critic generous on craft"},
 {"test": "creative.concept_distinct", "value": 100, "sample": ["2026-11-19-priya-shah-fixed-or-variable-at-renewal"], "verdict": "3/3 sets distinct", "notes": ""}
]
```

`value` is the percentage for the test. The scorecard uses the newest review file dated on or before the run date and marks it stale after 31 days. With no file, these tests show **pending**.

| Test | Sample | Pass rule per item |
|---|---|---|
| `intel.pattern_precision` | 2 example posts from each of 5 random patterns in `radar/patterns.json` (10 posts) | Thumbnail + caption actually show the pattern's `mechanism` |
| `kits.fact_accuracy` | 5 random (kit, filled key field) pairs | The value matches the source named in `provenance` (clients.json row, footer image, website page) |
| `creative.critic_agreement` | 6 rubric lines of 1 recent job, judged from full-size `qa/frames/` | Own score within 1 point of the critic's `qa/critique.json` |
| `creative.concept_distinct` | The last 3 `concepts.json` files | A, B and C differ in device, structure and style |

## Golden creative set (monthly, concept stage only)

Five fixed briefs in `golden.jsonl` (Ontario reel, Quebec carousel, Ontario static with no compliance line, a wealth client's short reel, BC stories). Each lists what an excellent concept must contain. Running the same briefs every month gives a clean trend line for the strategist. **It uses Opus and Sonnet tokens, so run it on purpose, once a month, not nightly.**

Procedure (first working day of the month):

1. For each brief, spawn one `strategist` agent (Opus) with: "Concept stage only. Write three concepts for this brief into `$R/studio/evals/golden/runs/<YYYY-MM>/<id>/concepts.json` in the SPEC concepts shape. Do not create a job, do not render, do not write anywhere else." Give it the brief text. At most 2 agents at once (house budget).
2. For each brief, spawn one fresh Sonnet judge with the prompt in `golden_judge.md`.
3. Merge the five judge outputs into `golden/results/<YYYY-MM>.json` (shape in `golden_judge.md`).
4. Run `scorecard.py`. The golden suite fills in, and the Desk shows the month next to the others.

Don't use golden briefs for real client work, and don't show their concepts to the strategist in later months. Otherwise the set stops measuring anything.

## Folder

```
studio/evals/
  TESTS.md            this page
  tests.json          catalogue (source of truth)
  scorecard.py        computes the automatic tests, writes history/
  golden.jsonl        5 fixed golden briefs + mustContain
  golden_judge.md     judge prompt + scoring sheet
  golden/runs/<YYYY-MM>/<id>/concepts.json    monthly strategist output (created by the procedure)
  golden/results/<YYYY-MM>.json               monthly judged results
  reviews/<YYYY-MM-DD>.json                   orchestrator spot-checks
  history/<YYYY-MM-DD>.json, history/index.json, history/.cache/
  briefs.jsonl, run_evals.py, report.md|json  intake dry run (feeds the Intake suite)
```

## Catalogue

<!-- catalogue:start (generated from tests.json by scorecard.py --write-catalogue; edit tests.json, not this table) -->

### Radar (`radar`, 13 tests, suite weight 1)

_Is the competitor and client-account feed complete, fresh and correct?_

| id | what it measures | how | target | warn | fail | why it matters |
|---|---|---|---|---|---|---|
| `radar.coverage.instagram` | Share of active instagram accounts in radar/accounts.json that have at least one post in posts.jsonl dated in the last 30 days | automatic: accounts.json active (and discoverable != false) on instagram; posts.jsonl grouped by account; count accounts with a post whose `date` is within 30 days. Business Discovery (official API). | >= 90% | 70% to < 90% | < 70% | Patterns are only as good as the accounts they see; a silent platform hides what competitors are doing there. |
| `radar.coverage.youtube` | Share of active youtube accounts in radar/accounts.json that have at least one post in posts.jsonl dated in the last 30 days | automatic: accounts.json active (and discoverable != false) on youtube; posts.jsonl grouped by account; count accounts with a post whose `date` is within 30 days. YouTube Data API. | >= 90% | 70% to < 90% | < 70% | Patterns are only as good as the accounts they see; a silent platform hides what competitors are doing there. |
| `radar.coverage.web` | Share of active web accounts in radar/accounts.json that have at least one post in posts.jsonl dated in the last 30 days | automatic: accounts.json active (and discoverable != false) on web; posts.jsonl grouped by account; count accounts with a post whose `date` is within 30 days. RSS/Atom feeds and robots-allowed pages. | >= 80% | 60% to < 80% | < 60% | Patterns are only as good as the accounts they see; a silent platform hides what competitors are doing there. |
| `radar.coverage.facebook` | Share of active facebook accounts in radar/accounts.json that have at least one post in posts.jsonl | automatic: accounts.json active (and discoverable != false) on facebook; posts.jsonl grouped by account; count accounts with any post. Manual entries only (no scraping), so the bar is low. | >= 20% | 5% to < 20% | < 5% | Patterns are only as good as the accounts they see; a silent platform hides what competitors are doing there. |
| `radar.coverage.linkedin` | Share of active linkedin accounts in radar/accounts.json that have at least one post in posts.jsonl | automatic: accounts.json active (and discoverable != false) on linkedin; posts.jsonl grouped by account; count accounts with any post. Manual entries only (no scraping), so the bar is low. | >= 20% | 5% to < 20% | < 5% | Patterns are only as good as the accounts they see; a silent platform hides what competitors are doing there. |
| `radar.coverage.tiktok` | Share of active tiktok accounts in radar/accounts.json that have at least one post in posts.jsonl | automatic: accounts.json active (and discoverable != false) on tiktok; posts.jsonl grouped by account; count accounts with any post. Manual entries and landscape notes only (no scraping). | >= 20% | 5% to < 20% | < 5% | Patterns are only as good as the accounts they see; a silent platform hides what competitors are doing there. |
| `radar.freshness` | Share of active, fetchable accounts (Instagram, YouTube, web; discoverable) whose newest post was collected (`seen`) in the last 48 hours | automatic: max(`seen`) per account in posts.jsonl vs now. | >= 90% | 60% to < 90% | < 60% | Stale data means the nightly ideas react to last week. An expired token shows up here first. |
| `radar.source_health` | Share of Radar sources (instagram, youtube, rss, manual) reporting ok in radar/status.json | automatic: status.json sources[*].ok; error text goes into detail. | >= 100% | 75% to < 100% | < 75% | A dead source silently shrinks coverage; this names it the same night. |
| `radar.metric_accuracy` | Share of 10 random YouTube API posts whose stored views are within 5% of a fresh YouTube Data API read | automatic: Seeded random sample (seed = date) of posts with source youtube-api, preferring ones seen in the last 48 h; videos.list?part=statistics with YOUTUBE_API_KEY from studio/.env (never printed); \|stored - fresh\| / fresh <= 5%. 1 quota unit. Skipped with --offline. | >= 90% | 70% to < 90% | < 70% | Outlier multiples drive what we copy; wrong view counts mean we chase the wrong posts. |
| `radar.duplicates` | Share of posts that duplicate another (same id, same normalised URL or video/shortcode, or same account + caption + day) | automatic: posts.jsonl; URLs normalised (YouTube watch/shorts/youtu.be -> video id, Instagram /p/ /reel/ -> shortcode, else host+path). | <= 0.5% | > 0.5% to 2% | > 2% | Duplicates inflate counts and pattern hits. |
| `radar.date_sanity` | Posts whose `date` looks like the collection time or is impossible | automatic: Count posts with a timestamped date within 2 minutes of `seen`, a date-only date equal to the `seen` day on non-API sources, a date more than 1 day after `seen`, a date before 2005, or 5+ posts of one account sharing one exact timestamp. | <= 0 | > 0 to 5 | > 5 | A fetch-time date makes an old post look new and breaks the 30-day windows and outliers. |
| `radar.dated_share` | Share of posts that carry their own date | automatic: posts.jsonl `date` not null. | >= 97% | 90% to < 97% | < 90% | Undated posts can't enter windows, outliers or patterns. |
| `radar.run_recency` | Age of radar/summary.json lastRun | automatic: now - summary.lastRun. | <= 26 h | > 26 h to 50 h | > 50 h | The nightly job must actually run. |

### Patterns & intel (`intel`, 9 tests, suite weight 1)

_Does the Radar turn posts into patterns, visual tags and questions we can trust?_

| id | what it measures | how | target | warn | fail | why it matters |
|---|---|---|---|---|---|---|
| `intel.patterns_valid` | Number of patterns in radar/patterns.json with 3+ example posts from 2+ different accounts | automatic: patterns[*].examples looked up in posts.jsonl for their account. | >= 8 | 4 to < 8 | < 4 | Fewer than 3 examples from one account is an anecdote, not a pattern. |
| `intel.patterns_valid_share` | Share of listed patterns meeting the 3-examples / 2-accounts bar | automatic: as above / len(patterns). | >= 100% | 80% to < 100% | < 80% | Unsupported patterns should never reach the strategist. |
| `intel.pattern_precision` | Share of sampled pattern examples that truly show the pattern's mechanism | orchestrator spot-check: Orchestrator opens 2 examples from each of 5 random patterns (10 posts), looks at the thumbnail/caption and marks match / no match. Written to reviews/<date>.json as {test:'intel.pattern_precision', value:%, sample:[post ids], verdict, notes}. | >= 85% | 70% to < 85% | < 70% | Keyword rules mislabel posts; this is the only check that a pattern means what it says. |
| `intel.client_fit_specificity` | Average share of all kits that a pattern's clientFit lists | automatic: mean(len(clientFit) / number of kits) over patterns. | <= 40% | > 40% to 70% | > 70% | A pattern that 'fits' every client tells the strategist nothing. |
| `intel.visual_coverage` | Share of the 50 highest-outlier competitor posts of the last 30 days that have visual tags in radar/visual.json | automatic: Top 50 by outlierRaw (competitor accounts only, dated in 30 days); ids found in visual.json (any of: {posts:{id:..}}, {id:..}, [{id\|post\|postId}], {items:[..]}). | >= 90% | 60% to < 90% | < 60% | Formats and hooks are half the story; the look is what the director needs. |
| `intel.questions_yield` | Number of audience questions in radar/questions.json | automatic: len(questions) (list, {questions:[..]} or {items:[..]}). | >= 30 | 10 to < 30 | < 10 | Real questions are the cheapest source of hooks that land. |
| `intel.questions_dedup` | Share of mined questions that are unique after normalisation | automatic: Lowercase, strip punctuation; duplicates = exact normalised match or token Jaccard >= 0.8. | >= 95% | 85% to < 95% | < 85% | Duplicate questions crowd out new ones and fake a trend. |
| `intel.candidates_pending` | Accounts proposed in radar/candidates.json that nobody has accepted or rejected yet | automatic: Items without status accepted/rejected/added/approved/dismissed. | <= 10 | > 10 to 30 | > 30 | Unreviewed candidates mean coverage gaps stay open. |
| `intel.client_mirror` | Share of kits whose own Instagram posts are in radar/clients.json (so new pieces avoid repeating them) | automatic: clients.json clients[*].posts > 0 / number of kits. | >= 80% | 50% to < 80% | < 50% | The strategist can only avoid repeats it can see. |

### Kits (`kits`, 9 tests, suite weight 1.5)

_Do the client kits hold complete, sourced, conflict-free facts?_

| id | what it measures | how | target | warn | fail | why it matters |
|---|---|---|---|---|---|---|
| `kits.completeness` | Mean kit completeness (12 key fields) across kits/_index.json | automatic: mean(completeness) x 100. | >= 90% | 75% to < 90% | < 75% | Every empty field is a TODO in a piece or a proof-only post. |
| `kits.provenance` | Share of filled key fields that name a source in kit.json provenance | automatic: Key fields: name, city, province, group, brokerage.name, brokerage.licence, agent.licence, photo, footer, logos, colors.accent (not 'default'), complianceLine. | >= 100% | 95% to < 100% | < 95% | An unsourced fact is an invented fact until proven otherwise. |
| `kits.conflicts` | Kit flags that record two sources disagreeing (differs, website says, conflict, inconsistent, spells, both Group ...) | automatic: Regex over kit.json flags; minus conflicts the user resolved in confirm.json notes. | <= 10 | > 10 to 40 | > 40 | Conflicting phone numbers, licences or names end up on a post. |
| `kits.ontario_compliance` | Share of Ontario (and unknown-province, treated as Ontario) kits that have a complianceLine | automatic: kit.json province in (ON, null) and complianceLine non-empty. | >= 100% | 85% to < 100% | < 85% | No line = proof-only = the piece can't be posted (O. Reg. 188/08). |
| `kits.assets_awaiting` | Assets marked 'check' that the user hasn't confirmed or rejected in the Desk | automatic: kit.json assets.check minus confirm.json assets decided true/false. | <= 0 | > 0 to 5 | > 5 | Unconfirmed assets can't be used, so pieces fall back to weaker branding. |
| `kits.colours_confirmed` | Share of kits whose accent colour is confirmed (not provisional) | automatic: tokens.json color.accent $extensions.studio.provisional == false, or confirm.json colors.accent == true/#hex. | >= 80% | 50% to < 80% | < 50% | Provisional colours are guesses from a website; wrong colours read as 'not our brand'. |
| `kits.accent_contrast` | Share of kits whose accent reaches 3:1 contrast against the paper colour | automatic: tokens.json color.accent $extensions.studio.contrastVsPaper >= 3. | >= 90% | 70% to < 90% | < 70% | A low-contrast accent forces the director to improvise colours. |
| `kits.group_assigned` | Share of kits with a group (drives batch and calendar) | automatic: kit.json group not null. | >= 100% | 85% to < 100% | < 85% | No group = left out of weekly batches. |
| `kits.fact_accuracy` | Share of 5 sampled kit facts that match their cited source | orchestrator spot-check: Orchestrator picks 5 random (kit, filled key field) pairs, opens the provenance source (clients.json, footer image, website) and marks match / mismatch. | >= 100% | 95% to < 100% | < 95% | Provenance says where a fact came from; this checks it was copied right. |

### Creative output (`creative`, 17 tests, suite weight 3)

_Are the finished pieces good, true, compliant and original?_

| id | what it measures | how | target | warn | fail | why it matters |
|---|---|---|---|---|---|---|
| `creative.qa_first_pass` | Share of jobs whose first critic round passed | automatic: job.json log: first critic 'done: pass\|...' vs 'done: fail\|...'. | >= 60% | 30% to < 60% | < 30% | Every extra round costs 10-100 minutes of director time and usage. |
| `creative.rounds_to_pass` | Average number of critic rounds per job until pass | automatic: Count critic 'done:' lines per job (or qa/critique.json round). | <= 1.5 | > 1.5 to 2.5 | > 2.5 | The trend line of how good first renders are. |
| `creative.critic_mean` | Mean of all scored rubric lines (1-5) in the final qa/critique.json of every job | automatic: critique.json scores; n/a and null skipped; per-line averages in detail. | >= 4.3 | 3.8 to < 4.3 | < 3.8 | The single best summary of craft quality as judged by the critic. |
| `creative.critic_min_line` | The lowest per-line average across jobs (which line is dragging) | automatic: min over the 12 lines of mean(score). | >= 4 | 3.5 to < 4 | < 3.5 | Shows the one skill to improve next (originality is usually it). |
| `creative.hard_stops` | Hard stops and coded QA fails still present when a piece reached Gate 2 | automatic: critique.json hardStops (if present) + critique pass == false + qa/report.json pass == false, for jobs past the critic. | <= 0 | none (pass or fail) | > 0 | A hard stop that reaches the owner is a process failure, not a taste issue. |
| `creative.neardup_clients` | Smallest perceptual distance between a job's deliverables and any piece of a different client (library + other jobs) | automatic: pHash+dHash (64-bit), distance = mean Hamming; library/hashes.json (thumb + frames, client from cards) and other jobs' out/ (videos at 25/50/75%). QA fails at <= 6. | >= 11 | 7 to < 11 | < 7 | Sibling clients must never get the same-looking post. |
| `creative.neardup_competitors` | Smallest perceptual distance between a job's deliverables and any Radar thumbnail | automatic: Same hashing against radar/thumbs/*.jpg (cached). | >= 11 | 7 to < 11 | < 7 | We borrow mechanisms from competitors, never their look. |
| `creative.variety` | Mean variety.py novelty score of the chosen concepts | automatic: concepts.json chosen concept `novelty.score` (or the score parsed from the novelty text). | >= 0.9 | 0.7 to < 0.9 | < 0.7 | Same style or device as last time = the feed looks templated. |
| `creative.compliance_correct` | Share of Ontario (or unknown-province) pieces that carry the compliance line or are explicitly labelled PROOF | automatic: qa/report.json copy.compliance_line == pass, or check.json proofOnly, or 'PROOF' in the director/gate summary. | >= 100% | none (pass or fail) | < 100% | A missing line on a postable Ontario piece is a regulatory breach. |
| `creative.maths_verified` | Share of numbers in check.json math that the checker recomputed as ok (jobs without check.json count as unverified) | automatic: check.json math[*].ok. | >= 100% | none (pass or fail) | < 100% | One wrong payment figure costs a client's credibility. |
| `creative.postable` | Share of approved pieces that are not proof-only (could be posted today) | automatic: check.json proofOnly false and no 'PROOF' in the director summary. | >= 80% | 40% to < 80% | < 40% | Approved-but-proof-only pieces are work the client never sees. |
| `creative.waivers` | Mean number of coded-check waivers per job (qa/waivers.json) | automatic: len(waivers.json) per job. | <= 0.5 | > 0.5 to 1.5 | > 1.5 | Waivers are fine once; a rising count means the gate or the engine needs fixing. |
| `creative.gate1_clean` | Share of jobs whose first Gate 1 decision by the owner was a pick (not revise/reject) | user signal: library/feedback.jsonl g1 rows, first per job, excluding by == producer-test. | >= 70% | 40% to < 70% | < 40% | The owner's own verdict on whether the concepts were good enough. |
| `creative.gate2_clean` | Share of jobs whose first Gate 2 decision was approve with no fix request in the notes | user signal: library/feedback.jsonl g2 rows, first per job; notes asking for a fix (fix, wrong, not proper, change, redo, look into...) count as revision. | >= 80% | 50% to < 80% | < 50% | The owner's verdict on the finished piece. |
| `creative.note_themes` | What the owner's gate notes are about (visual craft, copy, numbers, compliance, brand, pacing/sound) | user signal: Keyword themes over notes written at the Desk or in chat (producer test notes excluded). Informational. | info | info | info | Tells you which agent to improve first. |
| `creative.critic_agreement` | Share of sampled critic line scores the orchestrator agrees with within 1 point | orchestrator spot-check: Orchestrator re-scores 6 random rubric lines on one recent job from full-size frames; agreement = \|own - critic\| <= 1. | >= 90% | 75% to < 90% | < 75% | If the critic is lenient, every other creative number is inflated. |
| `creative.concept_distinct` | Share of recent Gate 1 sets whose three concepts differ in device, structure and style | orchestrator spot-check: Orchestrator reads the last 3 concepts.json files and marks each set distinct / not distinct. | >= 100% | 80% to < 100% | < 80% | Three versions of one idea is a fake choice. |

### Library & learning (`library`, 3 tests, suite weight 1)

_Is every decision filed so the next piece learns from it?_

| id | what it measures | how | target | warn | fail | why it matters |
|---|---|---|---|---|---|---|
| `library.filing_rate` | Share of approved jobs that the librarian filed (library card exists or librarian node done) | automatic: library/cards/<job id>.json or index.jsonl card with source job + the job id, or job.json librarian done. | >= 100% | 80% to < 100% | < 80% | Unfiled work is invisible to variety, near-dup and lessons, so the bot repeats itself. |
| `library.history_updated` | Share of approved jobs that appear in the client's kits/<slug>/history.json | automatic: history.json pieces[*].id/card matches the job id. | >= 100% | 80% to < 100% | < 80% | variety.py reads history.json; a missing entry means the next piece can repeat the style. |
| `library.feedback_logged` | Share of gate decisions in job.json that also appear in library/feedback.jsonl | automatic: (job, gate) pairs in job.json gates with a decision vs feedback.jsonl. | >= 100% | none (pass or fail) | < 100% | Feedback is the only memory the strategist has of the owner's taste. |

### Pipeline (`pipeline`, 10 tests, suite weight 1)

_How long, how many runs, how many failures, how much usage?_

| id | what it measures | how | target | warn | fail | why it matters |
|---|---|---|---|---|---|---|
| `pipeline.time_strategist` | Median minutes the strategist worked per job (all its runs added up) | automatic: job.json log: 'strategist running' -> next 'strategist done\|fail' segments, summed per job, median over jobs. | <= 12 min | > 12 min to 25 min | > 25 min | Where the hours go; a slow stage is the first optimisation target. |
| `pipeline.time_checker` | Median minutes the checker worked per job (all its runs added up) | automatic: job.json log: 'checker running' -> next 'checker done\|fail' segments, summed per job, median over jobs. | <= 3 min | > 3 min to 10 min | > 10 min | Where the hours go; a slow stage is the first optimisation target. |
| `pipeline.time_director` | Median minutes the director worked per job (all its runs added up) | automatic: job.json log: 'director running' -> next 'director done\|fail' segments, summed per job, median over jobs. | <= 30 min | > 30 min to 90 min | > 90 min | Where the hours go; a slow stage is the first optimisation target. |
| `pipeline.time_critic` | Median minutes the critic worked per job (all its runs added up) | automatic: job.json log: 'critic running' -> next 'critic done\|fail' segments, summed per job, median over jobs. | <= 3 min | > 3 min to 8 min | > 8 min | Where the hours go; a slow stage is the first optimisation target. |
| `pipeline.time_active` | Median minutes of agent work per job, gate waits excluded | automatic: Sum of all node segments except gate waits. | <= 40 min | > 40 min to 120 min | > 120 min | Total turnaround the owner waits on the bot. |
| `pipeline.gate_wait` | Median minutes jobs waited at Gate 1 + Gate 2 | automatic: 'gate waiting' -> decision segments. Informational (owner time). | info | info | info | Shows whether gates or agents are the bottleneck. |
| `pipeline.runs_per_job` | Mean number of agent runs (strategist, checker, director, critic, librarian) per job | automatic: Count of 'running' log lines per job. The floor is 5 (concepts, script, check, render, critique). | <= 6 | > 6 to 9 | > 9 | Each run costs usage; reruns mean something upstream was wrong. |
| `pipeline.failures` | Failed nodes, failed runner runs and error log lines | automatic: job.json nodes status failed + log lines starting fail/error (critic QA rounds excluded) + runner queue items failed/error. | <= 0 | > 0 to 2 | > 2 | Failures that need a human to restart kill the 'one-line brief' promise. |
| `pipeline.restarts` | Runner retries (attempts > 1), runs that waited for a usage reset, and resumed runs | automatic: studio/runner/queue.json items. | <= 1 | > 1 to 4 | > 4 | Restarts are the cost of running out of usage mid-job. |
| `pipeline.usage` | Sum of total_cost_usd and tokens reported by headless runs in the last 30 days | automatic: Result events in studio/runner/logs/*.jsonl and jobs/*/runs/*.jsonl. Chat-run jobs are not metered. Informational. | info | info | info | Lets you see cost per job once production runs go through the runner. |

### Intake (`intake`, 3 tests, suite weight 0.5)

_Can the 20 test briefs be produced as asked from the kits on disk?_

| id | what it measures | how | target | warn | fail | why it matters |
|---|---|---|---|---|---|---|
| `intake.ready` | Share of the 20 eval briefs whose readiness is 'ready' (fresh run_evals.py into a temp folder) | automatic: run_evals.py --out <tmp>; summary.ready / briefs. | >= 90% | 70% to < 90% | < 70% | A brief that is proof-only or blocked at intake can't become a postable piece. |
| `intake.verdict_pass` | Share of eval briefs with verdict pass (not warn/blocked) | automatic: summary.pass / briefs. | >= 80% | 50% to < 80% | < 50% | Warnings are kit gaps the user can close. |
| `intake.blocked` | Eval briefs that cannot be produced as asked | automatic: summary.blocked. | <= 0 | > 0 to 1 | > 1 | Blocked = the bot says no to a normal request. |

### Golden creative set (`golden`, 4 tests, suite weight 2)

_Monthly: how good are concepts for 5 fixed briefs, judged with the critic rubric?_

| id | what it measures | how | target | warn | fail | why it matters |
|---|---|---|---|---|---|---|
| `golden.mean` | Mean critic-rubric score (concept-stage lines) of the best concept per golden brief | monthly golden run: Latest studio/evals/golden/results/<YYYY-MM>.json, scored with golden_judge.md. | >= 4.2 | 3.6 to < 4.2 | < 3.6 | Same 5 briefs every month = a clean trend line for the strategist's quality. |
| `golden.must_contain` | Share of the golden briefs' must-contain items present in the chosen concept | monthly golden run: Same results file, mustContain booleans. | >= 90% | 70% to < 90% | < 70% | Checks the strategist follows the house rules and kit facts without being reminded. |
| `golden.hard_stops` | Hard stops found by the judge across the 5 golden briefs | monthly golden run: Same results file, hardStops lists. | <= 0 | none (pass or fail) | > 0 | A hard stop at concept stage would reach production. |
| `golden.recency` | Age of the latest golden results file | automatic: Today - results month/date. | <= 35 days | > 35 days to 62 days | > 62 days | A monthly trend needs monthly runs. |
<!-- catalogue:end -->
