/* Direction B "Phone POV" timeline. See template.mjs for the data shape.
 *
 * Beats (about 14 s, loops):
 *   0.0  hook      caption set in frame 1; a payment notification drops in at 0.06 s;
 *                  the balance jolts and refuses to move
 *   2.3  rise      camera swings; the minimum payment rewinds to the old figure, then
 *                  counts up on ticks; the change punches in as a chip
 *   5.3  stack     PATTERN INTERRUPT (~38%): snap zoom into the balance; twelve payment
 *                  banners stack in, "paid this year" climbs, the balance shakes but
 *                  does not move; a NO CHANGE stamp slams down
 *   8.5  fix       zoom out; the payment is retyped, set with a tap; twelve months tick
 *                  by and the balance finally steps down (calc series); the amount off
 *                  lands with a cash cue
 *  12.8  loop      the phone spins 360 degrees; the screen swaps back to the hook state
 *                  while its back faces camera; the hook caption pops back in
 */
window.TEMPLATE = {
  build(MT, M, tl) {
    const B = M.block;
    const V = M.values;
    const IR = MT.IR;
    const money = (n) => MT.fmt.money(n);
    const stage = document.getElementById('stage');
    // Set colours from the client's ink token, resolved to plain rgb (QA reads rgb only).
    {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-ink)';
      document.body.appendChild(probe);
      const ink = getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number);
      probe.remove();
      const mixc = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v * t + b[i] * (1 - t))).join(',')})`;
      stage.style.setProperty('--set', mixc(ink, [5, 6, 6], 0.38));
      stage.style.setProperty('--set-lift', mixc(ink, [42, 47, 45], 0.7));
    }
    const warnings = [];
    const beat = (id) => B.beats.find((b) => b.id === id);
    const rise = beat('rise'), stack = beat('stack'), fix = beat('fix');
    const series = V.series.shown;
    const seriesX = V.series.exact || series;
    // UI copy: generic bank-app labels, overridable per client via story.ui / beat labels.
    const U = {
      app: 'Home equity line', balance: B.hook.label || 'Balance owing', paid: 'Paid this year', minimum: 'Minimum payment',
      riseLabel: rise.label || 'Minimum payment', your: fix.label || 'Your payment', io: 'Interest only', set: 'Set payment', done: 'Payment set',
      month: 'This month', charged: 'Interest charged', received: 'Payment received', to: 'to your home equity line',
      stamp: stack.stamp || 'No change', extra: 'more a month pays down the balance', off: 'in a year', ...(B.ui || {}),
    };
    // Captions: fall back to wording built from the beat's own numbers.
    const capOf = {
      stack: stack.caption || `${stack.n} payments.|Balance: ==${money(stack.balance)}==.`,
      fix: fix.caption || `Pay ==${money(fix.pay)}== instead:|==${money(fix.off)}== off in a year.`,
      rise: rise.caption || `Interest only:|==${money(rise.to)}== a month.`,
    };
    // Bank balances show cents (exact calc values); the small cents mimic a real app.
    const cents = (n) => { const s = MT.fmt.money(n, { cents: true }); const i = s.lastIndexOf('.'); return `${s.slice(0, i)}<span class="cc">${s.slice(i)}</span>`; };
    const months = series.length - 1;
    const ch = MT.chrome(stage, { series: M.series, tag: M.tag, fine: M.fine });
    // Timing table (seconds). A caption starts only after the previous one has left,
    // so two captions never mix words on screen.
    const T = { notifIn: 0.06, jolt: 0.95, notifOut: 1.6, hookOut: 2.3, swing: 2.36, riseCap: 2.56, rewind: 2.95, count: 3.35, deltaPop: 4.24,
      riseOut: 5.2, zoom: 5.32, stackCap: 5.5, n0: 5.82, nStep: 0.15, stackOut: 8.42, zoomOut: 8.5, fixCap: 8.7,
      select: 9.25, keys: [9.55, 9.71, 9.87, 10.03], tap: 10.25, mon0: 10.6, monStep: 0.11, fixOut: 12.82, spin: 12.86, swap: 13.18, hookCap: 13.1 };

    const E = (tag, cls, parent, html) => MT.el(tag, cls, parent, html);
    const L = (node) => { node.dataset.role = 'label'; return node; };
    // Discrete text over time (typed digits, month labels): deterministic, set after each seek.
    const states = (node, list) => {
      list.sort((a, b) => a[0] - b[0]);
      MT.after((t) => {
        let v = list[0][1];
        for (const [tt, val] of list) if (t + 1e-6 >= tt) v = val;
        if (node.__s !== v) { node.innerHTML = v; node.__s = v; }
      });
    };
    const classStates = (node, cls, list) => {
      list.sort((a, b) => a[0] - b[0]);
      MT.after((t) => {
        let on = list[0][1];
        for (const [tt, val] of list) if (t + 1e-6 >= tt) on = val;
        node.classList.toggle(cls, !!on);
      });
    };
    const appIcon = (parent) => {
      const ic = E('div', 'app-ic', parent);
      ic.innerHTML = '<svg viewBox="0 0 40 40" width="70%" height="70%"><path d="M8 19 L20 9 L32 19 V31 H8 Z" fill="none" stroke="var(--color-accent)" stroke-width="3.4" stroke-linejoin="round"/><rect x="17" y="22" width="6" height="9" fill="var(--color-accent)"/></svg>';
      return ic;
    };

    /* ---------------- set: shadow, scene, phone ---------------- */
    const pshadow = E('div', 'pshadow', stage);
    const scene = E('div', 'scene', stage);
    const cam = E('div', 'cam', scene);
    const phone = E('div', 'phone', cam);
    const back = E('div', 'ph-ext', phone);
    back.style.transform = 'translateZ(-28px) rotateY(180deg)';
    back.style.background = 'linear-gradient(150deg,#3b403e,#151817 55%,#222624)';
    back.innerHTML = '<div style="position:absolute;left:60px;top:60px;width:230px;height:230px;border-radius:64px;background:#1b1e1d;box-shadow:inset 0 0 0 2px rgba(255,255,255,.08)"><i style="position:absolute;left:22px;top:22px;width:86px;height:86px;border-radius:50%;background:#070808;box-shadow:inset 0 0 0 6px #2b2f2d"></i><i style="position:absolute;left:122px;top:122px;width:86px;height:86px;border-radius:50%;background:#070808;box-shadow:inset 0 0 0 6px #2b2f2d"></i></div>';
    for (let i = 10; i >= 1; i--) {
      const x = E('div', 'ph-ext', phone);
      x.style.transform = `translateZ(${(-i * 2.6).toFixed(1)}px)`;
      x.style.filter = `brightness(${(0.55 + i * 0.03).toFixed(2)})`;
    }
    const front = E('div', 'ph-front', phone);
    const screen = E('div', 'screen', front);
    E('div', 'island', screen);
    const ui = E('div', 'ui', screen);

    /* ---------------- app UI (generic bank app, no brand) ---------------- */
    L(E('div', 'sb', ui, '9:41'));
    const icons = E('div', 'sb-icons', ui);
    [8, 12, 16, 20].forEach((h) => { const i = E('i', null, icons); i.style.height = h + 'px'; });
    E('i', 'sb-bat', icons);
    const hdr = E('div', 'hdr', ui);
    appIcon(hdr);
    L(E('div', 'hdr-t', hdr, MT.esc(U.app)));
    E('div', 'hdr-sp', hdr);
    hdr.insertAdjacentHTML('beforeend', '<svg class="bell" viewBox="0 0 34 34"><path d="M9 24 V15 a8 8 0 0 1 16 0 V24 l2 3 H7 Z M14 29 h6" fill="none" stroke="var(--app-ink)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></svg>');
    const balK = L(E('div', 'bal-k', ui, MT.esc(U.balance)));
    const bal = E('div', 'bal', ui);
    bal.dataset.role = 'display';
    const balP = { m: 0 };
    MT.after(() => { const v = cents(seriesX[Math.max(0, Math.min(months, Math.round(balP.m)))]); if (bal.__s !== v) { bal.innerHTML = v; bal.__s = v; } });
    const paid = L(E('div', 'paid', ui, `<span>${MT.esc(U.paid)}</span><b>${money(B.hook.paid)}</b>`));
    const off = L(E('div', 'off', ui, `−${money(fix.off)} ${MT.esc(U.off)}`));
    const card = E('div', 'card', ui);
    const cK = L(E('div', 'c-k', card));
    states(cK, [[0, MT.esc(U.minimum)], [T.rewind, MT.esc(U.riseLabel)], [T.riseOut, MT.esc(U.minimum)], [T.select - 0.05, MT.esc(U.your)], [T.swap, MT.esc(U.minimum)]]);
    const cAmt = E('div', 'c-amt', card);
    cAmt.dataset.role = 'display';
    const amtC = MT.counter(cAmt, { from: rise.to, to: rise.to });
    const cType = E('div', 'c-amt', card);
    cType.dataset.role = 'display';
    const cPer = L(E('div', 'c-per', card, '/ month'));
    const cNote = L(E('div', 'c-note', card, MT.esc(MT.typo(rise.note || ''))));
    const cNote2 = L(E('div', 'c-note', card, `${money(fix.extra)} ${MT.esc(U.extra)}`));
    const chip = L(E('div', 'chip', card, MT.esc(U.io)));
    const delta = L(E('div', 'delta', card, MT.esc(rise.delta)));
    const btn = L(E('div', 'btn', card));
    states(btn, [[0, MT.esc(U.set)], [T.tap + 0.06, '<svg viewBox="0 0 20 20" width="20" height="20"><path d="M4 10.5 l4 4 l8-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' + MT.esc(U.done)], [T.swap, MT.esc(U.set)]]);
    classStates(btn, 'done', [[0, false], [T.tap + 0.06, true], [T.swap, false]]);
    const ripple = E('div', 'ripple', card);
    const actK = L(E('div', 'act-k', ui, MT.esc(U.month)));
    const r1 = L(E('div', 'row r1', ui, `<span class="ri"><i class="dot" style="background:var(--color-accent)"></i>${MT.esc(U.charged)}</span><b>+${money(stack.unit)}</b>`));
    const r2 = L(E('div', 'row r2', ui, `<span class="ri"><i class="dot" style="background:var(--app-ink)"></i>${MT.esc(U.received)}</span><b>−${money(stack.unit)}</b>`));
    [560, 604, 648, 692, 736, 780].forEach((y, i) => { const s = E('div', 'skel', ui); s.style.top = y + 'px'; s.style.right = 36 + (i % 3) * 90 + 'px'; });
    const mon = E('div', 'months', ui);
    const mK = L(E('div', 'm-k', mon));
    const monP = { m: 0 };
    MT.after(() => { const v = `Month <b>${Math.round(monP.m)}</b> of ${months}`; if (mK.__s !== v) { mK.innerHTML = v; mK.__s = v; } });
    const mBar = E('div', 'm-bar', mon);
    const mFills = [];
    for (let i = 0; i < months; i++) { const seg = E('div', 'm-seg', mBar); mFills.push(E('div', 'm-fill', seg)); }
    // In-screen notification (hook beat).
    const nb = E('div', 'nb', screen);
    appIcon(nb);
    nb.insertAdjacentHTML('beforeend', `<div class="nb-tx"><div class="nb-t" data-role="label">${MT.esc(U.received)}</div><div class="nb-b" data-role="label">${B.hook.sticker ? MT.esc(MT.typo(B.hook.sticker)) : `${money(stack.unit)} ${MT.esc(U.to)}`}</div></div><div class="nb-tm" data-role="label">now</div>`);
    const glare = E('div', 'glare', screen);
    E('div', 'vign', stage);

    /* ---------------- interrupt layer (stage level) ---------------- */
    const nstack = E('div', 'nstack', stage);
    const banners = [];
    for (let i = 0; i < stack.n; i++) {
      const b = E('div', 'nb', nstack);
      appIcon(b);
      b.insertAdjacentHTML('beforeend', `<div class="nb-tx"><div class="nb-t" data-role="label">${MT.esc(U.received)}</div><div class="nb-b" data-role="label">${money(stack.unit)} · payment ${i + 1} of ${stack.n}</div></div><div class="nb-tm" data-role="label">now</div>`);
      b.style.zIndex = 20 + i;
      banners.push(b);
    }
    const pchip = E('div', 'paidchip', stage);
    L(E('span', null, pchip, MT.esc(U.paid)));
    const pv = E('b', null, pchip);
    pv.dataset.role = 'display';
    const paidC = MT.counter(pv, { from: 0, to: stack.total });
    const stamp = L(E('div', 'stamp', stage, MT.esc(MT.typo(U.stamp))));

    /* ---------------- captions ---------------- */
    const capWrap = E('div', 'cap-wrap', stage);
    const mkCap = (src) => {
      const box = E('div', 'cap', capWrap);
      box.style.position = 'absolute';
      box.style.left = '15px';
      box.dataset.fit = '1';
      const R = MT.rich(box, src, { size: 96, minSize: 58, width: 920, maxLines: 2, role: 'display', balance: false });
      box.style.top = Math.round((186 - box.getBoundingClientRect().height) / 2) + 'px';
      if (!R.fitted) warnings.push(`caption does not fit: ${src}`);
      return R;
    };
    const capHook = mkCap(B.hook.caption);
    const capRise = mkCap(capOf.rise);
    const capStack = mkCap(capOf.stack);
    const capFix = mkCap(capOf.fix);

    /* ---------------- geometry for the zoom (measured at the neutral pose) ---------------- */
    bal.innerHTML = cents(seriesX[0]);
    const br = bal.getBoundingClientRect();
    // Width of the widest balance the series shows (tabular figures: same width).
    const F = { x: br.left + br.width / 2, y: br.top + br.height / 2 };
    const ZS = Math.min(1.95, 860 / br.width), ZY = 915;
    const zoom = { scale: ZS, x: 540 - F.x, y: ZY - F.y };
    tl.set(cam, { transformOrigin: `${F.x}px ${F.y}px` }, 0);
    // "/ month" sits after the widest amount.
    cAmt.textContent = money(fix.pay);
    cPer.style.left = 24 + cAmt.getBoundingClientRect().width + 12 + 'px';
    // Stage-level chips: centred / placed by measurement (GSAP owns their transforms).
    const pcw = pchip.getBoundingClientRect().width;
    pchip.style.transform = 'none';
    pchip.style.left = Math.round(540 - pcw / 2) + 'px';
    const rippleAt = () => { const c = card.getBoundingClientRect(), b = btn.getBoundingClientRect(); ripple.style.left = b.left - c.left + b.width / 2 + 'px'; ripple.style.top = b.top - c.top + b.height / 2 + 'px'; };
    rippleAt();
    // Stamp: across the lower-right of the balance as it will appear zoomed.
    const zr = { x0: 540 - (br.width * ZS) / 2, x1: 540 + (br.width * ZS) / 2, y0: ZY - (br.height * ZS) / 2, y1: ZY + (br.height * ZS) / 2 };
    const sw = stamp.getBoundingClientRect().width;
    stamp.style.left = Math.round(Math.min(zr.x1 - sw * 0.9, 1015 - sw - 30)) + 'px';
    stamp.style.top = Math.round(zr.y1 - 74) + 'px';

    /* ---------------- poses ---------------- */
    const P0 = { rotationY: -13, rotationX: 7, rotationZ: 1.6 };
    const P0b = { rotationY: -7, rotationX: 5, rotationZ: 0.6 };
    const P1 = { rotationY: 9, rotationX: 5, rotationZ: -1.2 };
    const P1b = { rotationY: 5, rotationX: 4, rotationZ: -0.6 };
    const PZ = { rotationY: 0, rotationX: 0, rotationZ: 0 };
    const P3 = { rotationY: 8, rotationX: 5, rotationZ: -1 };
    const P3b = { rotationY: 3, rotationX: 4, rotationZ: -0.4 };
    const shadowFor = (p) => ({ x: -p.rotationY * 4.5 + 10, y: 36 + p.rotationX * 3, opacity: 0.9 });
    const glareFor = (p) => ({ x: -p.rotationY * 26 });
    const pose = (from, to, at, dur, ease) => {
      tl.fromTo(phone, { ...from }, { ...to, duration: dur, ease, ...IR }, at);
      tl.fromTo(pshadow, shadowFor(from), { ...shadowFor(to), duration: dur, ease, ...IR }, at);
      tl.fromTo(glare, glareFor(from), { ...glareFor(to), duration: dur, ease, ...IR }, at);
    };

    /* ---------------- t = 0: hook state ---------------- */
    tl.set(phone, { ...P0, z: 0, transformPerspective: 0 }, 0);
    tl.set(pshadow, shadowFor(P0), 0);
    tl.set(glare, glareFor(P0), 0);
    tl.set(cam, { scale: 1, x: 0, y: 0 }, 0);
    MT.showPop(tl, capHook, 0);
    [capRise, capStack, capFix].forEach((R) => MT.hidePop(tl, R, 0));
    tl.set(nb, { y: -150 }, 0);
    tl.set(balP, { m: 0 }, 0);
    amtC.set(tl, rise.to, 0);
    tl.set([cAmt, chip, paid, actK, r1, r2, cPer], { opacity: 1, y: 0, scale: 1 }, 0);
    tl.set([cType, btn, cNote, cNote2, delta, off, mon], { opacity: 0 }, 0);
    tl.set(nb, { opacity: 0 }, 0);
    tl.set(banners, { y: -46, scale: 1.05, opacity: 0 }, 0);
    tl.set(pchip, { opacity: 0, y: 20 }, 0);
    paidC.set(tl, 0, 0);
    tl.set(stamp, { opacity: 0, scale: 2.2, rotation: -14 }, 0);
    tl.set(ripple, { scale: 0, opacity: 0 }, 0);
    tl.set(mFills, { scaleX: 0 }, 0);
    tl.set(monP, { m: 0 }, 0);
    const zoomFade = [ui.querySelector('.sb'), icons, hdr, paid, card, actK, r1, r2];
    tl.set(zoomFade, { opacity: 1 }, 0);
    tl.set([balK, bal], { x: 0 }, 0);
    tl.set(cType, { innerHTML: '' }, 0);
    states(cType, [[0, ''], [T.select, `<span class="sel">${money(rise.to)}</span>`], [T.keys[0], '$<i class="caret"></i>'],
      [T.keys[1], `${money(fix.pay).slice(0, 2)}<i class="caret"></i>`], [T.keys[2], `${money(fix.pay).slice(0, 3)}<i class="caret"></i>`],
      [T.keys[3], `${money(fix.pay)}<i class="caret"></i>`], [T.tap + 0.05, money(fix.pay)], [T.swap, '']]);
    const cues = [];
    const cue = (t, n, g) => MT.cue(t, n, g);
    const keyframes = [{ t: 0, name: 'frame 1 (hook)' }];
    const holds = [];

    /* ---------------- hook beat ---------------- */
    pose(P0, P0b, 0, T.hookOut, 'sine.inOut');
    tl.fromTo(nb, { y: -150, opacity: 1 }, { y: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.7)', ...IR }, T.notifIn);
    cue(T.notifIn, 'swish', 0.6); cue(T.notifIn + 0.24, 'pop', 0.7);
    const shake = (targets, at, amp) => {
      tl.fromTo(targets, { x: 0 }, { x: -amp, duration: 0.04, ease: 'power1.out', ...IR }, at);
      tl.fromTo(targets, { x: -amp }, { x: amp * 0.8, duration: 0.06, ease: 'power1.inOut', ...IR }, at + 0.04);
      tl.fromTo(targets, { x: amp * 0.8 }, { x: -amp * 0.4, duration: 0.06, ease: 'power1.inOut', ...IR }, at + 0.1);
      tl.fromTo(targets, { x: -amp * 0.4 }, { x: 0, duration: 0.08, ease: 'power2.out', ...IR }, at + 0.16);
    };
    shake(bal, T.jolt, 9);
    cue(T.jolt, 'thud', 0.45);
    keyframes.push({ t: 0.62, name: 'notification landed' });
    tl.fromTo(nb, { y: 0 }, { y: -150, duration: 0.3, ease: 'power2.in', ...IR }, T.notifOut);
    tl.set(nb, { opacity: 0 }, T.notifOut + 0.31);
    cue(T.notifOut, 'whoosh-short', 0.35);
    holds.push({ name: 'hook caption', words: capHook.words_n, start: 0, end: T.hookOut });
    keyframes.push({ t: 2.1, name: 'hook hold' });

    /* ---------------- rise beat ---------------- */
    MT.unpopWords(tl, capHook, T.hookOut, { dur: 0.2, stagger: 0.015 });
    pose(P0b, P1, T.swing, 0.66, 'swap');
    cue(T.swing, 'whoosh', 0.7);
    pose(P1, P1b, T.swing + 0.66, T.riseOut - T.swing - 0.66, 'sine.inOut');
    const riseDone = MT.popWords(tl, capRise, T.riseCap, { per: 0.13 });
    amtC.run(tl, rise.to, rise.from, T.rewind, 0.36, 'power2.inOut');
    cue(T.rewind, 'swish', 0.5);
    tl.fromTo(cNote, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', ...IR }, T.rewind + 0.1);
    amtC.run(tl, rise.from, rise.to, T.count, 0.85, 'power1.inOut');
    const nTicks = Math.min(10, Math.max(4, Math.round((rise.to - rise.from) / 4)));
    for (let i = 0; i < nTicks; i++) cue(T.count + (i * 0.85) / nTicks, 'tick', 0.4);
    tl.fromTo(delta, { opacity: 0, scale: 0.6, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: 'back.out(2.6)', ...IR }, T.deltaPop);
    tl.fromTo(cAmt, { scale: 1 }, { scale: 1.08, duration: 0.14, ease: 'power2.out', transformOrigin: '0% 70%', ...IR }, T.deltaPop - 0.04);
    tl.fromTo(cAmt, { scale: 1.08 }, { scale: 1, duration: 0.4, ease: 'power3.out', ...IR }, T.deltaPop + 0.1);
    cue(T.deltaPop, 'pop', 0.8);
    holds.push({ name: 'rise caption', words: capRise.words_n, start: riseDone, end: T.riseOut });
    keyframes.push({ t: 4.8, name: 'rise settled' });

    /* ---------------- stack beat: pattern interrupt ---------------- */
    MT.unpopWords(tl, capRise, T.riseOut, { dur: 0.2, stagger: 0.015 });
    tl.fromTo(phone, { ...P1b }, { ...PZ, duration: 0.3, ease: 'expo.out', ...IR }, T.zoom);
    tl.fromTo(cam, { scale: 1, x: 0, y: 0 }, { ...zoom, duration: 0.3, ease: 'expo.out', ...IR }, T.zoom);
    tl.fromTo(cam, { scale: ZS }, { scale: ZS * 1.035, duration: T.stackOut - T.zoom - 0.3, ease: 'none', ...IR }, T.zoom + 0.3);
    tl.fromTo(pshadow, { opacity: 0.9 }, { opacity: 0, duration: 0.2, ease: 'none', ...IR }, T.zoom);
    tl.fromTo(glare, glareFor(P1b), { x: -260, duration: 0.3, ease: 'expo.out', ...IR }, T.zoom);
    tl.fromTo(zoomFade, { opacity: 1 }, { opacity: 0, duration: 0.12, ease: 'none', ...IR }, T.zoom);
    tl.fromTo([delta, cNote], { opacity: 1 }, { opacity: 0, duration: 0.12, ease: 'none', ...IR }, T.zoom);
    cue(T.zoom, 'whoosh-short', 0.8); cue(T.zoom + 0.2, 'thud', 0.8);
    const stackDone = MT.popWords(tl, capStack, T.stackCap, { per: 0.13 });
    tl.fromTo(pchip, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.8)', ...IR }, T.n0 - 0.25);
    banners.forEach((b, i) => {
      const t0 = T.n0 + i * T.nStep;
      tl.fromTo(b, { y: -46, scale: 1.05, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.24, ease: 'back.out(1.6)', ...IR }, t0);
      // Older banners step back into a stack of three.
      [1, 2, 3].forEach((k) => {
        const o = banners[i - k];
        if (!o) return;
        const st = [{ y: 0, scale: 1, opacity: 1 }, { y: 20, scale: 0.95, opacity: 0.55 }, { y: 36, scale: 0.9, opacity: 0.28 }, { y: 48, scale: 0.86, opacity: 0 }];
        tl.fromTo(o, st[k - 1], { ...st[k], duration: 0.18, ease: 'power2.out', ...IR }, t0);
      });
      paidC.set(tl, stack.unit * (i + 1), t0 + 0.12);
      shake([balK, bal], t0 + 0.14, 4);
      cue(t0, 'tick', 0.55);
    });
    const tStamp = T.n0 + (stack.n - 1) * T.nStep + 0.38;
    tl.fromTo(stamp, { opacity: 0, scale: 2.2, rotation: -14 }, { opacity: 1, scale: 1, rotation: -8, duration: 0.2, ease: 'power4.in', ...IR }, tStamp);
    tl.fromTo(cam, { x: zoom.x }, { x: zoom.x - 8, duration: 0.04, ease: 'none', ...IR }, tStamp + 0.2);
    tl.fromTo(cam, { x: zoom.x - 8 }, { x: zoom.x, duration: 0.26, ease: 'elastic.out(1, 0.4)', ...IR }, tStamp + 0.24);
    cue(tStamp + 0.2, 'stamp', 0.9);
    keyframes.push({ t: +(T.n0 + 5 * T.nStep + 0.2).toFixed(2), name: 'interrupt: payments stacking' });
    keyframes.push({ t: +(tStamp + 0.6).toFixed(2), name: 'no change' });
    holds.push({ name: 'stack caption', words: capStack.words_n, start: stackDone, end: T.stackOut });

    /* ---------------- fix beat ---------------- */
    MT.unpopWords(tl, capStack, T.stackOut, { dur: 0.2, stagger: 0.015 });
    tl.fromTo([stamp, pchip], { opacity: 1 }, { opacity: 0, duration: 0.2, ease: 'power1.in', ...IR }, T.stackOut);
    tl.fromTo(banners.slice(-3), { opacity: (i) => [0.28, 0.55, 1][i] }, { opacity: 0, duration: 0.2, ease: 'power1.in', ...IR }, T.stackOut);
    tl.fromTo(phone, { ...PZ }, { ...P3, duration: 0.6, ease: 'power3.inOut', ...IR }, T.zoomOut);
    tl.fromTo(cam, { scale: ZS * 1.035, x: zoom.x, y: zoom.y }, { scale: 1, x: 0, y: 0, duration: 0.6, ease: 'power3.inOut', ...IR }, T.zoomOut);
    tl.fromTo(pshadow, { ...shadowFor(P3), opacity: 0 }, { ...shadowFor(P3), duration: 0.5, ease: 'power1.out', ...IR }, T.zoomOut + 0.1);
    tl.fromTo(glare, { x: -260 }, { ...glareFor(P3), duration: 0.6, ease: 'power3.inOut', ...IR }, T.zoomOut);
    cue(T.zoomOut, 'whoosh', 0.6);
    pose(P3, P3b, T.zoomOut + 0.6, T.fixOut - T.zoomOut - 0.6, 'sine.inOut');
    const back1 = zoomFade.filter((x) => x !== paid);
    tl.fromTo(back1, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power1.out', ...IR }, T.zoomOut + 0.25);
    const fixDone = MT.popWords(tl, capFix, T.fixCap, { per: 0.13 });
    // Retype the payment and set it.
    tl.fromTo(cAmt, { opacity: 1 }, { opacity: 0, duration: 0.01, ease: 'none', ...IR }, T.select);
    tl.fromTo(cType, { opacity: 0 }, { opacity: 1, duration: 0.01, ease: 'none', ...IR }, T.select);
    tl.fromTo(chip, { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.8, duration: 0.18, ease: 'power2.in', ...IR }, T.select);
    tl.fromTo(btn, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)', ...IR }, T.select + 0.12);
    cue(T.select, 'click', 0.5);
    T.keys.forEach((k) => cue(k, 'click', 0.6));
    tl.fromTo(btn, { scale: 1 }, { scale: 0.92, duration: 0.07, ease: 'power2.out', ...IR }, T.tap);
    tl.fromTo(btn, { scale: 0.92 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', ...IR }, T.tap + 0.07);
    tl.fromTo(ripple, { scale: 0, opacity: 0.5 }, { scale: 2.6, opacity: 0, duration: 0.5, ease: 'power2.out', ...IR }, T.tap);
    cue(T.tap, 'pop', 0.8);
    tl.fromTo(cNote2, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', ...IR }, T.tap + 0.15);
    // Twelve months tick by: segments fill, the balance steps down the calc series.
    tl.fromTo([actK, r1, r2], { opacity: 1 }, { opacity: 0, duration: 0.2, ease: 'power1.in', ...IR }, T.mon0 - 0.25);
    tl.fromTo(mon, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', ...IR }, T.mon0 - 0.2);
    for (let i = 1; i <= months; i++) {
      const t0 = T.mon0 + (i - 1) * T.monStep;
      tl.fromTo(mFills[i - 1], { scaleX: 0 }, { scaleX: 1, duration: 0.1, ease: 'power2.out', ...IR }, t0);
      tl.set(balP, { m: i }, t0 + 0.05);
      tl.set(monP, { m: i }, t0 + 0.05);
      cue(t0, 'tick', 0.35);
    }
    const tOff = T.mon0 + months * T.monStep + 0.12;
    tl.fromTo(bal, { scale: 1 }, { scale: 1.06, duration: 0.14, ease: 'power2.out', transformOrigin: '0% 80%', ...IR }, tOff - 0.12);
    tl.fromTo(bal, { scale: 1.06 }, { scale: 1, duration: 0.45, ease: 'power3.out', ...IR }, tOff + 0.02);
    tl.fromTo(off, { opacity: 0, scale: 0.6, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: 'back.out(2.4)', ...IR }, tOff);
    cue(tOff, 'cash', 0.9);
    keyframes.push({ t: +(T.keys[3] + 0.1).toFixed(2), name: 'payment retyped' });
    keyframes.push({ t: +(tOff + 0.6).toFixed(2), name: 'balance moved' });
    holds.push({ name: 'fix caption', words: capFix.words_n, start: fixDone, end: T.fixOut });

    /* ---------------- loop: spin back to the hook ---------------- */
    MT.unpopWords(tl, capFix, T.fixOut, { dur: 0.2, stagger: 0.015 });
    const spinDur = 0.72;
    tl.fromTo(phone, { ...P3b }, { rotationY: 360 + P0.rotationY, rotationX: P0.rotationX, rotationZ: P0.rotationZ, duration: spinDur, ease: 'power3.inOut', ...IR }, T.spin);
    tl.fromTo(pshadow, shadowFor(P3b), { ...shadowFor(P0), duration: spinDur, ease: 'power3.inOut', ...IR }, T.spin);
    tl.fromTo(pshadow, { scaleX: 1 }, { scaleX: 0.35, duration: spinDur / 2, ease: 'power2.in', ...IR }, T.spin);
    tl.fromTo(pshadow, { scaleX: 0.35 }, { scaleX: 1, duration: spinDur / 2, ease: 'power2.out', ...IR }, T.spin + spinDur / 2);
    tl.fromTo(glare, glareFor(P3b), { ...glareFor(P0), duration: spinDur, ease: 'power3.inOut', ...IR }, T.spin);
    cue(T.spin, 'whoosh', 0.85);
    // Swap the screen back to the hook state while the phone's back faces camera.
    tl.set([cType, btn, cNote2, mon, off], { opacity: 0 }, T.swap);
    tl.set([cAmt, chip, paid, actK, r1, r2], { opacity: 1, y: 0, scale: 1 }, T.swap);
    tl.set(balP, { m: 0 }, T.swap);
    tl.set(monP, { m: 0 }, T.swap);
    tl.set(mFills, { scaleX: 0 }, T.swap);
    amtC.set(tl, rise.to, T.swap);
    const hookBack = MT.popWords(tl, capHook, T.hookCap, { per: 0.13 });
    const end = Math.max(T.spin + spinDur, hookBack) + 0.28;
    keyframes.push({ t: +(end - 1 / M.fps).toFixed(3), name: 'last frame (= frame 1)' });
    return { duration: end, keyframes, holds, poster: 0, warnings };
  },
};
