#!/bin/bash
# For styles whose poster.jpg shows the upstream credit, take a clean still from the trimmed film into site/posters/<slug>.jpg.
cd "${FILMS_WORK:-.}"
ST=$(git rev-parse --show-toplevel)/engines/films/styles; OUT=$(git rev-parse --show-toplevel)/site/posters; mkdir -p $OUT
PAT='lemo|opuscar|claude ?opus|clawd'
for s in $(ls $ST); do
  [ -f $ST/$s/poster.jpg ] || continue
  tesseract $ST/$s/poster.jpg - --psm 11 2>/dev/null | grep -qiE "$PAT" || continue
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 web-trimmed/$s.mp4); fsec=$(python3 -c "import json;print(json.load(open('$ST/$s/style.json'))['frame_sec'])")
  done=0
  for t in $fsec $(python3 -c "d=$d;print(' '.join(str(round(d*k,2)) for k in (.5,.35,.65,.25,.75,.45,.55)))"); do
    python3 -c "import sys;sys.exit(0 if $t < $d-1 else 1)" || continue
    ffmpeg -v error -y -ss $t -i web-trimmed/$s.mp4 -frames:v 1 -q:v 3 /tmp/sk_cand.jpg
    lum=$(ffmpeg -v error -i /tmp/sk_cand.jpg -vf "scale=1:1,format=gray" -f rawvideo - | od -An -tu1 | tr -d ' ')
    [ "${lum:-0}" -lt 25 ] && continue
    ffmpeg -v error -y -i /tmp/sk_cand.jpg -vf scale=2560:-1 /tmp/sk_big.png
    tesseract /tmp/sk_big.png - --psm 11 2>/dev/null | grep -qiE "$PAT" && continue
    cp /tmp/sk_cand.jpg $OUT/$s.jpg; echo "$s <- ${t}s"; done=1; break
  done
  [ $done = 1 ] || echo "$s: NO CLEAN FRAME"
done
