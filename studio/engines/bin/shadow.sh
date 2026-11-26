#!/bin/sh
# Make a private, writable copy of the stills and motion engines inside a job, so a render can be
# tweaked per job without touching engines/. node_modules are symlinked to the engines' own; .venv is not copied
# (point STATICS_PYTHON at $R/engines/stills/.venv/bin/python). Usage:
#   sh $R/studio/engines/bin/shadow.sh <job project dir>      -> <project>/engines/{stills,motion}
set -e
R="$(cd "$(dirname "$0")/../../.." && pwd)"
P="${1:?usage: shadow.sh <job project dir>}"
E="$R/engines"
mkdir -p "$P/engines"
rsync -a --exclude out --exclude node_modules --exclude .venv --exclude .DS_Store --exclude 'tokens/clients/*' "$E/stills/" "$P/engines/stills/"
mkdir -p "$P/engines/stills/tokens/clients" "$P/engines/stills/out"
[ -d "$E/stills/tokens/clients" ] && rsync -a --ignore-existing "$E/stills/tokens/clients/" "$P/engines/stills/tokens/clients/"
[ -e "$P/engines/stills/node_modules" ] || { [ -d "$E/stills/node_modules" ] && ln -s "$E/stills/node_modules" "$P/engines/stills/node_modules"; } || true
rsync -a --exclude node_modules --exclude .venv --exclude out --exclude .work --exclude .cache --exclude .DS_Store "$E/motion/" "$P/engines/motion/"
[ -e "$P/engines/motion/node_modules" ] || { [ -d "$E/motion/node_modules" ] && ln -s "$E/motion/node_modules" "$P/engines/motion/node_modules"; } || true
echo "shadow ready: $P/engines"
