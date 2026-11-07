// Grid helpers shared by every kernel. A kernel runs once per cell through a 3D dispatch, so globalId is the cell index.
// Res values must be multiples of 4: the workgroup is 4x4x4 and a partial group would write past the texture edge.
import { Fn, clamp, computeKernel, globalId, ivec3, texture3D, texture3DLoad, textureStore, uvec3, vec3 } from 'three/tsl';
import { WORLD } from '../config.js';

const WG = 4;

export function makeGrid(res) {
  const [nx, ny, nz] = res;
  const n = vec3(nx, ny, nz);
  const top = ivec3(nx - 1, ny - 1, nz - 1);
  const size = vec3(...WORLD.size);
  const lo = vec3(...WORLD.min);
  const dispatchSize = res.map((v) => Math.ceil(v / WG));
  const uvw = () => vec3(globalId).add(0.5).div(n);
  return {
    res, n, top, size, lo,
    h: WORLD.size[0] / nx,
    cells: nx * ny * nz,
    coord: () => ivec3(globalId),
    uvw,
    world: () => uvw().mul(size).add(lo),
    near: (c, x, y, z) => clamp(c.add(ivec3(x, y, z)), ivec3(0), top),
    store: (tex, value) => textureStore(tex, uvec3(globalId), value).toWriteOnly(),
    kernel(name, body) {
      const k = computeKernel(Fn(body)(), [WG, WG, WG]);
      k.setName(name);
      k.dispatchSize = dispatchSize;
      return k;
    },
  };
}

export const load = (tex, coord) => texture3DLoad(tex, coord).toVar();
export const sample = (tex, uvw) => texture3D(tex, uvw).level(0);

// Divergence-free swirl, about -1 to 1, repeating every `period` units. shift scrolls it over time.
export const flow = (f, w, period, shift) => sample(f.flow, w.div(period).add(shift)).xyz.mul(2).sub(1);
