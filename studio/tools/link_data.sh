#!/bin/sh
# Plug the client data into Studio. Client data lives in private/ (your private studio-clients repo, cloned there).
# Without it, private/ is created from examples/ (one fictional client) so a fresh clone runs end to end.
# Then the folders the bot expects at the repo root are linked to private/. Safe to run any number of times.
set -e
R="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$R"
if [ ! -f private/clients.json ]; then
  echo "No private/ client data found: creating it from examples/ (fictional client Northline Mortgages)."
  echo "To use real clients instead: git clone <your studio-clients repo> private   then run this again."
  mkdir -p private && cp -R examples/. private/
fi
mkdir -p private/jobs private/evals/history private/evals/reviews private/desk/fixtures private/library
link() { # link <path in repo> <target relative to that path's folder>
  if [ -e "$1" ] && [ ! -L "$1" ]; then echo "  skip $1 (a real file/folder is there; move it into private/ first)"; return; fi
  ln -sfn "$2" "$1"
}
for x in clients.json clients.csv clients.jsonl assets_manifest.csv assets kits library jobs; do
  [ -e "private/$x" ] && link "$x" "private/$x"
done
for x in briefs.jsonl golden.jsonl golden_judge.md reviews history report.md report.json; do
  [ -e "private/evals/$x" ] && link "studio/evals/$x" "../../private/evals/$x"
done
link studio/desk/fixtures ../../private/desk/fixtures
echo "Client data linked from private/ ($(ls private/kits 2>/dev/null | grep -vc '^_' ) kits)."
# Extra copywriting/strategy skills kept in the private repo (third-party, licences vary): link each into .claude/skills.
if [ -d private/skills ]; then
  for d in private/skills/*/; do n=$(basename "$d"); [ -e ".claude/skills/$n" ] && [ ! -L ".claude/skills/$n" ] && continue; ln -sfn "../../private/skills/$n" ".claude/skills/$n"; done
  echo "Linked $(ls private/skills | wc -l | tr -d ' ') extra skills from private/skills."
fi
