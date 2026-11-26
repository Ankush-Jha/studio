# Desk design system

World: film production board + broadcast control room (brief-pinned). Operate mode: standard controls, the world lends type, palette, density and one signature move.

## Signature move
Edge print: machine-printed metadata in Martian Mono condensed (wdth 75), 10px, uppercase, +0.07em, colour `--edge`, along the bottom of every node, card and media object, and as the activity ticker along the screen's bottom edge. Graph edges are double hairlines (a 7px rail stroked over by a 4.2px ground stroke) with small frames travelling along them where work flows.

## Colour (dark first; light redefines the same tokens)
| Token | Dark | Light | Job |
|---|---|---|---|
| `--ground` / `-2` / `-3` / `-4` | #0c0f12 / #11151a / #171c22 / #1e242b | #e9ecea / #f7f8f7 / #fff / #eef1ef | canvas, panels, raised, wells |
| `--line` / `--line-2` | #242b33 / #323b45 | #d3d9dc / #bcc5ca | hairlines |
| `--ink` / `-2` / `-3` | #e8ecef / #aab4bd / #7d8892 | #10161b / #3f4b55 / #5c6871 | text |
| `--rail` | #13232b (both themes) | | committed shell colour |
| `--run` | #3fd08f | #11804f | running (tally green) |
| `--wait` | #f5b83d | #a86a00 | gate waiting (amber glow) |
| `--fail` | #ff5d4f | #c9321f | failed |
| `--course` | #cf5ce0 | #9a2aa6 | reserved: the selected job's route, focus, selection |
| `--edge` | #93b0be | #46636f | edge print |
Format strips: reel yellow, short orange, carousel blue, static white/grey, story green, cover tan, footage pink, gif teal.

## Type
Archivo variable (OFL): UI at wdth 100, 13.5px base; display at wdth 62–72, weight 760–800, uppercase for screen and drawer titles, concept letters at 54px. Martian Mono variable (OFL) at wdth 75 for edge print, timecode, metrics, labels. Tabular numerals throughout.

## Shape and density
Square corners (2px), hairline borders, 4px rhythm, dense lists with 1px separators instead of boxes. Shadows are offset and soft; the only glow is the amber gate-waiting state the brief asks for.

## Motion
Running nodes pulse a ring; waiting gates breathe amber; frames travel along active edges (SVG animateMotion); drawer slides with an exponential ease; ticker scrolls and pauses on hover. `prefers-reduced-motion` stops all of it.
