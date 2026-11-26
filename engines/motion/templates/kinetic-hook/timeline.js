/* kinetic-hook timeline. See template.mjs for the data shape.
 *
 * Motion grammar (one style per family, see lib/families.mjs):
 *   frame 1   hook fully set and legible; at 0.15 s its mark draws and the marked word
 *             gets a type-scale punch, so the first second is never static
 *   holds     the block drifts 14 px on a long sine ease: settled, readable, alive
 *   changes   words leave up through their line masks while the next card rises in,
 *             overlapping; the family device and the ground shape below the safe zone
 *             move on every change (whoosh)
 *   numbers   count up on tabular figures (ticks), the old value is struck as it counts
 *   loop      the hook re-enters last, unmarked, exactly as frame 1
 */
window.TEMPLATE = {
  build(MT, M, tl) {
    const S = M.style;
    const B = M.block;
    const safe = M.safe;
    const stage = document.getElementById('stage');
    const layer = document.getElementById('layer');
    const variant = M.client.variant;
    const fam = M.family;
    const margin = S.device === 'margin';
    const ch = MT.chrome(stage, { series: M.series, tag: M.tag, fine: M.fine, folio: !margin });
    const warnings = [...(M.prepWarnings || [])];
    const IR = MT.IR;

    const footTop = ch.foot.getBoundingClientRect().top;
    const areaTop = safe.y0 + 130;
    const areaBottom = footTop - 48;
    const colX0 = margin ? (variant === 'b' ? safe.x0 + 15 : safe.x0 + 165) : safe.x0 + 15;
    const colW = margin ? (safe.x1 - 15) - colX0 - (variant === 'b' ? 150 : 0) : safe.x1 - safe.x0 - 30;
    const sizes = {
      ledger: { stmt: 196, stmtMin: 84, big: 360, old: 104, cap: 56, chip: 40 },
      kitchen: { stmt: 156, stmtMin: 70, big: 300, old: 92, cap: 54, chip: 38 },
      riso: { stmt: 200, stmtMin: 88, big: 360, old: 104, cap: 54, chip: 40 },
      dossier: { stmt: 140, stmtMin: 66, big: 280, old: 88, cap: 50, chip: 36 },
    }[fam];

    // ---------- build every card in its settled state ----------
    const cards = B.cards.map((c, i) => {
      const card = MT.el('div', 'card', layer);
      const layers = MT.layersIn(card);
      const blk = MT.el('div', 'blk', card);
      blk.style.left = colX0 + 'px';
      blk.style.width = colW + 'px';
      const p = { card, blk, layers, c, rich: [], els: [], words: 0 };
      if (c.kind === 'number') {
        const f = MT.formatter(c.format || 'money');
        if (c.label) { const k = MT.el('div', 'k-label', blk, MT.esc(MT.typo(c.label))); k.dataset.role = 'label'; p.els.push(k); p.words += MT.wordCount(c.label); }
        if (c.strike && c.from != null) {
          const o = MT.el('div', 'k-old', blk);
          p.old = MT.rich(o, `~~${f(c.from)}~~`, { size: sizes.old, role: 'display' });
          p.rich.push(p.old);
          p.words += 1;
        }
        const big = MT.el('div', 'k-big', blk);
        big.dataset.role = 'display';
        big.style.fontSize = sizes.big + 'px';
        big.textContent = f(c.to);
        let fs = sizes.big;
        while (big.scrollWidth > colW && fs > 120) { fs *= 0.96; big.style.fontSize = fs + 'px'; }
        p.big = big;
        p.counter = MT.counter(big, { from: c.from ?? 0, to: c.to, format: c.format || 'money' });
        p.words += 1;
        if (c.caption) {
          const cap = MT.el('div', 'k-cap', blk);
          p.cap = MT.rich(cap, c.caption, { size: sizes.cap, role: 'body' });
          p.rich.push(p.cap);
          p.words += p.cap.words_n;
        }
      } else {
        const box = MT.el('div', 'k-stmt', blk);
        box.dataset.fit = '1';
        const R = MT.rich(box, c.text, { size: sizes.stmt, minSize: sizes.stmtMin, width: colW, height: areaBottom - areaTop - 30, maxLines: c.maxLines || 4, role: 'display' });
        if (!R.fitted) warnings.push(`card ${i + 1} text does not fit at the minimum size`);
        p.rich.push(R);
        p.words += R.words_n;
      }
      const h = blk.getBoundingClientRect().height;
      const top = variant === 'b' ? Math.max(areaTop, areaBottom - h) : Math.round(areaTop + Math.max(0, areaBottom - areaTop - h) * 0.44);
      blk.style.top = top + 'px';
      p.top = top;
      p.width = Math.max(...p.rich.flatMap((R) => R.lines.map((l) => l.inner.getBoundingClientRect().width)), p.big ? p.big.getBoundingClientRect().width : 0);
      return p;
    });
    cards.forEach((p, i) => {
      p.marks = p.rich.flatMap((R, j) => MT.marksFor(R, p.layers, `card${i}:${j}`));
      p.punch = p.rich.flatMap((R) => R.words.filter((w) => w._marks.length && !w._marks.every((id) => R.marks[id] && R.marks[id].kind === 'strike')).map((w) => w.firstChild));
      if (p.big) p.punch.push(p.big);
    });

    // ---------- devices ----------
    const devices = [];
    if (S.device === 'rule' || S.device === 'memo') {
      const rule = MT.el('div', 'rule', layer);
      rule.style.left = colX0 + 'px';
      rule.style.width = colW + 'px';
      const st = (i) => ({ scaleX: Math.min(1, cards[i].width / colW), y: cards[i].top - 44 });
      devices.push({ set: (i, at) => tl.set(rule, st(i), at), move: (a, b, at) => tl.fromTo(rule, st(a), { ...st(b), duration: 0.7, ease: 'swap', ...IR }, at) });
    }
    if (margin) {
      const n = cards.length;
      const box = MT.el('div', 'margin-num', layer);
      box.dataset.role = 'display';
      box.style.left = (variant === 'b' ? safe.x1 - 15 - 130 : safe.x0 + 10) + 'px';
      const col = MT.el('span', 'mcol', box);
      for (let i = 0; i < n; i++) MT.el('span', 'mn', col, String(i + 1));
      const mrule = MT.el('div', 'mrule', layer);
      mrule.style.left = (variant === 'b' ? safe.x1 - 15 - 150 : safe.x0 + 152) + 'px';
      mrule.style.top = areaTop - 10 + 'px';
      mrule.style.height = M.height - areaTop + 10 + 'px';
      const st = (i) => ({ yPercent: -(100 / n) * i });
      const sy = (i) => ({ y: cards[i].top - 16 });
      devices.push({
        set: (i, at) => { tl.set(col, st(i), at); tl.set(box, sy(i), at); },
        move: (a, b, at) => { tl.fromTo(col, st(a), { ...st(b), duration: 0.7, ease: 'swap', ...IR }, at); tl.fromTo(box, sy(a), { ...sy(b), duration: 0.7, ease: 'swap', ...IR }, at); },
      });
    }
    // Ground: a family-styled shape under the safe zone (no text there) that steps to a
    // new height on every card change, so the lower frame is part of the motion.
    const ground = MT.el('div', `ground g-${fam}`, stage);
    ground.style.height = M.height + 'px';
    const gsvg = MT.svgEl('svg', { class: 'g-edge', viewBox: `0 0 ${M.width} 60`, width: M.width, height: 60, preserveAspectRatio: 'none' }, ground);
    const gr = MT.rng('ground');
    if (fam === 'kitchen' || fam === 'riso') {
      const pts = []; for (let x = 0; x <= M.width; x += 36) pts.push(`${x},${(30 + (gr() - 0.5) * 16).toFixed(1)}`);
      MT.svgEl('path', { d: `M0,60 L0,30 L${pts.join(' L')} L${M.width},60 Z`, class: 'g-fill' }, gsvg);
    } else {
      MT.svgEl('rect', { x: 0, y: 30, width: M.width, height: 30, class: 'g-fill' }, gsvg);
      MT.svgEl('rect', { x: 0, y: 24, width: M.width, height: 6, class: 'g-rule' }, gsvg);
    }
    const gy = (i) => safe.y1 + 30 + [40, 150, 90, 190][i % 4];
    devices.push({ set: (i, at) => tl.set(ground, { y: gy(i) }, at), move: (a, b, at) => tl.fromTo(ground, { y: gy(a) }, { y: gy(b), duration: 0.9, ease: 'swap', ...IR }, at) });
    const folio = ch.folio ? MT.rollingFolio(ch.folio, cards.length) : null;

    // ---------- choreography ----------
    const keyframes = [];
    const holds = [];
    const punch = (p, at) => {
      if (!p.punch.length) return;
      tl.fromTo(p.punch, { scale: 1, transformOrigin: '50% 85%' }, { scale: 1.07, transformOrigin: '50% 85%', duration: 0.2, ease: 'power2.out', ...IR }, at);
      tl.fromTo(p.punch, { scale: 1.07 }, { scale: 1, duration: 0.55, ease: 'power3.out', ...IR }, at + 0.2);
    };
    const drift = (p, from, to) => tl.fromTo(p.blk, { y: 0 }, { y: -14, duration: Math.max(0.1, to - from), ease: 'sine.inOut', ...IR }, from);
    const showCard = (p, at, marks = true) => {
      p.rich.forEach((R) => MT.showText(tl, R, at));
      MT.setShown(tl, p.els, true, at);
      if (p.big) tl.set(p.big, { opacity: 1, y: 0, scale: 1 }, at);
      if (p.counter) p.counter.set(tl, p.c.to, at);
      (marks ? MT.showMarks : MT.hideMarks)(tl, p.marks, at);
      tl.set(p.card, { autoAlpha: 1 }, at);
      tl.set(p.blk, { y: 0 }, at);
      if (p.punch.length) tl.set(p.punch, { scale: 1 }, at);
    };
    const hideCard = (p, at) => {
      p.rich.forEach((R) => MT.hideText(tl, R, at));
      MT.setShown(tl, p.els, false, at);
      if (p.big) tl.set(p.big, { opacity: 0, y: 40 }, at);
      if (p.counter) p.counter.set(tl, p.c.from ?? 0, at);
      MT.hideMarks(tl, p.marks, at);
      tl.set(p.card, { autoAlpha: 0 }, at);
      tl.set(p.blk, { y: 0 }, at);
    };
    const enterCard = (p, at, { marks = true } = {}) => {
      tl.set(p.card, { autoAlpha: 1 }, at);
      tl.set(p.blk, { y: 0 }, at);
      let settle = at;
      MT.inEl(tl, p.els, at);
      p.rich.forEach((R, j) => { settle = Math.max(settle, MT.enterText(tl, R, at + j * 0.1)); });
      if (p.big) {
        tl.fromTo(p.big, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.55, ease: S.enterEase, ...IR }, at + 0.08);
        const ce = p.counter.run(tl, p.c.from ?? 0, p.c.to, at + 0.16, S.countDur);
        for (let q = 0; q < 7; q++) MT.cue(at + 0.16 + (q * S.countDur) / 7, 'tick', 0.3);
        settle = Math.max(settle, ce);
      }
      let done = settle;
      if (marks) {
        const m0 = settle - 0.22 + S.markDelay;
        done = Math.max(done, MT.drawMarks(tl, p.marks, m0), p.punch.length ? m0 + 0.9 : 0);
        punch(p, m0 + 0.12);
        MT.cue(m0, 'swish', 0.45); MT.cue(m0 + 0.12, 'pop', 0.4);
      }
      return { settle, done };
    };
    const exitCard = (p, at) => {
      MT.eraseMarks(tl, p.marks, at, { dur: 0.24 });
      let end = at;
      p.rich.forEach((R, j) => { end = Math.max(end, MT.exitText(tl, R, at + 0.04 + j * 0.05)); });
      end = Math.max(end, MT.outEl(tl, p.els, at));
      if (p.big) { tl.fromTo(p.big, { opacity: 1, y: 0 }, { opacity: 0, y: -40, duration: S.exitDur, ease: S.exitEase, ...IR }, at + 0.06); end = Math.max(end, at + 0.06 + S.exitDur); }
      tl.set(p.card, { autoAlpha: 0 }, end + 0.01);
      return end;
    };

    // t = 0: hook fully set and legible (it is also the thumbnail), unmarked.
    cards.forEach((p, i) => (i === 0 ? showCard(p, 0, false) : hideCard(p, 0)));
    devices.forEach((d) => d.set(0, 0));
    if (folio) folio.set(tl, 0, 0);
    keyframes.push({ t: 0, name: 'frame 1 (hook)' });
    const hookMarksDone = MT.drawMarks(tl, cards[0].marks, 0.15);
    punch(cards[0], 0.27);
    MT.cue(0.15, 'swish', 0.5); MT.cue(0.27, 'pop', 0.4);
    keyframes.push({ t: +(hookMarksDone + 0.05).toFixed(3), name: 'hook marked' });

    let t = Math.max(cards[0].c.hold ?? MT.readTime(cards[0].words), hookMarksDone + 0.6);
    drift(cards[0], 0, t);
    holds.push({ name: 'card 1 (hook)', words: cards[0].words, start: 0, end: t });
    const order = [...cards.keys()].slice(1).concat([0]);
    let prev = 0;
    order.forEach((i, k) => {
      const p = cards[i];
      const last = k === order.length - 1;
      const exitEnd = exitCard(cards[prev], t);
      const at = exitEnd - S.overlap;
      devices.forEach((d) => d.move(prev, i, t + 0.06));
      MT.cue(t - 0.04, 'whoosh-short', 0.7);
      if (folio) folio.to(tl, i, t + 0.1, prev);
      const { settle, done } = enterCard(p, at, { marks: !last });
      if (!last) {
        const hold = p.c.hold ?? MT.readTime(p.words);
        const end = Math.max(settle + hold, done + 0.5);
        keyframes.push({ t: +(done + 0.05).toFixed(3), name: `card ${i + 1}` });
        holds.push({ name: `card ${i + 1}`, words: p.words, start: settle, end });
        drift(p, settle, end);
        t = end;
      } else {
        t = settle + (B.tail ?? 0.4);
        keyframes.push({ t: +(t - 1 / M.fps).toFixed(3), name: 'last frame (= frame 1)' });
      }
      prev = i;
    });
    return { duration: t, keyframes, holds, poster: 0, warnings };
  },
};
