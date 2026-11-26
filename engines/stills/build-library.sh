#!/usr/bin/env bash
# Render every style in the library with the example client, run the QA gate, build out/library-overview.jpg.
# Each line: spec, client, then optional --style/--variant/--format flags.
# Replace northline-mortgages with your own clients once they have token files and roster entries.
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p out
C=northline-mortgages
R() { node render.mjs "specs/library/$1.json" --client "$2" "${@:3}" 2>&1 | grep -E "Done|✗|FAIL" ; }
for style in swiss terminal bento magazine annotated cutout riso bold-type isometric paper-trail broadsheet; do
  R dec9-variable "$C" --style "$style" --anyGroup                        # carousel, variant from the roster/token
  R dec9-variable "$C" --style "$style" --anyGroup --format story --only 1 # reel/story cover
  R dec9-variable "$C" --style "$style" --anyGroup --format square --only 1
done
R heloc-paul "$C" --style magazine --anyGroup                              # a money story in a photo-ready style
# Gate + overview
node tools/qa-gate.mjs > out/qa-gate.txt; tail -12 out/qa-gate.txt
node tools/library-overview.mjs
