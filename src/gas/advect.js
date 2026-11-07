// Gas uses MacCormack advection: a forward step, a backward step to measure the error, then a correction clamped to
// the source cells. It keeps the filaments.
// Velocity stays semi-Lagrangian on purpose. MacCormack there clamps velocity to the 8 cell corners, which leaves
// plateaus with grid aligned edges, and the gas creases along them into rectangular bricks. The smoother velocity also
// gives the thick folds: a smooth flow stretching sharp gas is what reads as viscous.
import { floor, ivec3, length, max, min, vec4 } from 'three/tsl';
import { flow, load, sample } from './grid.js';

// RK2 backtrace in uvw space. scale converts units per second to uvw per step.
function backtrace(vel, uvw, scale) {
  const v1 = sample(vel, uvw).xyz;
  const v2 = sample(vel, uvw.sub(v1.mul(scale).mul(0.5))).xyz;
  return uvw.sub(v2.mul(scale)).toVar();
}

// Same, plus swirl below the velocity grid. It grows with the local speed: fast gas tears, calm gas stays smooth.
function gasBacktrace(g, p, f, vel, uvw) {
  const scale = p.dt.div(g.size);
  const w = uvw.mul(g.size);
  const t = p.time;
  const fine = flow(f, w, 4.5, t.mul(0.09)).add(flow(f, w.zxy, 2.3, t.mul(-0.13)).mul(0.7));
  const amp = length(sample(vel, uvw).xyz).mul(0.06).add(0.15).mul(p.subgrid);
  return backtrace(vel, uvw, scale).sub(fine.mul(amp).mul(scale)).toVar();
}

function forward(g, dst, src, back) {
  return g.kernel('advectGasForward', () => { g.store(dst, sample(src, back(g.uvw()))); });
}

function correct(g, src, tmp, dst, back) {
  return g.kernel('advectGasCorrect', () => {
    const uvw = g.uvw();
    const c = g.coord();
    const from = back(uvw);
    const hat = load(tmp, c);
    const bar = sample(tmp, uvw.mul(2).sub(from));
    const fixed = hat.add(load(src, c).sub(bar).mul(0.5));
    // Clamp to the 8 cells the backtrace read, or the correction rings and creates gas from nothing.
    const base = ivec3(floor(from.mul(g.n).sub(0.5))).toVar();
    let lo = load(src, g.near(base, 0, 0, 0));
    let hi = lo;
    for (const [x, y, z] of [[1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]) {
      const v = load(src, g.near(base, x, y, z));
      lo = min(lo, v);
      hi = max(hi, v);
    }
    g.store(dst, max(min(fixed, hi), lo));
  });
}

export function advectGas(g, p, f, vel, src, tmp, dst) {
  const back = (uvw) => gasBacktrace(g, p, f, vel, uvw);
  return [forward(g, tmp, src, back), correct(g, src, tmp, dst, back)];
}

export function advectVel(g, p, src, dst) {
  return g.kernel('advectVel', () => {
    g.store(dst, vec4(sample(src, backtrace(src, g.uvw(), p.dt.div(g.size))).xyz, 0));
  });
}
