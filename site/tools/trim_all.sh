#!/bin/bash
# waits for the downloads, detects each film's credit (4 at a time), then trims: cut 0.5 s before the credit, 0.6 s fade out (picture + sound)
cd "${FILMS_WORK:-.}"
until grep -q DONE dl.log; do sleep 10; done
mkdir -p credits web-trimmed
ls web/*.mp4 | xargs -P 4 -I{} sh -c 'b=$(basename {} .mp4); [ -s credits/$b.json ] || python3 find_credit.py {} > credits/$b.json'
for j in credits/*.json; do
  s=$(basename $j .json); c=$(python3 -c "import json;print(json.load(open('$j'))['credit_at'] or '')")
  if [ -z "$c" ]; then cp web/$s.mp4 web-trimmed/$s.mp4; echo "$s untouched"; continue; fi
  e=$(python3 -c "print(round(max(1,$c-0.5),3))"); fs=$(python3 -c "print(round($e-0.6,3))")
  ffmpeg -v error -y -i web/$s.mp4 -t $e -vf "fade=t=out:st=$fs:d=0.6" -af "afade=t=out:st=$fs:d=0.6" \
    -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -profile:v high -movflags +faststart -c:a aac -b:a 128k web-trimmed/$s.mp4 && echo "$s cut at $e"
done
touch web-trimmed/DONE
echo ALLDONE
