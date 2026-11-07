// Two small silhouettes for scale: the defender inside the shield and the attacker at the nozzle.
// Built from capsules on purpose: they only ever read as dark shapes against the fire, and this needs no asset.
import * as THREE from 'three/webgpu';
import { cameraPosition, dot, float, max, normalWorld, normalize, positionWorld, pow, vec3 } from 'three/tsl';

// Near black, with a rim of fire light so the figures sit in the scene instead of floating as cut-outs.
const MAT = new THREE.MeshBasicNodeMaterial();
const facing = max(dot(normalWorld, normalize(cameraPosition.sub(positionWorld))), 0);
MAT.colorNode = vec3(0.012, 0.01, 0.008).add(vec3(1, 0.32, 0.05).mul(pow(facing.oneMinus(), float(5))).mul(0.5));

function limb(group, from, to, r) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), MAT);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  group.add(mesh);
}

// A braced stance facing +x when reach is 1. Both arms push toward the other fighter. About 1.8 units tall.
function figure(reach) {
  const g = new THREE.Group();
  const f = (x) => x * reach;
  limb(g, [f(-0.05), 0.95, 0], [f(0.08), 1.42, 0], 0.17);
  limb(g, [f(-0.05), 0.92, 0.1], [f(-0.42), 0.48, 0.16], 0.075);
  limb(g, [f(-0.42), 0.48, 0.16], [f(-0.5), 0.04, 0.18], 0.065);
  limb(g, [f(-0.05), 0.92, -0.1], [f(0.32), 0.5, -0.14], 0.075);
  limb(g, [f(0.32), 0.5, -0.14], [f(0.28), 0.04, -0.16], 0.065);
  limb(g, [f(0.08), 1.5, 0.16], [f(0.52), 1.42, 0.12], 0.055);
  limb(g, [f(0.52), 1.42, 0.12], [f(0.9), 1.5, 0.04], 0.05);
  limb(g, [f(0.08), 1.5, -0.16], [f(0.5), 1.38, -0.12], 0.055);
  limb(g, [f(0.5), 1.38, -0.12], [f(0.9), 1.48, -0.04], 0.05);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), MAT);
  head.position.set(f(0.12), 1.72, 0);
  g.add(head);
  return g;
}

export function makeFigures(scene, p) {
  const defender = figure(1);
  defender.position.set(p.shieldC.value.x - 0.2, 0, 0);
  const attacker = figure(-1);
  attacker.position.set(p.nozzle.value.x + 0.95, 0.02, p.nozzle.value.z);
  scene.add(defender, attacker);
  return { defender, attacker };
}
