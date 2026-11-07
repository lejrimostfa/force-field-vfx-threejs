// GPU sparks. They spawn around the impact, ride the gas velocity with some inertia, fall and bounce on the floor.
// Drawn as quads stretched along their screen motion, so they read as streaks.
import * as THREE from 'three/webgpu';
import { Fn, If, cameraProjectionMatrix, cameraViewMatrix, dot, float, hash, instanceIndex, length, max, min, mix, normalize, positionGeometry, storage, texture3D, vec2, vec3, vec4 } from 'three/tsl';
import { WORLD } from '../config.js';

export function makeSparks(renderer, scene, f, p, count = 1000) {
  // Staggered first lives, parked under the floor: they enter one by one instead of all bursting on frame 0.
  const start = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    start[i * 4 + 1] = -10;
    start[i * 4 + 3] = (i / count) * 2.3;
  }
  const posAttr = new THREE.StorageInstancedBufferAttribute(start, 4);
  const velAttr = new THREE.StorageInstancedBufferAttribute(new Float32Array(count * 4), 4);
  const pos = storage(posAttr, 'vec4', count);
  const vel = storage(velAttr, 'vec4', count);
  const lo = vec3(...WORLD.min), size = vec3(...WORLD.size);

  const update = Fn(() => {
    const i = instanceIndex;
    const P = pos.element(i).toVar();
    const V = vel.element(i).toVar();
    P.w.subAssign(p.dt);
    If(P.w.lessThanEqual(0), () => {
      const seed = float(i).add(p.time.mul(61.7));
      const rnd = vec3(hash(seed), hash(seed.add(13.1)), hash(seed.add(29.3))).sub(0.5).mul(2).toVar();
      const front = normalize(rnd.add(vec3(1.2, 0, 0)));
      P.assign(vec4(p.shieldC.add(front.mul(p.shieldR.add(0.15))), hash(seed.add(47.7)).mul(1.8).add(0.5)));
      V.assign(vec4(front.mul(7).add(rnd.mul(5)).add(vec3(0, 2, 0)), hash(seed.add(3.3))));
      If(p.beamOn.lessThan(0.5), () => { P.y.assign(-10); });
    }).Else(() => {
      const uvw = P.xyz.sub(lo).div(size);
      const air = texture3D(f.vel[0], uvw).level(0).xyz;
      const v = mix(V.xyz, air, p.dt.mul(1.6)).add(vec3(0, -7, 0).mul(p.dt)).toVar();
      P.xyz.addAssign(v.mul(p.dt));
      If(P.y.lessThan(0.04), () => { P.y.assign(0.04); v.y.assign(v.y.abs().mul(0.35)); });
      If(P.z.lessThan(WORLD.min[2] + 0.1), () => { v.z.assign(v.z.abs().mul(0.3)); });
      const off = P.xyz.sub(p.shieldC).toVar();
      const d = length(off).toVar();
      If(d.lessThan(p.shieldR), () => {
        const n = off.div(max(d, 0.001));
        P.xyz.assign(p.shieldC.add(n.mul(p.shieldR)));
        v.subAssign(n.mul(min(dot(v, n), 0)).mul(1.5));
      });
      V.xyz.assign(v);
    });
    pos.element(i).assign(P);
    vel.element(i).assign(V);
  });
  const kernel = update().compute(count);
  kernel.setName('sparks');

  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const P = pos.element(instanceIndex), V = vel.element(instanceIndex);
  const heat = P.w.div(1.2).clamp(0, 1);
  const clipOf = (w) => cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(w, 1));
  mat.vertexNode = Fn(() => {
    const a = clipOf(P.xyz), b = clipOf(P.xyz.sub(V.xyz.mul(0.028)));
    const along = positionGeometry.x.add(0.5);
    const clip = mix(a, b, along).toVar();
    const na = a.xy.div(a.w), nb = b.xy.div(b.w);
    const d = nb.sub(na);
    const dir = d.div(max(length(d), 0.0001));
    const side = vec2(dir.y.negate(), dir.x).mul(positionGeometry.y).mul(0.0024).mul(V.w.mul(0.6).add(0.6));
    clip.xy.addAssign(side.mul(clip.w));
    return clip;
  })();
  mat.colorNode = vec3(1, 0.42, 0.1).mul(heat.mul(heat).mul(16).add(0.6));
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, count);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { step: () => renderer.compute(kernel) };
}
