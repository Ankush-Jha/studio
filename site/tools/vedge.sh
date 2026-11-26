#!/bin/bash
s=$1; T=$(mktemp -d); cd "${FILMS_WORK:-.}"
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 web-trimmed/$s.mp4 | tr -dc 0-9.)
ffmpeg -v error -ss $(python3 -c "print(max(0,$d-3))") -i web-trimmed/$s.mp4 -vf fps=8 $T/end_%03d.png
ffmpeg -v error -t 8 -i web-trimmed/$s.mp4 -vf fps=4 $T/start_%03d.png
ocr/vocr $T/*.png | grep -iE 'lemo ?lab|lemo-|lemo ?opus|opuscar|claude ?opus|x claude|clawd' | while IFS=$'\t' read f txt; do echo "$s $(basename $f) ${txt:0:100}"; done
rm -rf $T
