# Film cleaning tools

How the directory's films were made from the original project's 720p web cuts. Run them from a work folder
(`FILMS_WORK`, default: the current folder) holding `web/<slug>.mp4` (the originals, from the `web` release of
lemomo-ai/lemo-opuscar); they write `credits/<slug>.json` and `web-trimmed/<slug>.mp4`.

| Script | Does |
|---|---|
| `find_credit.py <film>` | tesseract OCR over the last 25 s (4 fps) and the whole film (0.5 fps): where the credit first shows |
| `trim_all.sh` | runs `find_credit.py` on every film and cuts 0.5 s before the credit, 0.6 s fade |
| `recut.sh <slug> <seconds>` | re-cuts one film at a chosen point, bitrate capped at the original's |
| `clean_news.py` | News Package: erases the channel name from every frame and cuts before the end card |
| `vocr.swift` | Apple Vision OCR (`swiftc -O vocr.swift -o ocr/vocr`); far better than tesseract on styled lettering |
| `vscan.sh <slug>` / `vedge.sh <slug>` | Vision checks: whole film at 2 fps / first 8 s at 4 fps and last 3 s at 8 fps |
| `fix_posters.sh` | takes a clean still from the film for any poster that shows the credit, into `site/posters/` |

Hand-picked cuts (OCR caught these late): pop-art 46.5, chalkboard 44.8, gilded-illumination 41.8, memphis-diorama 39.0,
comic-history 46.5, isometric-picture-book 56.5, one-bit-dither 46.4, paper-popup 127.5, tilt-shift 34.0, blueprint 44.45;
spy-titles starts at 5.7 s (opening credit card).
