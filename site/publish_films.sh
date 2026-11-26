#!/bin/sh
# Copies the directory's 720p films into a checkout of the studio-films repo and pushes them (its GitHub Pages serve them).
#   sh site/publish_films.sh <folder of <slug>.mp4 cuts> [checkout dir, default ../studio-films]
# The cuts are the upstream web cuts with the end credits trimmed (see site/README.md). Nothing is pushed unless something changed.
set -e
SRC="$1"; DEST="${2:-$(cd "$(dirname "$0")/../.." && pwd)/studio-films}"
[ -d "$SRC" ] || { echo "usage: sh site/publish_films.sh <films folder> [checkout]"; exit 1; }
[ -d "$DEST/.git" ] || git clone https://github.com/Ankush-Jha/studio-films.git "$DEST"
cp "$SRC"/*.mp4 "$DEST"/
touch "$DEST/.nojekyll"
cat > "$DEST/README.md" <<'EOF'
# SuperKreatives Studio films

The demo films behind the [Film Directory](https://ankush-jha.github.io/studio/), served by GitHub Pages at
`https://ankush-jha.github.io/studio-films/<style>.mp4`.

These films come from [Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar) by Lemomo (LemoLab), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Some include third-party material, credited in each style's
`demo/CREDITS` in the original repository. Changes: the original on-screen credits removed (end cards trimmed, the Spy Titles opening card cut, the News Package channel name erased).
EOF
cd "$DEST"
git add -A
if git diff --cached --quiet; then echo "studio-films: nothing changed"; exit 0; fi
git commit -qm "Update directory films ($(ls *.mp4 | wc -l | tr -d ' ') films)"
git push -q origin HEAD
echo "studio-films pushed"
