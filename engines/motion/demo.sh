#!/usr/bin/env bash
# Renders the proof set for the fictional example client: one idea (Paul's HELOC, an illustrative
# composite), three directions, a kinetic GIF, then the side-by-side overview. Add --quality draft for speed.
set -euo pipefail
cd "$(dirname "$0")"
Q="${@:-}"
D=data/heloc-paul.json
C=northline-mortgages
node render.mjs templates/pop-hook     --data $D --client $C --out out/directions/a-bold-pop/$C.mp4 $Q
node render.mjs templates/phone-pov    --data $D --client $C --out out/directions/b-phone-pov/$C.mp4 $Q
node render.mjs templates/object-3d    --data $D --client $C --out out/directions/c-object-3d/$C.mp4 $Q
node render.mjs templates/kinetic-hook --data $D --client $C --gif $Q
node tools/overview.mjs out/directions-overview.jpg \
  "A · Bold Pop (pop-hook)=out/directions/a-bold-pop/$C.mp4" \
  "B · Phone POV (phone-pov)=out/directions/b-phone-pov/$C.mp4" \
  "C · 3D Object (object-3d)=out/directions/c-object-3d/$C.mp4"
