// Two low resolution light fields, rebuilt each frame from the gas. Smoke, ground and cliff all read them.
//   light: fire irradiance near the flames. Emission spreads by diffusion and dims through soot.
//   lightFar: the same light across the stage. Diffusion only travels one cell per pass and a loss of l per pass
//     limits its reach to about h * sqrt(1 / (6 * l)) units. So long range needs big cells and a tiny loss, and
//     this field runs at an eighth of the gas resolution. Its gradient gives the direction of the fire, so normal
//     maps react to the flames with no shadow pass.
//   keyT: transmittance toward the blue lamp. A short ray per cell gives smoke its billow shading.
import { Loop, exp, float, normalize, select, vec3, vec4 } from 'three/tsl';
import { makeGrid, load, sample } from './grid.js';
import { extinction, fireColor } from '../render/optics.js';

// The light fire throws on things is a pure orange: summing white-hot emission here would wash the whole stage out.
const FIRE_TINT = vec3(1, 0.3, 0.045);

export function makeLightPasses(renderer, q, f, p) {
  const quarter = makeGrid(q.res.map((v) => v / 4));
  const half = makeGrid(q.res.map((v) => v / 2));
  const eighth = makeGrid(q.res.map((v) => v / 8));
  const size = quarter.size, lo = quarter.lo;

  const diffuse = (src, dst) => quarter.kernel('lightDiffuse', () => {
    const c = quarter.coord();
    const s = sample(f.gas[0], quarter.uvw());
    const near = (x, y, z) => load(src, quarter.near(c, x, y, z)).xyz;
    const avg = near(1, 0, 0).add(near(-1, 0, 0)).add(near(0, 1, 0)).add(near(0, -1, 0))
      .add(near(0, 0, 1)).add(near(0, 0, -1)).div(6);
    const dim = exp(extinction(s).mul(quarter.h).mul(0.1).negate());
    quarter.store(dst, vec4(FIRE_TINT.mul(fireColor(s.x).x).mul(0.2).add(avg.mul(dim).mul(0.992)), 1));
  });

  const key = half.kernel('keyShadow', () => {
    const w = half.world().toVar();
    const dir = normalize(p.keyPos.sub(w)).toVar();
    const STEP = 0.42;
    const tau = float(0).toVar();
    Loop(14, ({ i }) => {
      const at = w.add(dir.mul(float(i).add(0.7).mul(STEP)));
      tau.addAssign(extinction(sample(f.gas[0], at.sub(lo).div(size))));
    });
    half.store(f.keyT, vec4(exp(tau.mul(STEP).mul(1.7).negate()), 0, 0, 1));
  });

  const spread = (src, dst) => eighth.kernel('lightFar', () => {
    const c = eighth.coord();
    // Past an open face a neighbour reads as dimmer than this cell. Clamped edges would bounce the light back and
    // fill the whole box evenly. The floor stays reflective: y below 0 is not an open face.
    const me = load(src, c).xyz;
    const face = (x, y, z, edge) => select(edge, me.mul(0.6), load(src, eighth.near(c, x, y, z)).xyz);
    const top = eighth.res.map((n) => n - 1);
    const avg = face(1, 0, 0, c.x.equal(top[0])).add(face(-1, 0, 0, c.x.equal(0)))
      .add(face(0, 1, 0, c.y.equal(top[1]))).add(load(src, eighth.near(c, 0, -1, 0)).xyz)
      .add(face(0, 0, 1, c.z.equal(top[2]))).add(face(0, 0, -1, c.z.equal(0))).div(6);
    eighth.store(dst, vec4(sample(f.light[0], eighth.uvw()).xyz.mul(0.02).add(avg.mul(0.995)), 1));
  });

  const passes = [key];
  const a = diffuse(f.light[0], f.light[1]);
  const b = diffuse(f.light[1], f.light[0]);
  for (let i = 0; i < 6; i++) passes.push(a, b);
  const c = spread(f.lightFar[0], f.lightFar[1]);
  const d = spread(f.lightFar[1], f.lightFar[0]);
  for (let i = 0; i < 6; i++) passes.push(c, d);
  return { passes, step: () => renderer.compute(passes) };
}
