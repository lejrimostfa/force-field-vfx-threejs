// Boot and frame loop: sim step, light fields, sparks, raymarch, then scene plus volume through the post chain.
import * as THREE from 'three/webgpu';
import { dot, min, pass, saturation, screenUV, texture, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DT, TUNABLES, readOptions } from './config.js';
import { bus } from './events.js';
import { mountHud } from './hud.js';
import { makeFields } from './gas/fields.js';
import { makeParams } from './gas/params.js';
import { makeSolver } from './gas/solver.js';
import { makeLightPasses } from './gas/light.js';
import { makeStage } from './render/stage.js';
import { makeFigures } from './render/figures.js';
import { mountInput } from './input.js';
import { makeSparks } from './render/sparks.js';
import { makeVolume } from './render/volume.js';

THREE.Node.captureStackTrace = new URLSearchParams(location.search).has('trace');
const q = readOptions();
mountHud(q, TUNABLES);

if (!navigator.gpu || !(await navigator.gpu.requestAdapter())) {
  document.getElementById('nogpu').hidden = false;
  throw new Error('WebGPU is not available');
}

const renderer = new THREE.WebGPURenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
const [width, height] = q.size ?? [innerWidth, innerHeight];
renderer.setSize(width, height);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
document.body.appendChild(renderer.domElement);
await renderer.init();
const device = renderer.backend.device;
device.addEventListener('uncapturederror', (e) => bus.emit('fxFailed', { message: e.error.message }));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 200);
camera.position.set(2.5, 6, 23);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(1.4, 2.4, 0);
controls.update();

const fields = makeFields(q.res);
const params = makeParams();
const solver = makeSolver(renderer, q, fields, params);
const lights = makeLightPasses(renderer, q, fields, params);
makeStage(scene, fields, params);
makeFigures(scene, params);
const sparks = makeSparks(renderer, scene, fields, params);
const volume = makeVolume(renderer, q, fields, params, Math.ceil((width * q.march) / 8) * 8, Math.ceil((height * q.march) / 8) * 8);

const pipeline = new THREE.RenderPipeline(renderer);
const beauty = pass(scene, camera);
const col = beauty.getTextureNode('output');
const vol = texture(volume.texture, screenUV);
const hdr = saturation(col.rgb.mul(vol.a).add(vol.rgb), 1.3);
const centered = screenUV.sub(0.5);
const vignette = dot(centered, centered).mul(0.9).oneMinus();
pipeline.outputNode = vec4(hdr.add(bloom(min(hdr, vec3(9)), 0.32, 0.55, 1.1).rgb).mul(vignette), 1);

let frame = 0;
let orbit = q.autoRun;
bus.on('orbitToggled', () => { orbit = !orbit; });
bus.on('paramChanged', ({ name, value }) => { params[name].value = value; });
bus.on('beamToggled', () => { params.beamOn.value = params.beamOn.value > 0.5 ? 0 : 1; });
mountInput();
bus.emit('paramsReady', { params });

// Slow move around the stage, with the same framing rule as the video: low, three quarters.
function moveCamera(t) {
  const a = 0.1 + Math.sin(t * 0.13) * 0.32;
  camera.position.set(1.4 + Math.sin(a) * 26, 4.6 + Math.sin(t * 0.21) * 1.4, Math.cos(a) * 26);
  controls.update();
}

function simulate() {
  params.time.value = frame * DT;
  if (orbit) moveCamera(frame * DT);
  params.target.value.y = 2 + Math.sin(frame * DT * 0.7) * 0.5;
  params.target.value.z = Math.sin(frame * DT * 0.43) * 0.7;
  solver.step();
  lights.step();
  sparks.step();
  volume.render(camera, frame);
  pipeline.render();
  frame++;
}

// Timing: GPU time is measured to queue idle, because Chrome on Mac returns zero timestamps.
let last = performance.now(), count = 0, cpu = 0, gpu = 0;
async function measured() {
  const t0 = performance.now();
  simulate();
  const t1 = performance.now();
  await device.queue.onSubmittedWorkDone();
  const t2 = performance.now();
  cpu += t1 - t0; gpu += t2 - t0; count++;
  if (t2 - last > 500) {
    bus.emit('statsUpdated', { fps: (count * 1000) / (t2 - last), gpuMs: gpu / count, cpuMs: cpu / count, frame, cells: solver.grid.cells });
    last = t2; count = 0; cpu = 0; gpu = 0;
  }
}

async function loop() {
  await measured();
  requestAnimationFrame(loop);
}
if (q.autoRun) loop();

addEventListener('resize', () => {
  if (q.size) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Test hook. three updates its scene pass once per animation frame, and a hidden tab barely gets any. So each frame
// advances the node clock by hand: a bare loop would keep drawing a stale floor and under-report the cost.
window.__gasfx = {
  params, camera, renderer, fields, moveCamera, scene,
  // Redraws the same sim state, for A/B tests of render settings. n passes let the temporal filter settle.
  async redraw(n = 8, relight = false) {
    for (let i = 0; i < n; i++) {
      renderer._nodes.nodeFrame.update();
      if (relight) lights.step();
      volume.render(camera, frame + i);
      pipeline.render();
      await device.queue.onSubmittedWorkDone();
    }
  },
  // Mean time of each stage alone, in ms. n runs share one queue wait: a wait per run measures the wait, not the GPU.
  async profile(n = 25) {
    const stages = {
      gas: () => renderer.compute(solver.gasPasses), velocity: () => renderer.compute(solver.velPasses),
      lights: lights.step, sparks: sparks.step, volume: () => volume.render(camera, frame), post: () => pipeline.render(),
    };
    const out = {};
    for (const [name, run] of Object.entries(stages)) {
      await device.queue.onSubmittedWorkDone();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) run();
      await device.queue.onSubmittedWorkDone();
      out[name] = +((performance.now() - t0) / n).toFixed(2);
    }
    return out;
  },
  frame: () => frame,
  async run(n, each) {
    const times = [];
    for (let i = 0; i < n; i++) {
      renderer._nodes.nodeFrame.update();
      const t0 = performance.now();
      simulate();
      if (each) await each(i);
      await device.queue.onSubmittedWorkDone();
      times.push(performance.now() - t0);
    }
    return times;
  },
};
