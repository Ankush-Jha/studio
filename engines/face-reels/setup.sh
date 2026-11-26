#!/usr/bin/env bash
# Studio face reels: one-time setup. Safe to re-run (skips what is already there).
#
#   bash engines/face-reels/setup.sh                 # core: system tools check, vendor engines, model weights, media venv
#   bash engines/face-reels/setup.sh --heavy         # + ghost-editor's heavy installers (person matte, audio QA, Mixkit library,
#                                                    #   pinned HyperFrames): about 4.5 GB, see tools/setup_all.sh
#   bash engines/face-reels/setup.sh --design-skills # + the 95-repo design/motion skill collection (about 9.6 GB, optional,
#                                                    #   ideas and reference only; see docs/design-skills-CATALOG.md)
#
# Nothing here is committed to git: vendor/, tools/models/, .venv-media/ and clients/ are gitignored.
# Third-party code is cloned at the exact commits that were security-reviewed (docs/VENDOR.md).
# Do not change a commit without reading the diff first.
set -euo pipefail
A="$(cd "$(dirname "$0")" && pwd)"
V="$A/vendor"; M="$A/tools/models"
HEAVY=0; DESIGN=0
for a in "$@"; do case "$a" in --heavy) HEAVY=1;; --design-skills) DESIGN=1;; *) echo "unknown option $a"; exit 2;; esac; done
step(){ echo; echo "### $*"; }
have(){ command -v "$1" >/dev/null 2>&1; }

step "1. system tools"
miss=0
for t in ffmpeg ffprobe node git curl uv; do
  if have "$t"; then echo "ok    $t"; else echo "MISS  $t"; miss=1; fi
done
if have ffmpeg && ! ffmpeg -hide_banner -version >/dev/null 2>&1; then
  echo "FAIL  ffmpeg is installed but does not start (broken dylibs after an OS/Homebrew update): run  brew reinstall ffmpeg"; miss=1
fi
if have whisper-cli; then echo "ok    whisper-cli (whisper.cpp)"; else echo "MISS  whisper-cli: brew install whisper-cpp"; fi
have yt-dlp && echo "ok    yt-dlp" || echo "opt   yt-dlp (brew install yt-dlp): only for studying public reference reels"
[ "$miss" = 0 ] || echo "Install the missing tools (macOS: brew install ffmpeg node git uv whisper-cpp), then re-run."

step "2. vendor engines at reviewed commits (about 480 MB)"
mkdir -p "$V"
clone(){ # clone <dir> <github owner/repo> <full commit sha>
  local d="$V/$1" r="$2" sha="$3"
  if [ -d "$d/.git" ] && [ "$(git -C "$d" rev-parse HEAD)" = "$sha" ]; then echo "have  $1 @ ${sha:0:7}"; return 0; fi
  rm -rf "$d"; mkdir -p "$d"
  git -C "$d" init -q && git -C "$d" remote add origin "https://github.com/$r.git"
  if git -C "$d" fetch -q --depth 1 origin "$sha" && git -C "$d" checkout -q FETCH_HEAD; then echo "ok    $1 @ ${sha:0:7}"
  else echo "FAIL  $1 ($r @ $sha): repo moved or commit gone; re-review before using another commit"; fi
}
clone ghost-editor              kurbaitaev/ghost-editor                ce172726c36293722b08eb57b5b307d4f06389e8
clone claude-video-effects      Vibha-Ramprakash/claude-video-effects  a6c05c5acfadbc6730b3a6dae0fde7b886eb2207
clone papercut-explainer        0xS4N4TG/papercut-explainer            ff8223abc8136cc09e8d7e9b62ecb5d080c389e1
clone paper-reel                haiderfarooq3/paper-reel               9c5bc57b5e10a0cf07d3935c91c2ac30971c69b2
clone gbro-collage-info         pyang5166/gbro-collage-info            0b97a817a6b65285d8aa90431079500a29092eab
clone motion-graphics           Barty-Bart/motion-graphics             3d83d987d658601d8a1269eb691622bdcd427335
clone gsap-skills               greensock/gsap-skills                  aed9cfd3277740755f6bfc1155c7aa645403b760
clone kinetic-typography-skills iart-ai/kinetic-typography-skills      2b79c81230c6647a344844f9ed53b6fa07f3f1f9
clone motion-kit                hughminhphan/motion-kit                6173e5c408f81f1989435843af3f0788b74bda96
clone motion-video-kit          echris6/motion-video-kit               e4b1c0004080fe6a0deb883631bad5eba1e5f339
clone motionmaxxing             Tejashmakwana/motionmaxxing            8c8ec0f2a6f6c9a0da15cd24f7b1298ab298368c
clone MotionCraft               ahmdd4vd/MotionCraft                   8f4871543399c1981c247b734d9a123e6a6feb7a
clone 30x-video                 norahe0304-art/30x-video               51a606343e8af2fd0320c3d87597d0a75a6ea2dd
clone skills                    anthropics/skills                      2c5958ecac7cee2b583967a2c4981d0f4a75c579
# Studio Films (the film-style library) is not cloned: it lives in this repo at engines/films/.

step "3. model weights into tools/models (about 210 MB)"
mkdir -p "$M"
get(){ # get <file> <bytes> <url>
  local f="$M/$1"
  if [ -f "$f" ] && [ "$(wc -c < "$f" | tr -d ' ')" = "$2" ]; then echo "have  $1"; return 0; fi
  curl -fL --retry 3 -o "$f.part" "$3" && mv "$f.part" "$f" && echo "ok    $1"
  [ "$(wc -c < "$f" | tr -d ' ')" = "$2" ] || echo "WARN  $1 size differs from the reviewed file ($2 bytes)"
}
get face_landmarker.task             3758596   https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
get selfie_multiclass_256x256.tflite 16371837  https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite
get selfie_segmenter.tflite          249537    https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite
get ggml-small.en-q5_1.bin           190098681 https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin

step "4. media venv (.venv-media): numpy, OpenCV, MediaPipe, SciPy, Pillow, Playwright, openai-whisper"
if [ ! -x "$A/.venv-media/bin/python" ]; then
  if have uv; then uv venv -q --python 3.12 "$A/.venv-media"; else python3 -m venv "$A/.venv-media"; fi
fi
PY="$A/.venv-media/bin/python"
if have uv; then uv pip install -q --python "$PY" -r "$A/requirements-media.txt"; else "$PY" -m pip install -q -r "$A/requirements-media.txt"; fi
"$PY" -m playwright install chromium >/dev/null && echo "ok    playwright chromium"
"$PY" -c "import numpy, cv2, mediapipe, scipy, PIL, playwright, whisper; print('ok    media venv imports')"

step "5. skills for this engine (engines/face-reels/.claude/skills, gitignored)"
S="$A/.claude/skills"; mkdir -p "$S"
link(){ [ -f "$V/$2/SKILL.md" ] && ln -sfn "../../vendor/$2" "$S/$1" && echo "link  $1"; }
link ghost-editor ghost-editor
link effects claude-video-effects
link paper-reel paper-reel
link gbro-collage-info gbro-collage-info
for d in "$V"/motion-graphics/skills/* "$V"/papercut-explainer/skills/*; do
  [ -f "$d/SKILL.md" ] && ln -sfn "../../vendor/${d#"$V"/}" "$S/$(basename "$d")" && echo "link  $(basename "$d")"
done

if [ "$HEAVY" = 1 ]; then step "6. heavy installers (tools/setup_all.sh)"; bash "$A/tools/setup_all.sh"; fi
if [ "$DESIGN" = 1 ]; then step "7. design-skills collection"; bash "$A/tools/fetch_design_skills.sh"; fi

step "done"
echo "Next: export MEDIA_PY=\"$PY\"   (ghost-editor's doctor.sh and scripts use it)"
echo "      bash $V/ghost-editor/scripts/doctor.sh"
