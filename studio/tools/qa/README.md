# Studio QA gate

Deterministic, no LLM. Run with `R/studio/.venv/bin/python` (pillow, numpy, imagehash). Needs `ffmpeg`, `ffprobe`, `tesseract` on PATH; `whisper-cli` + a ggml model for the WER check.

## Commands

```
gate.py <job_dir> [--kind video|stills|auto] [--script script.json] [--client slug] [--caption file] [--kit kit.json] [--loop] [--no-neardup]
gate.py --target <folder-or-file>          # any folder; writes <folder>/qa/ (a file target writes next to it)
neardup.py <image-or-video> [--against library|jobs|radar|all] [--exclude-client slug] [--client slug]
copycheck.py --text <file|-> --client slug [--kit kit.json] [--ocr-text file]
contact.py out.jpg img[:label] ...
```

`gate.py <job>` checks `<job>/out/`, writes `<job>/qa/report.json` (SPEC shape plus `kind`, `client`, `summary`, `elapsed_s`, `runtime_s`), `qa/frames/*.jpg`, `qa/contact.jpg`, and for stills `qa/gridcrop.jpg`. Exit 0 = no `fail`; 1 = at least one `fail` (warnings never fail); 2 = bad path.

`out/contact*.jpg` is ignored (not a deliverable) and raises `out.review_aids` (warn): move review aids to `qa/`.

Inputs it picks up: `<job>/job.json` (`client`, `loop`), `<job>/script.json`, `<job>/caption.txt|caption.md|CAPTION.md` (also in `out/`). CAPTION.md: only the `## Caption` section is used.

`script.json` (all optional): `{"loop": true, "lang": "en", "voice": ["line", ...]}`. Voice lines (WER reference): `<job>/project/voice/lines.json` when present (the director's TTS wording; `asr` preferred over `text`; its `voice` key is a voice id and is ignored), else `script.json` `beats[].voice|vo|line` / `lines`. Voice ids are never text: keys `voiceId`/`voice_id`/`voiceCast` are skipped, and any value shaped like `am_liam`, `af_bella`, `kokoro:af_bella` is dropped. Kit: `$R/kits/<slug>/kit.json` (`rules` = list of strings with quoted phrases starting Never/Always, or a dict with ban*/avoid*/never* and require*/must*/always* lists; `complianceLine`; `province`).

Video job: checks `out/*.mp4`; the only still checked is `out/poster|cover|thumbnail.*`. Stills job: all images in `out/` (natural sort = slide order).

## Video checks (status rules)

| id | what | pass | warn | fail |
|---|---|---|---|---|
| spec.resolution | size | 1080x1920 | 1440x2560 | other |
| spec.codec | codec/profile | h264 High | h264 other profile | not h264 |
| spec.pix_fmt | pixel format | yuv420p | | anything else (yuvj420p = full range) |
| spec.color_tags | BT.709 space/primaries/transfer, tv range | all tagged | untagged | wrong tags |
| spec.fps / spec.cfr | frame rate / r vs avg rate | >= 30, CFR | 24 fps; VFR | < 24 or odd |
| spec.video_bitrate | | < 25 Mbps | | >= 25 |
| spec.audio_codec / audio_bitrate | AAC 48 kHz; kbps | <= 128 | > 128 kbps | wrong codec/rate/no audio |
| spec.faststart | moov atom before mdat | | | moov last |
| spec.duration / filesize | | 15-90 s | outside 15-90 s | > 180 s; > 300 MB |
| audio.loudness / truepeak | ffmpeg ebur128 | -14 +/-1 LUFS; <= -1 dBTP | | outside |
| video.black | blackdetect (d 0.3, pix_th 0.1) | none | segment >= 0.5 s | segment > 1 s |
| video.frozen | freezedetect (270 px, n 0.003) | none > 4 s | > 4 s | > 8 s |
| video.safezone | OCR words outside x 65-1015, y 270-1248 on sampled frames | 0 frames | 1 frame | >= 2 frames |
| video.hook_frame0 | OCR words in frame 0 | >= 2 words | fewer | |
| video.contrast | WCAG ratio of OCR text lines | all >= 4.5 | any < 4.5 | |
| video.loop_seam | PSNR first vs last frame | >= 20 dB | < 20 dB, only if job/script/--loop says loop | |
| video.wer | whisper transcript vs script voice lines | <= 5% | 5-8% | > 8% |

Sampling: frame 0, every 3 s, last frame, plus scene cuts (`scene > 0.35`, 0.8 s apart, capped at ~24 frames). OCR: tesseract psm 11 on 2x upscaled grayscale; words with conf < 60, under 2 characters or under 10 px tall are dropped. **Safe-zone texture filter** (`real_word` in video.py, added 19 Nov 2026 after the reel critic confirmed halftone dots read as text): before the safe-zone test a word is also dropped when it has < 2 alphanumeric chars (unless it carries `$`/`%`), OCR confidence < 70, or its letters are not word-like (must be in `/usr/share/dict/words`, 2-letter words only if common; names/brands pass at >= 5 letters, conf >= 85, a vowel, no 5-consonant run). Words with a digit, `$` or `%` always count. Real text is untouched; texture ('ee', 'ce', 'Co,') no longer fails the gate. WER normalisation (same function on script and transcript, spaces kept between tokens): lowercase, strip punctuation, `$80 a month` -> "eighty dollars a month", `$1,962` -> "one thousand nine hundred sixty two dollars", `$1.5 million`, `4.94%` -> "four point nine four percent", years `2027` -> "twenty twenty seven" (also matches spoken "two thousand twenty seven"), digits -> words. Model search order: `$STUDIO_WHISPER_MODEL`, `$R/engines/face-reels/tools/models/ggml-small.en-q5_1.bin`, `~/.cache/whisper-cpp/ggml-base.en.bin`, `ggml-large-v3-turbo.bin`. No script lines or no model = `skip`. English-only models: for other languages pass a multilingual model and `"lang"` in script.json.

## Stills checks

| id | what | thresholds |
|---|---|---|
| stills.count | carousel slides (1080x1350 / 1080x1440, more than one image) | 2-20 (fail outside) |
| stills.dimensions | 1080x1350/1440, 1080x1920, 1080x1080; one size per set | fail otherwise |
| stills.format | JPEG/PNG, RGB, sRGB or untagged ICC | CMYK/other format fail, other ICC warn |
| stills.filesize | | warn > 8 MB |
| stills.margins | OCR words within 60 px of side edges | fail |
| stills.gridcrop | slide 1 (and covers) text inside the centred 3:4 crop (1080x1920: y 240-1680; 4:5: x 34-1046) | fail for 1080x1920, warn otherwise |
| stills.contrast | text pixels vs ring of surrounding background, WCAG | warn < 4.5 |
| stills.words | OCR words per slide | warn > 40 |

## Near-duplicate

pHash and dHash (64-bit each); distance = mean of the two Hamming distances. Index = `$R/library/hashes.json` if present (`{"items":[{"path","client","phash","dhash"}]}`), otherwise built from `library/thumbs`, `library/cards`, `jobs/**/out`, `radar/thumbs` and cached in `tools/qa/.cache/hashes.json` (delete to rebuild). Videos are hashed at 1 s and 25/50/75%. Fail <= 6 to a piece of a different, known client; warn <= 10 (any client) or <= 6 to an unknown-client piece. The job's own folder is excluded. Client comes from `--client` or `job.json`.

## Copy and compliance

`copy.banned` (fail): PLAYBOOK list plus guaranteed, best rate(s), lowest rate(s), secret loophole, dream home. `copy.emdash`: warn 1-2, fail >= 3. `copy.kit_rules`: kit banned phrases / required phrases (skip if no kit). `copy.rate_disclosure`: a `%` within 30 characters of rate/APR/prime/fixed/variable needs APR wording and a term wording (fail). `copy.compliance_line`: kit `complianceLine` fuzzy-matched (ratio 0.85 over a sliding word window) in caption plus OCR text from frames/slides; required for Ontario kits (and when province is unknown). `copy.hashtags` <= 5. `copy.line1_search` (warn): caption line 1 holds a topic term. Script voice lines also get banned/em-dash/rate checks (ids end `@script`).

## Known limits

OCR on stylised or non-English type misses words (the Punjabi Hukam reel reads as transliterated noise, so its safe-zone numbers are indicative). Freeze detection works at 270 px and can miss tiny motion. Contrast is estimated from pixels, so gradients and antialiasing can push results about 0.2 off.
