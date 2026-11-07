// Rock height and normal map baked on the CPU at startup, so it gets real mipmaps. Tiles on both axes.
import * as THREE from 'three/webgpu';

function tileNoise(size, cells, seed) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) >>> 8) / 16777216;
  const grid = new Float32Array(cells * cells).map(rnd);
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = smooth(fx - ix), ty = smooth(fy - iy);
    const at = (i, j) => grid[((j % cells) * cells + (i % cells)) | 0];
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
    return a + (b - a) * ty;
  };
}

export function bakeRock(size = 1024) {
  const octaves = [[6, 0.7, 3], [14, 0.55, 5], [32, 0.34, 7], [76, 0.22, 11], [170, 0.14, 13], [340, 0.07, 17]].map(([c, a, s]) => [tileNoise(size, c, s), a]);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0;
      octaves.forEach(([n, a], i) => {
        // Tile-safe warp: sine terms with whole periods. It breaks up the square lattice of the value noise.
        const wx = (x + size + 22 * Math.sin((6 * Math.PI * y) / size)) % size;
        const wy = (y + size + 22 * Math.sin((4 * Math.PI * x) / size)) % size;
        const v = n(wx, wy);
        h += a * (i === 1 ? 1 - Math.abs(2 * v - 1) : v); // ridged at large scale, grain at small scale
      });
      height[y * size + x] = h;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  const strength = 15;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), o = (y * size + x) * 4;
      data[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      data[o + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      data[o + 2] = (1 / l) * 0.5 * 255 + 127;
      data[o + 3] = Math.min(255, (at(x, y) / 1.5) * 255);
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
