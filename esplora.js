/* Thread 16 - visore 3D navigabile dei modelli del thread 15 (three.js r147 in lib/).
   Scena: X = x edificio (est), Y = quota, Z = y edificio (sud): le stesse coordinate dei GLB. */
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
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82;
  var it = function (n, d) { return n.toLocaleString('it-IT', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  var S = M.sagoma, CX = (S[0] + S[2]) / 2, CZ = (S[1] + S[3]) / 2, FZ = M.piani.map(function (p) { return p[2]; }), IH = 3.15;

  var SKY = new T.Color(0xbfd6e6), NIGHT = new T.Color(0x0c171e), scene = new T.Scene(); scene.background = SKY;
  scene.add(new T.HemisphereLight(0xffffff, 0x8a8478, 0.28));
  var sun = new T.DirectionalLight(0xfff1dc, 1.5); sun.position.set(-30, 45, 40); scene.add(sun);
  var fill = new T.DirectionalLight(0xdde8ff, 0.25); fill.position.set(30, 20, -40); scene.add(fill);
  if (T.RoomEnvironment && T.PMREMGenerator) { try { var pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture; } catch (e) { } }
  var cam = new T.PerspectiveCamera(38, 1, 0.08, 600);
  var orb = new T.OrbitControls(cam, cvs); orb.maxPolarAngle = Math.PI / 2 - 0.03; orb.minDistance = 2; orb.maxDistance = 140;
  var dirty = true; orb.addEventListener('change', function () { dirty = true; });
  function view(i) { /* -1 tutto, 0 interrato, 1..4 piani, 5 copertura */
    if (i < 0) { orb.target.set(CX, 5, CZ + 2); cam.position.set(CX - 30, 22, CZ + 40); }
    else if (i === 0) { orb.target.set(CX - 2, -3, 12); cam.position.set(CX - 10, 38, 46); }
    else if (i === 5) { orb.target.set(CX, 13, CZ); cam.position.set(CX - 6, 44, CZ + 24); }
    else { orb.target.set(CX, FZ[i - 1] + 1, CZ); cam.position.set(CX - 3, FZ[i - 1] + 27, CZ + 19); }
    orb.update(); dirty = true;
  }

  /* ---- caricamento e fusione dei GLB ---- */
  var loader = new T.GLTFLoader(), U = T.BufferGeometryUtils;
  function nm(o) { while (o) { var n = (o.userData && o.userData.name) || o.name || ''; if (n.indexOf('/') > 0) return n; o = o.parent; } return ''; }
  /* fonde le mesh per chiave e materiale: da migliaia di oggetti a poche decine */
  function fuse(root, keyOf) {
    root.updateMatrixWorld(true); var bins = {}, out = [];
    root.traverse(function (o) {
      if (!o.isMesh) return; var k = keyOf(nm(o), o); if (k == null) return;
      var g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      Object.keys(g.attributes).forEach(function (a) { if (a !== 'position' && a !== 'normal') g.deleteAttribute(a); });
      if (!g.attributes.normal) g.computeVertexNormals();
      var id = k + '\u0001' + o.material.uuid; (bins[id] = bins[id] || { k: k, m: o.material, g: [] }).g.push(g);
    });
    Object.keys(bins).forEach(function (id) { var b = bins[id], g = b.g.length > 1 ? U.mergeBufferGeometries(b.g, false) : b.g[0]; if (!g) return; var m = new T.Mesh(g, b.m); m.userData.k = b.k; out.push(m); });
    return out;
  }
  function load(url, label) { return new Promise(function (ok, ko) { say('Carico ' + label + '…'); loader.load(url, function (g) { ok(g.scene); }, function (e) { if (e.total) say('Carico ' + label + '… ' + Math.round(e.loaded / e.total * 100) + '%'); }, ko); }); }

  var bld = new T.Group(), arr = new T.Group(), imp = new T.Group(); scene.add(bld, arr, imp);
  var flats = {}; function flat(m) { return flats[m.uuid] || (flats[m.uuid] = new T.MeshBasicMaterial({ color: m.color, toneMapped: false })); }
  var solid = []; /* materiali da rendere trasparenti nei raggi X */
  function keep(m) { if (solid.indexOf(m) < 0) { m.userData.o = { t: m.transparent, o: m.opacity, d: m.depthWrite }; solid.push(m); } }

  /* ---- stato ---- */
  var sel = -1, ceil = false, xray = false, walk = null, picked = null, furn = true, impOn = {}, reteOff = {}, impLoaded = {};
  var GF = { '03': 1, '04': 2, '05': 3, '06': 4 };
  function apply() {
    bld.children.forEach(function (m) {
      var p = m.userData.k.split('|'), g = p[0].slice(0, 2), sol = p[1] === 'S', v = true, f = GF[g];
      if (!walk && sel === 0) v = (g === '01' && !sol) || g === '07';
      else if (!walk && sel > 0 && sel < 5) v = g === '00' || g === '01' || (!!f && f <= sel) || (ceil && sol && (f === sel + 1 || (sel === 4 && g === '08')));
      else if (walk && !ceil) v = g === '00' || g === '01' || g === '02' || g === '07' || (!!f && f <= sel);
      if (xray && (p[0] === '00_Contesto' || (!walk && sel > 0 && sel < 5 && f !== sel))) v = false;
      m.visible = v;
    });
    arr.children.forEach(function (g) { g.visible = furn && !(xray && !walk) && ((walk && ceil) || sel < 0 || sel === 5 || (sel > 0 && g.userData.f <= sel)); });
    var pn = ['interrato', 'PT', 'P1', 'P2', 'P3', 'copertura'];
    imp.children.forEach(function (m) { var u = m.userData; m.visible = !!impOn[u.imp] && !reteOff[u.imp + '/' + u.rete] && (walk || sel < 0 || u.piano === pn[sel] || (u.piano === 'verticale' && sel !== 5) || (u.piano === 'esterno' && sel === 0)); });
    solid.forEach(function (m) { var o = m.userData.o; m.transparent = xray || o.t; m.opacity = xray ? Math.min(o.o, sel < 0 ? 0.035 : 0.06) : o.o; m.depthWrite = xray ? false : o.d; m.needsUpdate = true; });
    scene.background = xray ? NIGHT : SKY; pickG.visible = !walk; dirty = true;
  }

  /* ---- stanze: superfici invisibili per il clic ---- */
  var pickG = new T.Group(), rooms = [], hi = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: 0xf0a030, transparent: true, opacity: 0.55, depthWrite: false })); hi.rotation.x = -Math.PI / 2; hi.visible = false; scene.add(pickG, hi);
  var inv = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  M.piani.forEach(function (pp, fi) { M.tipi[pp[1]].rooms.forEach(function (r) { var q = r.r[0], m = new T.Mesh(new T.PlaneGeometry(q[2] - q[0], q[3] - q[1]), inv); m.rotation.x = -Math.PI / 2; m.position.set((q[0] + q[2]) / 2, pp[2] + 0.03, (q[1] + q[3]) / 2); m.userData = { r: r, fi: fi }; pickG.add(m); rooms.push(m); }); });
  var ray = new T.Raycaster(), info = $('.espinfo');
  var taglio = function (u, fi) { return u === 'M' ? 'bilocale' : (fi === 3 ? 'quadrilocale' : 'trilocale'); };
  function pick(m) {
    picked = m; hi.visible = !!m; dirty = true; if (!m) { info.hidden = true; return; }
    var r = m.userData.r, fi = m.userData.fi, pn = M.piani[fi][0], q = r.r[0], pt = (M.punti[pn + '|' + r.k] || [0, 0, 0]);
    hi.scale.set(q[2] - q[0], q[3] - q[1], 1); hi.position.copy(m.position); hi.position.y += 0.02;
    var ar = M.tipi[M.piani[fi][1]].furn.filter(function (f) { return f[7] === r.k && f[5] !== 'vetro'; }).map(function (f) { return f[6].split(' (')[0]; });
    var h = '<button class="x" aria-label="Chiudi">✕</button><small>' + (r.ala ? 'Alloggio ' + pn + '-' + r.ala + ' · ' + taglio(r.ala, fi) : 'Parti comuni · ' + pn) + '</small><h4>' + r.nome + '</h4>' +
      '<b>' + it(r.a, 2) + ' m²</b><span>' + it(q[2] - q[0], 2) + ' × ' + it(q[3] - q[1], 2) + ' m · altezza ' + (/bagno|ingresso|corr|pass|lavand|pianer/i.test(r.nome) ? '2,40' : '2,70') + ' m</span>';
    if (pt[0] + pt[1] + pt[2]) h += '<span>' + pt[0] + ' prese · ' + pt[1] + ' punti luce · ' + pt[2] + ' comandi e termostati</span>';
    if (ar.length) h += '<span class="ar">' + ar.join(' · ') + '</span>';
    h += '<button class="chip sel go">Entra in questa stanza</button>';
    info.innerHTML = h; info.hidden = false;
    info.querySelector('.x').onclick = function () { pick(null); };
    info.querySelector('.go').onclick = function () { enter(fi, (q[0] + q[2]) / 2, (q[1] + q[3]) / 2); };
  }
  var down = null;
  cvs.addEventListener('pointerdown', function (e) { down = [e.clientX, e.clientY]; });
  cvs.addEventListener('pointerup', function (e) {
    if (!down || Math.abs(e.clientX - down[0]) + Math.abs(e.clientY - down[1]) > 6 || walk) { down = null; return; } down = null;
    if (sel < 1 || sel > 4) { hint('Scegli un piano per aprire l\'edificio e toccare le stanze.'); return; }
    var b = cvs.getBoundingClientRect(); ray.setFromCamera(new T.Vector2((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1), cam);
    var hit = ray.intersectObjects(rooms.filter(function (m) { return m.userData.fi === sel - 1; }), false); pick(hit.length ? hit[0].object : null);
  });
  var ht; function hint(t) { var h = $('.esphint'); h.textContent = t; h.classList.add('on'); clearTimeout(ht); ht = setTimeout(function () { h.classList.remove('on'); }, 4000); }

  /* ---- camminare ---- */
  function inR(x, y, q) { return x > q[0] && x < q[2] && y > q[1] && y < q[3]; }
  function roomAt(x, y, fi) { var tp = M.tipi[M.piani[fi][1]], i, r; for (i = 0; i < tp.rooms.length; i++) { r = tp.rooms[i]; if (r.r.some(function (q) { return inR(x, y, q); }) && !r.e.some(function (q) { return inR(x, y, q); })) return r; } return null; }
  function free(x, y, fi) { return M.tipi[M.piani[fi][1]].porte.some(function (q) { return inR(x, y, q); }) || !!roomAt(x, y, fi); }
  var can = function (x, y, fi) { var d = 0.17; return free(x - d, y, fi) && free(x + d, y, fi) && free(x, y - d, fi) && free(x, y + d, fi); };
  function place() { cam.position.set(walk.x, FZ[walk.fi] + 1.6, walk.y); cam.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ'); dirty = true;
    var r = roomAt(walk.x, walk.y, walk.fi); $('.espwhere').textContent = r ? r.nome + (r.ala ? ' · ' + M.piani[walk.fi][0] + '-' + r.ala : '') + ' · ' + it(r.a, 2) + ' m²' : ''; }
  function enter(fi, x, y, yaw) {
    pick(null); if (!can(x, y, fi)) { x = 3.2; y = 10.2; }
    walk = { fi: fi, x: x, y: y, yaw: yaw != null ? yaw : (y > 7 ? Math.PI : 0), pitch: -0.08 };
    orb.enabled = false; cam.fov = 74; cam.near = 0.05; cam.updateProjectionMatrix(); box.classList.add('walk'); if (xray && !anyImp()) setX(false); sel = fi + 1; chipSel(); apply(); place();
    hint(window.matchMedia && matchMedia('(pointer:coarse)').matches ? 'Trascina per guardarti intorno. Usa le frecce per camminare.' : 'Trascina per guardarti intorno. Frecce o W A S D per camminare.');
  }
  function leave() { if (!walk) return; walk = null; orb.enabled = true; cam.fov = 38; cam.updateProjectionMatrix(); box.classList.remove('walk'); view(sel); apply(); }
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
  chips('.e-piani', [['Tutto', -1, 1], ['Interrato', 0], ['Piano terra', 1], ['Primo', 2], ['Secondo', 3], ['Terzo', 4], ['Copertura', 5]], function (v) {
    if (walk) { if (v < 1 || v > 4) { leave(); } else { walk.fi = v - 1; if (!can(walk.x, walk.y, walk.fi)) { walk.x = 3.2; walk.y = 10.2; } sel = v; chipSel(); place(); apply(); return; } }
    sel = v; chipSel(); pick(null); view(v); apply();
  });
  var IMP = [['elettrico', 'Elettrico e segnali', 'impianti_elettrico', '#e8a13a'], ['termico', 'Caldo e freddo', 'impianti_clima', '#e0564f'], ['vmc', 'Ventilazione', 'impianti_clima', '#35a889'], ['idrico', 'Acqua', 'impianti_acqua_scarichi', '#3f8fd6'], ['scarichi', 'Scarichi', 'impianti_acqua_scarichi', '#8a6a52']];
  var anyImp = function () { return Object.keys(impOn).some(function (k) { return impOn[k]; }); };
  chips('.e-imp', IMP.map(function (s) { return ['<i style="background:' + s[3] + '"></i>' + s[1], s, 0, false]; }), function (s, b) {
    var id = s[0]; impOn[id] = !impOn[id]; b.setAttribute('aria-pressed', impOn[id]);
    var go = function () { if (anyImp() && !xray) setX(true); if (!anyImp() && xray) setX(false); legend(); apply(); };
    if (impOn[id] && !impLoaded[s[2]]) {
      impLoaded[s[2]] = 1; load('modelli/' + s[2] + '.glb', s[1].toLowerCase()).then(function (root) {
        fuse(root, function (n) { var p = n.split('/'); return p[0] === 'edificio' || p.length < 4 ? null : p[0] + '|' + p[1] + '|' + p[2]; }).forEach(function (m) { var p = m.userData.k.split('|'); m.userData = { imp: p[0], rete: p[1], piano: p[2] }; m.material = flat(m.material); imp.add(m); });
        say(''); go();
      }, function () { say('Non riesco a caricare questo impianto.'); });
    } else go();
  });
  function legend() {
    var L = $('.e-reti'), seen = {}; L.innerHTML = '';
    imp.children.forEach(function (m) { var u = m.userData, k = u.imp + '/' + u.rete; if (!impOn[u.imp] || seen[k]) return; seen[k] = 1;
      var b = document.createElement('button'); b.className = 'chip sm'; b.innerHTML = '<i style="background:#' + m.material.color.clone().convertLinearToSRGB().getHexString() + '"></i>' + u.rete; b.setAttribute('aria-pressed', !reteOff[k]);
      b.onclick = function () { reteOff[k] = !reteOff[k]; b.setAttribute('aria-pressed', !reteOff[k]); apply(); }; L.appendChild(b); });
    $('.e-retirow').hidden = !L.children.length;
  }
  var xb = $('.e-x'); function setX(v) { xray = v; xb.setAttribute('aria-pressed', v); } xb.onclick = function () { setX(!xray); apply(); };
  var cb = $('.e-ceil'); cb.onclick = function () { ceil = !ceil; cb.setAttribute('aria-pressed', ceil); apply(); };
  var fb = $('.e-furn'); fb.onclick = function () { furn = !furn; fb.setAttribute('aria-pressed', furn); apply(); };
  $('.e-zi').onclick = function () { zoom(0.78); }; $('.e-zo').onclick = function () { zoom(1.28); };
  function zoom(f) { if (walk) return; var d = cam.position.clone().sub(orb.target).multiplyScalar(f); cam.position.copy(orb.target).add(d); orb.update(); }
  var fs = $('.e-fs'); if (box.requestFullscreen) fs.onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else box.requestFullscreen(); }; else fs.hidden = true;
  document.addEventListener('fullscreenchange', function () { setTimeout(size, 80); });

  /* ---- ciclo ---- */
  function size() { var b = cvs.getBoundingClientRect(); if (!b.width) return; renderer.setSize(b.width, b.height, false); cam.aspect = b.width / b.height; cam.updateProjectionMatrix(); dirty = true; }
  window.addEventListener('resize', size);
  var last = 0; function loop(t) { step(Math.min(0.05, (t - last) / 1000)); last = t; if (dirty) { dirty = false; renderer.render(scene, cam); } requestAnimationFrame(loop); }

  /* ---- avvio: si carica solo quando la persona lo chiede ---- */
  var started = false;
  function start() {
    if (started) return; started = true; $('.espact').hidden = true; box.classList.add('live'); size(); view(-1); requestAnimationFrame(loop);
    load('modelli/edificio.glb', 'l\'edificio').then(function (root) {
      fuse(root, function (n) { var p = n.split('/'); return p[0] + (/^solaio/.test(p[1] || '') ? '|S' : '|'); }).forEach(function (m) { keep(m.material); bld.add(m); });
      apply(); say('Carico l\'arredo…');
      var A = [['alloggio_trilocale_W', 2, [1, 2, 3], true, null], ['alloggio_bilocale_M', 2, [1, 2, 3], false, null], ['alloggio_quadrilocale_P3-W', 4, [4], true, /cabina|passaggio/i]];
      return A.reduce(function (pr, a) { return pr.then(function () { return new Promise(function (ok) { loader.load('modelli/' + a[0] + '.glb', function (g) {
        var ms = fuse(g.scene, function (n) { return /^4_/.test(n) ? (a[4] && a[4].test(n) ? 'solo' : 'tutti') : null; });
        a[2].forEach(function (f) { [false, true].forEach(function (mir) { if (mir && !a[3]) return; var G = new T.Group(); G.userData.f = f;
          ms.forEach(function (m) { if (mir && m.userData.k === 'solo') return; keep(m.material); G.add(new T.Mesh(m.geometry, m.material)); });
          G.position.y = (f - a[1]) * IH; if (mir) { G.scale.x = -1; G.position.x = S[2]; } arr.add(G); }); });
        apply(); ok(); }, undefined, function () { ok(); }); }); }); }, Promise.resolve());
    }).then(function () { say(''); apply(); }, function () { say('Non riesco a caricare il modello dell\'edificio.'); });
  }
  $('.espact').onclick = start;
  window.ESPLORA = { start: start, enter: enter, leave: leave, floor: function (i) { $$('.e-piani .chip')[i + 1].click(); }, imp: function (i) { $$('.e-imp .chip')[i].click(); }, key: function (k, v) { keys[k] = v; },
    room: function (fi, k) { rooms.forEach(function (m) { if (m.userData.fi === fi && m.userData.r.k === k) pick(m); }); }, look: function (y, p) { if (walk) { walk.yaw = y; walk.pitch = p || 0; place(); } }, stats: function () { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, bld: bld.children.length, arr: arr.children.length, imp: imp.children.length }; } };
})();
