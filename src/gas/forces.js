// Vorticity confinement in two passes (curl, then the force from its gradient), then turbulence and viscosity.
// Turbulence is divergence free and scales with heat and speed. Viscosity is the real term, nu laplacian(v), solved
// with one explicit step. Hot gas is more viscous than cold gas, which gives flames thick rolling folds.
import { clamp, cross, length, max, mix, vec3, vec4 } from 'three/tsl';
import { flow, load, sample } from './grid.js';

export function curl(g, velIn, dst) {
  return g.kernel('curl', () => {
    const c = g.coord();
    const [x0, x1] = [load(velIn, g.near(c, -1, 0, 0)), load(velIn, g.near(c, 1, 0, 0))];
    const [y0, y1] = [load(velIn, g.near(c, 0, -1, 0)), load(velIn, g.near(c, 0, 1, 0))];
    const [z0, z1] = [load(velIn, g.near(c, 0, 0, -1)), load(velIn, g.near(c, 0, 0, 1))];
    const w = vec3(
      y1.z.sub(y0.z).sub(z1.y.sub(z0.y)),
      z1.x.sub(z0.x).sub(x1.z.sub(x0.z)),
      x1.y.sub(x0.y).sub(y1.x.sub(y0.x)),
    ).div(2 * g.h).toVar();
    g.store(dst, vec4(w, length(w)));
  });
}

export function confine(g, p, f, curlTex, gasNow, velIn, dst) {
  return g.kernel('confine', () => {
    const c = g.coord();
    const wv = load(curlTex, c);
    const grad = vec3(
      load(curlTex, g.near(c, 1, 0, 0)).w.sub(load(curlTex, g.near(c, -1, 0, 0)).w),
      load(curlTex, g.near(c, 0, 1, 0)).w.sub(load(curlTex, g.near(c, 0, -1, 0)).w),
      load(curlTex, g.near(c, 0, 0, 1)).w.sub(load(curlTex, g.near(c, 0, 0, -1)).w),
    ).toVar();
    const N = grad.div(max(length(grad), 0.0001));
    const force = cross(N, wv.xyz).mul(p.confine).mul(g.h);

    // Sampled in uvw, never by cell index: gas and velocity have different grids.
    const gs = sample(gasNow, g.uvw());
    const v = load(velIn, c);
    const w = g.world();
    const t = p.time;
    const eddies = flow(f, w, 16, vec3(0, t.mul(-0.05), t.mul(0.03))).add(flow(f, w.yzx, 9, vec3(t.mul(0.07), 0, t.mul(-0.04))).mul(0.7));
    const stir = gs.x.add(gs.y.mul(0.3)).add(length(v.xyz).mul(0.04));
    const shred = eddies.mul(stir).mul(p.turbulence);

    const near = (x, y, z) => load(velIn, g.near(c, x, y, z)).xyz;
    const avg = near(1, 0, 0).add(near(-1, 0, 0)).add(near(0, 1, 0)).add(near(0, -1, 0)).add(near(0, 0, 1)).add(near(0, 0, -1)).div(6);
    const nu = p.viscosity.mul(gs.x.mul(2).add(1));
    const blend = clamp(nu.mul(p.dt).mul(6 / (g.h * g.h)), 0, 0.8);
    g.store(dst, vec4(mix(v.xyz, avg, blend).add(force.add(shred).mul(p.dt)), v.w));
  });
}
