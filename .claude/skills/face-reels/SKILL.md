---
name: face-reels
description: Studio face reels. Turn a client's raw talking-head clip into a finished 1080x1920 face reel (cut takes, face-aware captions, paper-collage graphics, sound, compliance end card) for a mortgage-broker or other regulated financial client, and onboard new clients for it. Use when the user gives a raw video to edit into a reel, asks to start or redo a face reel, or mentions a new client, broker or agent who needs face reels.
---

# Studio face reels

The engine lives in `engines/face-reels/` (paths below are relative to it). Its `CLAUDE.md` holds the five rules, the full pipeline, render safety and licences: read it first, every time. House rules for every piece: `playbook/PLAYBOOK.md` (repo root).

## 0. Installed?
`engines/face-reels/vendor/ghost-editor/` and `tools/models/` must exist. If not, tell the user to run `bash engines/face-reels/setup.sh` (see `tools/SETUP.md`; it clones the reviewed third-party engines, fetches model weights and builds `.venv-media`). Known issues: ffmpeg that will not start needs `brew reinstall ffmpeg`; transcription needs openai-whisper (installed into `.venv-media` by setup).

## 1. New client (onboarding)
1. Ask for the client's display name; derive a slug (lowercase, hyphens).
2. `python3 tools/new_client.py <slug> "<Display Name>"` creates `clients/<slug>/` from `client-template/` (`clients/` is gitignored: client data never goes into the repo).
3. Collect from the user, never guessing licence numbers, handles or disclaimer wording:
   - people on camera: name, role, licence number, one clear face photo in `assets/people/`;
   - company: legal name, brokerage licence number, regulator and jurisdiction, address, website, phone, email, social handles;
   - brand: brand guide or logo files (light, dark, mark-only), colours, fonts (from the website only if nothing else exists, and say so in `source_of_truth`);
   - compliance: required on-screen text, exact disclaimer, forbidden claims, who reviews and how fast;
   - voice: tone, words to use and avoid, topics to avoid, CTA, languages, platforms;
   - B-roll people rules only if the client asked for any.
4. Fill `client.json`, `brand/brand.json`, `compliance.json`, `voice.md`; logos in `brand/`, fonts in `brand/fonts/`. List anything unconfirmed in `client.json` → `needs_confirmation`.
5. Bracketed placeholders (`[BROKERAGE NAME]`, `[LICENCE #]`) and template text make `tools/compliance_check.py` fail. Do not start a reel until compliance.json holds real values.

Example to learn from: `examples/clients/northline-mortgages/` (fictional: Northline Mortgages, agent Sam Rivera, Toronto ON). Copy it into `clients/` to dry-run the pipeline; its compliance check fails on purpose.

## 2. New reel
1. **Which client?** Ask if not stated. Load the client's folder (client.json, brand.json, compliance.json, voice.md, people-rules.json, learnings.md). If compliance.json is unfilled, stop and onboard first.
2. Create `clients/<slug>/reels/<YYYY-MM-DD>_<short-name>/{raw,build,broll,out}` and move the raw clip into `raw/`.
3. Toolchain check: `MEDIA_PY=.venv-media/bin/python bash vendor/ghost-editor/scripts/doctor.sh`; report what is missing.
4. Ingest, transcribe, face-track, choose takes (CLAUDE.md steps 1-4), then write a **beat sheet** with `references/element-families.md` (3+ asset families, none back to back) and `references/design-quality.md`. Show it to the user.
5. Build in the client's brand, starting from `templates/overlay-starter.html` (copy to `build/overlay.html`); B-roll only made in code, licensed, or the client's own (no paid generation without a yes); soft sound design with the voice dominant.
6. QA gate: `tools/onscreen_text.py` → `tools/compliance_check.py <slug> build/onscreen_text.txt`, loudness about -14 LUFS / true peak ≤ -1.5 dBTP, contact sheet of every beat from the rendered video, captions off the face, safe zones, end card legible at phone size, every on-screen claim traceable to the transcript. Fix and re-check; report real results.
7. Preview first (phone size), wait for the user's OK, then the final render into `out/`, copied where the user asks.
8. Close out: append to `learnings.md`, list open confirmations.

Never post or upload anything. If something needed is missing (brand files, licence number, footage rights, API key), ask. If a step fails, say so with the evidence.
