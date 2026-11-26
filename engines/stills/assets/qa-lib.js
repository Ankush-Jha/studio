/* qa-lib.js: in-page audit for the style library (runs after fonts, style script, fit and marks).
 *
 * Collects every visible text run (HTML and SVG) with its line boxes, colour, effective opacity,
 * blend mode, role and font, and checks:
 *   - minimum size by role (fine 18 / label 20 / body 28 / display 28 px at 1080 wide)
 *   - text inside the format's safe box (unless inside [data-bleed])
 *   - overlapping [data-block]s, overflowing [data-fit] boxes, fit.js failures
 *   - compliance slot present, visible and in the safe box; placeholders flagged TODO
 *   - client photo placeholders flagged TODO
 *   - AI-look lint: gradient fills, blur blobs, glassmorphism, glow, gradient text, emoji,
 *     centred-everything, card-kit shadows, stray <img>, real bank names / banking chrome,
 *     missing ILLUSTRATIVE mark on document styles
 *   - copy lint: PLAYBOOK banned phrases and claims
 * WCAG contrast is measured in Node against the real pixels behind each run (render step).
 * Severity: "fail" blocks export; "warn" needs a human look; "todo" is a missing client asset.
 */
(function () {
  'use strict';
  const MIN = { fine: 18, label: 20, body: 28, display: 28 };
  const BANKS = /\b(RBC|Royal Bank|TD Bank|TD Canada|Toronto-Dominion|Scotiabank|Bank of Nova Scotia|BMO|Bank of Montreal|CIBC|National Bank|Banque Nationale|Desjardins|Tangerine|Simplii|EQ Bank|Equitable Bank|HSBC|ATB Financial|Laurentian|Manulife Bank|First National|MCAP|Home Trust|Coast Capital|Vancity|Meridian|Alterna|motusbank|Wealthsimple|Neo Financial|KOHO)\b/i;
  const CHROME = /\b(sign in|log ?in|online banking|forgot password|account number|routing|transit number|swift)\b/i;
  const BANNED = [
    /that'?s not how it works/i, /nobody tells you/i, /here'?s the thing/i, /let'?s dive in/i, /may surprise you/i,
    /game[- ]?changer/i, /\bunlock\b/i, /dream home/i, /\bthe point\?/i, /sound familiar\?/i,
    /\bguarantee(d)?\b/i, /\b(best|lowest) (mortgage )?rates?\b/i, /secret loophole/i, /guaranteed approval/i,
  ];
  const EMOJI = /\p{Extended_Pictographic}/u;

  function parse(c) {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  const roleOf = (el) => { const r = el.closest('[data-role]'); return r ? r.dataset.role : 'body'; };
  function effOpacity(el) {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity;
    return o;
  }
  function blendOf(el) {
    for (let n = el; n && n.nodeType === 1 && !n.classList.contains('slide'); n = n.parentElement) {
      const b = getComputedStyle(n).mixBlendMode;
      if (b && b !== 'normal') return b;
    }
    return 'normal';
  }
  function svgScale(el) {
    if (!(el instanceof SVGElement) || !el.getScreenCTM) return 1;
    const m = el.getScreenCTM();
    return m ? Math.hypot(m.a, m.b) : 1;
  }
  const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);

  window.QA_RUN = function () {
    const conf = window.QA_CONF || {};
    const slide = document.querySelector('.slide');
    const S = slide.getBoundingClientRect();
    const W = S.width, H = S.height, CANVAS = W * H;
    const safe = conf.safe;
    const issues = [];
    const add = (sev, kind, extra = {}) => issues.push({ sev, kind, ...extra });
    const runs = [];
    let words = 0;
    let allText = '';

    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode;
      const text = t.textContent.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const el = t.parentElement;
      if (el.closest('script,style')) continue;
      if (el.closest('[aria-hidden="true"]') && !el.closest('[data-qa]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const op = effOpacity(el);
      if (op < 0.02) continue;
      const isSVG = el instanceof SVGElement;
      const size = parseFloat(cs.fontSize) * svgScale(el);
      const fg = parse(isSVG ? cs.fill : cs.color) || { r: 0, g: 0, b: 0, a: 1 };
      if (isSVG) fg.a *= +cs.fillOpacity || 1;
      const range = document.createRange();
      range.selectNodeContents(t);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5)
        .map((r) => ({ x0: r.left - S.left, y0: r.top - S.top, x1: r.right - S.left, y1: r.bottom - S.top }));
      if (!rects.length) continue;
      const role = roleOf(el);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const bleed = !!el.closest('[data-bleed]');
      allText += ' ' + text;
      if (role !== 'fine' && !el.closest('[data-noword]')) words += text.split(' ').filter((w) => /[\p{L}\p{N}$%]/u.test(w)).length;
      runs.push({
        text: text.slice(0, 70), role, size: +size.toFixed(1), weight: parseInt(cs.fontWeight, 10), family: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        fg: [fg.r, fg.g, fg.b], alpha: +(fg.a * op).toFixed(3), blend: blendOf(el), need: large ? 3 : 4.5, rects, bleed,
        chars: text,
      });
      if (size < (MIN[role] ?? 28) - 0.05) add('fail', 'small-text', { role, size: +size.toFixed(1), text: text.slice(0, 50) });
      if (!bleed) {
        const out = rects.some((b) => b.x0 < safe.x0 - 1 || b.x1 > safe.x1 + 1 || b.y0 < safe.y0 - 1 || b.y1 > safe.y1 + 1);
        if (out) add('fail', 'outside-safe-area', { text: text.slice(0, 40), box: rects[0] });
      } else {
        const off = rects.some((b) => b.x1 < 0 || b.x0 > W || b.y1 < 0 || b.y0 > H);
        if (off) add('warn', 'bleed-offcanvas', { text: text.slice(0, 40) });
      }
      // Gradient-filled text.
      for (let n = el; n && n !== slide; n = n.parentElement) {
        const c = getComputedStyle(n);
        if (/gradient\(/.test(c.backgroundImage) && (c.webkitBackgroundClip === 'text' || c.backgroundClip === 'text')) { add('fail', 'ai-gradient-text', { text: text.slice(0, 40) }); break; }
      }
      if (EMOJI.test(text.replace(/[©®™↗↘→←↑↓✓✔×–—]/g, ''))) add('fail', 'ai-emoji', { text: text.slice(0, 40) });
    }

    // Overlap between exclusive blocks, overflow of fixed boxes, fit failures.
    const blocks = Array.from(slide.querySelectorAll('[data-block]')).map((el) => ({ el, r: el.getBoundingClientRect() }));
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      if (blocks[i].el.contains(blocks[j].el) || blocks[j].el.contains(blocks[i].el)) continue;
      const a = blocks[i].r, b = blocks[j].r;
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) add('fail', 'overlap', { a: blocks[i].el.dataset.block, b: blocks[j].el.dataset.block });
    }
    slide.querySelectorAll('[data-fit="box"]').forEach((el) => {
      const tol = (parseFloat(getComputedStyle(el).fontSize) || 16) * 0.3;
      if (el.scrollHeight > el.clientHeight + tol || el.scrollWidth > el.clientWidth + 2) add('fail', 'overflow', { text: el.textContent.trim().slice(0, 40) });
    });
    (window.FIT_ISSUES || []).forEach((f) => add('fail', 'fit-failed', f));

    // Compliance slot.
    const comp = slide.querySelector('.compliance');
    if (!comp) add('fail', 'compliance-missing');
    else {
      const r = comp.getBoundingClientRect();
      const cs = getComputedStyle(comp);
      if (!r.width || cs.visibility === 'hidden' || +cs.opacity < 0.5) add('fail', 'compliance-hidden');
      if (comp.classList.contains('has-ph')) add('todo', 'compliance-placeholder', { text: comp.textContent.trim().slice(0, 60) });
    }
    slide.querySelectorAll('[data-photo-placeholder]').forEach((el) => add('todo', 'photo-placeholder', { slot: el.dataset.photoPlaceholder }));

    // AI-look lint over every element.
    const allow = conf.allow || {};
    let centred = 0, textArea = 0;
    const shadowSig = {};
    slide.querySelectorAll('*').forEach((el) => {
      if (el.closest('svg.marks')) return;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const a = area(r);
      const allowed = (k) => allow[k] || el.closest(`[data-allow~="${k}"]`);
      if (/gradient\(/.test(cs.backgroundImage) && a > CANVAS * 0.04 && !allowed('gradient')) add('fail', 'ai-gradient', { el: el.className?.baseVal ?? el.className, share: +(a / CANVAS).toFixed(2) });
      const blur = cs.filter.match(/blur\(([\d.]+)px\)/);
      if (blur && +blur[1] >= 16 && a > CANVAS * 0.02 && !allowed('blur')) add('fail', 'ai-blur-blob', { px: +blur[1] });
      if (cs.backdropFilter && cs.backdropFilter !== 'none' && !allowed('glass')) add('fail', 'ai-glassmorphism');
      for (const prop of ['textShadow', 'boxShadow']) {
        const v = cs[prop];
        if (!v || v === 'none') continue;
        const m = [...v.matchAll(/(rgba?\([^)]+\))[^,]*?(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/g)];
        for (const s of m) {
          const c = parse(s[1]);
          const chroma = c ? Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) : 0;
          if (+s[4] >= 16 && chroma > 40 && !allowed('glow')) add('fail', 'ai-glow', { prop });
        }
        if (prop === 'boxShadow' && el.parentElement) {
          const sig = `${el.parentElement.dataset.qaid || (el.parentElement.dataset.qaid = Math.random().toString(36).slice(2))}|${cs.borderRadius}|${v}`;
          if (parseFloat(cs.borderRadius) >= 10) shadowSig[sig] = (shadowSig[sig] || 0) + 1;
        }
      }
      if (el.tagName === 'IMG') {
        const src = el.getAttribute('src') || '';
        const ok = (conf.allowedImg || []).some((p) => src.startsWith(p)) || src.startsWith('data:');
        if (!ok) add('fail', 'ai-stray-image', { src: src.slice(0, 80) });
      }
      if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !el.closest('[aria-hidden="true"]') && roleOf(el) !== 'fine') {
        const ta = a;
        textArea += ta;
        if (cs.textAlign === 'center') centred += ta;
      }
    });
    Object.values(shadowSig).forEach((n) => { if (n >= 3 && !allow.cards) add('warn', 'ai-card-kit', { count: n }); });
    if (textArea > 0 && centred / textArea > 0.8 && !allow.centred) add('warn', 'ai-centred-everything', { share: +(centred / textArea).toFixed(2) });

    if (BANKS.test(allText)) add('fail', 'ai-real-bank', { match: allText.match(BANKS)[0] });
    if (CHROME.test(allText)) add('fail', 'ai-banking-chrome', { match: allText.match(CHROME)[0] });
    if (conf.illustrative) {
      const mark = slide.querySelector('[data-illustrative]');
      const ok = mark && /illustrat|sample|specimen|exemple/i.test(mark.textContent) && mark.getBoundingClientRect().width > 0;
      if (!ok) add('fail', 'illustrative-mark-missing');
    }
    for (const re of BANNED) if (re.test(allText)) add('fail', 'copy-banned', { match: allText.match(re)[0] });
    if (/\s—\s|\w—\w/.test(allText)) add('warn', 'copy-em-dash');
    if (/\bit'?s not [^.]{1,40}, it'?s\b/i.test(allText)) add('warn', 'copy-not-x-but-y');
    if (words > (conf.maxWords || 40)) add('warn', 'too-many-words', { words });

    return { words, issues, runs, text: allText.trim() };
  };
})();
