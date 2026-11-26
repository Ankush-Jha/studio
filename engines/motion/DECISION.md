# Render core: decision

**Decision (16 Nov 2026):** HTML/CSS/SVG (+ three.js for 3D) animated on one GSAP timeline, rendered frame by frame in headless Chromium (Playwright), encoded with ffmpeg. All free for commercial use. Remotion is not adopted now; it would be a workflow upgrade, not a quality upgrade (details below).

## Why this stack

| Need | How this stack meets it |
|---|---|
| Same brand as the stills | Reads the same tokens (`engines/stills/tokens`), fonts (`engines/stills/fonts`), colour maths and mortgage maths (`engines/stills/lib`, via `lib/statics.mjs`). A client's reel, carousel and static agree to the cent and the colour. |
| Frame-accurate, deterministic output | The timeline is paused and only seeked: frame *n* is rendered at exactly *n*/30 s, by any worker, in any order. Each render tests this (out-of-order frames: byte-identical, or ≥ 60 dB PSNR, recorded in the manifest; measured 69–83 dB, i.e. ±1 level on a few edge pixels, from Chromium's compositor). |
| Motion quality | GSAP is the strongest timeline/easing engine on the web (custom bezier eases, staggers, overlaps). Motion blur is real temporal supersampling (4 sub-frames per frame, 180° shutter, averaged in ffmpeg). |
| 3D | three.js r186 (MIT), bundled once to `vendor/three.iife.js`, rendered on the GPU in the same page (about 150 ms/frame at 1080×1920). |
| Numbers you can trust | Every figure comes from `lib/calc.mjs`, and `expect` lines copied from the idea's checked math must match or the render stops. |
| Instagram delivery | ffmpeg: H.264 High 4.1, yuv420p, BT.709 matrix with VUI tags at frame level, limited range, 30 fps CFR, AAC-LC 48 kHz 128 kbps target, +faststart. Each render is verified by ffprobe and a delivery gate. |
| Sound | SFX synthesised in ffmpeg (no licences), cue-timed by the template, normalised to −14 LUFS with ffmpeg-normalize (EBU R128, two-pass). Slots for voice and a licensed music bed (ducked under the voice). |
| Throughput | Parallel capture (5 workers): a 15 s reel takes about 30 s as a draft, and about 95 s at final quality with 4-sample motion blur. The 3D direction takes about 5 min at final quality. |

## Options weighed

| Option | Output quality | Licence and cost for an agency | Verdict |
|---|---|---|---|
| **HTML/CSS/SVG + GSAP + Chromium + ffmpeg** (chosen) | Chromium raster; same as Remotion | Free. GSAP "standard no-charge" licence covers commercial use including all plugins. The only restriction is not building a tool that competes with Webflow's visual animation builder. Playwright (Apache-2.0), three.js (MIT), ffmpeg (LGPL/GPL build, used as a CLI) | **Chosen** |
| Remotion 4 (React) | Same Chromium raster, so no visible gain | Free only for teams of 3 or fewer. An agency of more than 3 people needs a Company License: **Remotion for Automators** at $0.01 per render, sold in blocks of 1,000 ($10 each), with a **$100/month minimum**. Our nightly batch is an automated pipeline, so this tier applies. **Remotion for Creators** costs **$25 per seat per month** for people using Studio by hand. Enterprise starts at $500/month. Source: remotion.dev/docs/license/pricing, read 16 Nov 2026. | Not now. Its real advantages are workflow: Studio's scrubbing/props UI, `<Player>` for previews in the dashboard, `<OffthreadVideo>` for frame-exact client footage, and Lambda scale-out. |
| Motion Canvas (MIT) | Canvas-2D raster; weaker live text layout | Free | Good for diagrams, weaker for typography-led brand work |
| Lottie (lottie-web, MIT) | Plays AE (Bodymovin) animation | Free | Used as the **AE bridge** (README), not as the core |
| nexrender + After Effects | AE quality | AE licences on a render machine (Adobe's terms on server rendering apply) | Only if the designers' AE projects must render unchanged (README) |

## If you later buy Remotion
Templates here are pure functions of time: `window.__seek(t)` sets the frame. Wrapping one in a Remotion composition takes about 30 lines: `useCurrentFrame()` → `tl.seek(frame / fps)` inside a `useLayoutEffect`. Our data, calc, tokens, SFX and ffmpeg delivery stages all carry over. Buy Automators ($100/month minimum) if the nightly job renders. Add Creators seats ($25/month each) only for designers who want Studio.

## Known limits
- Chromium's compositor can differ by ±1 level on a few edge pixels between runs, so frames are not always byte-identical. This is visually identical and invisible after H.264. The determinism number is in every manifest.
- Client footage (face reels) is composited in ffmpeg under an alpha render (`--alpha` gives ProRes 4444). It is not decoded inside the page.
- This ffmpeg build has no `drawtext`, so contact sheets and strips are laid out in Chromium.
