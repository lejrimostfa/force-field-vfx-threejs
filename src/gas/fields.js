// GPU storage for the solver. Every field is a 3D texture written by compute and read by the next pass.
// vel, prs, curl and keyT use half the gas resolution, light a quarter.
//   vel: xyz velocity in units per second, w expansion rate of burning gas
//   gas: r temperature, g soot, b dust, a fuel
//   prs: r pressure, g divergence, b solid flag. 32 bit: half floats add visible noise to the gradient.
//   curl: xyz vorticity, w its length
//   light: rgb irradiance from the fire close to the flames, a quarter of the gas resolution
//   lightFar: rgb irradiance that reaches across the stage, an eighth
//   keyT: r transmittance toward the blue key light
import * as THREE from 'three/webgpu';
import { bakeFlow } from './flow.js';

function field(res, name, { float = false } = {}) {
  const t = new THREE.Storage3DTexture(res[0], res[1], res[2]);
  t.name = name;
  t.type = float ? THREE.FloatType : THREE.HalfFloatType;
  t.format = THREE.RGBAFormat;
  t.generateMipmaps = false;
  t.minFilter = t.magFilter = float ? THREE.NearestFilter : THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  return t;
}

// Value noise that tiles on its own: random cells plus hardware trilinear filtering.
function noiseField(size = 32) {
  const data = new Uint8Array(size * size * size * 4);
  let seed = 12345;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = seed >>> 24;
  }
  const t = new THREE.Data3DTexture(data, size, size, size);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export function makeFields(res) {
  const half = res.map((v) => v / 2);
  const quarter = res.map((v) => v / 4);
  const eighth = res.map((v) => v / 8);
  return {
    vel: [field(half, 'velA'), field(half, 'velB')],
    gas: [field(res, 'gasA'), field(res, 'gasB')],
    gasTmp: field(res, 'gasTmp'),
    prs: [field(half, 'prsA', { float: true }), field(half, 'prsB', { float: true })],
    curl: field(half, 'curl'),
    light: [field(quarter, 'lightA'), field(quarter, 'lightB')],
    lightFar: [field(eighth, 'farA'), field(eighth, 'farB')],
    keyT: field(half, 'keyT'),
    noise: noiseField(),
    flow: bakeFlow(),
  };
}
