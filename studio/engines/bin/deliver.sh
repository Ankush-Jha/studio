#!/bin/sh
# PLAYBOOK delivery pass for any reel master: H.264 High yuv420p, BT.709 limited-range tags, 30 fps CFR,
# AAC-LC 128 kbps 48 kHz, +faststart, -14 LUFS integrated, true peak under -1 dBTP.
#   sh $R/studio/engines/bin/deliver.sh <master.mp4> <out.mp4>
# Video is copied when the master is already h264/yuv420p/tv/bt709/30 fps, otherwise re-encoded (CRF 17).
# Audio is always re-encoded through a two-pass loudnorm (I -14, TP ceiling tightened until the AAC file measures
# under -1 dBTP; up to 3 tries), with a 4x-oversampled limiter at that ceiling. Exit 1 if the final file still fails the loudness or peak target.
# Audio encoder: AudioToolbox AAC-LC in true CBR 128k (aac_at, macOS) because ffmpeg's native aac runs ABR and lands near
# 131-132 kbps (the QA gate warns above 128.5k). Where aac_at is missing it falls back to native aac and prints a note.
set -e
IN=${1:?master}; OUT=${2:?out}
PY="$(cd "$(dirname "$0")/../../.." && pwd)/studio/.venv/bin/python"
V=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,pix_fmt,color_range,color_space,r_frame_rate -of csv=p=0 "$IN")
case "$V" in
  "h264,yuv420p,tv,bt709,30/1") VARGS="-c:v copy" ;;
  *) VARGS="-c:v libx264 -profile:v high -level 4.1 -preset slow -crf 17 -maxrate 20M -bufsize 30M -vf scale=1080:1920:flags=lanczos:out_range=tv,setsar=1,format=yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -r 30" ;;
esac
if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q ' aac_at '; then AENC="-c:a aac_at -aac_at_mode cbr -b:a 128k"; else AENC="-c:a aac -b:a 128k"; echo "  note: aac_at not available, native aac is ABR (may measure ~131 kbps)"; fi
measure() { ffmpeg -nostdin -hide_banner -i "$1" -map 0:a:0 -af ebur128=peak=true -f null - 2>&1 | sed -n '/Summary/,$p'; }
for TP in -2.0 -3.0 -4.0; do
  J=$(ffmpeg -nostdin -hide_banner -i "$IN" -map 0:a:0 -af loudnorm=I=-14:TP=$TP:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
  LN=$(echo "$J" | "$PY" -c "import json,sys; d=json.load(sys.stdin); print(f\"loudnorm=I=-14:TP=$TP:LRA=11:measured_I={d['input_i']}:measured_TP={d['input_tp']}:measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}:offset={d['target_offset']}:linear=true\")")
  ffmpeg -nostdin -v error -y -i "$IN" -map 0:v:0 -map 0:a:0 $VARGS -af "$LN,aresample=192000,alimiter=limit=$(awk -v d="$TP" 'BEGIN{printf "%.4f", 10^(d/20)}'):attack=5:release=80:level=disabled,aresample=48000" $AENC -ar 48000 -movflags +faststart -shortest "$OUT"
  M=$(measure "$OUT"); I=$(echo "$M" | awk '/I:/{print $2; exit}'); P=$(echo "$M" | awk '/Peak:/{print $2; exit}')
  if awk -v p="$P" -v i="$I" 'BEGIN{exit !(p < -1.0 && i > -15.0 && i < -13.0)}'; then OK=1; break; else OK=0; echo "  retry: I $I LUFS, TP $P dBTP at ceiling $TP"; fi
done
ffprobe -v error -show_entries stream=codec_name,profile,width,height,pix_fmt,color_range,color_space,color_primaries,color_transfer,r_frame_rate,bit_rate,sample_rate -show_entries format=duration,size,bit_rate -of compact "$OUT"
echo "loudness: I $I LUFS, true peak $P dBTP"
[ "$OK" = 1 ] || { echo "FAIL: loudness/peak target not met"; exit 1; }
