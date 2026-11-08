import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { maybeEmulate } from './emulate.js';
import { loadEnvironment, buildTable, buildPatient, buildSurgicalLights, buildTower, buildIVPole, buildBackTable, loadProps } from './or.js';
import { LapMonitor } from './monitor.js';
import { VitalsMonitor } from './vitals.js';
import { ORAudio, Captions } from './audio.js';
import { VideoSource } from './video.js';
import { connectEvents } from './events.js';
import { Abdomen } from './abdomen/index.js';
import { Autopilot } from './abdomen/autopilot.js';
import { KeyboardTools } from './abdomen/keyboard.js';
import { TOOL_TYPES } from './abdomen/tools.js';

const params = new URLSearchParams(location.search);
if (params.has('clean')) document.body.classList.add('clean');
const device = await maybeEmulate(params);

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('emulate') || params.has('manual') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(0.5);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101418);
const world = new THREE.Group(); // everything; moved by "recenter"
scene.add(world);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 60);
camera.position.set(0, 1.65, 0.35);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.3, 1.35, -1.4);
controls.enableDamping = true;
controls.update();

world.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.35));

// ------------------------------------------------------------------ the OR
const ENV_ROTATION = Number(params.get('envrot') ?? 1.55);
loadEnvironment(renderer, scene, world, { rotation: ENV_ROTATION }).catch((e) => console.error('environment failed', e));

const table = buildTable();
table.group.position.set(0.1, 0, -0.75);
world.add(table.group);
const patient = buildPatient(table.surfaceY);
patient.position.copy(table.group.position);
world.add(patient);
world.add(buildSurgicalLights());
const tower = buildTower();
tower.group.position.set(0.35, 0, -1.85);
world.add(tower.group);
const iv = buildIVPole(); iv.position.set(1.35, 0, -0.3); world.add(iv);
const backTable = buildBackTable(); backTable.position.set(-1.5, 0, -0.55); backTable.rotation.y = Math.PI / 2; world.add(backTable);
loadProps(world);

// main laparoscopy monitor on a boom arm above the tower, facing the surgeon
const monitor = new LapMonitor({ width: Number(params.get('monitorWidth') || 1.6) });
monitor.group.position.set(0.3, 1.66, -1.65);
monitor.group.lookAt(0, 1.6, 0);
world.add(monitor.group);
const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 12), new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.5 }));
boom.position.set(0.3, 2.5, -1.8); world.add(boom);

const captions = new Captions({ width: 1.4 });
captions.mesh.position.set(0, -monitor.height / 2 - 0.15, 0.04);
monitor.group.add(captions.mesh);

// anaesthesia vitals monitor on a pole at the head end
const vitals = new VitalsMonitor({ width: 0.66 });
vitals.group.position.set(1.45, 1.62, -1.2);
vitals.group.lookAt(0, 1.55, 0);
world.add(vitals.group);
const vpole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.25, 12), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.3 }));
vpole.position.set(1.47, 0.68, -1.23); world.add(vpole);

// ------------------------------------------------------------------ audio
const audio = new ORAudio();
vitals.onBeat((v) => audio.beat(v));
addEventListener('pointerdown', () => { audio.unlock(); video.resume(); });

// ------------------------------------------------------------------ status HUD (2D page only)
const $ = (id) => document.getElementById(id);
function status(dotId, textId, cls, text) { $(dotId).className = `dot ${cls}`; $(textId).textContent = text; }

// ------------------------------------------------------------------ video
const video = new VideoSource({
  onVideo: (el, label) => { if (sourceMode !== 'sim') monitor.setVideo(el, label); },
  onStatus: (mode, detail) => status('src-dot', 'src-text', { live: 'ok', demo: 'warn', connecting: 'warn' }[mode] || 'bad', `video: ${detail}`),
});
const config = await fetch('./api/config').then((r) => r.json()).catch(() => ({ whep: '/mediamtx/cam/whep', defaultSource: 'auto' }));
const whepOverride = params.get('whep');
let sourceMode = params.get('source') || config.defaultSource || 'sim';

// ------------------------------------------------------------------ virtual abdomen (source "sim")
let abd = null, abdLoading = null, autopilot = null, keyTools = null;
function ensureAbdomen() {
  abdLoading ??= (async () => {
    const a = new Abdomen({
      width: 1280, height: 720, fat: params.get('fat') !== '0', scopeAngle: Number(params.get('scopeAngle') || 0) * Math.PI / 180,
      onEvent: (ev) => { if (!bus.send(ev)) apply({ ...ev, ts: Date.now(), from: 'sim' }); },
    });
    await a.init();
    abd = a;
    if (params.has('autopilot')) autopilot = new Autopilot(abd, { variant: params.get('autopilot') });
    if (params.get('view') === 'scope' || params.has('keys')) keyTools = new KeyboardTools(abd, renderer.domElement, null);
    return a;
  })();
  return abdLoading;
}
async function setSource(mode, whep) {
  sourceMode = mode;
  if (mode === 'sim') {
    video.stopLive(); video.demo.pause();
    status('src-dot', 'src-text', 'warn', 'video: loading virtual abdomen…');
    const a = await ensureAbdomen();
    if (sourceMode !== 'sim') return;
    monitor.setTexture(a.texture, 'SIM · virtual abdomen');
    status('src-dot', 'src-text', 'ok', 'video: virtual abdomen (XPBD sim)');
  } else video.configure({ mode, whep: whepOverride || whep || config.whep });
}
setSource(sourceMode, config.whep);

// ------------------------------------------------------------------ events
function apply(ev) {
  switch (ev.type) {
    case 'state': {
      const s = ev.state;
      monitor.setBleed(s.bleed);
      if (s.smoke.intensity > 0 && (!s.smoke.until || s.smoke.until > Date.now())) monitor.setSmoke({ intensity: s.smoke.intensity, durationMs: s.smoke.until ? s.smoke.until - Date.now() : 0 });
      monitor.setWarning(s.warning && (!s.warning.until || s.warning.until > Date.now()) ? { ...s.warning, durationMs: s.warning.until ? s.warning.until - Date.now() : 0 } : null);
      vitals.set({ ...s.vitals, transitionMs: 0 }); vitals.snap();
      if (!params.get('source') && s.source?.mode && s.source.mode !== sourceMode) setSource(s.source.mode, s.source.whep);
      monitor.setBile(s.bile || { intensity: 0 });
      break;
    }
    case 'bleed': monitor.setBleed(ev); break;
    case 'smoke': monitor.setSmoke(ev); break;
    case 'warning': monitor.setWarning(ev); break;
    case 'clear': {
      const t = ev.target || 'all';
      if (t === 'all' || t === 'bleed') monitor.setBleed({ intensity: 0 });
      if (t === 'all' || t === 'bile') monitor.setBile({ intensity: 0 });
      if (t === 'all' || t === 'smoke') monitor.setSmoke({ intensity: 0, durationMs: 0 });
      if (t === 'all' || t === 'warning') monitor.setWarning(null);
      if (t === 'all' || t === 'captions') captions.clear();
      break;
    }
    case 'vitals': vitals.set(ev); break;
    case 'say': captions.push(ev.speaker, ev.text); audio.say(ev); break;
    case 'source': setSource(ev.mode, ev.whep); break;
    case 'bile': monitor.setBile(ev); break;
    case 'tools': if (abd && ev.from !== 'display') abd.setPoses(ev.tools); break;
    case 'sim':
      if (ev.action === 'reset' && abd) { abdLoading = null; abd = null; autopilot = null; setSource(sourceMode); }
      if (ev.action === 'autopilot' && abd) { abd.lastExternal = 0; autopilot = new Autopilot(abd, { variant: ev.target }); }
      if (ev.action === 'stop') autopilot = null;
      break;
    case 'reset':
      monitor.setBleed({ intensity: 0 }); monitor.setBile({ intensity: 0 }); monitor.setSmoke({ intensity: 0, durationMs: 0 }); monitor.setWarning(null); captions.clear();
      vitals.set({ hr: 78, bp: '122/76', spo2: 99, rr: 12, etco2: 36, temp: 36.8, transitionMs: 2000 });
      break;
  }
}
const bus = connectEvents({
  role: 'display', name: device ? 'emulated-quest' : navigator.userAgent.includes('OculusBrowser') ? 'quest' : 'browser',
  onEvent: apply,
  onStatus: (ok) => status('ws-dot', 'ws-text', ok ? 'ok' : 'bad', ok ? 'director link: connected' : 'director link: reconnecting…'),
});

// ------------------------------------------------------------------ XR: controllers + recenter
const controllerModels = new XRControllerModelFactory();
for (let i = 0; i < 2; i++) {
  const grip = renderer.xr.getControllerGrip(i);
  // ?controllers=0 hides the models (the surgeon's hands are on real instruments anyway)
  if (params.get('controllers') !== '0') grip.add(controllerModels.createControllerModel(grip));
  scene.add(grip);
  const ctrl = renderer.xr.getController(i);
  ctrl.addEventListener('squeezestart', recenter);
  scene.add(ctrl);
}
/** Move the OR so the surgeon spot is where the user's head is now, facing where they look. */
function recenter() {
  const xrCam = renderer.xr.getCamera();
  const pos = new THREE.Vector3(), q = new THREE.Quaternion();
  xrCam.getWorldPosition(pos); xrCam.getWorldQuaternion(q);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  world.rotation.y = Math.atan2(-fwd.x, -fwd.z);
  world.position.set(pos.x, 0, pos.z);
}
renderer.xr.addEventListener('sessionstart', () => { audio.unlock(); video.resume(); });

// Without the physical tracker, the Quest controllers act as instrument handles: each one
// pivots through a virtual trocar on the draped patient (left hand -> right-subcostal port,
// right hand -> epigastric port). Trigger closes the jaws, A/X = energy, B/Y = next instrument.
const handPorts = { left: 'rsc', right: 'epigastric' };
const btnPrev = { left: false, right: false };
function controllerTools() {
  const session = renderer.xr.getSession();
  if (!session || !abd || autopilot || performance.now() - abd.lastExternal < 1500 || params.get('controllerTools') === '0') return;
  const poses = [];
  const H = new THREE.Vector3(), T = new THREE.Vector3();
  for (const src of session.inputSources) {
    const hand = src.handedness; if (!handPorts[hand] || !src.gamepad) continue;
    renderer.xr.getControllerGrip([...session.inputSources].indexOf(src)).getWorldPosition(H);
    patient.userData.ports[handPorts[hand]].getWorldPosition(T);
    const dir = T.clone().sub(H); const dist = dir.length(); dir.normalize();
    // physical port frame: straight down into the abdomen; right = OR world X rotated with the room
    const d = new THREE.Vector3(0, -1, 0), r = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), world.rotation.y), u = new THREE.Vector3().crossVectors(r, d);
    const b = src.gamepad.buttons, id = hand === 'left' ? 'left' : 'right';
    const cur = abd.poses[id];
    const next = b[5]?.pressed; if (next && !btnPrev[hand]) cur.tool = TOOL_TYPES[(TOOL_TYPES.indexOf(cur.tool) + 1) % TOOL_TYPES.length]; btnPrev[hand] = next;
    poses.push({ id, port: handPorts[hand], tool: cur.tool, yaw: Math.atan2(dir.dot(r), dir.dot(d)), pitch: Math.asin(THREE.MathUtils.clamp(dir.dot(u), -1, 1)),
      roll: 0, depth: THREE.MathUtils.clamp(0.36 - dist, 0.02, 0.2), jaw: 1 - (b[0]?.value ?? 0), energy: !!b[4]?.pressed });
  }
  if (poses.length) abd.setPoses(poses, false);
}

const manualSim = params.has('manual'); // tests advance the sim deterministically via lapsim.stepSim()
function stepSim(dt) {
  if (autopilot) abd.setPoses(autopilot.tick(dt), false);
  else if (renderer.xr.isPresenting) controllerTools();
  keyTools?.update(dt);
  abd.hr = vitals.cur.hr;
  abd.update(dt);
}

// ?view=scope: show only the laparoscope monitor image full-screen (desktop testing)
const scopeView = params.get('view') === 'scope' ? (() => {
  const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), monitor.screen.material));
  return { scene: sc, camera: cam };
})() : null;

// ------------------------------------------------------------------ loop
const timer = new THREE.Timer(); timer.connect(document);
let renderRequested = false;
renderer.setAnimationLoop((time) => {
  timer.update(time);
  if (manualSim && !renderRequested && !renderer.xr.isPresenting) return; // tests: draw only after a step
  renderRequested = false;
  const dt = Math.min(timer.getDelta(), 0.1);
  const t = timer.getElapsed();
  monitor.setHeartRate(vitals.cur.hr);
  monitor.update(dt, t);
  vitals.update(dt, t);
  captions.update();
  if (abd && sourceMode === 'sim') {
    if (!manualSim) stepSim(dt);
    abd.render(renderer);
  }
  if (scopeView) { renderer.render(scopeView.scene, scopeView.camera); return; }
  if (!renderer.xr.isPresenting) controls.update();
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const vrButton = VRButton.createButton(renderer, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
vrButton.id = 'vr-button';
if (!scopeView) document.body.appendChild(vrButton);

// Hooks for tests / debugging in the console
window.lapsim = {
  THREE, renderer, scene, camera, controls, world, monitor, vitals, captions, video, bus, device, apply, recenter,
  get abd() { return abd; }, get autopilot() { return autopilot; }, setSource,
  stepSim(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) stepSim(dt); renderRequested = true; },
  snap() { monitor.snap(); vitals.snap(); },
};
