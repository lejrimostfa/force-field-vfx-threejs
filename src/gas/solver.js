// One simulation step, as a fixed chain of precompiled compute passes. Gas runs at full resolution. Velocity and
// pressure run at half, so the solve costs 8 times less: the visible detail lives in the gas, not in the pressure.
// The chain starts and ends on index 0 of each pair, so no field swaps and no bind group is rebuilt.
//   gas: advect, correct, sources.  velocity: advect, sources, curl, confine, divergence, jacobi x N, project.
import { makeGrid } from './grid.js';
import { advectGas, advectVel } from './advect.js';
import { gasSources, velSources } from './sources.js';
import { confine, curl } from './forces.js';
import { divergence, jacobi, project } from './project.js';

export function makeSolver(renderer, quality, f, p) {
  const g = makeGrid(quality.res);
  const v = makeGrid(quality.res.map((n) => n / 2));
  const { vel, gas, prs, gasTmp } = f;
  const gasPasses = [
    ...advectGas(g, p, f, vel[0], gas[0], gasTmp, gas[1]),
    gasSources(g, p, f, gas[1], gas[0]),
  ];
  const velPasses = [
    advectVel(v, p, vel[0], vel[1]),
    velSources(v, p, f, gas[0], vel[1], vel[0]),
    curl(v, vel[0], f.curl),
    confine(v, p, f, f.curl, gas[0], vel[0], vel[1]),
    divergence(v, p, vel[1], prs[0], prs[1]),
  ];
  const odd = jacobi(v, prs[1], prs[0]);
  const even = jacobi(v, prs[0], prs[1]);
  for (let i = 0; i < quality.jacobi; i += 2) velPasses.push(odd, even);
  // The loop leaves the newest pressure in prs[1]. One more pass brings it to prs[0] for project and the next warm start.
  velPasses.push(odd, project(v, vel[1], prs[0], vel[0]));
  const passes = [...gasPasses, ...velPasses];
  return { grid: g, velGrid: v, gasPasses, velPasses, passes, step: () => renderer.compute(passes) };
}
