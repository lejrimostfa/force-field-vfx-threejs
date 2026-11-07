// Raymarch of the gas into a half resolution HDR texture, in compute. rgb is the light picked up along the ray,
// a is what remains of the background. The march stops on the box faces, which are the floor and the cliff.
import * as THREE from 'three/webgpu';
import { Break, Fn, If, Loop, clamp, computeKernel, dot, exp, float, fract, globalId, ivec2, max, min, mix, normalize, smoothstep,
  texture3D, textureLoad, textureStore, uniform, uvec2, vec2, vec3, vec4 } from 'three/tsl';
import { WORLD } from '../config.js';
import { fireColor, holdHue, smokeDensity, softLight } from './optics.js';

export function makeVolume(renderer, q, f, p, width, height) {
  const target = () => {
    const t = new THREE.StorageTexture(width, height);
    t.type = THREE.HalfFloatType;
    t.format = THREE.RGBAFormat;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  };
  const raw = target(), output = target(), history = target();

  const invVP = uniform(new THREE.Matrix4());
  const eye = uniform(new THREE.Vector3());
  const frame = uniform(0);
  const lo = vec3(...WORLD.min);
  const size = vec3(...WORLD.size);
  const hi = lo.add(size);
  const keyColor = vec3(0.03, 0.2, 1.0);

  const march = Fn(() => {
    const uv = vec2(globalId.xy).add(0.5).div(vec2(width, height));
    const far = invVP.mul(vec4(uv.x.mul(2).sub(1), uv.y.mul(2).sub(1).negate(), 1, 1));
    const rd = normalize(far.xyz.div(far.w).sub(eye)).toVar();
    const inv = vec3(1).div(rd.add(vec3(0.00001)));
    const t0 = lo.sub(eye).mul(inv).toVar();
    const t1 = hi.sub(eye).mul(inv).toVar();
    const a = min(t0, t1), b = max(t0, t1);
    const tNear = max(max(max(a.x, a.y), a.z), 0).toVar();
    const tFar = min(min(b.x, b.y), b.z).toVar();
    const color = vec3(0).toVar();
    const trans = float(1).toVar();

    If(tFar.greaterThan(tNear), () => {
      const dl = tFar.sub(tNear).div(q.steps).toVar();
      // Interleaved gradient noise. The offset hides banding and the temporal pass averages it out.
      const ign = fract(dot(vec2(globalId.xy), vec2(0.06711056, 0.00583715)).mul(52.9829189).add(frame.mul(0.61803))).toVar();
      const t = tNear.add(dl.mul(ign)).toVar();
      Loop(q.steps, () => {
        const pos = eye.add(rd.mul(t)).toVar();
        const uvw = pos.sub(lo).div(size).toVar();
        const s = texture3D(f.gas[0], uvw).level(0).toVar();
        const smoke = smokeDensity(s).toVar();
        // Thin haze fades and thick gas turns solid, so the gas reads as a body with an edge. Flames are opaque too:
        // the eye sees the structure of their outer layer instead of the sum of the whole fireball.
        const sigma = smoke.mul(smoke).div(smoke.add(p.edge)).mul(p.thickness).add(smoothstep(0.12, 0.34, s.x).mul(s.x).mul(p.flameBody)).toVar();
        If(sigma.greaterThan(0.01), () => {
          // Near light is capped so smoke next to the flames does not veil them. Far light keeps its full value: smoke away
          // from the fire must match the floor below it.
          const close = softLight(texture3D(f.light[0], uvw).level(0).xyz).toVar();
          const fire = close.mul(p.fireOnSmoke).add(texture3D(f.lightFar[0], uvw).level(0).xyz.mul(p.farOnSmoke));
          // Art direction: the lamp fades out where the fire rules, so orange and blue meet without adding to lilac.
          const calm = smoothstep(0, 0.4, s.x).oneMinus().mul(close.x.mul(1.1).oneMinus().max(0));
          const toKey = p.keyPos.sub(pos);
          const dist2 = dot(toKey, toKey);
          const lamp = keyColor.mul(texture3D(f.keyT, uvw).level(0).x).mul(p.lampOnSmoke).div(dist2.add(60));
          const ambient = vec3(0.004, 0.006, 0.014);
          // Surface shading from the density gradient. It sculpts the folds the shadow field is too coarse to show.
          const rho = (o) => smokeDensity(texture3D(f.gas[0], uvw.add(o)).level(0));
          const e = 0.008;
          const slope = vec3(rho(vec3(e / 2, 0, 0)), rho(vec3(0, e, 0)), rho(vec3(0, 0, e))).sub(smoke).negate();
          const nrm = normalize(slope.add(vec3(0.0001))).toVar();
          const facing = dot(nrm, normalize(toKey)).mul(0.5).add(0.5);
          const folds = dot(nrm, normalize(eye.sub(pos))).max(0).mul(0.35).add(facing.mul(0.65)).mul(p.relief).add(p.relief.oneMinus());
          const lit = fire.add(lamp.mul(calm)).mul(folds).add(ambient).mul(p.smokeAlbedo);
          const seg = exp(sigma.mul(dl).negate()).toVar();
          color.addAssign(lit.add(fireColor(s.x).mul(p.emitGain)).mul(seg.oneMinus()).mul(trans));
          trans.mulAssign(seg);
        });
        If(trans.lessThan(0.01), () => { Break(); });
        t.addAssign(dl);
      });
    });
    textureStore(raw, uvec2(globalId.xy), vec4(holdHue(color), trans)).toWriteOnly();
  });

  const kernel = computeKernel(march(), [8, 8]);
  kernel.setName('raymarch');

  // Temporal filter. History is clamped to the 3x3 neighbourhood of the new frame, which removes the march noise
  // without ghosts. Reading history only at the same pixel also leaves a slight smear on fast flames.
  const size2 = ivec2(width - 1, height - 1);
  const resolveFn = Fn(() => {
    const c = ivec2(globalId.xy).toVar();
    const cur = textureLoad(raw, c).toVar();
    const lo = cur.toVar(), hi = cur.toVar();
    for (const [x, y] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
      const n = textureLoad(raw, clamp(c.add(ivec2(x, y)), ivec2(0), size2)).toVar();
      lo.assign(min(lo, n));
      hi.assign(max(hi, n));
    }
    textureStore(output, uvec2(globalId.xy), mix(cur, clamp(textureLoad(history, c), lo, hi), 0.55)).toWriteOnly();
  });
  const copyFn = Fn(() => {
    textureStore(history, uvec2(globalId.xy), textureLoad(output, ivec2(globalId.xy))).toWriteOnly();
  });
  const dispatch = [Math.ceil(width / 8), Math.ceil(height / 8), 1];
  const resolve = computeKernel(resolveFn(), [8, 8]);
  const copy = computeKernel(copyFn(), [8, 8]);
  kernel.dispatchSize = resolve.dispatchSize = copy.dispatchSize = dispatch;

  return {
    texture: output,
    render(camera, n) {
      camera.updateMatrixWorld();
      invVP.value.copy(camera.matrixWorld).multiply(camera.projectionMatrixInverse);
      eye.value.setFromMatrixPosition(camera.matrixWorld);
      frame.value = n % 64;
      renderer.compute([kernel, resolve, copy]);
    },
  };
}
