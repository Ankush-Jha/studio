# Face reels setup

Everything heavy is fetched, not committed. `vendor/` alone is about 10 GB on a full install (most of it the optional design-skills collection), so the repo carries only the code, docs and small assets, plus `setup.sh` to fetch the rest.

## 1. System tools (install yourself)
| Tool | Why | macOS |
|---|---|---|
| ffmpeg + ffprobe (with libx264) | every cut, overlay, mix and encode | `brew install ffmpeg` |
| Node 22+ | HyperFrames, ghost-editor's JS helpers | `brew install node` |
| uv | Python 3.11/3.12 for the venvs | `brew install uv` |
| whisper.cpp (`whisper-cli`) | DTW word times for `tools/plan_cut.py` | `brew install whisper-cpp` |
| git, curl | fetching | Xcode command line tools |
| yt-dlp (optional) | studying public reference reels (never reusing footage) | `brew install yt-dlp` |

**Known issues**
- **ffmpeg will not start** after a macOS or Homebrew update (missing dylib): `brew reinstall ffmpeg`. `setup.sh` checks for this.
- **Transcription needs openai-whisper**: ghost-editor's `transcribe.py --backend whisper` calls it. `setup.sh` installs it into `.venv-media` (it pulls PyTorch, about 1-2 GB). On Apple silicon, mlx-whisper in its own venv is faster (`uv venv ~/.venvs/mlxw && uv pip install --python ~/.venvs/mlxw/bin/python mlx-whisper`; transcribe.py finds it through `MLXW_PY`).
- ffmpeg 9.0.2 can deadlock on large filter graphs: see "Render safety" in `CLAUDE.md`.
- Homebrew ffmpeg has no libass/drawtext: text is rendered in Chromium, so this does not matter.
- MediaPipe needs Python 3.12 or older: `.venv-media` is created with 3.12.

## 2. `bash setup.sh` (core, about 1 GB with the venv)
1. Checks the system tools above.
2. Clones the third-party engines into `vendor/` at the exact commits that were security-reviewed (list: `docs/VENDOR.md`).
3. Downloads model weights into `tools/models/` and checks their sizes:
   - `face_landmarker.task` (3.8 MB) and `selfie_multiclass_256x256.tflite` (16 MB), `selfie_segmenter.tflite` (0.25 MB): MediaPipe, Apache-2.0, from storage.googleapis.com/mediapipe-models;
   - `ggml-small.en-q5_1.bin` (190 MB): whisper.cpp small.en model (MIT), from huggingface.co/ggerganov/whisper.cpp.
4. Creates `.venv-media` from `requirements-media.txt` (numpy, OpenCV, MediaPipe, SciPy, Pillow, Playwright + Chromium, openai-whisper).
5. Links the engines' skills into `engines/face-reels/.claude/skills/`.

Then `export MEDIA_PY=engines/face-reels/.venv-media/bin/python` and run `bash vendor/ghost-editor/scripts/doctor.sh`.

## 3. `bash setup.sh --heavy` (about 4.5 GB more, runs `tools/setup_all.sh`)
Runs ghost-editor's own installers, read and reviewed at the pinned commit:
- media library: Mixkit SFX and music beds, Fluent emoji (about 60 MB; Mixkit licence: commercial use OK, not for Content ID);
- BiRefNet person matte (`~/.venvs/ghost-matte`, about 2.4 GB of weights in `~/.cache/ghost-matte`): words behind the speaker, photo cut-outs (`tools/cutout_image.py`);
- audio QA venv (`~/.venvs/ghost-audioqa`, about 1.9 GB): pause detection, voice enhancement;
- the pinned HyperFrames renderer (`npx hyperframes@<vendor/ghost-editor/scripts/HF_VERSION>`).
`tools/prefetch_weights.sh` pre-downloads the same Hugging Face weights with aria2 (resumable) if the installers' single-stream downloads are too slow.

## 4. `bash setup.sh --design-skills` (optional, about 9.6 GB)
Clones the 95 repos in `docs/design-skills-LIST.tsv` into `vendor/design-skills/` (shallow, blobs over 1 MB skipped). Reference and ideas only; nothing is linked or executed. `python3 tools/catalog_skills.py` rebuilds the catalogue with licence and security-scan flags (`docs/design-skills-CATALOG.md` is the reviewed copy).

## Optional, ask first
- Gemini API key: ghost-editor's B-roll people/line checks and reference-reel study. Frames are sent to Google. Without it those checks are skipped (and ghost-editor treats unchecked shots as a QA fail when people rules exist).
- ElevenLabs key: only for narrated no-camera explainers.
- `bash vendor/ghost-editor/scripts/setup_looks.sh` (film LUTs, about 1 GB), `setup_captions.sh` (new caption fonts).
- Larger whisper.cpp model: `curl -L -o tools/models/ggml-large-v3-turbo-q5_0.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin`.

## Notes
- HyperFrames asks for Node >= 22; newer Node versions are outside its tested range, so watch for odd errors.
- ghost-editor is tested on Apple silicon, in English and Russian.
