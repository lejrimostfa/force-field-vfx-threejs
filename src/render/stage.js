// Floor and cliff. Their light comes straight from the gas fields: the fire field for colour and direction, the key
// transmittance for smoke shadow on the lamp pool. No three.js lights are used, so the cost is one material.
import * as THREE from 'three/webgpu';
import { abs, cameraPosition, clamp, dot, exp, float, length, max, mix, normalize, pow, positionWorld, smoothstep, texture, texture3D, vec2, vec3 } from 'three/tsl';
import { WORLD } from '../config.js';
import { softLight } from './optics.js';
import { bakeRock } from './rock.js';

function rockMaterial(f, p, map, axisOf, flatness) {
  const m = new THREE.MeshBasicNodeMaterial();
  const pw = positionWorld;
  const lo = vec3(...WORLD.min), size = vec3(...WORLD.size);
  const { uv, tangentToWorld } = axisOf(pw);
  const tex = texture(map, uv.mul(0.21));
  const fine = texture(map, uv.mul(0.83));
  const nA = tex.xyz.mul(2).sub(1), nB = fine.xyz.mul(2).sub(1);
  const N = normalize(tangentToWorld(vec3(nA.x.add(nB.x.mul(0.6)), nA.y.add(nB.y.mul(0.6)), flatness))).toVar();
  const albedo = mix(vec3(0.1, 0.085, 0.075), vec3(0.2, 0.17, 0.145), tex.w).toVar();

  // Fire light. The field gradient points at the flames.
  // Past the box, the edge value keeps falling with distance, so the light has no border on the floor.
  const inBox = clamp(pw, lo, lo.add(size)).toVar();
  const past = length(pw.sub(inBox));
  const uvw = inBox.sub(lo).div(size).toVar();
  const near = texture3D(f.light[0], uvw).level(0).xyz;
  const fire = softLight(near.add(texture3D(f.lightFar[0], uvw).level(0).xyz)).div(past.mul(past).mul(0.05).add(1)).toVar();
  const lum = (o) => dot(texture3D(f.lightFar[0], uvw.add(o)).level(0).xyz, vec3(0.3, 0.6, 0.1));
  const e = 0.05;
  const grad = vec3(lum(vec3(e, 0, 0)).sub(lum(vec3(-e, 0, 0))), lum(vec3(0, e * 2, 0)).sub(lum(vec3(0, -e * 2, 0))), lum(vec3(0, 0, e * 2)).sub(lum(vec3(0, 0, -e * 2)))).toVar();
  // The gradient tilts the surface normal instead of replacing it. Used alone it flips under the light's peak and
  // draws a seam on the floor.
  const toFire = normalize(grad.div(lum(vec3(0)).add(0.002)).mul(0.35).add(tangentToWorld(vec3(0, 0, 1)))).toVar();
  const fireDiff = max(dot(N, toFire).mul(0.75).add(0.25), 0);
  const view = normalize(cameraPosition.sub(pw)).toVar();
  const spec = pow(max(dot(N, normalize(toFire.add(view))), 0), float(36)).mul(0.5);

  // Blue lamp, with smoke shadow from the key field.
  const toKey = p.keyPos.sub(pw).toVar();
  const d2 = dot(toKey, toKey);
  const K = normalize(toKey);
  const shade = texture3D(f.keyT, uvw).level(0).x;
  const lamp = vec3(0.03, 0.2, 1.0).mul(max(dot(N, K), 0)).mul(shade).mul(p.lampOnRock).mul(exp(d2.div(-70)));
  // Art direction: the lamp falls off fast and its pool pushes the orange back, so the two colours keep their sides.
  const cold = smoothstep(0.2, 0.9, shade.mul(exp(d2.div(-70))));
  const lampSpec = pow(max(dot(N, normalize(K.add(view))), 0), float(30)).mul(shade).mul(8).div(d2.add(50));

  m.colorNode = albedo.mul(fire.mul(p.fireOnRock).mul(fireDiff).mul(cold.oneMinus().mul(0.85).add(0.15)).add(lamp)).add(fire.mul(spec).mul(p.fireOnRock).mul(0.08)).add(vec3(0.03, 0.2, 1).mul(lampSpec)).add(vec3(0.003, 0.004, 0.008));
  return m;
}

export function makeStage(scene, f, p) {
  const map = bakeRock();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), rockMaterial(f, p, map, (pw) => ({
    uv: pw.xz, tangentToWorld: (n) => vec3(n.x, n.z, n.y),
  }), 2.2));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const wallGeo = new THREE.PlaneGeometry(90, 40, 1, 1);
  const wall = new THREE.Mesh(wallGeo, rockMaterial(f, p, map, (pw) => ({
    uv: pw.xy.mul(vec2(0.9, 3.1)), tangentToWorld: (n) => vec3(n.x, n.y, n.z),
  }), 4));
  wall.position.set(0, 20, WORLD.min[2]);
  scene.add(wall);
  return { floor, wall };
}
