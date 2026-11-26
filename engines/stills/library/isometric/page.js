// Iso Blocks scene renderer (runs in the page). Builds the scene described by style.mjs in
// three.js: true isometric orthographic camera, matte clay materials (roughness 1, metalness 0),
// one key light with soft shadow map + hemisphere fill, shadows caught on a transparent plane so
// the CSS ground shows through. The model is fitted into the .io-scene box; labels marked
// data-place="auto" are positioned next to their projected anchors; every label gets a
// hairline leader drawn into svg.io-leaders. No text is ever drawn into the canvas.

const SQ = Math.SQRT1_2;
const place = (u, v) => ({ x: (u + v) * SQ, z: (v - u) * SQ });

window.STYLE_RUN = async (data) => {
  const THREE = await import(`${window.VENDOR}/three.module.min.js`);
  if (window.FIT_RUN) window.FIT_RUN();
  const slide = document.querySelector('.slide');
  const S = slide.getBoundingClientRect();
  const K = 2;
  const W = Math.round(S.width), H = Math.round(S.height);
  const pal = data.palette || {};
  const col = (name) => new THREE.Color(pal[name] || name || '#cccccc');

  const canvas = document.querySelector('.bg canvas.io-gl');
  canvas.width = W * K; canvas.height = H * K;
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W * K, H * K, false);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const group = new THREE.Group();
  scene.add(group);

  // Matte clay: one material per colour, flat-ish response.
  const mats = {};
  const mat = (name, k = 1) => {
    const key = `${name}:${k}`;
    if (!mats[key]) {
      const c = col(name);
      if (k !== 1) c.multiplyScalar(k);
      mats[key] = new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0 });
    }
    return mats[key];
  };

  function rbox(w, h, d, r = 0.05) {
    r = Math.min(r, w / 4, h / 4, d / 4);
    const iw = w - 2 * r, id = d - 2 * r, rc = Math.min(r * 0.8, iw / 3, id / 3);
    const s = new THREE.Shape();
    const x0 = -iw / 2, y0 = -id / 2;
    s.moveTo(x0 + rc, y0);
    s.lineTo(x0 + iw - rc, y0); s.absarc(x0 + iw - rc, y0 + rc, rc, -Math.PI / 2, 0, false);
    s.lineTo(x0 + iw, y0 + id - rc); s.absarc(x0 + iw - rc, y0 + id - rc, rc, 0, Math.PI / 2, false);
    s.lineTo(x0 + rc, y0 + id); s.absarc(x0 + rc, y0 + id - rc, rc, Math.PI / 2, Math.PI, false);
    s.lineTo(x0, y0 + rc); s.absarc(x0 + rc, y0 + rc, rc, Math.PI, Math.PI * 1.5, false);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, h - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, r, 0);
    return g;
  }
  const mesh = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; return o; };

  const anchors = {};
  function addAnchor(id, obj, at = 'top') {
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj);
    const c = b.getCenter(new THREE.Vector3());
    anchors[id] = at === 'top' ? new THREE.Vector3(c.x, b.max.y, c.z) : c;
  }

  const builders = {
    box(o) { return mesh(rbox(o.w, o.h, o.d, Math.min(0.07, o.h / 3)), mat(o.color)); },
    plinth(o) { return mesh(rbox(o.w, o.h, o.d, 0.05), mat(o.color)); },
    house(o) {
      const s = o.s, g = new THREE.Group();
      const bw = s, bh = s * 0.72, bd = s * 0.92;
      g.add(mesh(rbox(bw, bh, bd, 0.04), mat(o.color)));
      // Gable roof, ridge along x: a triangular prism.
      const tri = new THREE.Shape();
      const rw = bd * 1.14, rh = s * 0.5;
      tri.moveTo(-rw / 2, 0); tri.lineTo(rw / 2, 0); tri.lineTo(0, rh); tri.lineTo(-rw / 2, 0);
      const roof = new THREE.ExtrudeGeometry(tri, { depth: bw * 1.1, bevelEnabled: false });
      roof.rotateY(Math.PI / 2);
      roof.translate(-bw * 0.55, bh, 0);
      g.add(mesh(roof, mat(o.roof || 'stone-2')));
      // Door and window on the +x (front) face.
      const door = mesh(new THREE.BoxGeometry(0.03, bh * 0.52, bd * 0.2), mat('slate'));
      door.position.set(bw / 2 + 0.012, bh * 0.26, bd * 0.16);
      g.add(door);
      const win = mesh(new THREE.BoxGeometry(0.03, bh * 0.22, bd * 0.2), mat('slate'));
      win.position.set(bw / 2 + 0.012, bh * 0.56, -bd * 0.22);
      g.add(win);
      return g;
    },
    envelope(o) {
      const s = o.s, g = new THREE.Group();
      const card = mesh(rbox(s, s * 0.64, 0.07, 0.02), mat(o.color));
      g.add(card);
      // Flap: two thin slate strips meeting in a V on the +z face.
      const fl = s * 0.56;
      for (const sgn of [-1, 1]) {
        const strip = mesh(new THREE.BoxGeometry(fl, 0.022, 0.012), mat('slate'));
        strip.position.set(sgn * s * 0.24, s * 0.47, 0.04);
        strip.rotation.z = sgn * 0.52;
        g.add(strip);
      }
      const seal = mesh(new THREE.CylinderGeometry(s * 0.09, s * 0.09, 0.03, 32), mat(o.seal || 'accent'));
      seal.rotation.x = Math.PI / 2;
      seal.position.set(0, s * 0.33, 0.05);
      g.add(seal);
      g.rotation.order = 'YXZ';
      g.rotation.set(-0.16, Math.PI / 4, 0);
      return g;
    },
    coins(o) {
      const g = new THREE.Group();
      const ch = 0.15, r = o.r || 0.55;
      for (let i = 0; i < o.n; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, ch, 48), [mat(o.color, 0.82), mat(o.color), mat(o.color)]);
        c.castShadow = true; c.receiveShadow = true;
        c.position.y = ch / 2 + i * (ch + 0.01);
        c.position.x = Math.sin(i * 1.7) * 0.015;
        g.add(c);
      }
      return g;
    },
    bookmark(o) {
      const s = o.s, w = s * 0.42, h = s;
      const sh = new THREE.Shape();
      sh.moveTo(-w / 2, 0); sh.lineTo(0, h * 0.18); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h); sh.lineTo(-w / 2, h); sh.lineTo(-w / 2, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
      g.translate(0, 0.02, -0.05);
      const m = mesh(g, mat(o.color));
      m.rotation.y = Math.PI / 4;
      return m;
    },
    bubble(o) {
      const s = o.s, g = new THREE.Group();
      const body = mesh(rbox(s, s * 0.62, s * 0.2, 0.12), mat(o.color));
      body.position.y = s * 0.22;
      g.add(body);
      const tail = new THREE.Shape();
      tail.moveTo(0, 0); tail.lineTo(s * 0.26, 0); tail.lineTo(0, -s * 0.24); tail.lineTo(0, 0);
      const tg = new THREE.ExtrudeGeometry(tail, { depth: s * 0.14, bevelEnabled: false });
      tg.translate(-s * 0.28, s * 0.24, -s * 0.07);
      g.add(mesh(tg, mat(o.color)));
      g.rotation.y = Math.PI / 4;
      return g;
    },
    // Paper plane (Instagram's own send glyph, folded): two wings with dihedral and a keel,
    // each face its own flat shade so the folds read.
    plane(o) {
      const s = o.s;
      const P = { nose: [1.1, 0, 0], tail: [-0.7, 0, 0], tipL: [-0.75, 0.2, 0.62], tipR: [-0.75, 0.2, -0.62], keel: [-0.7, -0.32, 0] };
      const g = new THREE.Group();
      const face = (a, b, c, name, k) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...P[a], ...P[b], ...P[c]].map((v) => v * s)), 3));
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col(name).multiplyScalar(k), roughness: 1, metalness: 0, side: THREE.DoubleSide }));
        m.castShadow = true;
        g.add(m);
      };
      face('nose', 'tipL', 'tail', o.color, 1);
      face('nose', 'tail', 'tipR', o.color, 0.86);
      face('nose', 'keel', 'tail', o.color, 0.62);
      // Fly toward screen upper-right (+u = world (1, 0, -1)), nose up, banked.
      g.rotation.order = 'YXZ';
      g.rotation.set(0.85, Math.PI / 4, 0.3);
      return g;
    },
    // Dashed flight path: short capsules along a quadratic curve given in (u, v, y).
    trail(o) {
      const g = new THREE.Group();
      const q = (a) => { const p = place(a[0], a[1]); return new THREE.Vector3(p.x, a[2], p.z); };
      const c = new THREE.QuadraticBezierCurve3(q(o.from), q(o.via), q(o.to));
      const n = 11;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 0.5) / n;
        const a = c.getPoint(t0), b = c.getPoint(t1);
        const len = a.distanceTo(b);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 10), mat('slate'));
        seg.position.copy(a.clone().add(b).multiplyScalar(0.5));
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        seg.castShadow = true;
        g.add(seg);
      }
      g.userData.absolute = true;
      return g;
    },
  };

  for (const o of data.scene.objects) {
    const b = builders[o.kind];
    if (!b) continue;
    const obj = b(o);
    if (!obj.userData.absolute) {
      const p = place(o.u || 0, o.v || 0);
      obj.position.set(p.x, o.y || 0, p.z);
    }
    group.add(obj);
    if (o.id) addAnchor(o.id, obj, o.anchorAt || 'top');
  }

  // Light: key from screen upper-left, shadows falling down-right; hemisphere fill.
  const hemi = new THREE.HemisphereLight(0xffffff, col('paper').getHex(), 1.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.35);
  const bbox = new THREE.Box3().setFromObject(group);
  const size = bbox.getSize(new THREE.Vector3()), ctr = bbox.getCenter(new THREE.Vector3());
  const R = Math.max(size.x, size.y, size.z) * 1.6 + 2;
  key.position.set(ctr.x - R * 0.55, ctr.y + R * 1.1, ctr.z + R * 0.35);
  key.target.position.copy(ctr);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.camera.left = -R; key.shadow.camera.right = R; key.shadow.camera.top = R; key.shadow.camera.bottom = -R;
  key.shadow.camera.near = 0.1; key.shadow.camera.far = R * 4;
  key.shadow.radius = 9; key.shadow.blurSamples = 20; key.shadow.bias = -0.0004;
  scene.add(key, key.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(R * 8, R * 8), new THREE.ShadowMaterial({ color: col('slate'), opacity: 0.2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.001;
  ground.receiveShadow = true;
  scene.add(ground);

  // True isometric camera, fitted so the model's projection fills the .io-scene box.
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200);
  cam.position.set(ctr.x + 30, ctr.y + 30, ctr.z + 30);
  cam.up.set(0, 1, 0);
  cam.lookAt(ctr);
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  group.traverse((m) => {
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 400))) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
  });
  const box = document.querySelector('[data-scene]');
  const br = box.getBoundingClientRect();
  const pad = +(getComputedStyle(box).getPropertyValue('--scene-pad') || 0.04);
  // Room above the model for auto-placed labels that sit in a band over it.
  const padTop = box.querySelector('.io-lab[data-place="auto"][data-side="top"]') ? (parseFloat(getComputedStyle(box).getPropertyValue('--scene-pad-top')) || 64) : 0;
  const rx = br.left - S.left + br.width * pad, ry = br.top - S.top + br.height * pad + padTop;
  const rw = br.width * (1 - 2 * pad), rh = br.height * (1 - 2 * pad) - padTop;
  const dx = maxX - minX, dy = maxY - minY;
  const sc = Math.min(rw / dx, rh / dy);
  const alignX = getComputedStyle(box).getPropertyValue('--scene-align-x').trim() || 'center';
  const alignY = getComputedStyle(box).getPropertyValue('--scene-align-y').trim() || 'end';
  const ox = rx + (alignX === 'start' ? 0 : alignX === 'end' ? rw - sc * dx : (rw - sc * dx) / 2);
  const oy = ry + (alignY === 'start' ? 0 : alignY === 'center' ? (rh - sc * dy) / 2 : rh - sc * dy);
  cam.left = minX - ox / sc; cam.right = cam.left + W / sc;
  cam.top = maxY + oy / sc; cam.bottom = cam.top - H / sc;
  cam.updateProjectionMatrix();

  renderer.render(scene, cam);
  const modelTop = oy;

  // Project anchors to slide px.
  const toPx = (p) => { const v = p.clone().project(cam); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }; };
  const svg = document.querySelector('svg.io-leaders');
  const NS = 'http://www.w3.org/2000/svg';
  const ink = getComputedStyle(slide).getPropertyValue('--color-ink').trim() || '#1D2630';
  const safe = (window.QA_CONF && window.QA_CONF.safe) || { x0: 64, y0: 56, x1: 1016, y1: 1294 };

  document.querySelectorAll('.io-lab[data-anchor]').forEach((el) => {
    const a = anchors[el.dataset.anchor];
    if (!a) return;
    if (getComputedStyle(el).getPropertyValue('--leader').trim() === 'none') return;
    const p = toPx(a);
    const side = el.dataset.side || 'top';
    // Auto labels sit next to their anchor, clamped inside the safe box.
    if (el.dataset.place === 'auto') {
      const host = el.offsetParent.getBoundingClientRect();
      const lw = el.offsetWidth, lh = el.offsetHeight, gap = +(el.dataset.gap || 64);
      let lx, ly;
      if (side === 'top') { lx = p.x - lw / 2; ly = el.dataset.band === 'anchor' ? p.y - gap - lh : Math.min(p.y - gap - lh, modelTop - 18 - lh); ly = Math.max(ly, br.top - S.top); }
      else if (side === 'left') { lx = p.x - gap - lw; ly = p.y - lh / 2 - gap * 0.4; }
      else { lx = p.x + gap; ly = p.y - lh / 2 - gap * 0.4; }
      lx = Math.max(safe.x0, Math.min(safe.x1 - lw, lx));
      ly = Math.max(safe.y0, Math.min(safe.y1 - lh, ly));
      el.style.left = `${lx - (host.left - S.left)}px`;
      el.style.top = `${ly - (host.top - S.top)}px`;
    }
    const r = el.getBoundingClientRect();
    const L = { x0: r.left - S.left, y0: r.top - S.top, x1: r.right - S.left, y1: r.bottom - S.top };
    let sx, sy;
    if (side === 'top') { sx = Math.max(L.x0 + 6, Math.min(L.x1 - 6, p.x)); sy = p.y < L.y0 ? L.y0 - 8 : L.y1 + 8; }
    else if (side === 'left') { sx = L.x1 + 10; sy = (L.y0 + L.y1) / 2; }
    else { sx = L.x0 - 10; sy = (L.y0 + L.y1) / 2; }
    if (el.dataset.side === 'right' && el.classList.contains('io-lab-item')) { sx = L.x1 + 10; }
    const line = document.createElementNS(NS, 'path');
    line.setAttribute('d', `M${sx.toFixed(1)},${sy.toFixed(1)} L${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    line.setAttribute('stroke', ink); line.setAttribute('stroke-width', '2'); line.setAttribute('fill', 'none');
    svg.appendChild(line);
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', p.x.toFixed(1)); dot.setAttribute('cy', p.y.toFixed(1)); dot.setAttribute('r', '6');
    dot.setAttribute('fill', getComputedStyle(slide).getPropertyValue('--color-paper').trim() || '#fff');
    dot.setAttribute('stroke', ink); dot.setAttribute('stroke-width', '2.5');
    svg.appendChild(dot);
  });

  window.ISO_ANCHORS = Object.fromEntries(Object.entries(anchors).map(([k, v]) => [k, toPx(v)]));
  document.documentElement.dataset.isoDone = '1';
};
