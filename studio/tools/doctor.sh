#!/bin/sh
# Studio doctor: proves this laptop matches the reference setup. Prints one line per check; exits 1 if any FAIL.
R="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$R"
F=0
ok()   { printf '  ok    %s\n' "$*"; }
warn() { printf '  warn  %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; F=1; }

echo "Studio doctor ($R)"
# versions
n=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null); [ "$n" = "$(cat .nvmrc)" ] && ok "node $n (pinned $(cat .nvmrc))" || warn "node ${n:-missing} (pinned $(cat .nvmrc))"
[ -x studio/.venv/bin/python ] && ok "studio python $(studio/.venv/bin/python -c 'import sys;print("%d.%d"%sys.version_info[:2])')" || bad "studio/.venv missing (sh setup.sh)"
studio/.venv/bin/python - <<'EOF' 2>/dev/null && ok "python packages match studio/requirements.txt" || bad "python packages differ from studio/requirements.txt (sh setup.sh)"
import importlib.metadata as m, re, sys
reqs = [s.strip() for s in open('studio/requirements.txt') if s.strip() and not s.lstrip().startswith('#')]
bad = [r for r in reqs if m.version(r.split('==')[0]) != r.split('==')[1]]
sys.exit(1 if bad else 0)
EOF
command -v ffmpeg >/dev/null && ok "$(ffmpeg -version | head -1 | cut -d' ' -f1-3)" || bad "ffmpeg missing"
command -v tesseract >/dev/null && ok "tesseract (QA OCR)" || warn "tesseract missing: QA text checks are skipped"
command -v whisper-cli >/dev/null && ok "whisper-cli (QA voice check)" || warn "whisper-cpp missing: QA voice/caption check is skipped"
command -v claude >/dev/null && ok "claude CLI" || warn "Claude Code CLI missing: /create, /desk, /radar need it"
# data
[ -L kits ] && [ -f clients.json ] && ok "client data linked from private/ ($(ls kits | grep -v '^_' | grep -vc '\.') kits)" || bad "client data not linked (sh studio/tools/link_data.sh)"
[ -d private/.git ] && ok "private/ is the studio-clients repo ($(git -C private rev-parse --short HEAD 2>/dev/null || echo 'no commits'))" || warn "private/ is not a git repo (example data only, or not cloned)"
# engines
[ -f engines/films/AGENTS.md ] && ok "engine: films ($(ls engines/films/styles | grep -vc '^_\|README') styles)" || bad "engines/films missing"
[ -d engines/films/node_modules ] && ok "films node_modules" || bad "films deps missing (sh engines/films/setup.sh deps)"
[ -x engines/films/.venv/bin/python ] && ok "films .venv" || bad "films .venv missing (sh engines/films/setup.sh deps voice music)"
[ -d engines/stills/lib ] && ok "engine: stills" || bad "engines/stills missing"
[ -d engines/stills/node_modules ] && ok "stills node_modules" || warn "stills deps missing (cd engines/stills && npm ci)"
[ -d engines/motion/lib ] && ok "engine: motion" || bad "engines/motion missing"
[ -d engines/face-reels ] && ok "engine: face-reels" || warn "engines/face-reels missing"
[ -d studio/lib/node_modules ] && ok "studio/lib node_modules" || bad "studio/lib deps missing (cd studio/lib && npm ci)"
# guard + tools
printf '%s' "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$R/engines/films/AGENTS.md\"},\"cwd\":\"$R\"}" | node .claude/hooks/guard.mjs | grep -q deny && ok "guard hook blocks writes to engines/" || bad "guard hook not working"
node studio/tools/job.mjs list >/dev/null 2>&1 && ok "job tool" || bad "job tool failed"
node studio/tools/learn.mjs >/dev/null 2>&1 && ok "learning loop tool" || bad "learn.mjs failed"
[ -f studio/.env ] && ok "studio/.env present (keys optional, for /radar)" || warn "studio/.env missing (cp studio/.env.example studio/.env)"
echo
[ $F = 0 ] && echo "All required checks passed." || echo "Some checks FAILED: fix them, then run sh studio/tools/doctor.sh again."
exit $F
