# Shared adapter: voice and music

Every engine that needs sound uses this page: who speaks, how it is checked, how loud, and where the music comes from. It is not a render engine; the sections follow the SPEC order so directors can read it like one.

```sh
R=$(git rev-parse --show-toplevel)
LIB=$R/engines/films; PY="$LIB/.venv/bin/python"
J=$R/jobs/<id>; P=$J/project; O=$J/out
```

## Best for

| Situation | Voice | Ask first? |
|---|---|---|
| Drafts, previews, simple English reels | **Kokoro** (local, `core/tts/tts.py`) | no |
| Hero pieces where Kokoro sounds flat | **ElevenLabs** via the claude.ai connector | **yes** (spends credits; plan question below) |
| French (Quebec clients), Hindi, Punjabi | **ElevenLabs** (Kokoro on this machine has English voices only) | **yes** |
| The client supplied a recording | **the client's own voice** | no |
| No voice (music-only loop, GIF) | none | no |

## Formats and sizes

WAV, mono or stereo, 24 kHz (Kokoro) / 48 kHz (mix). Final file audio: AAC-LC 128 kbps 48 kHz, −14 LUFS integrated, true peak under −1 dBTP (PLAYBOOK).

## Inputs it needs

- Script lines from `script.json.beats[].voice` (≈ 150 words/min; 45–60 s = 110–150 words).
- Kit `languages` and `voice.md` (tone, banned words), `history.json` (which voice the client used last).
- For the client's voice: the recording (absolute path).

## Setup check (exact command)

```sh
cd $R/engines/films && .venv/bin/python -c "
from kokoro_onnx import Kokoro; k=Kokoro('core/tts/kokoro-v1.0.onnx','core/tts/voices-v1.0.bin'); print('kokoro voices:', ' '.join(k.get_voices()))
import faster_whisper; print('asr ok')" && which whisper-cli && ls ~/.cache/whisper-cpp/ggml-large-v3-turbo.bin
```

Verified 19 Nov 2026 and again 26 Nov 2026 on the new layout: Kokoro voices installed = `af_bella af_heart am_adam am_liam am_michael am_onyx bm_george bm_lewis` (American `af_`/`am_`, British `bm_`); faster-whisper OK; whisper.cpp with `ggml-large-v3-turbo.bin`. Fresh clone: the Kokoro model and the voice packages come from `sh $LIB/setup.sh deps voice` (Studio Films, `engines/films`); whisper.cpp from `brew install whisper-cpp`; the large model is a separate download (`curl -L -o ~/.cache/whisper-cpp/ggml-large-v3-turbo.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin`; ask first, about 1.6 GB).

ElevenLabs connector: `mcp__claude_ai_ElevenLabs__creative_list_voices` answered on 19 Nov 2026 (French, Hindi and Punjabi library voices listed). The connector has needed re-authorising before: if a call is refused, the user re-connects it in claude.ai → Settings → Connectors; until then use Kokoro for English and stop for other languages. Account on 19 Nov 2026 (`account_get_usage`): **free tier, 10,000 characters/month, 0 used**. UNVERIFIED: whether the free tier's licence allows commercial client use (ElevenLabs' free plan has historically required attribution and excluded commercial use); confirm a paid plan with the user before any client delivery uses ElevenLabs audio.

## Run (exact commands)

### Kokoro (default)

`$P/voice/lines.json`:

```json
[{"id":"L01","text":"Five years of heelock payments, and the balance is still fifty thousand dollars.","voice":"af_bella","speed":1.0,"asr":"Five years of HELOC payments, and the balance is still $50,000."}]
```

```sh
cd "$LIB" && "$PY" core/tts/tts.py "$P/voice/lines.json" "$P/voice"          # <id>.wav (24 kHz, trimmed) + dur.json
cd "$LIB" && "$PY" core/tts/asr_check.py "$P/voice/lines.json" "$P/voice"     # exit 0 required; writes words.json (word timings)
```

Spell numbers and acronyms for the ear in `text`; write what Whisper hears in `asr` and use digits on screen. Default speed 0.92 (house reels use 1.0–1.05). Cast per film; vary the voice across clients.

### ElevenLabs (hero / French / Hindi / Punjabi), after the user says yes

1. `mcp__claude_ai_ElevenLabs__account_get_usage` (credits left).
2. `mcp__claude_ai_ElevenLabs__creative_list_voices` with `languages: ["fr"]` (or `hi`, `pa`, `en`) and descriptors (e.g. `descriptives: ["calm","professional"]`, `use_cases: ["informative_educational"]`). The voice_id comes only from this list or the user.
3. `mcp__claude_ai_ElevenLabs__creative_create_flow` once, then for the whole script (one call, not per line, to save credits) `mcp__claude_ai_ElevenLabs__creative_generate_speech` with `prompt` = the script, `voice_id`, `model_id: "eleven_multilingual_v2"` (or `eleven_v4` for delivery tags), `generations_count: 1`, `flow_id`; first with `estimate_only: true` and report the cost. Never call it twice to retry (each call is charged).
4. Poll `mcp__claude_ai_ElevenLabs__creative_get_flow_run_status` (wait `poll_after_seconds`) until `all_completed`; download the audio to `$P/voice/vo_eleven.mp3`, convert: `ffmpeg -nostdin -v error -y -i "$P/voice/vo_eleven.mp3" -ar 48000 "$P/voice/vo.wav"`. UNVERIFIED: the exact field holding the audio URL in the status result (not exercised; no credits spent in this setup).
5. Check: `whisper-cli -m ~/.cache/whisper-cpp/ggml-large-v3-turbo.bin -l fr -f "$P/voice/vo16k.wav" -ojf -ml 1` on a 16 kHz copy (`ffmpeg -i vo.wav -ar 16000 -ac 1 vo16k.wav`), then compare to the script word by word (numbers by value). `asr_check.py` supports `--lang en|zh|ja|ko|auto`; UNVERIFIED for French/Hindi/Punjabi matching, so use whisper-cli plus a read-through.

### The client's own recording

Keep every spoken word. Only shorten pauses (cut silences over 0.3 s, keep ~0.2 s breath between sentences) and clean the audio (denoise, de-hum, enhance, level). Never re-order, drop or re-synthesize words. Tools (from the face-reels engine's ghost-editor, `$R/engines/face-reels/vendor/ghost-editor/scripts/`, present after `bash $R/engines/face-reels/setup.sh`; see `face-reels.md`): `autocut.py` ("cut the pauses, keep every word"), `denoise.sh` (DeepFilterNet3, ≤ 20 dB), `voice_enhance.py --mode enhance|superres`. After editing, re-transcribe and diff against the original transcript: any missing word is a fail.

### Music (policy)

1. **Default: an original synthesized score**, composed for the piece: numpy synthesis (model `$LIB/styles/swiss-motion/demo/music/score.py`, an original motorik score) and/or `$LIB/core/audio/sampler.py` instruments from free CC0/CC BY sample libraries (credited in `CREDITS` via `sampler.py credits(names)`).
2. A licensed music library or **ElevenLabs Music**: only with a paid plan **and** the user's yes for that piece.
3. **Never Suno or Udio.**
4. **Meta Sound Collection**: added by whoever posts, in the Instagram app at posting time; put a line in the caption notes ("optional: add a Sound Collection track in-app; keep it under the voice"). Never trending licensed songs (business accounts can't use them and can't boost).
5. Mixkit music beds (in the face-reels engine's ghost-editor library, `setup.sh --heavy`): ask first. Mixkit SFX and procedural foley (`$LIB/core/audio/sfx.py`) are fine.

### Mix and loudness targets

| Element | Target |
|---|---|
| Voice | the reference; compress Kokoro first (high peak-to-average), then balance by RMS |
| Music | 18–25 dB under the voice while it speaks, fast ducking; low end 20–120 Hz around −3 dB relative to the rest |
| SFX | whoosh on transitions, hit on number reveals, −12 to −18 dB under dialogue |
| Master | −14 LUFS integrated, true peak < −1 dBTP; no dead silence mid-reel; energy rises toward the payoff |

Master and deliver:

```sh
LEMO_COLOR=bt709 sh "$LIB/core/render/mux.sh" "$P/out/video.mp4" "$P/out/mix.wav" "$P/out/master.mp4" 30 0
sh $R/studio/engines/bin/deliver.sh "$P/out/master.mp4" "$O/<name>.mp4"
```

`deliver.sh` (two-pass loudnorm + 4× oversampled limiter, AAC 128k 48 kHz) exits 1 unless the file lands at −15…−13 LUFS with true peak under −1 dBTP; verified 19 Nov 2026 on a Studio Films master (−14.1 / −1.7) and on a motion render whose own audio peaked at +2.1 dBTP (fixed to −14.0 / −1.5).

## Branding

Voice is part of the brand: one narrator per client series unless the kit says otherwise; never present an AI voice as the broker (PLAYBOOK). If the broker's own voice exists, prefer it for face-led accounts.

## Outputs to collect

`$P/voice/*.wav`, `dur.json`, `words.json` (timings for captions), `$P/out/score.wav`, `$P/out/mix.wav`; final audio lives inside the delivered MP4. Library card: `voice` (`kokoro:<voice>`, `elevenlabs:<voice name>`, `client`), `music` (`original synth`, `none`, …).

**Instagram AI-label reminder: put this line in every delivery (caption notes and the Gate 2 summary) whenever Kokoro or ElevenLabs speaks:** "Turn on Instagram's AI label when posting: the voiceover is AI-generated." (PLAYBOOK: our Kokoro TTS counts.)

## Time and usage

Kokoro: ≈ 1 min for a 13-line script, ASR check ≈ 1 min (first run downloads ~145 MB). ElevenLabs: seconds per generation; ≈ 1 character = 1 credit on the free tier (10,000/month): a 60 s script ≈ 800–900 characters. UNVERIFIED: exact credit cost per model (use `estimate_only`). Score synthesis: seconds to a minute.

## Built-in QA vs what Studio's gate adds

Built in: `asr_check.py` (every Kokoro line transcribes back), `mux.sh` loudness print, `deliver.sh` pass/fail. Studio adds: a whisper pass on the final mix (words still intelligible under music), the word-keeping diff for client recordings, banned phrases spoken aloud, the AI-label line, music provenance in `CREDITS`.

## Pitfalls

- Kokoro reads "HELOC", "CMHC", "%" and dollar amounts badly: respell.
- Calling an ElevenLabs voice "the broker" or cloning the broker's voice without written consent: never.
- Re-running `creative_generate_speech` to "retry" doubles the charge.
- Music that masks the voice on phone speakers: check the mix on the final file at low volume.
- A mux of a WAV shorter than the picture: `mux.sh` pads; longer: cut at the picture end.

## Picking a style against the client's history

Read `history.json` (`voice` of past pieces): rotate Kokoro voices across clients in the same city so two accounts don't share a narrator in the same week; keep one voice per client series when the kit or lessons ask for it.
