---
name: radar
description: Refresh Studio's competitor and client-account Radar (YouTube, Instagram Business Discovery, broker blogs, manual posts) and open the Radar wall in the Desk. Also "radar add <url>" for a Facebook/LinkedIn/TikTok/Instagram post the user pastes, and "radar setup" for connecting API keys.
---

Root `R` = the repository root (`R=$(git rev-parse --show-toplevel)`).

- `radar` / `radar refresh`: run `node $R/studio/radar/run.mjs` (timeout 10 min), then `bash $R/studio/desk/start.sh` and point the user to `http://127.0.0.1:4747/#/radar`. Report in 3 lines: new posts per source, the top 3 outliers (account, hook, multiple), and which sources still need keys (`$R/radar/runs/<today>.json` needsKeys).
- `radar add <url> [note]`: `node $R/studio/radar/manual.mjs add "<url>" --note "<note>"`. Never fetch Facebook, Instagram, LinkedIn, TikTok, Threads, X or Reddit pages (their terms forbid automated access).
- `radar setup`: walk the user through `$R/studio/radar/SETUP.md` one step at a time. Keys go in `$R/studio/.env` (never print them back).
- To turn a post into content: `/create <format> for <client> inspired by radar:<post id>` — the strategist uses the post's mechanism, never its wording or look.
