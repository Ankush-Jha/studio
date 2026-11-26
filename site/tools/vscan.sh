#!/bin/bash
# Apple Vision OCR at 2 fps over a trimmed film; prints "<slug> <second> <text>" for frames showing the credit
s=$1; T=$(mktemp -d); cd "${FILMS_WORK:-.}"
ffmpeg -v error -i web-trimmed/$s.mp4 -vf fps=2 $T/%04d.png
ocr/vocr $T/*.png | grep -iE 'lemo ?lab|lemo-|lemo ?opus|opuscar|claude ?opus|x claude|clawd' | while IFS=$'\t' read f txt; do n=$((10#$(basename $f .png))); echo "$s $(python3 -c "print(($n-1)/2)") ${txt:0:120}"; done
rm -rf $T
