// Divergence-free noise, baked at startup into a 3D texture. It sums random waves v = a cos(2 pi k.x + phase) with a
// perpendicular to k, so every wave and their sum has zero divergence: it swirls gas without compressing it into fuzz.
// Integer wave vectors make it tile, and there is no lattice to print ribs into the gas. Amplitudes follow a
// Kolmogorov slope, so large eddies carry the energy and small ones add folds.
import * as THREE from 'three/webgpu';

export function bakeFlow(size = 48, modes = 64) {
  let seed = 777;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) >>> 8) / 16777216;
  const waves = [];
  while (waves.length < modes) {
    const k = [Math.round(rnd() * 20 - 10), Math.round(rnd() * 20 - 10), Math.round(rnd() * 20 - 10)];
    const len = Math.hypot(...k);
    if (len < 2 || len > 10) continue;
    const r = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
    const a = [k[1] * r[2] - k[2] * r[1], k[2] * r[0] - k[0] * r[2], k[0] * r[1] - k[1] * r[0]];
    const norm = Math.hypot(...a) || 1;
    const gain = len ** (-5 / 6) / norm;
    waves.push({ k, a: a.map((v) => v * gain), phase: rnd() * Math.PI * 2 });
  }
  const field = new Float32Array(size * size * size * 3);
  let peak = 0;
  for (let z = 0, o = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++, o += 3) {
        let vx = 0, vy = 0, vz = 0;
        for (const { k, a, phase } of waves) {
          const c = Math.cos(((k[0] * x + k[1] * y + k[2] * z) / size) * Math.PI * 2 + phase);
          vx += a[0] * c; vy += a[1] * c; vz += a[2] * c;
        }
        field[o] = vx; field[o + 1] = vy; field[o + 2] = vz;
        peak = Math.max(peak, Math.abs(vx), Math.abs(vy), Math.abs(vz));
      }
    }
  }
  const data = new Uint8Array(size * size * size * 4);
  for (let i = 0; i < size * size * size; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = (field[i * 3 + c] / peak) * 127.5 + 127.5;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, size, size, size);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
