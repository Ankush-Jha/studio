/* pop-hook (Direction A, "Bold Pop") timeline.
 *
 * Rhythm (about 14 s): every 1-2 s something visibly changes.
 *   0.00  HOOK  accent field. "$7,800 paid." sticker, "Still owes", giant "$150,000."
 *         frame 1 is fully legible; the giant number is already settling from a snap
 *         zoom (1.10 -> 1.00) and the sticker swings in, so motion starts at frame 0.
 *   0.70  "Paid off 0%" bar appears; 1.25 it tries to fill and snaps back (stuck).
 *   2.30  snap-zoom cut (whoosh) to the ink field.
 *   RISE  "Interest only" pill, giant counter $619 -> $650 on ticks, "+$31" chip pops.
 *   ~41%  PATTERN INTERRUPT: cut to the paper field; 12 payment slips rain down while
 *         "Paid" climbs to $7,800 and the giant balance refuses to move: shake + stamp.
 *   FIX   ink field. Slider $650 -> $850, balance counts down to $147,542, "-$2,458" chip.
 *   LOOP  snap back into the hook; the last frame is frame 1.
 */
window.TEMPLATE = {
  build(MT, M, tl) {
    const B = M.block;
    const safe = M.safe;
    const W = M.width;
    const IR = MT.IR;
    const stage = document.getElementById('stage');
    const layer = document.getElementById('layer');
    const beat = (id) => B.beats.find((b) => b.id === id);
    const rise = beat('rise'), stack = beat('stack'), fix = beat('fix');
    const money = MT.fmt.money;
    const cue = MT.cue;
    const warnings = [];

    /* ---------- palette: client tokens, contrast-safe text colours ---------- */
    const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (h) => { const [r, g, b] = hex(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
    const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const mixHex = (a, b, t) => { const A = hex(a), Bv = hex(b); return '#' + A.map((v, i) => Math.round(v + (Bv[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
    const toward = (c, target, bg, need) => { for (let t = 0; t <= 1.0001; t += 0.04) { const m = mixHex(c, target, t); if (cr(m, bg) >= need) return m; } return target; };
    const ACC = css('--color-accent'), INK = css('--color-ink'), PAPER = css('--color-paper');
    const pick = (bg, list, need) => list.find((c) => cr(c, bg) >= need) || list.reduce((a, c) => (cr(c, bg) > cr(a, bg) ? c : a), list[0]);
    const P = {
      acc: ACC, ink: INK, paper: PAPER,
      onAccBig: pick(ACC, ['#FFFFFF', PAPER, '#111111'], 3.0),
      onAccSmall: pick(ACC, ['#111111', INK, '#000000', '#FFFFFF'], 4.5),
      accOnInk: toward(ACC, '#FFFFFF', INK, 4.5),
      accInk: toward(ACC, '#000000', PAPER, 4.5),
    };
    const setVars = (el, o) => Object.entries(o).forEach(([k, v]) => el.style.setProperty(k, v));
    setVars(stage, { '--chrome-ink': P.onAccSmall, '--chrome-bg': P.acc });

    /* ---------- set: field, background shapes, chrome ---------- */
    const field = MT.el('div', 'field', stage);
    stage.insertBefore(field, stage.firstChild);
    const blob = MT.el('div', 'blob', stage);
    const blob2 = MT.el('div', 'blob2', stage);
    const ch = MT.chrome(stage, { series: M.series, tag: M.tag, fine: M.fine, folio: false });
    const footTop = ch.foot.getBoundingClientRect().top;

    const scene = (name) => { const s = MT.el('div', `scene sc-${name}`, layer); return s; };
    const abs = (parent, cls, x, y, html, style = {}) => { const e = MT.el('div', `abs ${cls}`, parent, html); e.style.left = x + 'px'; e.style.top = y + 'px'; Object.assign(e.style, style); return e; };
    const fitFont = (e, targetW, max, min = 80) => { let fs = max; e.style.fontSize = fs + 'px'; const w = e.getBoundingClientRect().width; fs = Math.max(min, Math.min(max, fs * (targetW / w))); e.style.fontSize = fs.toFixed(1) + 'px'; return fs; };
    const X0 = safe.x0 + 15, X1 = safe.x1 - 15, CW = X1 - X0;

    /* ---------- HOOK ---------- */
    const sH = scene('hook');
    const hk = B.hook || {};
    const paid = hk.paid, balance = hk.balance;
    const sticker = abs(sH, 'sticker lab', X0, 410, MT.esc(MT.typo(hk.sticker || `${money(paid)} paid.`)), { background: P.ink, color: P.paper, fontSize: '66px' });
    sticker.dataset.role = 'display';
    // Long stickers shrink so that, swung to their frame-1 angle, they clear the label row.
    { let fs = 66; while (sticker.getBoundingClientRect().width > CW * 0.68 && fs > 40) { fs -= 2; sticker.style.fontSize = fs + 'px'; } }
    sticker.style.top = '440px';
    const hLabel = abs(sH, 'lab', X0, 560, MT.esc(MT.typo(hk.label || 'Still owes')), { color: P.onAccSmall, fontSize: '78px' });
    hLabel.dataset.role = 'display';
    const giant = abs(sH, 'pop num', X0, 650, MT.esc(`${money(balance)}.`), { color: P.onAccBig, transformOrigin: '0% 60%' });
    giant.dataset.role = 'display';
    fitFont(giant, CW * 0.9, 330);
    const gH = giant.getBoundingClientRect().height;
    const barY = 650 + gH + 70;
    const barLab = abs(sH, 'lab', X0, barY - 48, 'Paid off', { color: P.onAccSmall, fontSize: '32px' });
    barLab.dataset.role = 'label';
    const barPct = abs(sH, 'lab num', X1 - 120, barY - 48, '0%', { color: P.onAccSmall, fontSize: '32px', width: '120px', textAlign: 'right' });
    barPct.dataset.role = 'label';
    const bar = abs(sH, 'bar', X0, barY, '', { width: CW + 'px', background: 'rgba(0,0,0,.2)' });
    const barFill = MT.el('i', null, bar); barFill.style.background = P.ink;

    /* ---------- RISE ---------- */
    const sR = scene('rise');
    const rPill = abs(sR, 'pill lab', X0, 420, MT.esc(MT.typo(rise.label || 'Interest only')), { background: P.acc, color: P.onAccSmall, fontSize: '38px' });
    rPill.dataset.role = 'label';
    rPill.dataset.bg = '1';
    const rBig = abs(sR, 'pop num', X0 - 6, 520, money(rise.to), { color: P.accOnInk });
    rBig.dataset.role = 'display';
    fitFont(rBig, CW * 0.72, 380);
    const rCnt = MT.counter(rBig, { from: rise.from, to: rise.to });
    const rBigH = rBig.getBoundingClientRect().height;
    const rMo = abs(sR, 'lab', X0, 520 + rBigH + 26, 'a month', { color: P.paper, fontSize: '46px' });
    rMo.dataset.role = 'display';
    const rChip = abs(sR, 'pill lab', X0 + 300, 520 + rBigH + 14, MT.esc(MT.typo(`${rise.delta}`)), { background: P.paper, color: P.ink, fontSize: '56px', padding: '14px 26px 12px' });
    rChip.dataset.role = 'display';
    const rNoteBox = abs(sR, 'cap', X0, 520 + rBigH + 140, '', { color: P.paper, width: CW + 'px' });
    const rNote = MT.rich(rNoteBox, rise.note || '', { size: 54, role: 'display', width: CW });

    /* ---------- STACK (pattern interrupt) ---------- */
    const sS = scene('stack');
    const sBalLab = abs(sS, 'lab', X0, 400, 'Balance', { color: P.ink, fontSize: '36px' });
    sBalLab.dataset.role = 'label';
    const sBal = abs(sS, 'pop num', X0 - 4, 448, `${money(stack.balance)}`, { color: P.accInk, transformOrigin: '30% 60%' });
    sBal.dataset.role = 'display';
    sBal.style.zIndex = '4'; sBalLab.style.zIndex = '4';
    fitFont(sBal, CW * 0.86, 220);
    const sBalH = sBal.getBoundingClientRect().height;
    const gridTop = 448 + sBalH + 46;
    const cols = 4, sw = 196, sh = 118, gx = 22, gy = 20;
    const gridW = cols * sw + (cols - 1) * gx;
    const gx0 = Math.round((W - gridW) / 2);
    const rr = MT.rng('slips');
    const slips = [];
    for (let i = 0; i < stack.n; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const s = abs(sS, 'slip', gx0 + c * (sw + gx), gridTop + r * (sh + gy), `<span class="num">${money(stack.unit)}</span>`, { background: P.ink, color: P.paper });
      s.firstChild.dataset.role = 'body';
      s._rot = (rr() - 0.5) * 9;
      slips.push(s);
    }
    const rows = Math.ceil(stack.n / cols);
    const paidY = gridTop + rows * (sh + gy) + 14;
    const sPaidLab = abs(sS, 'lab', X0, paidY + 14, 'Paid', { color: P.ink, fontSize: '36px' });
    sPaidLab.dataset.role = 'label';
    const sPaid = abs(sS, 'pop num', X0 + 120, paidY - 6, money(stack.total), { color: P.ink, fontSize: '92px' });
    sPaid.dataset.role = 'display';
    const sCnt = MT.counter(sPaid, { from: 0, to: stack.total });
    const stamp = abs(sS, 'stamp lab', X1 - 330, 372, MT.esc(MT.typo(stack.stamp || 'Unchanged')), { color: P.accInk, fontSize: '54px', background: 'rgba(255,255,255,.0)' });
    stamp.dataset.role = 'display';
    stamp.style.left = (X1 - stamp.getBoundingClientRect().width - 44) + 'px';
    if (paidY + 100 > footTop - 8) warnings.push('stack scene: paid row is close to the foot');

    /* ---------- FIX ---------- */
    const sF = scene('fix');
    const fPill = abs(sF, 'pill lab', X0, 420, MT.esc(MT.typo(fix.label || 'Pay instead')), { background: P.acc, color: P.onAccSmall, fontSize: '38px' });
    fPill.dataset.role = 'label';
    const fBig = abs(sF, 'pop num', X0 - 6, 512, money(fix.pay), { color: P.accOnInk });
    fBig.dataset.role = 'display';
    fitFont(fBig, CW * 0.5, 260);
    const fCnt = MT.counter(fBig, { from: stack.unit, to: fix.pay });
    const fBigH = fBig.getBoundingClientRect().height;
    const trackY = 512 + fBigH + 30;
    const vmin = Math.min(stack.unit, fix.pay) - 150, vmax = Math.max(stack.unit, fix.pay) + 100;
    const kx = (v) => X0 + ((v - vmin) / (vmax - vmin)) * (CW - 76);
    const track = abs(sF, 'track', X0, trackY + 29, '', { width: CW + 'px', background: 'rgba(255,255,255,.22)' });
    const trackFill = abs(sF, 'track', X0, trackY + 29, '', { width: CW + 'px', background: P.accOnInk, transformOrigin: '0 50%' });
    const knob = abs(sF, 'knob', 0, trackY, '', { background: P.paper });
    const fBalLab = abs(sF, 'lab', X0, trackY + 112, 'Balance', { color: P.paper, fontSize: '34px' });
    fBalLab.dataset.role = 'label';
    const fBal = abs(sF, 'pop num', X0 - 3, trackY + 152, money(fix.balanceEnd), { color: P.paper, fontSize: '112px' });
    fBal.dataset.role = 'display';
    const fBalCnt = MT.counter(fBal, { from: stack.balance, to: fix.balanceEnd });
    const fChip = abs(sF, 'pill lab', X0 + 560, trackY + 168, MT.esc(MT.typo(fix.chip || `−${money(fix.off)} in a year`)), { background: P.acc, color: P.onAccSmall, fontSize: '40px', padding: '14px 22px 12px', whiteSpace: 'nowrap' });
    fChip.dataset.role = 'display';
    fChip.style.left = (X1 - fChip.getBoundingClientRect().width) + 'px';
    if (trackY + 152 + 110 > footTop - 6) warnings.push('fix scene: balance is close to the foot');

    /* ---------- timeline ---------- */
    const keyframes = [], holds = [];
    const scenes = [sH, sR, sS, sF];
    const fields = { hook: P.acc, rise: P.ink, stack: P.paper, fix: P.ink };
    const chromeInk = { hook: P.onAccSmall, rise: P.paper, stack: P.ink, fix: P.paper };
    const badgeFg = { hook: pick(P.onAccSmall, ['#FFFFFF', P.paper, '#111111', '#000000'], 4.5), rise: P.ink, stack: P.paper, fix: P.ink };
    const blobs = {
      hook: { c: P.ink, c2: P.paper, x: 330, y: 1290, s: 1, x2: -170, y2: 1480 },
      rise: { c: P.acc, c2: P.paper, x: -260, y: 1330, s: 1.1, x2: 830, y2: 1500 },
      stack: { c: P.acc, c2: P.ink, x: 420, y: 1350, s: 0.9, x2: -120, y2: 1420 },
      fix: { c: P.paper, c2: P.acc, x: -300, y: 1300, s: 1.05, x2: 860, y2: 1460 },
    };
    const setLook = (k, at) => {
      tl.set(field, { backgroundColor: fields[k] }, at);
      // The stage carries the field colour too, so QA measures text against it.
      tl.set(stage, { backgroundColor: fields[k], '--chrome-ink': chromeInk[k], '--chrome-bg': fields[k], '--badge-fg': badgeFg[k] }, at);
      const b = blobs[k];
      tl.set(blob, { backgroundColor: b.c }, at); tl.set(blob2, { backgroundColor: b.c2 }, at);
    };
    const moveBlobs = (a, b, at, d = 0.6) => {
      const A = blobs[a], Bb = blobs[b];
      tl.fromTo(blob, { x: A.x - 330, y: A.y - 1290, scale: A.s }, { x: Bb.x - 330, y: Bb.y - 1290, scale: Bb.s, duration: d, ease: 'expo.out', ...IR }, at);
      tl.fromTo(blob2, { x: A.x2 + 170, y: A.y2 - 1480 }, { x: Bb.x2 + 170, y: Bb.y2 - 1480, duration: d, ease: 'expo.out', ...IR }, at);
    };
    // Snap-zoom cut: outgoing scene rushes at the camera, the field flips on the frame
    // where both are moving fastest, the new scene lands from a step back.
    const cut = (from, to, keyFrom, keyTo, at) => {
      cue(at - 0.06, 'whoosh', 0.9);
      tl.fromTo(from, { scale: 1, opacity: 1 }, { scale: 1.5, opacity: 0, duration: 0.2, ease: 'power3.in', ...IR }, at);
      const c = at + 0.17;
      setLook(keyTo, c);
      moveBlobs(keyFrom, keyTo, c);
      tl.fromTo(to, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'expo.out', ...IR }, c);
      cue(c, 'thud', 0.55);
      return c;
    };
    const shake = (el, at, amp = 12, n = 6, step = 0.045) => {
      let x = 0;
      for (let i = 0; i < n; i++) { const nx = i === n - 1 ? 0 : (i % 2 ? 1 : -1) * amp * (1 - i / n); tl.fromTo(el, { x }, { x: nx, duration: step, ease: 'sine.inOut', ...IR }, at + i * step); x = nx; }
    };
    const ticks = (from, to, n, gain = 0.35) => { for (let i = 0; i < n; i++) cue(from + ((to - from) * i) / Math.max(1, n - 1), 'tick', gain); };

    // t = 0
    scenes.forEach((s, i) => tl.set(s, { scale: 1, opacity: i === 0 ? 1 : 0 }, 0));
    setLook('hook', 0);
    tl.set(blob, { x: 0, y: 0, scale: 1 }, 0); tl.set(blob2, { x: 0, y: 0 }, 0);
    tl.set(giant, { scale: 1.1 }, 0);
    tl.set(sticker, { rotation: -14, scale: 1 }, 0);
    tl.set([barLab, barPct, bar], { opacity: 0, y: 20 }, 0);
    tl.set(barFill, { scaleX: 0 }, 0);
    tl.set([rPill, rMo, rChip], { opacity: 0, y: 24, scale: 1 }, 0);
    tl.set(rBig, { opacity: 0, y: 30 }, 0); rCnt.set(tl, rise.from, 0);
    MT.hidePop(tl, rNote, 0);
    tl.set([sBalLab, sBal, sPaidLab, sPaid], { opacity: 0, y: 24 }, 0); sCnt.set(tl, 0, 0);
    slips.forEach((s) => tl.set(s, { y: -150, opacity: 0, rotation: s._rot * 3 }, 0));
    tl.set(stamp, { opacity: 0, scale: 2.2, rotation: -16 }, 0);
    tl.set([fPill, fBalLab, fBal, fChip, track], { opacity: 0, y: 24 }, 0);
    tl.set(fBig, { opacity: 0, y: 30 }, 0); fCnt.set(tl, stack.unit, 0);
    tl.set(trackFill, { scaleX: (kx(stack.unit) - X0 + 38) / CW, opacity: 0 }, 0);
    tl.set(knob, { x: kx(stack.unit), opacity: 0 }, 0);
    fBalCnt.set(tl, stack.balance, 0);

    // HOOK (frame 1 legible; motion from frame 0)
    keyframes.push({ t: 0, name: 'frame 1 (hook)' });
    tl.fromTo(giant, { scale: 1.1 }, { scale: 1, duration: 0.5, ease: 'expo.out', ...IR }, 0);
    tl.fromTo(sticker, { rotation: -14 }, { rotation: -5, duration: 0.7, ease: 'back.out(2.6)', ...IR }, 0);
    cue(0.0, 'thud', 0.7); cue(0.04, 'pop', 0.4);
    MT.inEl(tl, [barLab, barPct, bar], 0.62, { y: 20, dur: 0.45, stagger: 0.05 });
    cue(0.62, 'swish', 0.4);
    keyframes.push({ t: 1.05, name: 'hook settled' });
    // the bar tries to fill... and snaps back: stuck.
    tl.fromTo(barFill, { scaleX: 0 }, { scaleX: 0.08, duration: 0.32, ease: 'power2.out', ...IR }, 1.2);
    tl.fromTo(barFill, { scaleX: 0.08 }, { scaleX: 0, duration: 0.18, ease: 'power3.in', ...IR }, 1.56);
    shake(bar, 1.74, 10, 6); shake(giant, 1.74, 6, 6);
    cue(1.2, 'rise', 0.35); cue(1.72, 'glitch', 0.6);
    holds.push({ name: 'hook', words: MT.wordCount(`${hk.sticker || ''} ${hk.label || 'Still owes'} x`) + 2, start: 0, end: 2.2 });

    // RISE
    let c = cut(sH, sR, 'hook', 'rise', 2.2);
    MT.inEl(tl, [rPill], c + 0.06, { dur: 0.45 }); cue(c + 0.06, 'pop', 0.45);
    tl.fromTo(rBig, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out', ...IR }, c + 0.12);
    const cEnd = rCnt.run(tl, rise.from, rise.to, c + 0.3, 1.0, 'power2.inOut');
    ticks(c + 0.3, cEnd - 0.05, 9);
    MT.inEl(tl, [rMo], c + 0.5, { dur: 0.4 });
    tl.fromTo(rChip, { opacity: 0, y: 24, scale: 0.6 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(2.4)', ...IR }, cEnd + 0.02);
    cue(cEnd + 0.02, 'pop', 0.7);
    const nEnd = MT.popWords(tl, rNote, cEnd + 0.4, { per: 0.12 });
    keyframes.push({ t: +(nEnd + 0.05).toFixed(3), name: 'rise' });
    const riseOut = Math.max(5.3, nEnd + MT.wordCount(rise.note || '') * 0.34);
    holds.push({ name: 'rise: pill + number + chip', words: 4, start: cEnd + 0.4, end: riseOut });
    holds.push({ name: 'rise: note', words: rNote.words_n, start: nEnd, end: riseOut });

    // STACK: pattern interrupt
    c = cut(sR, sS, 'rise', 'stack', riseOut);
    keyframes.push({ t: +(c + 0.45).toFixed(3), name: 'pattern interrupt' });
    MT.inEl(tl, [sBalLab, sBal], c + 0.05, { dur: 0.45, stagger: 0.06 });
    const s0 = c + 0.35, per = 0.12;
    slips.forEach((s, i) => {
      tl.fromTo(s, { y: -150, opacity: 0, rotation: s._rot * 3, scale: 1.15 }, { y: 0, opacity: 1, rotation: s._rot, scale: 1, duration: 0.45, ease: 'back.out(1.7)', ...IR }, s0 + i * per);
      cue(s0 + i * per + 0.18, i % 3 === 2 ? 'paper' : 'tick', 0.45);
    });
    MT.inEl(tl, [sPaidLab, sPaid], s0, { dur: 0.4 });
    for (let i = 0; i < stack.n; i++) tl.fromTo(sCnt.proxy, { v: stack.unit * i }, { v: stack.unit * (i + 1), duration: 0.1, ease: 'power1.out', ...IR }, s0 + i * per + 0.2);
    const slipsEnd = s0 + (stack.n - 1) * per + 0.55;
    // the balance won't budge
    shake(sBal, slipsEnd, 14, 7);
    tl.fromTo(stamp, { opacity: 0, scale: 2.2, rotation: -16 }, { opacity: 1, scale: 1, rotation: -9, duration: 0.18, ease: 'power4.in', ...IR }, slipsEnd + 0.12);
    shake(sS, slipsEnd + 0.3, 8, 5, 0.04);
    cue(slipsEnd + 0.28, 'stamp', 0.9);
    keyframes.push({ t: +(slipsEnd + 0.7).toFixed(3), name: 'stack' });
    const stackOut = slipsEnd + 0.3 + 1.15;
    holds.push({ name: 'stack: balance', words: 2, start: c + 0.5, end: stackOut });
    holds.push({ name: 'stack: paid + stamp', words: 3, start: slipsEnd + 0.3, end: stackOut });

    // FIX
    c = cut(sS, sF, 'stack', 'fix', stackOut);
    MT.inEl(tl, [fPill], c + 0.05, { dur: 0.45 }); cue(c + 0.05, 'pop', 0.45);
    tl.fromTo(fBig, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out', ...IR }, c + 0.1);
    MT.inEl(tl, [track], c + 0.2, { dur: 0.4 });
    tl.fromTo(knob, { opacity: 0, x: kx(stack.unit) }, { opacity: 1, x: kx(stack.unit), duration: 0.3, ease: 'expo.out', ...IR }, c + 0.25);
    tl.fromTo(trackFill, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'expo.out', ...IR }, c + 0.25);
    const k0 = c + 0.7;
    tl.fromTo(knob, { x: kx(stack.unit) }, { x: kx(fix.pay), duration: 0.55, ease: 'swap', ...IR }, k0);
    tl.fromTo(trackFill, { scaleX: (kx(stack.unit) - X0 + 38) / CW }, { scaleX: (kx(fix.pay) - X0 + 38) / CW, duration: 0.55, ease: 'swap', ...IR }, k0);
    fCnt.run(tl, stack.unit, fix.pay, k0, 0.55, 'swap');
    cue(k0 - 0.02, 'swish', 0.6); cue(k0 + 0.55, 'click', 0.7);
    MT.inEl(tl, [fBalLab, fBal], k0 + 0.6, { dur: 0.4, stagger: 0.05 });
    const b0 = k0 + 0.85;
    const bEnd = fBalCnt.run(tl, stack.balance, fix.balanceEnd, b0, 0.9, 'power2.inOut');
    ticks(b0, bEnd - 0.05, 8, 0.3);
    tl.fromTo(fChip, { opacity: 0, y: 24, scale: 0.6 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(2.4)', ...IR }, bEnd + 0.02);
    cue(bEnd, 'cash', 0.9);
    keyframes.push({ t: +(bEnd + 0.6).toFixed(3), name: 'fix' });
    const fixOut = bEnd + 0.02 + 1.6;
    holds.push({ name: 'fix: pay + balance', words: 4, start: bEnd, end: fixOut });
    holds.push({ name: 'fix: chip', words: MT.wordCount(fix.chip || `${money(fix.off)} in a year`), start: bEnd + 0.3, end: fixOut });

    // LOOP: snap back into the hook, landing exactly on the frame-1 state.
    cue(fixOut - 0.06, 'whoosh', 0.9);
    tl.fromTo(sF, { scale: 1, opacity: 1 }, { scale: 1.5, opacity: 0, duration: 0.2, ease: 'power3.in', ...IR }, fixOut);
    const L = fixOut + 0.17;
    setLook('hook', L);
    moveBlobs('fix', 'hook', L, 0.4);
    tl.set([barLab, barPct, bar], { opacity: 0, y: 20 }, L);
    tl.set(barFill, { scaleX: 0 }, L);
    tl.set(giant, { x: 0 }, L); tl.set(bar, { x: 0 }, L);
    tl.fromTo(sH, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.42, ease: 'expo.out', ...IR }, L);
    tl.fromTo(giant, { scale: 0.7 }, { scale: 1.1, duration: 0.42, ease: 'power2.out', ...IR }, L);
    tl.fromTo(sticker, { rotation: -30 }, { rotation: -14, duration: 0.42, ease: 'power2.out', ...IR }, L);
    const end = L + 0.42 + 2 / M.fps;
    keyframes.push({ t: +(end - 1 / M.fps).toFixed(3), name: 'last frame (= frame 1)' });
    return { duration: end, keyframes, holds, poster: 0.6, warnings };
  },
};
