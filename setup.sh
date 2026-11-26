#!/bin/sh
# Studio setup: makes this laptop run Studio exactly like the original one.
#   sh setup.sh            everything (system check, client data link, Python + Node deps, all engines, doctor)
#   sh setup.sh --no-engines   skip the big engine installs (films voice/music packs, face-reels vendor)
# Safe to re-run. Pinned versions: .nvmrc (Node), .python-version (Python), studio/requirements.txt,
# package-lock.json files (npm ci), Brewfile (system tools).
set -e
R="$(cd "$(dirname "$0")" && pwd)"
cd "$R"
ENGINES=1; [ "$1" = "--no-engines" ] && ENGINES=0
say() { printf '\n== %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1. Install system tools first:  brew bundle --file=Brewfile"; exit 1; }; }

say "1/6 System tools"
need git; need node; need npm; need ffmpeg
need uv   # installs the pinned Python (.python-version) by itself
NODE_MAJ=$(node -p 'process.versions.node.split(".")[0]'); WANT_NODE=$(cat .nvmrc)
[ "$NODE_MAJ" = "$WANT_NODE" ] || echo "  note: Node $NODE_MAJ found, Studio is pinned to Node $WANT_NODE (.nvmrc). It usually works; for an exact match: nvm use / brew install node@$WANT_NODE"
command -v claude >/dev/null 2>&1 || echo "  note: Claude Code CLI not found. Install it (https://claude.com/claude-code) to run /create, /desk, /radar."

say "2/6 Client data"
sh studio/tools/link_data.sh

say "3/6 Studio Python (QA gate, evals)"
[ -x studio/.venv/bin/python ] || uv venv -q --python "$(cat .python-version)" studio/.venv
uv pip install -q --python studio/.venv/bin/python -r studio/requirements.txt
echo "  ok: studio/.venv ($(studio/.venv/bin/python --version))"

say "4/6 Studio Node libs (radar, Desk, custom-html)"
(cd studio/lib && npm ci --no-audit --no-fund --silent)
node studio/lib/node_modules/playwright-core/cli.js install chromium-headless-shell >/dev/null 2>&1 || echo "  note: chromium download failed; run: node studio/lib/node_modules/playwright-core/cli.js install chromium-headless-shell"
echo "  ok: studio/lib"

say "5/6 Engines"
for e in stills motion; do
  if [ -f "engines/$e/package-lock.json" ]; then (cd "engines/$e" && npm ci --no-audit --no-fund --silent && npm run -s setup >/dev/null 2>&1 || true) && echo "  ok: engines/$e"; fi
done
if [ -f engines/stills/requirements.txt ]; then
  [ -x engines/stills/.venv/bin/python ] || uv venv -q --python "$(cat .python-version)" engines/stills/.venv
  uv pip install -q --python engines/stills/.venv/bin/python -r engines/stills/requirements.txt && echo "  ok: engines/stills/.venv"
fi
if [ $ENGINES = 1 ]; then
  [ -f engines/films/setup.sh ] && sh engines/films/setup.sh deps voice music
  [ -f engines/face-reels/setup.sh ] && bash engines/face-reels/setup.sh || echo "  note: face-reels setup did not finish; see engines/face-reels/tools/SETUP.md"
else
  echo "  skipped films voice/music packs and face-reels engines and models (--no-engines)"
fi
[ -f studio/.env ] || { cp studio/.env.example studio/.env; chmod 600 studio/.env; echo "  created studio/.env (add your YouTube / Meta keys for /radar; everything else works without them)"; }

say "6/6 Doctor"
sh studio/tools/doctor.sh
