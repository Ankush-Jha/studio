#!/bin/sh
# Windows (inside WSL Ubuntu) or Linux: installs the system tools Studio needs, then runs setup.sh.
# The Mac equivalent is: brew bundle --file=Brewfile && sh setup.sh
#   sh install-wsl.sh              everything
#   sh install-wsl.sh --no-engines skip the big engine installs (passed through to setup.sh)
# Safe to re-run. Asks for your Ubuntu password once (for apt).
set -e
R="$(cd "$(dirname "$0")" && pwd)"
cd "$R"
say() { printf '\n== %s\n' "$*"; }

say "System packages (git, ffmpeg, tesseract, build tools)"
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates unzip build-essential ffmpeg tesseract-ocr

say "Node $(cat .nvmrc) (pinned in .nvmrc, installed with nvm)"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
. "$NVM_DIR/nvm.sh"
nvm install "$(cat .nvmrc)"
nvm alias default "$(cat .nvmrc)" >/dev/null

say "uv (installs the pinned Python by itself)"
command -v uv >/dev/null 2>&1 || curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

say "Claude Code"
command -v claude >/dev/null 2>&1 || curl -fsSL https://claude.ai/install.sh | bash
export PATH="$HOME/.local/bin:$HOME/.claude/bin:$PATH"

say "Libraries the headless browser needs (renders stills and films)"
(cd studio/lib && npm ci --no-audit --no-fund --silent)
sudo env "PATH=$PATH" node studio/lib/node_modules/playwright-core/cli.js install-deps chromium || echo "  note: could not install browser libraries; rendering may fail until they are installed"

sh setup.sh "$@"

cat <<'EOF'

Done. Open Studio any time from the Ubuntu app with:
  cd ~/studio && claude
(Footage reels need whisper.cpp, which this script does not install yet; everything else is ready.)
EOF
