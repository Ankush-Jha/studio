"""Video QA checks (1080x1920 reels)."""
import json, math, os, re, struct, sys, tempfile, time
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
from common import (run, have, Report, ocr_many, line_boxes, box_contrast, SAFE_X0, SAFE_X1, SAFE_Y0, SAFE_Y1)
import neardup as nd

MODELS = [os.environ.get("STUDIO_WHISPER_MODEL", ""),
          str(Path(__file__).resolve().parents[3] / "engines/face-reels/tools/models/ggml-small.en-q5_1.bin"),
          str(Path.home() / ".cache/whisper-cpp/ggml-base.en.bin"),
          str(Path.home() / ".cache/whisper-cpp/ggml-large-v3-turbo.bin")]


def probe(path):
    r = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)])
    return json.loads(r.stdout)


def frac(s):
    try:
        a, b = s.split("/")
        return float(a) / float(b) if float(b) else 0.0
    except Exception:
        return 0.0


def moov_before_mdat(path):
    with open(path, "rb") as f:
        pos, seen = 0, []
        size = os.path.getsize(path)
        while pos < size and len(seen) < 12:
            f.seek(pos)
            h = f.read(8)
            if len(h) < 8:
                break
            sz, typ = struct.unpack(">I4s", h)
            typ = typ.decode("latin1")
            if sz == 1:
                sz = struct.unpack(">Q", f.read(8))[0]
            elif sz == 0:
                sz = size - pos
            seen.append(typ)
            if typ in ("moov", "mdat"):
                return typ == "moov", seen
            pos += max(sz, 8)
    return False, seen


def spec_checks(rep, path, tag, loop=False):
    P = probe(path)
    v = next((s for s in P["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in P["streams"] if s["codec_type"] == "audio"), None)
    fmt = P["format"]
    dur = float(fmt.get("duration", 0))
    info = {"duration": dur}
    if not v:
        rep.add("spec.video_stream", "Video stream", "fail", None, "present", "", tag)
        return info
    W, H = v["width"], v["height"]
    ok = (W, H) == (1080, 1920)
    rep.add("spec.resolution", "Resolution", "pass" if ok else ("warn" if (W, H) == (1440, 2560) else "fail"),
            f"{W}x{H}", "1080x1920", "", tag)
    prof = v.get("profile", "")
    ok = v["codec_name"] == "h264" and prof == "High"
    rep.add("spec.codec", "Codec / profile", "pass" if ok else ("warn" if v["codec_name"] == "h264" else "fail"),
            f"{v['codec_name']} {prof}", "h264 High", "", tag)
    pf = v.get("pix_fmt")
    rep.add("spec.pix_fmt", "Pixel format", "pass" if pf == "yuv420p" else "fail", pf, "yuv420p",
            "yuvj420p is full-range (JPEG) and gets re-encoded/shifted by IG" if pf == "yuvj420p" else "", tag)
    tags = {k: v.get(k, "unspecified") for k in ("color_space", "color_primaries", "color_transfer", "color_range")}
    good = all(tags[k] == "bt709" for k in ("color_space", "color_primaries", "color_transfer")) and tags["color_range"] in ("tv", "unspecified", "limited")
    miss = [k for k, x in tags.items() if x in ("unspecified", "unknown")]
    rep.add("spec.color_tags", "BT.709 colour tags (limited range)",
            "pass" if good and tags["color_range"] == "tv" and not miss else ("warn" if not any(t not in ("bt709", "unspecified", "unknown", "tv", "limited") for t in tags.values()) else "fail"),
            tags, "bt709 / bt709 / bt709 / tv",
            ("untagged: " + ",".join(miss)) if miss else "", tag)
    r, avg = frac(v.get("r_frame_rate", "0/1")), frac(v.get("avg_frame_rate", "0/1"))
    fps = avg or r
    st = "pass" if fps >= 29.9 else "warn" if 23.9 <= fps < 29.9 and abs(fps - 24) < 0.2 else "fail"
    rep.add("spec.fps", "Frame rate", st, round(fps, 3), ">= 30 (24 = warn)",
            "24 fps is accepted by the API but new work should be 30" if st == "warn" else "", tag)
    vfr = r and avg and abs(r - avg) / max(r, avg) > 0.01
    rep.add("spec.cfr", "Constant frame rate", "warn" if vfr else "pass", f"r={r:.3f} avg={avg:.3f}", "r == avg", "", tag)
    vbr = int(v.get("bit_rate") or 0)
    if not vbr and fmt.get("bit_rate"):
        vbr = int(fmt["bit_rate"]) - int((a or {}).get("bit_rate") or 0)
    rep.add("spec.video_bitrate", "Video bitrate", "pass" if vbr < 25e6 else "fail", f"{vbr/1e6:.2f} Mbps", "< 25 Mbps",
            "", tag)
    if a:
        rep.add("spec.audio_codec", "Audio codec / rate", "pass" if a["codec_name"] == "aac" and a.get("sample_rate") == "48000" else "fail",
                f"{a['codec_name']} {a.get('sample_rate')} Hz", "aac 48000 Hz", "", tag)
        abr = int(a.get("bit_rate") or 0)
        rep.add("spec.audio_bitrate", "Audio bitrate", "pass" if abr <= 128_500 else "warn", f"{abr/1000:.0f} kbps",
                "<= 128 kbps (API/scheduler posting)", "re-encode to 128k before API upload" if abr > 128_500 else "", tag)
    else:
        rep.add("spec.audio_codec", "Audio stream", "fail", None, "aac 48 kHz", "no audio stream", tag)
    fs, atoms = moov_before_mdat(path)
    rep.add("spec.faststart", "+faststart (moov before mdat)", "pass" if fs else "fail", " ".join(atoms), "moov first",
            "" if fs else "re-mux with -movflags +faststart", tag)
    size = os.path.getsize(path)
    rep.add("spec.filesize", "File size", "pass" if size < 300e6 else "fail", f"{size/1e6:.1f} MB", "< 300 MB", "", tag)
    st = "fail" if dur > 180 else "warn" if (dur < 15 or dur > 90) else "pass"
    rep.add("spec.duration", "Duration", st, f"{dur:.1f} s", "<= 180 s (fail); 15-90 s", "", tag)
    info.update(w=W, h=H, fps=fps)
    return info


def loudness(rep, path, tag):
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"])
    t = r.stderr.split("Summary:")[-1]
    mi = re.search(r"I:\s+(-?[\d.]+) LUFS", t)
    mp = re.search(r"Peak:\s+(-?[\d.]+) dBFS", t)
    if not mi:
        rep.add("audio.loudness", "Integrated loudness", "skip", None, "-14 LUFS", "no audio / ebur128 failed", tag)
        return
    I, tp = float(mi.group(1)), float(mp.group(1)) if mp else None
    rep.add("audio.loudness", "Integrated loudness", "pass" if abs(I + 14) <= 1 else "fail", f"{I:.1f} LUFS", "-14 +/-1 LUFS", "", tag)
    rep.add("audio.truepeak", "True peak", "pass" if tp is not None and tp <= -1 else "fail",
            f"{tp:.1f} dBTP" if tp is not None else None, "<= -1 dBTP", "", tag)


def black_freeze(rep, path, tag, dur):
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-an", "-vf",
             "scale=270:480,blackdetect=d=0.3:pix_th=0.1,freezedetect=n=0.003:d=2", "-f", "null", "-"], timeout=900)
    log = r.stderr
    blacks = [(float(a), float(b)) for a, b in re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", log)]
    fr_s = [float(x) for x in re.findall(r"freeze_start: ([\d.]+)", log)]
    fr_d = [float(x) for x in re.findall(r"freeze_duration: ([\d.]+)", log)]
    if len(fr_s) > len(fr_d):          # unterminated freeze at EOF
        fr_d.append(max(0.0, dur - fr_s[-1]))
    freezes = list(zip(fr_s, fr_d))
    longb = [(a, b) for a, b in blacks if b - a >= 0.5]
    tot = sum(b - a for a, b in blacks)
    rep.add("video.black", "Black frames", "fail" if any(b - a > 1.0 for a, b in blacks) else "warn" if longb else "pass",
            [f"{a:.1f}-{b:.1f}s" for a, b in blacks][:8] or 0, "none > 0.5 s", f"{tot:.1f}s black total" if blacks else "", tag)
    bad = [(s, d) for s, d in freezes if d > 4]
    rep.add("video.frozen", "Frozen stretches > 4 s", "fail" if any(d > 8 for _, d in bad) else "warn" if bad else "pass",
            [f"{s:.1f}s +{d:.1f}s" for s, d in bad][:8] or 0, "none > 4 s",
            "freezedetect at 270px, noise 0.003; tiny text motion can be missed. PLAYBOOK: nothing static past 4 s" if bad else "", tag)


def sample_frames(path, outdir, dur, stem, cap=24):
    """Frame 0, every 3 s, scene cuts, last frame. Returns [(t, jpg_path)] sorted."""
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-an", "-vf",
             "scale=270:480,select='gt(scene,0.35)',showinfo", "-f", "null", "-"], timeout=900)
    cuts = [float(x) for x in re.findall(r"pts_time:([\d.]+)", r.stderr)]
    ts = {0.0}
    t = 3.0
    while t < dur - 0.2:
        ts.add(round(t, 2)); t += 3.0
    last = max(0.0, dur - 0.1)
    ts.add(round(last, 2))
    kept = []
    for c in cuts:                      # scene cuts, min 0.8 s from other samples
        if all(abs(c - x) > 0.8 for x in ts) and all(abs(c - x) > 0.8 for x in kept):
            kept.append(c)
    # if too many, thin evenly
    room = max(0, cap - len(ts))
    if len(kept) > room:
        step = len(kept) / room if room else 1
        kept = [kept[int(i * step)] for i in range(room)] if room else []
    ts |= {round(c + 0.05, 2) for c in kept}
    out = []
    for t in sorted(ts):
        p = Path(outdir) / f"{stem}_t{t:06.2f}.jpg"
        args = ["ffmpeg", "-v", "error", "-y"]
        args += ["-sseof", "-0.12"] if t == round(last, 2) and t > 0 else ["-ss", f"{t:.2f}"]
        run(args + ["-i", str(path), "-frames:v", "1", "-q:v", "3", str(p)])
        if p.exists():
            out.append((t, str(p)))
    return out, [round(c, 2) for c in cuts]


_DICT = None
COMMON2 = set("of to in is it on at as an or we be by do go he me my no so up us if am ok hi oh ad tv id vs".split())


def _dictionary():
    global _DICT
    if _DICT is None:
        try:
            _DICT = {w.strip().lower() for w in open("/usr/share/dict/words", errors="ignore") if len(w.strip()) >= 2}
        except OSError:
            _DICT = set()
    return _DICT


def real_word(w, min_conf=70):
    """Safe-zone OCR noise filter: halftone dots, grain and window art read as 'ee', 'ce', 'Co,'. Drop a word with
    < 2 alphanumeric characters (unless it carries $ or %), OCR confidence < 70, or letters that are not word-like:
    must be in the system dictionary (2-letter words: common ones only), or (names, brands) >= 5 letters, conf >= 85, a vowel and no run of 5 consonants.
    Anything with a digit, $ or % is kept."""
    txt = w["text"]
    if "$" in txt or "%" in txt:
        return True
    alnum = re.sub(r"[^A-Za-z0-9]", "", txt)
    if len(alnum) < 2 or w.get("conf", 100) < min_conf:
        return False
    if any(ch.isdigit() for ch in alnum):
        return True
    low = re.sub(r"[^a-z]", "", alnum.lower())
    if len(low) == 2:     # 2-letter dictionary entries (ce, ee, co...) are mostly texture; keep only common words
        return low in COMMON2
    d = _dictionary()
    if not d or low in d or low.rstrip("s") in d:
        return True
    return len(low) >= 5 and w.get("conf", 100) >= 85 and bool(re.search(r"[aeiouy]", low)) and not re.search(r"[^aeiouy]{5}", low)


def ocr_checks(rep, frames, tag, dur, extra=None):
    imgs = [p for _, p in frames]
    allw = ocr_many(imgs)
    res = {"words": {}, "text": []}
    off = {}                           # frame idx -> offending words
    contrast_bad = []
    for (t, p), words in zip(frames, allw):
        im = Image.open(p)
        W, H = im.size
        sx, sy = 1080 / W, 1920 / H
        res["words"][t] = [w["text"] for w in words]
        res["text"].append(" ".join(w["text"] for w in words))
        for w in words:
            if not real_word(w):
                continue          # texture noise (halftone dots etc.) never counts against the safe zone
            x0, y0, x1, y1 = w["x0"] * sx, w["y0"] * sy, w["x1"] * sx, w["y1"] * sy
            if x0 < SAFE_X0 or x1 > SAFE_X1 or y0 < SAFE_Y0 or y1 > SAFE_Y1:
                off.setdefault(t, []).append((w["text"], int(x0), int(y0), int(x1), int(y1)))
        rgb = np.asarray(im.convert("RGB"))
        for txt, box in line_boxes(words):
            if len(txt) < 4:
                continue
            c = box_contrast(rgb, box)
            if c is not None and c < 4.5:
                contrast_bad.append((t, txt[:30], round(c, 1)))
    n = len(frames)
    nf = len(off)
    ex = []
    for t, ws in list(off.items())[:4]:
        ex.append(f"t={t:.1f}s: " + ", ".join(f"'{a}'@({x0},{y0})-({x1},{y1})" for a, x0, y0, x1, y1 in ws[:3]))
    st = "pass" if nf == 0 else "warn" if nf == 1 else "fail"
    rep.add("video.safezone", "Text inside safe zone (x65-1015, y270-1248)", st,
            f"{nf}/{n} sampled frames have OCR text outside", "0 frames",
            " | ".join(ex) + ("" if not ex else ""), tag)
    # hook in frame 0
    f0 = allw[0] if allw else []
    f0txt = " ".join(w["text"] for w in f0)
    nw = len([w for w in f0 if len(re.sub(r"\W", "", w["text"])) >= 3])
    rep.add("video.hook_frame0", "Hook text in frame 1", "pass" if nw >= 2 else "warn", f"{nw} words: {f0txt[:80]!r}",
            ">= 2 words in frame 0", "text may animate in after frame 0; check qa/frames t000.00" if nw < 2 else "", tag)
    rep.add("video.contrast", "Caption/text contrast >= 4.5:1 (sampled frames)",
            "pass" if not contrast_bad else "warn", f"{len(contrast_bad)} low-contrast lines",
            ">= 4.5:1", "; ".join(f"t={t:.0f}s '{s}' {c}:1" for t, s, c in contrast_bad[:5]), tag)
    return res


def loop_seam(rep, frames, tag, loop):
    if len(frames) < 2:
        return
    a = np.asarray(Image.open(frames[0][1]).convert("L").resize((270, 480)), float)
    b = np.asarray(Image.open(frames[-1][1]).convert("L").resize((270, 480)), float)
    mse = ((a - b) ** 2).mean()
    psnr = 99.0 if mse == 0 else 10 * math.log10(255 ** 2 / mse)
    if loop:
        rep.add("video.loop_seam", "Loop seam (first vs last frame PSNR)", "pass" if psnr >= 20 else "warn", f"{psnr:.1f} dB",
                ">= 20 dB (job says loop)", "", tag)
    else:
        rep.add("video.loop_seam", "Loop seam (first vs last frame PSNR)", "pass", f"{psnr:.1f} dB", ">= 20 dB if loop",
                "informational: script does not say loop", tag)


# ------------------------------------------------------------------ WER
NUM_ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
NUM_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def n2w(n):
    if n < 20: return NUM_ONES[n]
    if n < 100: return NUM_TENS[n // 10] + ("" if n % 10 == 0 else " " + NUM_ONES[n % 10])
    if n < 1000: return NUM_ONES[n // 100] + " hundred" + ("" if n % 100 == 0 else " " + n2w(n % 100))
    for div, name in ((10**9, "billion"), (10**6, "million"), (1000, "thousand")):
        if n >= div:
            return n2w(n // div) + " " + name + ("" if n % div == 0 else " " + n2w(n % div))
    return str(n)


SCALE = {"k": " thousand", "m": " million", "bn": " billion", "thousand": " thousand", "million": " million", "billion": " billion"}


def normalise(t):
    """Both the script reference and the whisper transcript go through this, so numbers and currency
    end up in the same form on both sides: digits become words ("$1,962" -> "one thousand nine hundred sixty two
    dollars"), every substitution keeps spaces around its output ("$80 a month" -> "eighty dollars a month")."""
    t = t.lower().replace("\u2019", "'").replace("-", " ")
    t = re.sub(r"(?<=\d),(?=\d{3}\b)", "", t)
    t = re.sub(r"\$\s?(\d+(?:\.\d+)?)(?:\s?(k|m|bn|thousand|million|billion)\b)?",
               lambda m: f" {m.group(1)}{SCALE.get(m.group(2) or '', '')} dollars ", t)
    t = re.sub(r"(\d+(?:\.\d+)?)\s*%", r" \1 percent ", t)
    t = re.sub(r"\b(\d+)(st|nd|rd|th)\b", r" \1 ", t)

    def dec(m):
        a, b = m.group(1), m.group(2)
        return f" {n2w(int(a))} point " + " ".join(n2w(int(c)) for c in b) + " "
    t = re.sub(r"\b(\d+)\.(\d+)\b", dec, t)
    # years read the way people say them: 2027 -> twenty twenty seven (bare 4-digit 1950-2099, not currency)
    def year(m):
        y = int(m.group(0))
        return f" {n2w(y // 100)} {n2w(y % 100) if y % 100 >= 10 else ('oh ' + n2w(y % 100) if y % 100 else 'hundred')} "
    t = re.sub(r"(?<![\d.])(19[5-9]\d|20\d\d)(?![\d.]| (?:dollars|percent))", year, t)
    t = re.sub(r"\b\d+\b", lambda m: f" {n2w(int(m.group(0)))} " if int(m.group(0)) < 10**12 else m.group(0), t)
    t = re.sub(r"'", "", t)
    t = re.sub(r"[^a-z ]", " ", t)
    w = t.split()
    # spoken "two thousand twenty seven" == "twenty twenty seven"; "and" after hundred is optional
    out, i = [], 0
    while i < len(w):
        if w[i:i + 2] == ["two", "thousand"] and i + 2 < len(w) and (w[i + 2] in NUM_TENS[2:] or w[i + 2] in NUM_ONES[10:]):
            i += 2; out.append("twenty"); continue
        out.append(w[i]); i += 1
    return out


def wer(ref, hyp):
    r, h = ref, hyp
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev = cur
    return d[len(h)] / max(1, len(r))


VOICE_ID_RE = re.compile(r"^(?:[a-z]+:)?[a-z]{1,3}_[a-z0-9]+$|^[a-z]{1,3}_[a-z0-9_]+$", re.I)   # am_liam, af_bella, kokoro:af_bella
VOICE_ID_KEYS = {"voiceid", "voice_id", "voicecast", "voiceids", "voice_ids", "voicename", "voice_name", "tts", "speaker"}


def spoken(v):
    """True when a string looks like spoken text, not a TTS voice id."""
    v = v.strip()
    return bool(v) and not VOICE_ID_RE.match(v) and (" " in v or len(v) > 24)


def lines_json_lines(job):
    """The director's TTS wording (project/voice/lines.json) is the true reference. Prefers `asr` (the wording
    a transcriber should hear, e.g. digits and US spelling) over `text`. A `voice` key here is a voice id and is ignored."""
    p = Path(job) / "project" / "voice" / "lines.json"
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text())
    except Exception:
        return []
    if isinstance(data, dict):
        data = data.get("lines") or list(data.values())
    out = []
    for l in data if isinstance(data, list) else []:
        if isinstance(l, str) and spoken(l):
            out.append(l)
        elif isinstance(l, dict):
            v = l.get("asr") or l.get("text") or l.get("line") or l.get("say")
            if isinstance(v, str) and v.strip():
                out.append(v)
    return out


def voice_lines(script, job=None):
    """Reference lines for WER: project/voice/lines.json when present, else script.json beats[].voice (and the
    older vo/lines shapes). Voice ids (key voiceId/voice_id/voiceCast, or values like am_liam) are never spoken text."""
    if job:
        got = lines_json_lines(job)
        if got:
            return got
    out = []
    KEYS = {"voice", "vo", "voiceover", "voice_over", "spoken", "say", "narration", "line"}
    def walk(o, key=None):
        if isinstance(o, dict):
            for k, v in o.items():
                if k.lower() in VOICE_ID_KEYS:
                    continue
                walk(v, k.lower())
        elif isinstance(o, list):
            for v in o:
                walk(v, key)
        elif isinstance(o, str) and key in KEYS | {"lines"} and spoken(o):
            out.append(o)
    if isinstance(script, dict) and isinstance(script.get("lines"), list):
        for l in script["lines"]:
            if isinstance(l, str) and spoken(l): out.append(l)
            elif isinstance(l, dict):
                v = l.get("text") or l.get("line") or l.get("vo") or l.get("voice")
                if isinstance(v, str) and spoken(v): out.append(v)
        return out
    walk(script)
    return out


def find_model():
    for m in MODELS:
        if m and Path(m).exists():
            return m
    return None


def caption_wer(rep, path, tag, script, lang="en", job=None):
    lines = voice_lines(script, job)
    if not lines:
        rep.add("video.wer", "Caption accuracy (whisper WER vs script)", "skip", None, "WER <= 5% (8% fail)",
                "no spoken lines found (project/voice/lines.json or script.json beats[].voice)", tag)
        return None
    model = find_model()
    if not (have("whisper-cli") and model):
        rep.add("video.wer", "Caption accuracy (whisper WER vs script)", "skip", None, "WER <= 5%",
                "whisper-cli or ggml model not found", tag)
        return None
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, "a.wav")
        run(["ffmpeg", "-v", "error", "-y", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", wav])
        r = run(["whisper-cli", "-m", model, "-f", wav, "-l", lang, "-nt", "-np"], timeout=900)
    hyp_raw = " ".join(r.stdout.split())
    ref, hyp = normalise(" ".join(lines)), normalise(hyp_raw)
    w = wer(ref, hyp)
    st = "fail" if w > 0.08 else "warn" if w > 0.05 else "pass"
    rep.add("video.wer", "Caption accuracy (whisper WER vs script)", st, f"{w*100:.1f}%", "<= 5% (fail > 8%)",
            f"model {Path(model).name}; {len(ref)} ref words; heard: {hyp_raw[:160]!r}", tag)
    return hyp_raw


def run_video(rep, path, qa_dir, script=None, loop=False, lang="en", multi=False, job=None):
    path = Path(path)
    tag = path.name if multi else ""
    t0 = time.time()
    qa_dir = Path(qa_dir); fdir = qa_dir / "frames"; fdir.mkdir(parents=True, exist_ok=True)
    info = spec_checks(rep, path, tag)
    dur = info.get("duration", 0)
    loudness(rep, path, tag)
    black_freeze(rep, path, tag, dur)
    frames, cuts = sample_frames(path, fdir, dur, path.stem)
    ocr = ocr_checks(rep, frames, tag, dur)
    loop_seam(rep, frames, tag, loop)
    hyp = caption_wer(rep, path, tag, script, lang, job)
    return {"frames": frames, "ocr": ocr, "scene_cuts": cuts, "info": info, "transcript": hyp, "secs": time.time() - t0}
