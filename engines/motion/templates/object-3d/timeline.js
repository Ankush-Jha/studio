/* object-3d timeline (Direction C "3D Object").
 *
 * Story, told with objects:
 *   hook   night field, a giant accent sun behind a cream house and a cash stack drawn
 *          to scale ($10K bundles). Frame 1 is fully legible; the camera kicks in and
 *          the key number punches inside 0.3 s; a payment coin flies into the chimney
 *          and burns as a puff of smoke.
 *   rise   chimney close-up: the payment counts from the old to the new interest-only amount; chip shows the change.
 *   stack  PATTERN INTERRUPT (~40%): hard cut to top-down with the colours inverted.
 *          n coins rain into the chimney (PAID counts up); the stack does not move.
 *   fix    low hero angle on the stack: $850 coins land on it and the top bundle loses
 *          exactly (amount paid off / bundle value) of its length while BALANCE counts down month by month.
 *   loop   the camera flies back to the opening frame and the hook pops back in.
 *
 * Every 3D move is a GSAP tween on a plain object; MT.after() draws the WebGL frame
 * after each seek, so any frame renders identically in any order.
 */
window.TEMPLATE = {
  async build(MT, M, tl) {
    const T = window.THREE;
    const IR = MT.IR;
    const W = M.width, H = M.height;
    const safe = M.safe;
    const B = M.block;
    const beat = (id) => B.beats.find((b) => b.id === id);
    const RISE = beat('rise'), STACK = beat('stack'), FIX = beat('fix');
    const stage = document.getElementById('stage');
    const layer = document.getElementById('layer');
    const warnings = [...(M.prepWarnings || [])];

    /* ---------- layout constants (world units) ---------- */
    const HX = -0.92, SX = 0.98, DISC_R = 2.3, DISC_Y = 0.75;

    /* ---------- palette from client tokens ---------- */
    const css = getComputedStyle(document.documentElement);
    const tok = (n, d) => (css.getPropertyValue(n).trim() || d);
    const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
    const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    const mix = (a, b, t) => { const A = hex(a), Bv = hex(b); return toHex(A.map((v, i) => v + (Bv[i] - v) * t)); };
    const lum = (h) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = hex(h); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const ACC = tok('--color-accent', '#D9480F');
    const INK = tok('--color-ink', '#1E3A2F');
    const PAPER = tok('--color-paper', '#F3EADB');
    const BG = mix(INK, '#000000', 0.52);
    let HOT = ACC;
    for (let t = 0.1; t <= 0.9 && contrast(HOT, BG) < 4.5; t += 0.04) HOT = mix(ACC, '#FFFFFF', t);
    const NEAR_BLACK = '#090C0A';
    // Inverted (day) palette: text colour picked by contrast on the accent field, so a dark
    // accent (e.g. forest green) gets cream type and a light one (saffron) gets near-black.
    const dayFg = contrast(PAPER, ACC) >= contrast(NEAR_BLACK, ACC) ? PAPER : NEAR_BLACK;
    const dayHot = dayFg === PAPER ? mix(ACC, '#FFFFFF', 0.8) : PAPER;
    const DAY = { bg: ACC, fg: dayFg, fg2: dayFg, hot: dayHot, ph: dayFg };
    stage.style.setProperty('--o3d-on-hot', contrast(NEAR_BLACK, HOT) >= contrast(PAPER, HOT) ? NEAR_BLACK : PAPER);
    const NIGHT = { bg: BG, fg: PAPER, fg2: mix(PAPER, BG, 0.3), hot: HOT, ph: '#FF9A8A' };
    const setPalette = (p, at) => tl.set(stage, { '--o3d-bg': p.bg, '--o3d-fg': p.fg, '--o3d-fg2': p.fg2, '--o3d-hot': p.hot, '--o3d-ph': p.ph }, at);

    /* ---------- chrome (label row, fine line, compliance) ---------- */
    MT.chrome(stage, { series: M.series, tag: M.tag, fine: M.fine });

    /* ---------- WebGL ---------- */
    const canvas = document.createElement('canvas');
    canvas.className = 'gl';
    stage.insertBefore(canvas, layer);
    const vig = document.createElement('div');
    vig.className = 'vignette';
    stage.insertBefore(vig, layer);
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    const scene = new T.Scene();
    const cBG = new T.Color(BG), cACC = new T.Color(ACC);
    scene.background = cBG.clone();
    scene.fog = new T.Fog(cBG.clone(), 16, 34);
    const pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new T.RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.42;

    const camera = new T.PerspectiveCamera(30, W / H, 0.1, 120);

    // Lights: warm key with soft shadows, saffron rim from behind, low hemisphere fill.
    const key = new T.SpotLight('#FFF0DA', 420, 0, 0.42, 0.65, 2);
    key.position.set(4.6, 8.4, 7.2);
    key.target.position.set(0.1, 0.8, 0.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 5;
    key.shadow.camera.near = 4; key.shadow.camera.far = 24;
    scene.add(key, key.target);
    const rim = new T.DirectionalLight(mix(ACC, '#FFFFFF', 0.25), 2.4);
    rim.position.set(-4, 5, -7);
    scene.add(rim);
    const hemi = new T.HemisphereLight('#FFE6CC', BG, 0.4);
    scene.add(hemi);

    // Ground and the giant sun disc (a flat poster shape that sinks into the ground).
    const groundMat = new T.MeshStandardMaterial({ color: mix(BG, '#FFFFFF', 0.05), roughness: 0.96, metalness: 0 });
    const ground = new T.Mesh(new T.PlaneGeometry(80, 80), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const discMat = new T.MeshBasicMaterial({ color: cACC.clone(), toneMapped: false, fog: false });
    const disc = new T.Mesh(new T.CircleGeometry(DISC_R, 128), discMat);
    disc.position.set(0.05, DISC_Y, -3.6);
    scene.add(disc);
    const ringMat = new T.MeshBasicMaterial({ color: cACC.clone(), toneMapped: false, fog: false, transparent: true, opacity: 0.35 });
    const ring = new T.Mesh(new T.RingGeometry(DISC_R * 1.08, DISC_R * 1.1, 128), ringMat);
    ring.position.copy(disc.position);
    scene.add(ring);

    /* ---------- house ---------- */
    const house = new T.Group();
    house.position.set(HX, 0, 0);
    scene.add(house);
    const wallMat = new T.MeshStandardMaterial({ color: PAPER, roughness: 0.72 });
    const body = new T.Mesh(new T.RoundedBoxGeometry(1.8, 1.45, 1.7, 4, 0.05), wallMat);
    body.position.y = 0.725;
    body.castShadow = true; body.receiveShadow = true;
    house.add(body);
    const roofShape = new T.Shape();
    roofShape.moveTo(-1.07, 0); roofShape.lineTo(0, 0.95); roofShape.lineTo(1.07, 0); roofShape.lineTo(-1.07, 0);
    const roofGeo = new T.ExtrudeGeometry(roofShape, { depth: 1.92, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
    roofGeo.translate(0, 0, -0.96);
    const roofMat = new T.MeshStandardMaterial({ color: mix(ACC, '#000000', 0.38), roughness: 0.6 });
    const roof = new T.Mesh(roofGeo, roofMat);
    roof.position.y = 1.43;
    roof.castShadow = true;
    house.add(roof);
    const chim = new T.Mesh(new T.RoundedBoxGeometry(0.32, 0.8, 0.32, 2, 0.03), wallMat);
    chim.position.set(0.42, 2.02, -0.25);
    chim.castShadow = true;
    house.add(chim);
    const winMat = new T.MeshStandardMaterial({ color: '#2A1A08', emissive: new T.Color('#FFC46A'), emissiveIntensity: 2.4, roughness: 0.4 });
    const frameMat = new T.MeshStandardMaterial({ color: mix(INK, '#000000', 0.2), roughness: 0.6 });
    const addWindow = (x, y, z, ry = 0) => {
      const g = new T.Group();
      g.position.set(x, y, z); g.rotation.y = ry;
      const pane = new T.Mesh(new T.PlaneGeometry(0.44, 0.48), winMat);
      g.add(pane);
      const v = new T.Mesh(new T.BoxGeometry(0.03, 0.5, 0.02), frameMat); v.position.z = 0.01; g.add(v);
      const h = new T.Mesh(new T.BoxGeometry(0.46, 0.03, 0.02), frameMat); h.position.z = 0.01; g.add(h);
      house.add(g);
    };
    addWindow(-0.5, 0.92, 0.856);
    addWindow(0.5, 0.92, 0.856);
    addWindow(0.906, 0.92, 0.25, Math.PI / 2);
    addWindow(0.906, 0.92, -0.42, Math.PI / 2);
    const door = new T.Mesh(new T.PlaneGeometry(0.4, 0.74), new T.MeshStandardMaterial({ color: INK, roughness: 0.55 }));
    door.position.set(0, 0.37, 0.856);
    house.add(door);
    const glow = new T.PointLight('#FFB65A', 5, 5, 1.6);
    glow.position.set(0, 0.8, 1.5);
    house.add(glow);
    const CHIMNEY_TOP = new T.Vector3(HX + 0.42, 2.5, -0.25);

    /* ---------- cash stack: drawn to scale from the balance ----------
     * One bundle = $10,000 ($25,000 above $250K); the top bundle is partial when the
     * balance is not a whole number of bundles, so the stack is always proportional. */
    const bundleValue = STACK.balance <= 250000 ? 10000 : 25000;
    const NB = Math.max(1, Math.ceil(STACK.balance / bundleValue - 1e-9));
    const TOP0 = STACK.balance / bundleValue - (NB - 1);
    const BL = 1.05, BH = 0.118, BD = 0.48;
    const canvasTex = (w, h, draw) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t;
    };
    const billTex = canvasTex(512, 236, (g, w, h) => {
      g.fillStyle = '#CFE0C3'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(70,100,70,.16)'; g.lineWidth = 1.2;
      for (let i = 0; i < 30; i++) { g.beginPath(); for (let x = 0; x <= w; x += 8) { const y = h / 2 + Math.sin(x / 36 + i * 0.5) * 72 * Math.cos(i * 0.31); if (x) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
      g.strokeStyle = '#7E9A74'; g.lineWidth = 6; g.strokeRect(14, 14, w - 28, h - 28);
      g.lineWidth = 2; g.strokeRect(26, 26, w - 52, h - 52);
      g.fillStyle = '#E4EEDA'; g.beginPath(); g.ellipse(395, h / 2, 60, 72, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#7E9A74'; g.stroke();
      g.fillStyle = '#4E6B47'; g.font = '700 98px "Fraunces"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 395, h / 2 + 6);
      g.fillStyle = PAPER; g.fillRect(196, 0, 80, h); g.fillStyle = ACC; g.fillRect(205, 0, 7, h); g.fillRect(260, 0, 7, h);
    });
    const edgeTex = (band) => canvasTex(512, 32, (g, w, h) => {
      for (let y = 0; y < h; y += 2) { g.fillStyle = y % 4 ? '#E6EEDC' : '#B9CDAE'; g.fillRect(0, y, w, 2); }
      if (band) { g.fillStyle = PAPER; g.fillRect(196, 0, 80, h); g.fillStyle = ACC; g.fillRect(205, 0, 7, h); g.fillRect(260, 0, 7, h); }
    });
    const longEdge = new T.MeshStandardMaterial({ map: edgeTex(true), roughness: 0.85 });
    const shortEdge = new T.MeshStandardMaterial({ map: edgeTex(false), roughness: 0.85 });
    const face = new T.MeshStandardMaterial({ map: billTex, roughness: 0.78 });
    const bundleMats = [shortEdge, shortEdge, face, face, longEdge, longEdge];
    const bundleGeo = new T.RoundedBoxGeometry(BL, BH, BD, 2, 0.015);
    const STACK_POS = new T.Vector3(SX, 0, 0.55);
    const rs = MT.rng('stack');
    const bundles = [];
    for (let i = 0; i < NB; i++) {
      const m = new T.Mesh(bundleGeo, bundleMats);
      const bx = STACK_POS.x + (rs() - 0.5) * 0.05;
      m.position.set(bx, BH / 2 + i * (BH + 0.004), STACK_POS.z + (rs() - 0.5) * 0.04);
      m.rotation.y = (rs() - 0.5) * 0.14;
      m.castShadow = true; m.receiveShadow = true;
      m.userData.bx = bx;
      scene.add(m);
      bundles.push(m);
    }
    const TOP = bundles[NB - 1];
    const STACK_TOP = new T.Vector3(STACK_POS.x, TOP.position.y + BH / 2 + 0.04, STACK_POS.z);

    /* ---------- coins + smoke puffs ---------- */
    const coinGeo = new T.CylinderGeometry(0.2, 0.2, 0.045, 48);
    const coinMat = new T.MeshStandardMaterial({ color: mix(ACC, '#FFD27A', 0.55), metalness: 0.85, roughness: 0.26, emissive: new T.Color(mix(ACC, '#000000', 0.6)), emissiveIntensity: 0.25 });
    const puffGeo = new T.IcosahedronGeometry(0.22, 2);
    const coins = [];
    const mkCoin = (from, to, arc, withPuff) => {
      const mesh = new T.Mesh(coinGeo, coinMat);
      mesh.castShadow = true; mesh.visible = false;
      scene.add(mesh);
      const st = { u: 0, s: 0 };
      let puff = null;
      if (withPuff) {
        const mat = new T.MeshStandardMaterial({ color: '#EDE6DA', roughness: 1, transparent: true, opacity: 0, depthWrite: false });
        const g = new T.Group();
        [[0, 0, 0, 1], [0.16, 0.08, 0.05, 0.75], [-0.14, 0.12, -0.04, 0.68]].forEach(([x, y, z, s]) => { const p = new T.Mesh(puffGeo, mat); p.position.set(x, y, z); p.scale.setScalar(s); g.add(p); });
        g.position.copy(to); g.visible = false;
        scene.add(g);
        puff = { g, mat, st: { p: 0 } };
      }
      const c = { mesh, st, from: from.clone(), to: to.clone(), arc, puff };
      coins.push(c);
      return c;
    };
    const fly = (c, at, dur = 0.58) => {
      tl.set(c.st, { s: 1 }, at);
      tl.fromTo(c.st, { u: 0 }, { u: 1, duration: dur, ease: 'sine.in', ...IR }, at);
      tl.fromTo(c.st, { s: 1 }, { s: 0, duration: 0.14, ease: 'power2.in', ...IR }, at + dur - 0.06);
      if (c.puff) tl.fromTo(c.puff.st, { p: 0 }, { p: 1, duration: 0.85, ease: 'power2.out', ...IR }, at + dur - 0.04);
      return at + dur;
    };
    const coinState = (c) => {
      const { u, s } = c.st;
      c.mesh.visible = u > 0.001 && s > 0.01;
      if (c.mesh.visible) {
        c.mesh.position.lerpVectors(c.from, c.to, u);
        c.mesh.position.y += Math.sin(Math.PI * u) * c.arc;
        c.mesh.rotation.set(Math.PI / 2 - 0.5 * u, u * Math.PI * 3, 0.3);
        c.mesh.scale.setScalar(Math.max(0.001, s));
      }
      if (c.puff) {
        const p = c.puff.st.p;
        c.puff.g.visible = p > 0.001 && p < 0.999;
        c.puff.g.scale.setScalar(0.3 + p * 1.05);
        c.puff.g.position.set(c.to.x + p * 0.25, c.to.y + 0.06 + p * 0.38, c.to.z);
        c.puff.mat.opacity = 0.8 * (1 - p) * Math.min(1, p * 8);
      }
    };
    const LAUNCH = new T.Vector3(0.55, 0.15, 5.2);
    const LAUNCH_FIX = new T.Vector3(2.9, -0.5, 4.8);

    /* ---------- camera ---------- */
    const POSES = {
      P0: { px: 0.85, py: 1.95, pz: 12.0, tx: -0.15, ty: 2.2, tz: 0, fov: 34, top: 0 },
      P0k: { px: 0.65, py: 1.95, pz: 10.5, tx: -0.15, ty: 2.12, tz: 0, fov: 34, top: 0 },
      P1: { px: -0.05, py: 2.55, pz: 8.4, tx: -0.85, ty: 2.38, tz: 0, fov: 34, top: 0 },
      P1b: { px: -1.35, py: 2.5, pz: 8.2, tx: -0.9, ty: 2.35, tz: 0, fov: 34, top: 0 },
      P3: { px: -0.1, py: 11.2, pz: 6.6, tx: -0.22, ty: 0, tz: -2.05, fov: 34, top: 0 },
      P3b: { px: -0.05, py: 10.2, pz: 6.0, tx: -0.2, ty: 0, tz: -1.97, fov: 34, top: 0 },
      P4: { px: 2.9, py: 0.75, pz: 5.6, tx: 0.75, ty: 2.12, tz: 0.4, fov: 34, top: 0 },
      P4b: { px: 2.55, py: 0.8, pz: 5.0, tx: 0.78, ty: 2.12, tz: 0.4, fov: 34, top: 0 },
    };
    const C = { ...POSES.P0 };
    const cut = (p, at) => tl.set(C, { ...POSES[p] }, at);
    const move = (a, b, at, dur, ease) => tl.fromTo(C, { ...POSES[a] }, { ...POSES[b], duration: dur, ease, ...IR }, at);

    /* ---------- scene state applied after every seek ---------- */
    const F = { flip: 0, disc: 1, shake: 0, top: TOP0 };
    const cDay = { bg: new T.Color(ACC), ground: new T.Color(ACC), disc: new T.Color(BG), roof: new T.Color(mix(INK, '#000000', 0.15)) };
    const cNight = { bg: new T.Color(BG), ground: new T.Color(mix(BG, '#FFFFFF', 0.05)), disc: new T.Color(ACC), roof: new T.Color(mix(INK, '#000000', 0.1)) };
    const fogNight = { near: 16, far: 34 }, fogDay = { near: 60, far: 120 };
    MT.after(() => {
      const day = F.flip > 0.5;
      const P = day ? cDay : cNight;
      scene.background.copy(P.bg);
      scene.fog.color.copy(P.bg);
      scene.fog.near = day ? fogDay.near : fogNight.near;
      scene.fog.far = day ? fogDay.far : fogNight.far;
      groundMat.color.copy(P.ground);
      roofMat.color.copy(P.roof);
      key.intensity = day ? 520 : 420;
      discMat.color.copy(P.disc);
      disc.visible = ring.visible = !day;
      ringMat.color.copy(P.disc);
      disc.scale.setScalar(F.disc);
      ring.scale.setScalar(F.disc * (1 + (F.disc - 1) * 2.2));
      // The stack refuses to move: a tight shake, then still.
      const sh = F.shake;
      bundles.forEach((b, i) => { b.position.x = b.userData.bx + Math.sin(i * 1.7 + sh * 40) * 0.012 * Math.sin(Math.PI * sh); });
      TOP.scale.x = F.top;
      TOP.position.x = TOP.userData.bx - (1 - F.top) * BL * 0.5;
      coins.forEach(coinState);
      camera.position.set(C.px, C.py, C.pz);
      if (C.top > 0.5) camera.up.set(0, 0, -1); else camera.up.set(0, 1, 0);
      camera.lookAt(C.tx, C.ty, C.tz);
      if (camera.fov !== C.fov) { camera.fov = C.fov; }
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    });

    // Read-only debug handle for composition checks (projected screen positions).
    window.__o3d = {
      project(x, y, z) { const v = new T.Vector3(x, y, z).project(camera); return [Math.round((v.x + 1) / 2 * W), Math.round((1 - v.y) / 2 * H)]; },
      points: () => ({ houseBase: [HX, 0, 0.85], roofApex: [HX, 2.38, 0], chimney: [CHIMNEY_TOP.x, CHIMNEY_TOP.y, CHIMNEY_TOP.z], stackTop: [SX, STACK_TOP.y, 0.55], stackBase: [SX, 0, 0.8], discTop: [0.05, DISC_Y + DISC_R, -3.6], houseLeft: [HX - 0.9, 1, 0.85], stackRight: [SX + 0.53, 1, 0.8] }),
    };

    /* ---------- captions + readouts (live HTML type) ---------- */
    const X0 = safe.x0 + 26, CW = safe.x1 - safe.x0 - 46;
    // The fine print + compliance sit as a slim strip under the label row; captions start below it.
    const CTOP = Math.round(document.querySelector('.foot').getBoundingClientRect().bottom + 22);
    // Local caption builder: one baseline-aligned row per visual line, greedy wrapping,
    // shrink-to-fit. (MT.rich groups words by offsetTop, which splits a line when a big
    // key number sits next to small words, so this direction lays out its own rows.)
    // Returns an object MT.popWords / hidePop / unpopWords accept ({ words: [.w > .wi] }).
    const caption = (src, size = 86, emScale = 1.8) => {
      const box = MT.el('div', 'cap', layer);
      box.style.left = X0 + 'px'; box.style.top = CTOP + 'px'; box.style.width = CW + 'px';
      box.style.setProperty('--em-scale', emScale + 'em');
      box.dataset.role = 'display';
      const glued = String(src).replace(/==([^=]+)==([.,:;!?]+)/g, '==$1$2==');
      const segs = glued.split('|').map((seg) => {
        const out = [];
        seg.split(/(==[^=]+==)/).forEach((part) => {
          if (!part) return;
          const hot = /^==.*==$/.test(part);
          const text = hot ? part.slice(2, -2) : part;
          text.split(/\s+/).filter(Boolean).forEach((t) => out.push({ t: MT.typo(t), hot }));
        });
        return out;
      });
      const build = (fs) => {
        box.innerHTML = '';
        box.style.fontSize = fs + 'px';
        const words = [];
        segs.forEach((seg) => {
          let row = MT.el('div', 'cl', box);
          let used = 0;
          seg.forEach((tok) => {
            const w = MT.el('span', 'w' + (tok.hot ? ' em' : ''), row);
            MT.el('span', 'wi', w, MT.esc(tok.t));
            const space = used ? w.getBoundingClientRect().left - row.getBoundingClientRect().left - used : 0;
            const right = w.getBoundingClientRect().right - row.getBoundingClientRect().left;
            if (used && right > CW + 0.5) {
              row.removeChild(w);
              row = MT.el('div', 'cl', box);
              row.appendChild(w);
            } else if (used) row.insertBefore(document.createTextNode(' '), w);
            used = w.getBoundingClientRect().right - row.getBoundingClientRect().left;
            void space;
            words.push(w);
          });
        });
        return words;
      };
      let fs = size, words = build(fs);
      const fits = () => words.every((w) => w.getBoundingClientRect().right - box.getBoundingClientRect().left <= CW + 0.5) && box.getBoundingClientRect().height <= 470;
      while (!fits() && fs > 50) { fs *= 0.96; words = build(fs); }
      if (!fits()) warnings.push(`caption does not fit: ${MT.plain(src)}`);
      const ems = words.filter((w) => w.classList.contains('em'));
      ems.forEach((w) => w.classList.replace('em', 'hot'));
      return {
        capEl: box, words, words_n: MT.wordCount(src),
        em: ems.map((w) => w.firstChild),
        bottom: Math.max(...words.map((w) => w.firstChild.getBoundingClientRect().bottom)) + 4,
      };
    };
    const pill = (label, top) => {
      const el = MT.el('div', 'ro', layer);
      el.style.left = X0 + 'px'; el.style.top = top + 'px';
      const k = MT.el('span', 'ro-k', el, MT.esc(label)); k.dataset.role = 'label';
      const v = MT.el('span', 'ro-v', el); v.dataset.role = 'display';
      return { el, v };
    };

    // Captions come from the story block; stack/fix fall back to lines built from values.
    const money0 = (n) => '$' + Math.round(n).toLocaleString('en-CA');
    const stackCap = STACK.caption || `${STACK.n} payments.|Balance: ==${money0(STACK.balance)}==.`;
    const fixCap = FIX.caption || `${FIX.label || 'Pay'} ==${money0(FIX.pay)}==:|==${money0(FIX.off)}== off in a year.`;
    const capHook = caption(B.hook.caption, 76, 2.15);
    const capRise = caption(RISE.caption, 84, 1.75);
    const capStack = caption(stackCap, 88, 1.7);
    const capFix = caption(fixCap, 80, 1.45);

    // rise: the key number in the caption is a live counter (from -> to), chip = change
    const riseNum = capRise.em[0];
    const riseCount = MT.counter(riseNum, { from: RISE.from, to: RISE.to });
    const chip = MT.el('div', 'chip', layer, MT.esc(MT.typo(RISE.delta)));
    chip.dataset.role = 'display';
    chip.style.left = X0 + 'px'; chip.style.top = capRise.bottom + 22 + 'px';
    // stack: PAID counts one payment at a time
    const paid = pill('Paid', capStack.bottom + 26);
    const paidCount = MT.counter(paid.v, { from: 0, to: STACK.total });
    // Optional stamp from the story ("Didn't move"), slammed on when the last payment lands.
    let stamp = null;
    if (STACK.stamp) {
      stamp = MT.el('div', 'stamp', layer, MT.esc(MT.typo(STACK.stamp)));
      stamp.dataset.role = 'display';
      stamp.style.left = Math.round(paid.el.getBoundingClientRect().right + 26) + 'px';
      stamp.style.top = Math.round(paid.el.getBoundingClientRect().top - 4) + 'px';
    }
    // fix: BALANCE counts down month by month (calc series when available)
    const bal = pill('Balance', capFix.bottom + 26);
    const balCount = MT.counter(bal.v, { from: STACK.balance, to: FIX.balanceEnd });
    const series = (M.values.series && M.values.series.shown) || null;

    /* ---------- choreography ---------- */
    const keyframes = [];
    const holds = [];
    const punch = (els, at, k = 1.08) => {
      if (!els.length) return;
      tl.fromTo(els, { scale: 1, transformOrigin: '50% 85%' }, { scale: k, duration: 0.16, ease: 'power2.out', ...IR }, at);
      tl.fromTo(els, { scale: k }, { scale: 1, duration: 0.5, ease: 'power3.out', ...IR }, at + 0.16);
    };
    const hidePill = (p, at) => tl.set(p.el, { opacity: 0, y: 24, scale: 0.9 }, at);
    const showPillAt = (p, at) => tl.fromTo(p.el, { opacity: 0, y: 24, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.8)', ...IR }, at);
    const outPill = (p, at) => tl.fromTo(p.el, { opacity: 1, y: 0, scale: 1 }, { opacity: 0, y: -20, scale: 0.94, duration: 0.25, ease: 'power2.in', ...IR }, at);

    // t = 0 states
    setPalette(NIGHT, 0);
    tl.set(F, { flip: 0, disc: 1, shake: 0, top: TOP0 }, 0);
    cut('P0', 0);
    MT.showPop(tl, capHook, 0);
    [capRise, capStack, capFix].forEach((R) => MT.hidePop(tl, R, 0));
    riseCount.set(tl, RISE.from, 0);
    tl.set(chip, { opacity: 0, y: 20, scale: 0.8 }, 0);
    hidePill(paid, 0); hidePill(bal, 0);
    if (stamp) tl.set(stamp, { opacity: 0, scale: 1.6, rotation: -7 }, 0);
    paidCount.set(tl, 0, 0); balCount.set(tl, STACK.balance, 0);
    coins.forEach((c) => { tl.set(c.st, { u: 0, s: 0 }, 0); if (c.puff) tl.set(c.puff.st, { p: 0 }, 0); });
    keyframes.push({ t: 0, name: 'frame 1 (hook)' });

    // HOOK 0 - 2.35: camera kick, number punch, sun pulse, a payment burns in the chimney
    // Starts one frame in: frames render at t + 1e-4, so a move starting at exactly 0
    // would already have nudged frame 1 and broken the byte-exact loop seam.
    move('P0', 'P0k', 1 / 30, 2.27, 'power3.out');
    punch(capHook.em, 0.06, 1.06);
    MT.cue(0.06, 'thud', 0.9);
    tl.fromTo(F, { disc: 1 }, { disc: 1.05, duration: 0.24, ease: 'power2.out', ...IR }, 0.04);
    tl.fromTo(F, { disc: 1.05 }, { disc: 1, duration: 0.7, ease: 'power3.out', ...IR }, 0.28);
    keyframes.push({ t: 0.3, name: '0.3 s (motion)' });
    const hookCoin = mkCoin(LAUNCH, CHIMNEY_TOP, 1.7, true);
    // coins are created after the t=0 states above; declare theirs now
    tl.set(hookCoin.st, { u: 0, s: 0 }, 0); tl.set(hookCoin.puff.st, { p: 0 }, 0);
    // A payment launches inside the first 0.3 s and burns; a second follows ~1.2 s later.
    MT.cue(0.12, 'swish', 0.5);
    const hc = fly(hookCoin, 0.12, 0.62);
    MT.cue(hc, 'pop', 0.55);
    const hookCoin2 = mkCoin(new T.Vector3(-1.25, 0.15, 5.4), CHIMNEY_TOP, 1.5, true);
    tl.set(hookCoin2.st, { u: 0, s: 0 }, 0); tl.set(hookCoin2.puff.st, { p: 0 }, 0);
    MT.cue(1.25, 'swish', 0.4);
    const hc2 = fly(hookCoin2, 1.25, 0.6);
    MT.cue(hc2, 'pop', 0.5);
    keyframes.push({ t: +(hc2 + 0.25).toFixed(2), name: 'hook: payments burn' });
    const hookOut = 2.35;
    holds.push({ name: 'hook', words: capHook.words_n, start: 0, end: hookOut });

    // RISE 2.35 - 5.9: house close-up, payment counts up, chip with the change
    MT.unpopWords(tl, capHook, hookOut);
    MT.cue(hookOut, 'whoosh', 0.8);
    move('P0k', 'P1', hookOut, 0.72, 'power3.inOut');
    move('P1', 'P1b', hookOut + 0.72, 6.05 - (hookOut + 0.72), 'sine.inOut');
    const riseIn = hookOut + 0.2;
    let riseSettle = MT.popWords(tl, capRise, riseIn, { per: 0.12 });
    const riseCoin = mkCoin(LAUNCH, CHIMNEY_TOP, 1.4, true);
    tl.set(riseCoin.st, { u: 0, s: 0 }, 0); tl.set(riseCoin.puff.st, { p: 0 }, 0);
    MT.cue(riseIn + 0.25, 'swish', 0.45);
    const rc = fly(riseCoin, riseIn + 0.25, 0.55);
    MT.cue(rc, 'pop', 0.5);
    const cStart = riseIn + 0.3;
    const cEnd = riseCount.run(tl, RISE.from, RISE.to, cStart, 0.7, 'power2.out');
    for (let k = 0; k < 6; k++) MT.cue(cStart + k * 0.12, 'tick', 0.32);
    punch([riseNum], cEnd, 1.1);
    tl.fromTo(chip, { opacity: 0, y: 20, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(2.4)', ...IR }, cEnd);
    MT.cue(cEnd, 'pop', 0.7);
    riseSettle = Math.max(riseSettle, cEnd + 0.35);
    keyframes.push({ t: +(riseSettle + 0.1).toFixed(2), name: 'rise: interest-only payment' });
    const riseOut = 6.0;
    holds.push({ name: 'rise', words: capRise.words_n + MT.wordCount(RISE.delta), start: riseSettle, end: riseOut - 0.3 });
    MT.unpopWords(tl, capRise, riseOut - 0.3, { dur: 0.2, stagger: 0.015 });
    tl.fromTo(chip, { opacity: 1, y: 0, scale: 1 }, { opacity: 0, y: -16, scale: 0.9, duration: 0.2, ease: 'power2.in', ...IR }, riseOut - 0.3);

    // STACK 5.95: PATTERN INTERRUPT (hard cut to top-down, colours inverted)
    const interrupt = 6.05;
    cut('P3', interrupt);
    move('P3', 'P3b', interrupt, 3.0, 'sine.out');
    setPalette(DAY, interrupt);
    tl.set(F, { flip: 1 }, interrupt);
    MT.cue(interrupt, 'glitch', 0.8);
    MT.cue(interrupt + 0.03, 'stamp', 0.9);
    // One bold line lands WITH the cut (slam), so the interrupt frame is never empty.
    tl.fromTo(capStack.words.map((w) => w.firstChild), { scale: 1.35, opacity: 0, y: 0, transformOrigin: '50% 85%' }, { scale: 1, opacity: 1, duration: 0.2, ease: 'power3.out', stagger: 0.025, ...IR }, interrupt);
    let stackSettle = interrupt + 0.2 + 0.025 * (capStack.words.length - 1);
    keyframes.push({ t: +(stackSettle + 0.03).toFixed(2), name: 'pattern interrupt (bird\'s-eye, inverted)' });
    showPillAt(paid, interrupt + 0.3);
    const step = 0.15, flight = 0.55, c0 = interrupt + 0.05;
    for (let i = 0; i < STACK.n; i++) {
      const c = mkCoin(LAUNCH, CHIMNEY_TOP, 1.6, true);
      tl.set(c.st, { u: 0, s: 0 }, 0); tl.set(c.puff.st, { p: 0 }, 0);
      const arrive = fly(c, c0 + i * step, flight);
      // Snap to whole payments (every value on screen is a real running total) + pill punch.
      tl.set(paidCount.proxy, { v: Math.min(STACK.total, STACK.unit * (i + 1)) }, arrive);
      tl.fromTo(paid.el, { scale: 1 }, { scale: 1.06, duration: 0.06, ease: 'power2.out', ...IR }, arrive);
      tl.fromTo(paid.el, { scale: 1.06 }, { scale: 1, duration: 0.12, ease: 'power2.out', ...IR }, arrive + 0.06);
      MT.cue(arrive, 'tick', 0.5);
    }
    MT.cue(c0, 'swish', 0.4);
    const lastArrive = c0 + (STACK.n - 1) * step + flight;
    // Paid reaches the computed total exactly (unit x n may differ by cents on other inputs).
    tl.set(paidCount.proxy, { v: STACK.total }, lastArrive + 0.13);
    tl.fromTo(F, { shake: 0 }, { shake: 1, duration: 0.45, ease: 'none', ...IR }, lastArrive + 0.05);
    punch(capStack.em, lastArrive + 0.05, 1.1);
    MT.cue(lastArrive + 0.05, 'stamp', 0.8);
    if (stamp) {
      tl.fromTo(stamp, { opacity: 0, scale: 1.6, rotation: -7 }, { opacity: 1, scale: 1, rotation: -7, duration: 0.18, ease: 'power3.in', ...IR }, lastArrive + 0.05);
    }
    // (the slammed caption is fully readable at stackSettle; no artificial floor)
    keyframes.push({ t: +(lastArrive + 0.35).toFixed(2), name: 'stack: payments in, balance unmoved' });
    const stackOut = Math.max(lastArrive + 0.7, 9.0);
    holds.push({ name: 'stack', words: capStack.words_n + 2 + (STACK.stamp ? MT.wordCount(STACK.stamp) : 0), start: stackSettle, end: stackOut - 0.24 });
    MT.unpopWords(tl, capStack, stackOut - 0.24, { dur: 0.2, stagger: 0.015 });
    outPill(paid, stackOut - 0.24);
    if (stamp) tl.fromTo(stamp, { opacity: 1 }, { opacity: 0, duration: 0.2, ease: 'power2.in', ...IR }, stackOut - 0.24);

    // FIX: cut back to night, low hero angle on the stack, $850 coins shrink the top bundle
    const fixIn = stackOut + 0.08;
    cut('P4', fixIn);
    setPalette(NIGHT, fixIn);
    tl.set(F, { flip: 0 }, fixIn);
    MT.cue(fixIn, 'whoosh-short', 0.8);
    let fixSettle = MT.popWords(tl, capFix, fixIn + 0.1, { per: 0.11 });
    showPillAt(bal, fixIn + 0.3);
    const fixCoins = STACK.n;
    const fs0 = fixIn + 0.75, fstep = 0.16, fflight = 0.5;
    const shrinkTo = Math.max(0.04, TOP0 - FIX.off / bundleValue);
    for (let i = 0; i < fixCoins; i++) {
      const c = mkCoin(LAUNCH_FIX, STACK_TOP, 0.9, false);
      tl.set(c.st, { u: 0, s: 0 }, 0);
      const arrive = fly(c, fs0 + i * fstep, fflight);
      const fromV = series ? series[i] : STACK.balance - (FIX.off * i) / fixCoins;
      const toV = series ? series[i + 1] : STACK.balance - (FIX.off * (i + 1)) / fixCoins;
      void fromV;
      tl.set(balCount.proxy, { v: toV }, arrive);
      tl.fromTo(bal.el, { scale: 1 }, { scale: 1.06, duration: 0.06, ease: 'power2.out', ...IR }, arrive);
      tl.fromTo(bal.el, { scale: 1.06 }, { scale: 1, duration: 0.12, ease: 'power2.out', ...IR }, arrive + 0.06);
      const fromS = Math.max(0.04, TOP0 - ((STACK.balance - fromV) / bundleValue)), toS = Math.max(0.04, TOP0 - ((STACK.balance - toV) / bundleValue));
      tl.fromTo(F, { top: fromS }, { top: toS, duration: 0.12, ease: 'power2.out', ...IR }, arrive);
      MT.cue(arrive, 'click', 0.45);
    }
    const fixLast = fs0 + (fixCoins - 1) * fstep + fflight;
    tl.set(balCount.proxy, { v: FIX.balanceEnd }, fixLast + 0.13);
    tl.set(F, { top: shrinkTo }, fixLast + 0.13);
    MT.cue(fixLast + 0.1, 'cash', 1.0);
    punch(capFix.em, fixLast + 0.1, 1.1);
    move('P4', 'P4b', fixIn, fixLast + 0.9 - fixIn, 'sine.inOut');
    fixSettle = Math.max(fixSettle, fixIn + 0.8);
    keyframes.push({ t: +(fixLast + 0.45).toFixed(2), name: 'fix: balance finally moves' });
    const fixOut = Math.max(fixLast + 0.6, fixSettle + 2.55);
    holds.push({ name: 'fix', words: capFix.words_n + 2, start: fixSettle, end: fixOut + 0.5 });
    // Fix caption + balance stay up through the fly-back, then hand over to the hook.
    MT.unpopWords(tl, capFix, fixOut + 0.5, { dur: 0.2, stagger: 0.015 });
    outPill(bal, fixOut + 0.5);

    // LOOP: fly back to the opening frame; the top bundle rewinds during the move.
    MT.cue(fixOut + 0.05, 'whoosh', 0.85);
    move('P4b', 'P0', fixOut + 0.05, 0.95, 'power3.inOut');
    tl.fromTo(F, { top: shrinkTo }, { top: TOP0, duration: 0.4, ease: 'power2.inOut', ...IR }, fixOut + 0.25);
    MT.cue(fixOut + 0.25, 'rise', 0.4);
    keyframes.push({ t: +(fixOut + 0.4).toFixed(2), name: 'loop: fly back' });
    const hookBack = fixOut + 0.7;
    const hbEnd = MT.popWords(tl, capHook, hookBack, { per: 0.1 });
    MT.cue(hookBack, 'pop', 0.4);
    const duration = Math.max(hbEnd + 0.22, fixOut + 1.05);
    keyframes.push({ t: +(duration - 1 / M.fps).toFixed(3), name: 'last frame (= frame 1)' });
    return { duration, keyframes, holds, poster: 0, warnings };
  },
};
window.dispatchEvent(new Event('template-ready'));
