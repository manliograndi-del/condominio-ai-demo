/* R2 thread 16 - visore 3D navigabile (three.js r147 in lib/). Preliminare, da verificare e firmare.
   Scena: X = x edificio (est), Y = quota, Z = y edificio (sud). L'esterno arriva da modelli/edificio.glb (Blender, geo_r2);
   tramezzi, pavimenti, soffitti, arredo, pilastri e impianti sono costruiti qui dai dati di dati/modello.js.
   Soffitti: accesi quando si cammina in un alloggio, spenti nella vista dall'alto di un piano (richiesta di Manlio). */
(function () {
  "use strict";
  var M = window.MODELLO, T = window.THREE, box = document.getElementById('esp');
  if (!box) return;
  var $ = function (s) { return box.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(box.querySelectorAll(s)); };
  var say = function (t) { var e = $('.espload'); e.textContent = t || ''; e.hidden = !t; };
  var fail = function (t) { $('.espact').hidden = true; say(t); };
  if (!M || !T || !T.GLTFLoader) { fail('Il modello 3D non è disponibile in questo browser.'); return; }
  if (location.protocol === 'file:') { fail('I modelli 3D si caricano solo dal sito online, non dal file aperto in locale.'); return; }
  var cvs = $('canvas'), renderer;
  try { renderer = new T.WebGLRenderer({ canvas: cvs, antialias: true }); } catch (e) { fail('Questo browser non supporta la grafica 3D (WebGL).'); return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.62;
  var it = function (n, d) { return n.toLocaleString('it-IT', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  var S = M.sagoma, CX = (S[0] + S[2]) / 2, CZ = (S[1] + S[3]) / 2, FZ = M.piani.map(function (p) { return p[2]; }), HN = M.H;

  var SKY = new T.Color(0xbfd6e6), NIGHT = new T.Color(0x0c171e), scene = new T.Scene(); scene.background = SKY;
  scene.add(new T.HemisphereLight(0xffffff, 0x8a8478, 0.3));
  var sun = new T.DirectionalLight(0xfff1dc, 1.25); sun.position.set(-30, 45, 40); scene.add(sun);
  var fill = new T.DirectionalLight(0xdde8ff, 0.3); fill.position.set(30, 20, -40); scene.add(fill);
  if (T.RoomEnvironment && T.PMREMGenerator) { try { var pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture; } catch (e) { } }
  var cam = new T.PerspectiveCamera(38, 1, 0.08, 600);
  var orb = new T.OrbitControls(cam, cvs); orb.maxPolarAngle = Math.PI / 2 - 0.03; orb.minDistance = 2; orb.maxDistance = 140;
  var dirty = true; orb.addEventListener('change', function () { dirty = true; });
  var clip = new T.Plane(new T.Vector3(0, -1, 0), 0);
  function view(i) { /* -1 tutto, 0..3 piani, 4 copertura */
    if (i < 0) { orb.target.set(CX, 6, CZ + 1); cam.position.set(CX - 30, 22, CZ + 40); }
    else if (i === 4) { orb.target.set(CX, 14, CZ); cam.position.set(CX - 6, 46, CZ + 24); }
    else { orb.target.set(CX, FZ[i] + 1, CZ); cam.position.set(CX - 3, FZ[i] + 27, CZ + 19); }
    orb.update(); dirty = true;
  }

  /* ---- materiali ---- */
  var solid = []; function keep(m) { if (solid.indexOf(m) < 0) { m.userData.o = { t: m.transparent, o: m.opacity, d: m.depthWrite }; solid.push(m); } return m; }
  function mat(c, r) { return keep(new T.MeshStandardMaterial({ color: c, roughness: r == null ? 0.85 : r, metalness: 0, envMapIntensity: 0.45 })); }
  var MW = mat(0xe9e4d8), MCUT = mat(0x4a4f55), MCEIL = mat(0xfafafa), MPIL = mat(0x9aa0a6, 0.7),
    MFL = { giorno: mat(0xc9a97a, 0.6), notte: mat(0xd2b48a, 0.6), bagno: mat(0xb9c4c8, 0.4), serv: mat(0xcfc8bb, 0.6), comune: mat(0xa9a59c, 0.5) };
  var FC = { letto: 0x7d8fa6, comodino: 0x9a7b56, armadio: 0xb89668, scrivania: 0x9a7b56, tavolo: 0x8a6a48, tavolino: 0x8a6a48, divano: 0x5f7f78, 'mobile-tv': 0x6b5a48, libreria: 0xb89668, cassettiera: 0x9a7b56, credenza: 0x9a7b56, mensole: 0xb89668,
    wc: 0xffffff, bidet: 0xffffff, lavabo: 0xffffff, doccia: 0xdfe8ea, 'box doccia': 0xbfe0ea, controparete: 0xe6e2d8, scaldasalviette: 0xdddddd, 'lavatrice+asciugatrice': 0xe8e8e8, collettore: 0xd05050, QE: 0xe8a13a, appendiabiti: 0x6b5a48 };
  var fm = {}; function fmat(t) { var k = /^cucina/.test(t) ? 'cucina' : t; if (!fm[k]) { var c = k === 'cucina' ? 0x3f4a52 : (FC[k] || 0xa08a6a); fm[k] = mat(c, 0.6); if (k === 'box doccia') { fm[k].transparent = true; fm[k].opacity = 0.35; fm[k].userData.o = { t: true, o: 0.35, d: false }; fm[k].depthWrite = false; } } return fm[k]; }
  var U = T.BufferGeometryUtils;
  function bx(x0, y0, x1, y1, z0, z1) { var g = new T.BoxGeometry(x1 - x0, z1 - z0, y1 - y0); g.translate((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2); return g; }
  function mesh(gs, m) { var g = gs.length > 1 ? U.mergeBufferGeometries(gs, false) : gs[0]; return new T.Mesh(g, m); }

  /* ---- interni costruiti dai dati ---- */
  var bld = new T.Group(), inn = new T.Group(), ceilG = new T.Group(), arr = new T.Group(), imp = new T.Group(), str = new T.Group(); scene.add(bld, inn, ceilG, arr, imp, str); str.visible = false;
  M.piani.forEach(function (pp, fi) {
    var tp = M.tipi[pp[1]], z = pp[2], W = [], Lw = [], F = {}, Cg = [], P = [];
    tp.walls.forEach(function (w) { (w[4] > 0 ? Lw : W).push(bx(w[0], w[1], w[2], w[3], z + w[4], z + HN)); });
    tp.rooms.forEach(function (r) { r.r.forEach(function (q) { (F[r.tipo] = F[r.tipo] || []).push(bx(q[0], q[1], q[2], q[3], z - 0.06, z)); if (r.k !== 'scala') Cg.push(bx(q[0], q[1], q[2], q[3], z + HN, z + HN + 0.05)); }); });
    tp.walls.forEach(function (w) { Cg.push(bx(w[0], w[1], w[2], w[3], z + HN, z + HN + 0.05)); });
    M.pilastri.forEach(function (p) { if (p[5] <= z + 0.1 && p[6] >= z + HN - 0.1 && p[2] > 0.5 && p[4] < tp.ysud - 0.5 && p[1] > 0.5 && p[3] < S[2] - 0.5) P.push(bx(p[1] - 0.005, p[2] - 0.005, p[3] + 0.005, p[4] + 0.005, z, z + HN)); });
    var add = function (gs, m, G) { if (!gs.length) return; var o = mesh(gs, m); o.userData.f = fi; G.add(o); };
    add(W, MW, inn); add(Lw, MW, inn); add(P, MPIL, inn); Object.keys(F).forEach(function (k) { add(F[k], MFL[k] || MFL.serv, inn); }); add(Cg, MCEIL, ceilG);
    var byT = {}; (M.furn[pp[0]] || []).forEach(function (f) { var k = /^cucina/.test(f[6]) ? 'cucina' : f[6]; (byT[k] = byT[k] || []).push(bx(f[0], f[1], f[3], f[4], z + f[2], z + Math.max(f[5], f[2] + 0.02))); });
    Object.keys(byT).forEach(function (k) { add(byT[k], fmat(k), arr); });
  });
  M.impianti.forEach(function (s, si) {
    var v = []; s.linee.forEach(function (l) { for (var i = 1; i + 5 < l.length; i += 3) v.push(l[i], l[i + 2], l[i + 1], l[i + 3], l[i + 5], l[i + 4]); });
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    var o = new T.LineSegments(g, new T.LineBasicMaterial({ color: s.col, toneMapped: false })); o.userData.i = si; o.visible = false; imp.add(o);
  });

  /* ---- stato ---- */
  var sel = -1, ceil = false, xray = false, walk = null, picked = null, furn = true, impOn = {}, strOn = false, strLoaded = false;
  function apply() {
    var cut = !walk && sel >= 0 && sel < 4;
    clip.constant = cut ? FZ[sel] + 2.25 : 1e4; renderer.clippingPlanes = cut ? [clip] : [];
    inn.children.forEach(function (m) { m.visible = !cut || m.userData.f <= sel; });
    ceilG.children.forEach(function (m) { m.visible = walk ? ceil : (!cut || m.userData.f < sel); });
    arr.children.forEach(function (m) { m.visible = furn && (!cut || m.userData.f <= sel); });
    imp.children.forEach(function (m) { m.visible = !!impOn[m.userData.i]; });
    str.visible = strOn;
    solid.forEach(function (m) { var o = m.userData.o; m.transparent = xray || o.t; m.opacity = xray ? Math.min(o.o, 0.07) : o.o; m.depthWrite = xray ? false : o.d; m.needsUpdate = true; });
    scene.background = xray ? NIGHT : SKY; pickG.visible = !walk; dirty = true;
  }

  /* ---- stanze: superfici invisibili per il clic ---- */
  var pickG = new T.Group(), rooms = [], hi = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: 0xf0a030, transparent: true, opacity: 0.55, depthWrite: false })); hi.rotation.x = -Math.PI / 2; hi.visible = false; scene.add(pickG, hi);
  var inv = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  M.piani.forEach(function (pp, fi) { M.tipi[pp[1]].rooms.forEach(function (r) { r.r.forEach(function (q, qi) { var m = new T.Mesh(new T.PlaneGeometry(q[2] - q[0], q[3] - q[1]), inv); m.rotation.x = -Math.PI / 2; m.position.set((q[0] + q[2]) / 2, pp[2] + 0.03, (q[1] + q[3]) / 2); m.userData = { r: r, fi: fi, q: q }; pickG.add(m); rooms.push(m); }); }); });
  var ray = new T.Raycaster(), info = $('.espinfo');
  var taglio = function (u) { return u === 'bil_M' ? 'bilocale' : (/^att/.test(u) ? 'attico' : 'trilocale'); };
  function pick(m) {
    picked = m; hi.visible = !!m; dirty = true; if (!m) { info.hidden = true; return; }
    var r = m.userData.r, fi = m.userData.fi, pn = M.piani[fi][0], q = m.userData.q;
    hi.scale.set(q[2] - q[0], q[3] - q[1], 1); hi.position.copy(m.position); hi.position.y += 0.02;
    var seen = {}, ar = (M.furn[pn] || []).filter(function (f) { return f[7] === r.k && !/controparete|box doccia/.test(f[6]); }).map(function (f) { return f[6].replace(/^cucina .*/, 'cucina'); }).filter(function (n) { return seen[n] ? false : (seen[n] = 1); });
    var h = '<button class="x" aria-label="Chiudi">✕</button><small>' + (r.ala ? 'Alloggio ' + pn + '-' + r.ala + ' · ' + taglio(r.u) : 'Parti comuni · ' + pn) + '</small><h4>' + r.nome + '</h4>' +
      '<b>' + it(r.a, 2) + ' m²</b><span>' + it(q[2] - q[0], 2) + ' × ' + it(q[3] - q[1], 2) + ' m · altezza 2,70 m</span>';
    if (ar.length) h += '<span class="ar">' + ar.join(' · ') + '</span>';
    if (r.k !== 'scala') h += '<button class="chip sel go">Entra in questa stanza</button>';
    info.innerHTML = h; info.hidden = false;
    info.querySelector('.x').onclick = function () { pick(null); };
    var go = info.querySelector('.go'); if (go) go.onclick = function () { enter(fi, (q[0] + q[2]) / 2, (q[1] + q[3]) / 2); };
  }
  var down = null;
  cvs.addEventListener('pointerdown', function (e) { down = [e.clientX, e.clientY]; });
  cvs.addEventListener('pointerup', function (e) {
    if (!down || Math.abs(e.clientX - down[0]) + Math.abs(e.clientY - down[1]) > 6 || walk) { down = null; return; } down = null;
    if (sel < 0 || sel > 3) { hint('Scegli un piano per aprire l\'edificio e toccare le stanze.'); return; }
    var b = cvs.getBoundingClientRect(); ray.setFromCamera(new T.Vector2((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1), cam);
    var hit = ray.intersectObjects(rooms.filter(function (m) { return m.userData.fi === sel; }), false); pick(hit.length ? hit[0].object : null);
  });
  var ht; function hint(t) { var h = $('.esphint'); h.textContent = t; h.classList.add('on'); clearTimeout(ht); ht = setTimeout(function () { h.classList.remove('on'); }, 4000); }

  /* ---- camminare ---- */
  function inR(x, y, q) { return x > q[0] && x < q[2] && y > q[1] && y < q[3]; }
  function roomAt(x, y, fi) { var tp = M.tipi[M.piani[fi][1]], i, r; for (i = 0; i < tp.rooms.length; i++) { r = tp.rooms[i]; if (r.k !== 'scala' && r.r.some(function (q) { return inR(x, y, q); }) && !r.e.some(function (q) { return inR(x, y, q); })) return r; } return null; }
  function free(x, y, fi) { return M.tipi[M.piani[fi][1]].porte.some(function (q) { return inR(x, y, q); }) || !!roomAt(x, y, fi); }
  var can = function (x, y, fi) { var d = 0.17; return free(x - d, y, fi) && free(x + d, y, fi) && free(x, y - d, fi) && free(x, y + d, fi); };
  function place() { cam.position.set(walk.x, FZ[walk.fi] + 1.6, walk.y); cam.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ'); dirty = true;
    var r = roomAt(walk.x, walk.y, walk.fi); $('.espwhere').textContent = r ? r.nome + (r.ala ? ' · ' + M.piani[walk.fi][0] + '-' + r.ala : '') + ' · ' + it(r.a, 2) + ' m²' : ''; }
  var cb = $('.e-ceil'); function setCeil(v) { ceil = v; cb.setAttribute('aria-pressed', v); }
  function enter(fi, x, y, yaw) {
    pick(null); if (!can(x, y, fi)) { x = 3.2; y = 10.2; }
    walk = { fi: fi, x: x, y: y, yaw: yaw != null ? yaw : (y > 7 ? Math.PI : 0), pitch: -0.08 };
    orb.enabled = false; cam.fov = 74; cam.near = 0.05; cam.updateProjectionMatrix(); box.classList.add('walk'); sel = fi; setCeil(true); chipSel(); apply(); place();
    hint(window.matchMedia && matchMedia('(pointer:coarse)').matches ? 'Trascina per guardarti intorno. Usa le frecce per camminare.' : 'Trascina per guardarti intorno. Frecce o W A S D per camminare.');
  }
  function leave() { if (!walk) return; walk = null; orb.enabled = true; cam.fov = 38; cam.updateProjectionMatrix(); box.classList.remove('walk'); setCeil(false); view(sel); apply(); }
  $('.e-exit').onclick = leave;
  $$('.e-enter').forEach(function (b) { b.onclick = function () { var v = b.dataset.go.split(','); enter(+v[0], +v[1], +v[2], +v[3]); }; });
  var keys = {}, look = null;
  var KM = { ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', ArrowRight: 'r', KeyA: 'sl', KeyD: 'sr', KeyQ: 'l', KeyE: 'r' };
  window.addEventListener('keydown', function (e) { if (!walk || !KM[e.code]) return; var b = cvs.getBoundingClientRect(); if (b.bottom < 0 || b.top > innerHeight) return; keys[KM[e.code]] = 1; e.preventDefault(); });
  window.addEventListener('keyup', function (e) { if (KM[e.code]) keys[KM[e.code]] = 0; if (e.code === 'Escape') leave(); });
  $$('.esppad button').forEach(function (b) { var k = b.dataset.k, on = function (e) { e.preventDefault(); keys[k] = 1; }, off = function () { keys[k] = 0; };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off); });
  cvs.addEventListener('pointerdown', function (e) { if (walk) { look = [e.clientX, e.clientY, walk.yaw, walk.pitch]; try { cvs.setPointerCapture(e.pointerId); } catch (_) { } } });
  cvs.addEventListener('pointermove', function (e) { if (!walk || !look) return; walk.yaw = look[2] + (e.clientX - look[0]) * 0.005; walk.pitch = Math.max(-1.2, Math.min(1.2, look[3] + (e.clientY - look[1]) * 0.004)); place(); });
  ['pointerup', 'pointercancel'].forEach(function (n) { cvs.addEventListener(n, function () { look = null; }); });
  function step(dt) {
    if (!walk) return; var mv = (keys.f ? 1 : 0) - (keys.b ? 1 : 0), st = (keys.sr ? 1 : 0) - (keys.sl ? 1 : 0), tu = (keys.l ? 1 : 0) - (keys.r ? 1 : 0);
    if (!mv && !st && !tu) return; walk.yaw += tu * dt * 1.7;
    var v = 2.0 * dt, dx = (-Math.sin(walk.yaw) * mv + Math.cos(walk.yaw) * st) * v, dy = (-Math.cos(walk.yaw) * mv - Math.sin(walk.yaw) * st) * v;
    if (can(walk.x + dx, walk.y, walk.fi)) walk.x += dx; if (can(walk.x, walk.y + dy, walk.fi)) walk.y += dy; place();
  }

  /* ---- comandi ---- */
  function chips(sl, items, cb) { var h = $(sl); items.forEach(function (x) { var b = document.createElement('button'); b.className = 'chip'; b.innerHTML = x[0]; b.onclick = function () { cb(x[1], b); }; if (x[2]) b.classList.add('sel'); if (x[3] != null) b.setAttribute('aria-pressed', x[3]); h.appendChild(b); }); }
  function chipSel() { $$('.e-piani .chip').forEach(function (x, i) { x.classList.toggle('sel', i === sel + 1); }); }
  chips('.e-piani', [['Tutto', -1, 1], ['Piano terra', 0], ['Primo', 1], ['Secondo', 2], ['Terzo', 3], ['Copertura', 4]], function (v) {
    if (walk) { if (v < 0 || v > 3) { leave(); } else { walk.fi = v; if (!can(walk.x, walk.y, walk.fi)) { walk.x = 3.2; walk.y = 10.2; } sel = v; chipSel(); place(); apply(); return; } }
    sel = v; chipSel(); pick(null); view(v); apply();
  });
  var anyX = function () { return strOn || Object.keys(impOn).some(function (k) { return impOn[k]; }); };
  function setX(v) { xray = v; xb.setAttribute('aria-pressed', v); }
  if (M.impianti.length) chips('.e-imp', M.impianti.map(function (s, i) { return ['<i style="background:' + s.col + '"></i>' + s.nome, i, 0, false]; }), function (i, b) { impOn[i] = !impOn[i]; b.setAttribute('aria-pressed', !!impOn[i]); setX(anyX()); apply(); });
  else $('.e-imp').hidden = true;
  var sb = $('.e-str'); if (sb) sb.onclick = function () {
    strOn = !strOn; sb.setAttribute('aria-pressed', strOn); setX(anyX());
    if (strOn && !strLoaded) { strLoaded = true; load('modelli/strutture.glb', 'il telaio').then(function (root) { root.traverse(function (o) { if (o.isMesh) o.material.side = T.DoubleSide; }); str.add(root); say(''); apply(); }, function () { say('Non riesco a caricare il telaio.'); }); }
    apply();
  };
  var xb = $('.e-x'); xb.onclick = function () { setX(!xray); apply(); };
  cb.onclick = function () { setCeil(!ceil); apply(); };
  var fb = $('.e-furn'); fb.onclick = function () { furn = !furn; fb.setAttribute('aria-pressed', furn); apply(); };
  $('.e-zi').onclick = function () { zoom(0.78); }; $('.e-zo').onclick = function () { zoom(1.28); };
  function zoom(f) { if (walk) return; var d = cam.position.clone().sub(orb.target).multiplyScalar(f); cam.position.copy(orb.target).add(d); orb.update(); }
  var fs = $('.e-fs'); if (box.requestFullscreen) fs.onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else box.requestFullscreen(); }; else fs.hidden = true;
  document.addEventListener('fullscreenchange', function () { setTimeout(size, 80); });

  /* ---- caricamento ---- */
  var loader = new T.GLTFLoader();
  function load(url, label) { return new Promise(function (ok, ko) { say('Carico ' + label + '…'); loader.load(url, function (g) { ok(g.scene); }, function (e) { if (e.total) say('Carico ' + label + '… ' + Math.round(e.loaded / e.total * 100) + '%'); }, ko); }); }
  function fuse(root) { /* fonde le mesh per materiale: da più di mille oggetti a poche decine */
    root.updateMatrixWorld(true); var bins = {}, out = [];
    root.traverse(function (o) { if (!o.isMesh) return; var g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      Object.keys(g.attributes).forEach(function (a) { if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); }); if (!g.attributes.normal) g.computeVertexNormals();
      (bins[o.material.uuid] = bins[o.material.uuid] || { m: o.material, g: [] }).g.push(g); });
    Object.keys(bins).forEach(function (id) { var b = bins[id]; out.push(mesh(b.g, b.m)); }); return out;
  }
  function size() { var b = cvs.getBoundingClientRect(); if (!b.width) return; renderer.setSize(b.width, b.height, false); cam.aspect = b.width / b.height; cam.updateProjectionMatrix(); dirty = true; }
  window.addEventListener('resize', size);
  var last = 0; function loop(t) { step(Math.min(0.05, (t - last) / 1000)); last = t; if (dirty) { dirty = false; renderer.render(scene, cam); } requestAnimationFrame(loop); }
  var started = false;
  function start() {
    if (started) return; started = true; $('.espact').hidden = true; box.classList.add('live'); size(); view(-1); apply(); requestAnimationFrame(loop);
    load('modelli/edificio.glb', 'l\'edificio').then(function (root) { fuse(root).forEach(function (m) { m.material.envMapIntensity = 0.45; keep(m.material); bld.add(m); }); say(''); apply(); }, function () { say('Non riesco a caricare il modello dell\'edificio.'); });
  }
  $('.espact').onclick = start;
  window.ESPLORA = { start: start, enter: enter, leave: leave, floor: function (i) { $$('.e-piani .chip')[i + 1].click(); }, imp: function (i) { $$('.e-imp .chip')[i].click(); }, str: function () { sb.click(); }, key: function (k, v) { keys[k] = v; },
    look: function (y, p) { if (walk) { walk.yaw = y; walk.pitch = p || 0; place(); } }, stats: function () { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, bld: bld.children.length, ceil: ceil }; } };
})();
