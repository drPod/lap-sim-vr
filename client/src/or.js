// Operating room set dressing. The room itself is Poly Haven's CC0 "Surgery"
// HDRI projected on a GroundedSkybox; CC0 glTF props (Poly Haven, Kenney) are
// placed around a procedurally built OR table, draped patient, surgical lights,
// laparoscopy tower and IV pole.
//
// Coordinates: metres, local-floor. The surgeon stands at the origin facing -Z,
// on the patient's left. The patient lies along X with the head at +X.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';

const A = './assets';
const gltf = new GLTFLoader();

const mat = {
  drape: new THREE.MeshStandardMaterial({ color: 0x3f7fb0, roughness: 0.95 }),
  drapeDark: new THREE.MeshStandardMaterial({ color: 0x2f6390, roughness: 0.95 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.3, metalness: 0.9 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.4, metalness: 0.7 }),
  plastic: new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.5 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.5 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xd9a58a, roughness: 0.7 }),
  iodine: new THREE.MeshStandardMaterial({ color: 0x9a5a2a, roughness: 0.6 }),
  cap: new THREE.MeshStandardMaterial({ color: 0x8fb8d8, roughness: 0.95 }),
  bag: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, transmission: 0.6, transparent: true, opacity: 0.6 }),
};

function box(w, h, d, m) { const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); g.castShadow = g.receiveShadow = true; return g; }
function cyl(rt, rb, h, m, seg = 24) { const g = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); g.castShadow = true; return g; }
function rounded(w, h, d, r, m) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r); shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d); shape.quadraticCurveTo(x, y + d, x, y + d - r); shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 });
  g.rotateX(-Math.PI / 2); g.translate(0, 0, 0);
  const m2 = new THREE.Mesh(g, m); m2.castShadow = m2.receiveShadow = true; return m2;
}

/** Load a glb and scale it so its largest bbox dimension along `axis` equals `size` metres; feet on y=0. */
async function prop(url, { size, axis = 'y', position = [0, 0, 0], rotY = 0 }) {
  const { scene } = await gltf.loadAsync(url);
  const b = new THREE.Box3().setFromObject(scene);
  const dims = b.getSize(new THREE.Vector3());
  const s = size / dims[axis];
  scene.scale.setScalar(s);
  const b2 = new THREE.Box3().setFromObject(scene);
  const c = b2.getCenter(new THREE.Vector3());
  const wrap = new THREE.Group();
  scene.position.set(-c.x, -b2.min.y, -c.z);
  wrap.add(scene);
  wrap.position.set(...position); wrap.rotation.y = rotY;
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return wrap;
}

export async function loadEnvironment(renderer, scene, parent, { rotation = 0 } = {}) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const [hdr, jpg] = await Promise.all([
    new HDRLoader().loadAsync(`${A}/env/surgery_1k.hdr`),
    new THREE.TextureLoader().loadAsync(`${A}/env/surgery_4k.jpg`),
  ]);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  scene.environmentRotation.y = rotation;
  hdr.dispose(); pmrem.dispose();

  jpg.colorSpace = THREE.SRGBColorSpace;
  jpg.mapping = THREE.EquirectangularReflectionMapping;
  jpg.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const sky = new GroundedSkybox(jpg, 1.55, 9, 96);
  sky.position.y = 1.55; // camera height of the HDRI capture -> floor at y=0
  sky.rotation.y = rotation;
  sky.material.toneMapped = false; // the JPG is already tonemapped
  sky.name = 'room';
  parent.add(sky);
  return sky;
}

export function buildTable() {
  const g = new THREE.Group(); g.name = 'or-table';
  const topY = 0.86;
  // base + column
  const base = rounded(0.9, 0.08, 0.42, 0.06, mat.darkSteel); base.position.set(-0.15, 0, 0);
  const col = box(0.32, topY - 0.15, 0.22, mat.plastic); col.position.set(0, (topY - 0.15) / 2 + 0.08, 0);
  // table top + mattress
  const top = box(2.0, 0.06, 0.55, mat.steel); top.position.set(0, topY - 0.03, 0);
  const rail1 = box(2.0, 0.025, 0.012, mat.steel); rail1.position.set(0, topY - 0.06, 0.285);
  const rail2 = rail1.clone(); rail2.position.z = -0.285;
  const mattress = rounded(1.96, 0.06, 0.53, 0.04, mat.black); mattress.position.set(0, topY, 0);
  g.add(base, col, top, rail1, rail2, mattress);
  return { group: g, surfaceY: topY + 0.08 };
}

export function buildPatient(surfaceY) {
  const g = new THREE.Group(); g.name = 'patient';
  // One cloth mesh draped over an implied body: a height field from a few
  // ellipsoids (chest, abdomen, pelvis, legs) that falls over the table edges.
  const L = 1.9, Wd = 1.1, nx = 190, nz = 110;
  const geo = new THREE.PlaneGeometry(L, Wd, nx, nz); geo.rotateX(-Math.PI / 2); geo.translate(0.68 - L / 2, 0, 0); // ends at the ether screen
  const blobs = [ // x, z, rx, rz, height
    [0.35, 0, 0.3, 0.22, 0.2], [0.05, 0, 0.3, 0.21, 0.19], [-0.3, 0, 0.22, 0.21, 0.15],
    [-0.75, 0.09, 0.4, 0.075, 0.1], [-0.75, -0.09, 0.4, 0.075, 0.1],
  ];
  const win = { x: 0.14, z: 0.02, rx: 0.2, rz: 0.13 }; // prepped abdominal window
  const pos = geo.attributes.position, colors = [];
  const blue = new THREE.Color(0x3f7fb0), iod = new THREE.Color(0x7a4026), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = 0;
    for (const [bx, bz, rx, rz, bh] of blobs) {
      const q = ((x - bx) / rx) ** 2 + ((z - bz) / rz) ** 2;
      if (q < 1) h = Math.max(h, bh * Math.sqrt(1 - q));
    }
    const az = Math.abs(z), ax = x < -1.0 ? -1.0 - x : 0;
    let y = surfaceY + 0.015 + h;
    if (az > 0.29) y -= (az - 0.29) * 2.4;            // hangs over the long edges
    if (ax > 0) y -= ax * 2.6;                        // and over the foot end
    y += 0.006 * Math.sin(x * 23 + z * 7) * Math.sin(z * 19); // wrinkles
    pos.setY(i, y);
    const qw = ((x - win.x) / win.rx) ** 2 + ((z - win.z) / win.rz) ** 2;
    tmp.copy(blue).multiplyScalar(0.92 + 0.08 * Math.sin(x * 40) * Math.sin(z * 30));
    tmp.lerp(iod, THREE.MathUtils.smoothstep(1.0 - qw, 0.0, 0.25)); // soft-edged iodine-prepped skin
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const drape = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }));
  drape.receiveShadow = true; drape.name = 'drape';
  g.add(drape);
  const heightAt = (x, z) => { let h = 0; for (const [bx, bz, rx, rz, bh] of blobs) { const q = ((x - bx) / rx) ** 2 + ((z - bz) / rz) ** 2; if (q < 1) h = Math.max(h, bh * Math.sqrt(1 - q)); } return surfaceY + 0.015 + h; };
  const ports = [[0.0, 0.02], [0.22, 0.08], [0.2, -0.08], [0.3, 0.12]]; // umbilical, epigastric, 2x right subcostal
  for (const [x, z] of ports) {
    const p = new THREE.Group();
    const cannula = cyl(0.008, 0.008, 0.12, mat.darkSteel, 12); cannula.position.y = 0.06;
    const hub = cyl(0.018, 0.016, 0.035, mat.black, 16); hub.position.y = 0.12;
    p.add(cannula, hub); p.position.set(x, heightAt(x, z) - 0.01, z); p.rotation.z = (x - 0.15) * 0.8;
    g.add(p);
  }
  // head end: ether screen (anaesthesia drape bar), head with cap on a pillow
  const bar = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.008, 8, 32, Math.PI), mat.steel);
  bar.rotation.y = Math.PI / 2; bar.position.set(0.66, surfaceY + 0.02, 0);
  const screen = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x3f7fb0, roughness: 1, side: THREE.DoubleSide }));
  screen.rotation.y = Math.PI / 2; screen.position.set(0.66, surfaceY + 0.02, 0);
  const pillow = rounded(0.32, 0.06, 0.4, 0.06, mat.plastic); pillow.position.set(0.85, surfaceY, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), mat.skin); head.scale.set(1.1, 0.9, 0.9); head.position.set(0.86, surfaceY + 0.14, 0);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.cap);
  cap.rotation.z = -Math.PI / 2; cap.position.copy(head.position).add(new THREE.Vector3(0.02, 0, 0));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.82, surfaceY + 0.2, 0), new THREE.Vector3(0.9, surfaceY + 0.35, 0.05), new THREE.Vector3(1.1, surfaceY + 0.4, -0.2), new THREE.Vector3(1.35, surfaceY + 0.2, -0.45)]), 32, 0.012, 8),
  new THREE.MeshStandardMaterial({ color: 0xbfd8e8, roughness: 0.2, transparent: true, opacity: 0.8 }));
  g.add(bar, screen, pillow, head, cap, tube);
  return g;
}

export function buildSurgicalLights() {
  const g = new THREE.Group(); g.name = 'surgical-lights';
  const ceilingY = 2.75;
  const mount = cyl(0.12, 0.12, 0.08, mat.plastic); mount.position.set(0.1, ceilingY, -0.9);
  const post = cyl(0.03, 0.03, 0.35, mat.plastic); post.position.set(0.1, ceilingY - 0.2, -0.9);
  g.add(mount, post);
  const heads = [[-0.75, 2.3, -0.75, 0.45], [0.85, 2.35, -0.55, -0.45]];
  for (const [x, y, z, tilt] of heads) {
    const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.1, ceilingY - 0.35, -0.9), new THREE.Vector3((x + 0.1) / 2, ceilingY - 0.3, (z - 0.9) / 2), new THREE.Vector3(x, y + 0.35, z)]), 20, 0.025, 10), mat.plastic);
    const head = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), mat.plastic);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.03, 12, 40), mat.plastic); rim.rotation.x = Math.PI / 2; rim.position.y = 0.12;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.235, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 2.2 }));
    lens.rotation.x = Math.PI / 2; lens.position.y = 0.11;
    const handle = cyl(0.02, 0.02, 0.12, mat.steel); handle.position.y = 0.04;
    dome.position.y = -0.0;
    head.add(dome, rim, lens, handle);
    head.position.set(x, y, z); head.rotation.z = tilt;
    const stem = cyl(0.022, 0.022, 0.3, mat.plastic); stem.position.set(x, y + 0.25, z);
    g.add(arm, stem, head);
    const spot = new THREE.SpotLight(0xfff4e5, 7, 5, 0.4, 0.7, 1.2);
    spot.position.set(x, y, z); spot.target.position.set(0.1, 1.0, -0.75);
    g.add(spot, spot.target);
  }
  return g;
}

/** Laparoscopy tower: cart with insufflator / light source / camera control unit; the big monitor sits on top. */
export function buildTower() {
  const g = new THREE.Group(); g.name = 'lap-tower';
  const w = 0.62, d = 0.55;
  const base = rounded(w + 0.1, 0.06, d + 0.1, 0.05, mat.plastic); base.position.y = 0.1;
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const wheel = cyl(0.045, 0.045, 0.03, mat.black, 16); wheel.rotation.x = Math.PI / 2; wheel.position.set(x * w / 2, 0.045, z * d / 2); g.add(wheel);
  }
  const p1 = box(0.04, 1.05, 0.04, mat.plastic); p1.position.set(-w / 2, 0.68, -d / 2 + 0.02);
  const p2 = p1.clone(); p2.position.x = w / 2;
  g.add(base, p1, p2);
  const units = [
    { y: 0.32, h: 0.16, label: 'INSUFFLATOR', screen: '15 mmHg', color: 0x66ffcc },
    { y: 0.52, h: 0.14, label: 'LIGHT SOURCE', screen: '●  100%', color: 0xffe08a },
    { y: 0.7, h: 0.14, label: 'CCU  HD', screen: 'CAM 1', color: 0x8ac8ff },
    { y: 0.88, h: 0.12, label: 'ESU', screen: 'CUT 30  COAG 30', color: 0xff9a8a },
  ];
  for (const u of units) {
    const shelf = box(w, 0.015, d, mat.plastic); shelf.position.y = u.y - u.h / 2 - 0.02; g.add(shelf);
    const dev = box(w - 0.06, u.h, d - 0.08, new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.4 }));
    dev.position.set(0, u.y, 0); g.add(dev);
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#f2f4f6'; x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#556'; x.font = '600 30px system-ui'; x.fillText(u.label, 20, 46);
    x.fillStyle = '#111'; x.fillRect(250, 18, 240, 92);
    x.fillStyle = '#' + u.color.toString(16).padStart(6, '0'); x.font = '700 34px ui-monospace, monospace'; x.fillText(u.screen, 262, 76);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, u.h), new THREE.MeshBasicMaterial({ map: t }));
    face.position.set(0, u.y, (d - 0.08) / 2 + 0.001); g.add(face);
  }
  const topShelf = box(w, 0.02, d, mat.plastic); topShelf.position.y = 1.0; g.add(topShelf);
  const arm = cyl(0.03, 0.03, 0.3, mat.darkSteel); arm.position.set(0, 1.15, -0.1); g.add(arm);
  return { group: g, monitorMountY: 1.3 };
}

export function buildIVPole() {
  const g = new THREE.Group(); g.name = 'iv-pole';
  const pole = cyl(0.012, 0.012, 1.9, mat.steel, 12); pole.position.y = 0.95;
  g.add(pole);
  for (let i = 0; i < 5; i++) {
    const leg = box(0.3, 0.02, 0.03, mat.steel); const a = (i / 5) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15); leg.rotation.y = -a; g.add(leg);
  }
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 8, 24), mat.steel); hook.position.y = 1.9; g.add(hook);
  const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.16, 6, 16), mat.bag); bag.scale.z = 0.4; bag.position.set(0.06, 1.72, 0); g.add(bag);
  const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.06, 1.6, 0), new THREE.Vector3(0.1, 1.2, 0), new THREE.Vector3(-0.1, 1.0, -0.15), new THREE.Vector3(-0.35, 0.98, -0.3)]), 24, 0.004, 6),
  new THREE.MeshStandardMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.7 }));
  g.add(line);
  return g;
}

/** Draped back table with laparoscopic instruments laid out. */
export function buildBackTable() {
  const g = new THREE.Group(); g.name = 'back-table';
  const top = box(1.1, 0.03, 0.6, mat.steel); top.position.y = 0.9;
  const cloth = box(1.16, 0.012, 0.66, mat.drape); cloth.position.y = 0.92;
  const skirt = box(1.16, 0.3, 0.012, mat.drapeDark); skirt.position.set(0, 0.77, 0.33);
  g.add(top, cloth, skirt);
  for (const [x, z] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) {
    const leg = cyl(0.015, 0.015, 0.88, mat.steel, 10); leg.position.set(x, 0.44, z); g.add(leg);
  }
  // 5 mm instruments: long shafts with handles
  for (let i = 0; i < 6; i++) {
    const shaft = cyl(0.004, 0.004, 0.36, mat.darkSteel, 8); shaft.rotation.z = Math.PI / 2;
    shaft.position.set(-0.15, 0.935, -0.2 + i * 0.07);
    const handle = box(0.07, 0.025, 0.02, mat.black); handle.position.set(0.07, 0.94, -0.2 + i * 0.07);
    g.add(shaft, handle);
  }
  const tray = box(0.3, 0.04, 0.2, mat.steel); tray.position.set(0.35, 0.945, 0.12); g.add(tray);
  return g;
}

/** Load the CC0 glTF props. Failures are non-fatal (scene still works without them). */
export async function loadProps(scene) {
  const items = [
    ['metal_stool_01.glb', { size: 0.62, position: [-0.75, 0, 0.55] }],
    ['metal_trash_can.glb', { size: 0.55, position: [-1.35, 0, 0.45] }],
    ['kenney_sideTableDrawers.glb', { size: 0.72, position: [1.65, 0, -0.95], rotY: -Math.PI / 2.4 }], // anaesthesia cart
    ['kenney_computerKeyboard.glb', { size: 0.42, axis: 'x', position: [1.6, 0.73, -0.9], rotY: -Math.PI / 2.4 }],
  ];
  const results = await Promise.allSettled(items.map(([f, o]) => prop(`${A}/models/${f}`, o)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      r.value.name = items[i][0];
      // Kenney's furniture kit is warm wood; repaint it clinical white/grey
      if (items[i][0].startsWith('kenney_')) r.value.traverse((o) => { if (o.isMesh) o.material = o.material.color.getHSL({}).l > 0.35 ? mat.plastic : mat.darkSteel; });
      scene.add(r.value);
    } else console.warn('prop failed', items[i][0], r.reason); });
}
