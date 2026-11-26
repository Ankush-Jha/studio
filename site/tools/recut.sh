#!/bin/bash
# recut.sh <slug> <cut seconds>: re-cut a film from the original at a given point (bitrate capped, 0.6 s fade)
s=$1; e=$2; cd "${FILMS_WORK:-.}"
br=$(ffprobe -v error -select_streams v -show_entries stream=bit_rate -of csv=p=0 web/$s.mp4 | tr -dc 0-9); fs=$(python3 -c "print(round($e-0.6,3))")
ffmpeg -v error -y -i web/$s.mp4 -t $e -vf "fade=t=out:st=$fs:d=0.6" -af "afade=t=out:st=$fs:d=0.6" \
  -c:v libx264 -preset slow -crf 23 -maxrate $br -bufsize $((br*2)) -pix_fmt yuv420p -profile:v high -movflags +faststart -c:a aac -b:a 128k web-trimmed/$s.tmp.mp4 && mv web-trimmed/$s.tmp.mp4 web-trimmed/$s.mp4
