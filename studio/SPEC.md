# Studio: build spec (the contract every part follows)

Studio is the agency's creative bot. You type `/create <brief>` in Claude Code, at `$R`. Agents turn the brief into finished, on-brand Instagram content (reels, carousels, statics, covers, GIFs, stories, footage reels) for one client or a group. The **Desk** (a local web app) shows everything visually: the live flow of each job as a node graph, the competitor Radar grid, the clients, the library, and the two approval gates.

Root: `R=$(git rev-parse --show-toplevel)`. Python for tools: `$R/studio/.venv/bin/python` (pillow, numpy, imagehash, scikit-learn, scipy). Node 25. ffmpeg 9, whisper-cli, tesseract.

## Ground rules
- **Never write inside `$R/engines/` (except face-reels inbox/reels), `$R/playbook/`**, `$R/clients.json|csv|jsonl`, `$R/assets_manifest.csv`, `$R/assets/`. They are read-only sources.
- Studio writes only in `$R/studio/`, `$R/kits/`, `$R/library/`, `$R/jobs/`, `$R/radar/`, `$R/.claude/`.
- Never invent client facts: names, licences, brokerage, colours, quotes, rates. Missing facts become a `missing` entry and a visible TODO.
- Never post or upload anything. No Instagram/Facebook publish calls.
- No scraping of Instagram, Facebook, Threads, LinkedIn, TikTok, X or Reddit, logged in or out (their terms forbid it). Use official APIs with the user's own keys, public RSS/JSON, YouTube Data API, and manual entries.
- The rules of the house for every piece: `$R/playbook/PLAYBOOK.md`.

## Folder layout
```
$R/
  clients.json, assets/<slug>/ (+ assets/_provenance.json)   read-only sources
  studio/
    SPEC.md                this file
    tools/                 node + python tools (kits, library, jobs, variety)
    tools/qa/              QA gate tools
    engines/<name>.md      one adapter per render engine
    rubric/critic.md       critic rubric
    evals/briefs.jsonl     20 test briefs
    desk/                  the Desk web app (server.mjs + public/)
    radar/                 competitor collectors (code only)
    .env                   optional keys (YOUTUBE_API_KEY, META_ACCESS_TOKEN, META_IG_USER_ID); never commit/print
  kits/<slug>/             one per client (see Kit)
  kits/_index.json         [{slug, name, city, province, group, completeness, flags}]
  kits/REPORT.md           missing-data report
  library/cards/<id>.json  one per past piece (see Card)
  library/thumbs/<id>.jpg  480 px wide thumbnail
  library/index.jsonl      one card per line (same objects)
  library/feedback.jsonl   every gate decision (see Feedback)
  library/lessons-pending.md
  jobs/<id>/               one per job (see Job)
  radar/                   accounts.json, posts.jsonl, thumbs/, runs/<date>.json
```

## Client slugs
The slug is the folder name in `clients.json` `asset_folder` (e.g. `assets/northline-mortgages/` gives `northline-mortgages`). Roster/seed files in `graphic reels/content-desk/seed/clients/` and token files in `engines/stills/tokens/clients/` sometimes use other slugs. Keep a `aliases` list (e.g. `harbour-lending` has alias `harbour`, `the-okafor-team` has alias `keaton-jim-okafor`). Extra clients not in the sheet: `omar-haddad`, `mira-patel` (roster only), `jordan-lee` (Caliber Wealth, from `graphic reels/portfolio-failing/`).

## Kit (`kits/<slug>/`)
- `kit.json`:
```json
{ "id":"northline-mortgages", "aliases":[], "sheetId":"client-014", "name":"Sam Rivera", "people":[],
  "city":"London", "province":"ON", "region":"Southwestern Ontario",
  "group":4, "video":true, "languages":["en"],
  "brokerage":{"name":"Mortgage Architects","licence":"#12728"},
  "agent":{"name":"Sam Rivera","title":"Licensed Mortgage Broker","licence":"[LICENCE #]"},
  "contact":{"phones":[],"emails":[],"website":""},
  "services":[], "audience":"", "postingMode":"Autoposting", "postingTime":"11:00 AM", "timeZone":"EST",
  "figma":"", "complianceLine":"Sam Rivera, Licensed Mortgage Broker · Lic. [LICENCE #] · Mortgage Architects · Brokerage Lic. #12728",
  "rules":[{"id":"r1","kind":"never|always|scope|footer|outro|hashtags|rotation|other","text":"","appliesTo":["all"],"since":"","source":"sheet special_requests"}],
  "assets":{"photo":"assets/northline-mortgages/photo.png","footer":"…","footerAlt":null,"logos":["…"],"check":["paths needing user confirmation"]},
  "stills":{"primary":"broadsheet","secondary":"paper-trail","variant":"a"},
  "missing":["field names still empty"], "flags":["data conflicts"],
  "provenance":{"field":"source"}, "completeness":0.0, "updated":"ISO" }
```
- `tokens.json`: W3C DTCG 2025.10 style. `color.accent`, `color.accent2`, `color.ink`, `color.paper`, each `{"$type":"color","$value":"#hex","$extensions":{"studio":{"source":"footer|logo|tokens|default","provisional":true}}}`; `font.display`, `font.body` (from the roster style); `logo.light`, `logo.dark` paths.
- `voice.md`: tone, audience, languages, banned words (PLAYBOOK globals + client rules), client rules in plain words.
- `history.json`: `{"pieces":[{"id","date","format","engine","style","device","hookPattern","topic","card"}],"lastStyle":null}`.
- `lessons.md`: approved lessons for this client (starts empty with a header).

## Library card (`library/cards/<id>.json`)
```json
{ "id":"heloc-five-years", "title":"", "clients":[], "generic":true, "date":"2026-11-15",
  "format":"graphic-reel|short-reel|carousel|static|cover|footage-reel|gif|story",
  "engine":"films|stills|motion|hyperframes|custom-html|face-reels",
  "style":"swiss-motion", "lengthS":53.5, "fps":30, "size":"1080x1920", "voice":"kokoro:af_bella", "music":"original synth",
  "topic":"", "tags":[], "hook":"", "logline":"", "structure":"", "device":"",
  "rejectedStyles":[], "rejectedStructures":[],
  "files":{"final":"abs path","poster":"","thumb":"library/thumbs/<id>.jpg","treatment":"","project":""},
  "status":"delivered|approved|rejected|draft", "feedback":[], "performance":null, "lessons":[], "source":"seed|job" }
```

## Job (`jobs/<YYYY-MM-DD>-<slug>-<topic>/`)
- `job.json` is the single source of truth the Desk renders:
```json
{ "id":"", "created":"ISO", "updated":"ISO", "client":"slug|group:2", "format":"", "topic":"", "brief":{},
  "status":"intake|concepts|gate1|checking|producing|qa|gate2|approved|delivered|parked|failed",
  "engine":null, "style":null,
  "nodes":[{"id":"intake|strategist|gate1|checker|director|critic|gate2|librarian","status":"idle|running|done|waiting|failed|skipped","started":null,"ended":null,"summary":"","outputs":["relative paths"]}],
  "concepts":"concepts.json", "chosen":null,
  "gates":{"g1":{"at":null,"decision":null,"choice":null,"notes":""},"g2":{"at":null,"decision":null,"notes":""}},
  "outputs":[{"kind":"video|image|carousel|caption|cover|contact","path":"out/…","w":1080,"h":1920,"durationS":null}],
  "qa":{"report":"qa/report.json","pass":null},
  "log":[{"t":"ISO","node":"","msg":""}] }
```
- `concepts.json`: `[{"id":"A","title","hook":{"main","alts":[]},"angle","clientFacts":[],"format","engine","style","styleWhy","device","structure","beats":[{"t","visual","text","voice":"the spoken line"}],"slides":[],"cta","novelty","preview":"path or null"}]`
- `script.json`: the Create-tab shape used by the nightly desk: `forClient,title,hook,hookAlts,beats[{t,visual,text,voice}],cover,caption,hashtags,cta,sendTest,math[{claim,working,result}],whyThisClient,researchIds,complianceNotes,needs,fr`.
  - **Voice fields (schema rule).** `beats[].voice` is always the **spoken line** (plain words, the TTS/ASR reference, nothing else). The TTS voice id (`am_liam`, `af_bella`, `kokoro:af_bella`) lives only in `voiceId` (top level or `voiceCast.voiceId`), never in a key called `voice`. Reels also write `project/voice/lines.json` (`[{"id","text","voice","speed","asr"}]`, the Studio Films TTS tool's own format, where `voice` is the voice id): the director's exact TTS wording. The QA gate prefers it over `beats[].voice` and prefers its `asr` field (digits, US spelling, what a transcriber writes) over `text`; the `voice` key in that file is a voice id and is never read as text. `script.json` itself never uses `voice` for an id.
  - Review aids (contact sheets, strips) go in `qa/`, never `out/`; the gate ignores `out/contact*.jpg` and warns.
- `check.json`, `project/` (engine workdir), `out/` (deliverables), `qa/report.json` + `qa/frames/`.
- Gate decisions: `{"gate":"g1|g2","decision":"pick|revise|approve|reject","choice":"A|B|C|null","notes":"","by":"desk|chat","at":"ISO"}` written into `job.json.gates` and appended to `library/feedback.jsonl` with `job, client, format, engine, style`.

## QA report (`jobs/<id>/qa/report.json`)
`{"pass":bool,"checks":[{"id","name","status":"pass|warn|fail|skip","value","expected","detail"}],"frames":["qa/frames/…"],"contact":"qa/contact.jpg","at":"ISO"}`

## Radar
- `radar/accounts.json`: `[{"id","name","handle","platform":"instagram|facebook|linkedin|youtube|tiktok|web","url","region","type","followers","watchFor":[],"source":"landscape|manual|api","active":true}]`
- `radar/posts.jsonl`: `{"id","account","platform","url","date","format":"reel|carousel|image|video|short|article","caption","hook","thumb":"radar/thumbs/<id>.jpg or remote url","metrics":{"views","likes","comments","shares"},"outlier":null,"topics":[],"source":"youtube-api|ig-business-discovery|landscape|manual|rss","seen":"ISO","confidence":"api|check"}`
- `outlier` = views (or likes) / that account's median over its last 15 posts.

## Engine adapter (`studio/engines/<name>.md`)
Sections, in order: Best for · Formats and sizes · Inputs it needs · Setup check (exact command) · Run (exact commands, absolute paths, writing into `jobs/<id>/project` and `jobs/<id>/out`) · Branding (where the footer, logo and compliance line go) · Outputs to collect · Time and usage · Built-in QA vs what Studio's gate adds · Pitfalls · Picking a style against the client's history.
