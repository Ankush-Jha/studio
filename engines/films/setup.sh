#!/bin/sh
# Studio Films: check the toolkit and install its packages. Works from any folder and any clone location:
# every path is relative to this script's folder (the library root, engines/films/).
#   sh engines/films/setup.sh                    system tools present? which package tiers are installed? → LIB=<path>
#   sh engines/films/setup.sh deps [voice] [music]
#                                                install packages: core = Node packages (npm ci), headless browser,
#                                                Python .venv + requirements.txt, missing sample libraries and HDRIs;
#                                                voice = requirements-voice.txt + the Kokoro model; music = requirements-music.txt
#   sh engines/films/setup.sh demo <slug>        print one style's demo folder and poster (every demo ships with the library)
# FILMS_FETCH=0 skips the big downloads (sample libraries, HDRIs, Kokoro model); fetch them later with tools/fetch.sh.
# Adapted from the setup script of Lemo-Opuscar (MIT); see NOTICE.md.
set -e
LIB=$(cd "$(dirname "$0")" && pwd -P)
is_lib() { [ -f "$1/AGENTS.md" ] && [ -d "$1/core/render" ]; }
is_lib "$LIB" || { echo "✗ $LIB does not look like the Studio Films library (no AGENTS.md / core/render)"; exit 1; }
LIBS="freepats karoryfer salamander vcsl vsco2ce"

# Installed packages are tracked by content: a marker holds a checksum of the files they came from (and the Python
# version), so a changed package.json or requirements file triggers a reinstall.
sig() { cat "$@" 2>/dev/null | cksum | cut -d' ' -f1; }
pysig() { echo "$(sig "$1")-$("$LIB/.venv/bin/python" -V 2>&1 | cut -d. -f1,2)"; }
req() { [ "$1" = core ] && echo "$LIB/requirements.txt" || echo "$LIB/requirements-$1.txt"; }
node_ok() {
  [ -d "$LIB/node_modules" ] || return 1
  want=$(sig "$LIB/package.json" "$LIB/package-lock.json")
  [ "$(cat "$LIB/node_modules/.films-ok" 2>/dev/null)" = "$want" ] && return 0
  # node_modules copied in from elsewhere: accept it when npm agrees it matches package.json and the lock (offline check)
  if command -v npm >/dev/null && (cd "$LIB" && npm ls --omit=dev >/dev/null 2>&1); then
    echo "$want" > "$LIB/node_modules/.films-ok"; return 0
  fi
  return 1
}
py_ok() { [ "$(cat "$LIB/.venv/.films-$1" 2>/dev/null)" = "$(pysig "$(req "$1")")" ]; }
# a Python 3.11+ for the venv; kokoro-onnx (voice tier) needs < 3.14, so those come first
find_py() {
  for c in python3.12 python3.13 python3.11 python3 python; do
    "$c" -c 'import sys; sys.exit(not ((3, 11) <= sys.version_info[:2] < (3, 14)))' 2>/dev/null && { command -v "$c"; return 0; }
  done
  for c in python3 python; do
    "$c" -c 'import sys; sys.exit(sys.version_info < (3, 11))' 2>/dev/null && { command -v "$c"; return 0; }
  done
  return 1
}
have_lib() { [ -d "$LIB/core/audio/instruments/$1" ] && [ -f "$LIB/core/audio/instruments/index.json" ] && [ ! -e "$LIB/.release/instruments-$1.tar.download" ]; }
have_voice() { [ -f "$LIB/core/tts/kokoro-v1.0.onnx" ] && [ -f "$LIB/core/tts/voices-v1.0.bin" ]; }
have_hdri() { ls "$LIB"/core/assets/polyhaven/*.hdr >/dev/null 2>&1; }
# Windows (Git Bash): a venv keeps its Python in Scripts/python.exe. Give it the .venv/bin/python every tool calls,
# a shim that also forces UTF-8.
win_shim() {
  [ -f .venv/Scripts/python.exe ] && [ ! -e .venv/bin/python ] || return 0
  mkdir -p .venv/bin
  printf '#!/bin/sh\nPYTHONUTF8=1 PYTHONIOENCODING=utf-8 exec "$(dirname "$0")/../Scripts/python.exe" "$@"\n' > .venv/bin/python
  chmod +x .venv/bin/python
}
# One deps run per library at a time: a lock folder holds the run's pid; a lock whose run is gone is taken over.
lock_deps() {
  lock=$LIB/.films-deps.lock; n=0
  until mkdir "$lock" 2>/dev/null; do
    p=$(cat "$lock/pid" 2>/dev/null || true)
    if [ -n "$p" ] && ! kill -0 "$p" 2>/dev/null; then rm -rf "$lock"; continue; fi
    [ $n -gt 0 ] || echo "… another 'setup.sh deps' is installing into $LIB; waiting for it to finish"
    n=$((n + 1)); [ $n -lt 1800 ] || { echo "✗ $lock is still there after 30 minutes: remove it if no install is running"; exit 1; }
    sleep 1
  done
  echo $$ > "$lock/pid"
  trap 'rm -rf "$lock"' EXIT; trap 'exit 1' INT TERM HUP
}

case "$1" in
  ""|status) ;;
  deps)
    shift; tiers=core
    for t in "$@"; do case $t in voice|music) tiers="$tiers $t" ;; *) echo "usage: sh setup.sh deps [voice] [music]"; exit 1 ;; esac; done
    cd "$LIB"; lock_deps
    # system tools first: stop early with one clear message
    command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || { echo "✗ Node 20+ is needed (found: $(node -v 2>/dev/null || echo none))"; exit 1; }
    command -v npm >/dev/null || { echo "✗ npm not found: install Node 20+ first"; exit 1; }
    command -v ffmpeg >/dev/null || echo "! ffmpeg not found: install ffmpeg 7+ before the first render"
    command -v python3 >/dev/null || command -v uv >/dev/null || { echo "✗ python3 (3.11+) is needed"; exit 1; }
    if ! node_ok; then
      npm ci --no-audit --no-fund --loglevel=error
      sig package.json package-lock.json > node_modules/.films-ok
    fi
    node node_modules/playwright-core/cli.js install chromium-headless-shell   # the renderer's browser (a no-op when present)
    # a venv whose Python is gone (after a Python upgrade) can't be repaired in place: make it again
    win_shim
    [ ! -e .venv ] || .venv/bin/python -c pass 2>/dev/null || { echo "! $LIB/.venv is broken; making it again"; rm -rf .venv; }
    if [ ! -x .venv/bin/python ]; then
      py=$(find_py || true)
      if command -v uv >/dev/null; then uv venv --quiet --python "${py:-3.12}" .venv
      elif [ -n "$py" ]; then "$py" -m venv .venv
      else echo "✗ Python 3.11+ is needed (or install uv, which fetches it)"; exit 1; fi
      win_shim
    fi
    upy=.venv/bin/python; [ ! -f .venv/Scripts/python.exe ] || upy=.venv/Scripts/python.exe
    for t in $tiers; do
      py_ok "$t" && continue
      echo "↓ Python packages: $t tier"
      if command -v uv >/dev/null; then uv pip install --quiet --python "$upy" -r "$(req "$t")"
      else .venv/bin/python -m pip install --quiet --disable-pip-version-check -r "$(req "$t")"; fi
      pysig "$(req "$t")" > ".venv/.films-$t"
    done
    # big assets (Release packs of the upstream library), only when missing
    if [ "${FILMS_FETCH:-1}" = 0 ]; then
      echo "! FILMS_FETCH=0: skipping sample libraries, HDRIs and the Kokoro model (sh tools/fetch.sh fetches them later)"
    else
      for l in $LIBS; do have_lib "$l" || sh tools/fetch.sh instruments "$l"; done
      have_hdri || sh tools/fetch.sh hdri
      case " $tiers " in *" voice "*) have_voice || sh tools/fetch.sh voice ;; esac
    fi
    ;;
  demo)
    [ -n "$2" ] && [ -f "$LIB/styles/$2/STYLE.md" ] || { echo "usage: sh setup.sh demo <slug>  (slugs: $LIB/styles/README.md)"; exit 1; }
    [ -d "$LIB/styles/$2/demo" ] || { echo "✗ styles/$2 has no demo folder in this library"; exit 1; }
    echo "demo source: $LIB/styles/$2/demo"
    [ -f "$LIB/styles/$2/poster.jpg" ] && echo "demo poster: $LIB/styles/$2/poster.jpg"
    ;;
  *) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac

# System tools the pipeline needs (report only; installing them is up to the user)
miss=""
if command -v node >/dev/null; then
  [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || miss="$miss node20+(found $(node -v))"
else miss="$miss node20+"; fi
if command -v ffmpeg >/dev/null; then
  ffv=$(ffmpeg -version 2>/dev/null | sed -n '1s/^ffmpeg version n\{0,1\}\([0-9][0-9]*\)\..*/\1/p')
  [ -z "$ffv" ] || [ "$ffv" -ge 7 ] || miss="$miss ffmpeg7+(found $ffv.x)"
else miss="$miss ffmpeg"; fi
command -v uv >/dev/null || find_py >/dev/null || miss="$miss python3.11+(or uv)"
[ -n "$miss" ] && echo "! missing:$miss"
if ! { node_ok && py_ok core; }; then
  if [ -f "$LIB/node_modules/.films-ok" ] || [ -f "$LIB/.venv/.films-core" ]; then
    echo "! packages changed: run 'sh $LIB/setup.sh deps' to update them before the next render"
  else echo "! packages not installed yet: run 'sh $LIB/setup.sh deps' (a few minutes) before the first render"; fi
fi
mark() { if "$@"; then printf '✓'; else printf '✗'; fi; }
core_ok() { node_ok && py_ok core; }
voice_ok() { py_ok voice && have_voice; }
libs_ok() { for l in $LIBS; do have_lib "$l" || return 1; done; }
add=""; voice_ok || add="$add voice"; py_ok music || add="$add music"
tline="packages: core $(mark core_ok) · voice $(mark voice_ok) · music $(mark py_ok music) · samples $(mark libs_ok)"
core_ok && [ -n "$add" ] && tline="$tline  (when a film needs them: sh setup.sh deps$add)"
echo "$tline"
echo "LIB=$LIB"
