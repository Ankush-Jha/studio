---
name: motion
description: Studio Motion. Render template-driven Instagram reels and GIFs in code (kinetic type, animated mortgage maths, phone POV, 3D object, and Studio Films styles as data-driven templates) for a broker client, with the same tokens, fonts and maths as Studio Stills. Use when someone asks for an animated data reel, a kinetic-type reel, a looping GIF or an animated version of a still/carousel idea, rather than a hand-directed film.
---

# Studio Motion

Engine: `engines/motion/` (read its `README.md` for the CLI, templates, data format and the AE/Lottie bridge; `DECISION.md` for why HTML + GSAP + Chromium + ffmpeg). House rules: `playbook/PLAYBOOK.md` ("Directing graphic reels", "Instagram specs", "Copy that reads as AI", "Compliance and trust").

1. **Client and idea.** The client needs a token file in `engines/stills/tokens/clients/<id>.json` and a roster entry in `engines/stills/library/roster.json` (example: `northline-mortgages`, fictional). Never invent compliance values; bracketed placeholders render tagged and `--strict` refuses.
2. **Data file** `engines/motion/data/<id>.json` (model: `data/heloc-paul.json`): `calc` inputs, `expect` lines copied from checked maths (a mismatch stops the render), `assumptions` with `{apr}`, per-template blocks (`story`, `kinetic`), and `byClient.<id>` so each account gets its own numbers, opening line and stamp.
3. **Pick a template:** `pop-hook` (loud default), `phone-pov`, `object-3d`, `kinetic-hook` (calm, also GIF), `film-pop-art`, `film-thermal`, `film-game-show`.
4. **Render** from `engines/motion/`:
   ```bash
   node render.mjs templates/<t> --data data/<id>.json --client <client> --quality draft   # look first
   node render.mjs templates/<t> --data data/<id>.json --client <client> --strict          # final
   node render.mjs templates/kinetic-hook --data data/<id>.json --client <client> --gif     # GIF
   ```
   Needs `npm install && npm run setup` in `engines/motion` and ffmpeg on PATH (`brew reinstall ffmpeg` if it will not start).
5. **Check** the `.strip.jpg` (frames from the delivered MP4, safe zone dashed) and the `.manifest.json` (maths audit, QA per keyframe, reading time, loop seam, delivery gate). Fix every QA issue; read every frame of the strip at full size.
6. **Deliver** the MP4, `.poster.jpg` (cover) and caption; list open TODOs (compliance, APR, music licence, AI label for TTS voice). Never post or upload anything.
