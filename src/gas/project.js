// Pressure projection: makes the velocity divergence free, so gas swirls instead of compressing.
// The solver works in world units. A solid neighbour reflects pressure and contributes zero velocity, which gives
// free slip on the shield. The floor is solid too. Other faces are open: pressure there is 0.
import { float, length, select, vec3, vec4 } from 'three/tsl';
import { load } from './grid.js';

export function divergence(g, p, velIn, prsPrev, prsOut) {
  const solidAt = (w) => length(w.sub(p.shieldC)).lessThan(p.shieldR);
  return g.kernel('divergence', () => {
    const c = g.coord();
    const w = g.world().toVar();
    const flux = (x, y, z, axis) => {
      const off = vec3(x, y, z).mul(g.h);
      const v = load(velIn, g.near(c, x, y, z));
      return select(solidAt(w.add(off)), float(0), v[axis]);
    };
    const floorV = select(c.y.equal(0), float(0), flux(0, -1, 0, 'y'));
    const div = flux(1, 0, 0, 'x').sub(flux(-1, 0, 0, 'x'))
      .add(flux(0, 1, 0, 'y')).sub(floorV)
      .add(flux(0, 0, 1, 'z')).sub(flux(0, 0, -1, 'z')).div(2 * g.h)
      .sub(load(velIn, c).w);
    // Warm start: last step's pressure is a good first guess for a slowly changing flow.
    g.store(prsOut, vec4(load(prsPrev, c).x.mul(0.96), div, select(solidAt(w), float(1), float(0)), 0));
  });
}

export function jacobi(g, src, dst) {
  return g.kernel('jacobi', () => {
    const c = g.coord();
    const me = load(src, c);
    const open = (x, y, z, border) => {
      const n = load(src, g.near(c, x, y, z));
      const inner = select(n.z.greaterThan(0.5), me.x, n.x);
      return select(border, float(0), inner);
    };
    const xLo = open(-1, 0, 0, c.x.equal(0));
    const xHi = open(1, 0, 0, c.x.equal(g.res[0] - 1));
    const yLo = select(c.y.equal(0), me.x, open(0, -1, 0, c.y.lessThan(0)));
    const yHi = open(0, 1, 0, c.y.equal(g.res[1] - 1));
    const zLo = open(0, 0, -1, c.z.equal(0));
    const zHi = open(0, 0, 1, c.z.equal(g.res[2] - 1));
    const p = xLo.add(xHi).add(yLo).add(yHi).add(zLo).add(zHi).sub(me.y.mul(g.h * g.h)).div(6);
    g.store(dst, vec4(p, me.y, me.z, 0));
  });
}

export function project(g, velIn, prs, dst) {
  return g.kernel('project', () => {
    const c = g.coord();
    const me = load(prs, c);
    const grad = (x, y, z, keepFloor) => {
      const a = load(prs, g.near(c, x, y, z));
      const b = load(prs, g.near(c, -x, -y, -z));
      const pa = select(a.z.greaterThan(0.5), me.x, a.x);
      const pb = select(b.z.greaterThan(0.5).or(keepFloor), me.x, b.x);
      return pa.sub(pb);
    };
    const never = c.x.lessThan(0);
    const g3 = vec3(grad(1, 0, 0, never), grad(0, 1, 0, c.y.equal(0)), grad(0, 0, 1, never)).div(2 * g.h);
    const v = load(velIn, c);
    const out = v.xyz.sub(g3).mul(float(1).sub(me.z));
    // Fluid can never push through the floor.
    const y = select(c.y.equal(0), out.y.max(0), out.y);
    g.store(dst, vec4(out.x, y, out.z, 0));
  });
}
