# Engine: remotion (OFF by default)

**Status: OFF.** Do not route any job here until the user confirms a Remotion licence in writing (a line in `$R/studio/.env` is not enough; the user says so in chat or at a gate).

**Licence:** Remotion is free only for individuals and companies of **3 people or fewer**. This agency is larger, so it needs a Company License: **Remotion for Automators** (automated/nightly rendering) at $0.01 per render, sold in blocks of 1,000, **$100/month minimum**; **Remotion for Creators** is $25 per seat per month for people using Studio by hand; Enterprise from $500/month. Source: `engines/motion/DECISION.md`, which read remotion.dev/docs/license/pricing on 16 Nov 2026. UNVERIFIED: prices not re-checked since. The decision on file: Remotion gives no visible quality gain over the HTML/GSAP/Chromium engines Studio already has (same Chromium raster); its advantages are workflow (Studio scrubbing UI, `<Player>` previews, `<OffthreadVideo>` frame-exact footage, Lambda scale-out).

```sh
R=$(git rev-parse --show-toplevel)
J=$R/jobs/<id>; P=$J/project; O=$J/out
```

## Best for

If enabled: React-based templated reels where the team wants Remotion Studio's props UI, frame-exact client footage via `<OffthreadVideo>`, or a `<Player>` preview inside the Desk. Every Studio use case is already covered by `films`, `hyperframes`, `motion` or `face-reels`.

## Formats and sizes

Composition `width={1080} height={1920} fps={30}` for reels, `1080×1350` for 4:5. Text inside x 65–1015, y 270–1248.

## Inputs it needs

Concept, copy, kit tokens/fonts (OFL files via `@remotion/fonts` or `staticFile()`), audio WAVs (`voice-music.md`).

## Setup check (exact command)

```sh
test -f ~/.claude/skills/remotion-best-practices/SKILL.md && grep -m1 version ~/.claude/skills/remotion-best-practices/SKILL.md
```

Verified 19 Nov 2026: skill present (version 4.0.544). No Remotion project or npm install exists for Studio. UNVERIFIED: `npx create-video` not run.

## Run (only once enabled)

1. Load the `remotion-best-practices` skill (router) and follow `remotion-create/REFERENCE.md` to scaffold a project in `$P/remotion/`; `remotion-markup`, `remotion-multimedia`, `remotion-captions` and `remotion-render` for the parts used. Pin the Remotion version in `package.json` (exact, no `^`).
2. Render: per `remotion-render/REFERENCE.md`, H.264, 30 fps, to `$P/out/master.mp4`.
3. Delivery: `sh $R/studio/engines/bin/deliver.sh "$P/out/master.mp4" "$O/<name>.mp4"`.
4. Porting a HyperFrames/motion template instead (DECISION.md): wrap the seekable page, `useCurrentFrame()` → `tl.seek(frame / fps)` in a `useLayoutEffect` (about 30 lines).

## Branding

As in `hyperframes.md`: verbatim `kit.complianceLine` in the safe zone on the payoff beat and in caption lines 1–2; footer/outro only where a kit rule asks; no logo on frame 1.

## Outputs to collect

`$O/<name>.mp4`, `$O/poster.jpg`, `$O/caption.md`. Card `engine: "remotion"` (add it to SPEC's engine list when enabled).

## Time and usage

Licence cost above. Lambda rendering adds AWS cost; not used.

## Built-in QA vs what Studio's gate adds

Remotion has no content QA; Studio's full gate applies (safe zone, hook, copy, maths, loudness, compliance, critic).

## Pitfalls

- Using it without the licence confirmation.
- Remotion's own skills install/upgrade packages freely; keep the version pinned per project.

## Picking a style against the client's history

Same as HyperFrames: record the template name as `style`; check `history.json` and `variety.py` (UNVERIFIED: being built).
