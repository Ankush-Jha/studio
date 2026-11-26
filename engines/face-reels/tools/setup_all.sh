#!/usr/bin/env bash
# One-time heavy setup for Studio face reels (run by `setup.sh --heavy`, or on its own after setup.sh). It runs
# vendored third-party installer scripts that were read and reviewed on 2026-11-12 (see docs/VENDOR.md):
#     bash engines/face-reels/tools/setup_all.sh | tee /tmp/face-reels-setup.log
# Downloads about 4.5 GB (person-matte model ~2.4 GB, audio-QA models ~1.9 GB, sound library ~60 MB). Safe to re-run.
# Time depends on your connection: at the ~0.6 MB/s I measured from Hugging Face, expect over an hour.
set -u
A="$(cd "$(dirname "$0")/.." && pwd)"; GE="$A/vendor/ghost-editor"; MP="${MEDIA_PY:-$A/.venv-media/bin/python}"
step(){ echo; echo "### $(date +%T) $*"; }

step "python 3.11 (needed by ghost-editor's matte and audio-QA venvs)"
uv python install 3.11 2>&1 | tail -2
export PYTHON311="$(uv python find 3.11)"; echo "PYTHON311=$PYTHON311"

# (Speech: whisper.cpp with tools/models/ggml-small.en-q5_1.bin, fetched by setup.sh; openai-whisper is in .venv-media.
#  The optional 1.5 GB mlx-whisper model is NOT fetched here; at ~0.6 MB/s it would take ~45 min.)

step "media library: SFX, music, emoji from Mixkit and GitHub (~60 MB)"
"$MP" "$GE/scripts/library_restore.py" 2>&1 | tail -8

step "BiRefNet person matte: words behind the speaker (~2.4 GB)"
bash "$GE/scripts/setup_matte.sh" 2>&1 | tail -5

step "audio QA venv: pause detection, voice enhance (~1.9 GB)"
bash "$GE/scripts/setup_audioqa.sh" 2>&1 | tail -3

step "HyperFrames renderer at the pinned version ($(cat "$GE/scripts/HF_VERSION"))"
bash "$GE/scripts/hf.sh" --version 2>&1 | tail -2

step "final toolchain check"
bash "$GE/scripts/doctor.sh" 2>&1 | tail -40
echo; echo "### DONE $(date +%T)"
