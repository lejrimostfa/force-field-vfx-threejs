// How gas looks. The raymarch, the light field and the sparks all share these, so fire reads the same everywhere.
import { Fn, float, max, mix, pow, smoothstep, vec3 } from 'three/tsl';

// What the eye reads as smoke. Soot is dense, dust is thin.
export const smokeDensity = (s) => s.y.mul(1.9).add(s.z.mul(0.7));

// Extinction per unit length for the light fields. Hot gas stays nearly clear.
export const extinction = (s) => s.y.mul(1.9).add(s.z.mul(0.7)).add(s.x.mul(0.4));

// Soft ceiling on the light fields. Far light keeps its value, the light right next to the flames stops at a glow.
export const softLight = (c) => c.div(c.x.mul(1.6).add(1));

// Temperature to HDR emission. Red rims, then orange through most of the fire. White is kept for the hottest core.
export const fireColor = Fn(([T]) => {
  const red = vec3(1.0, 0.03, 0.015);
  const orange = vec3(1.0, 0.2, 0.015);
  const yellow = vec3(1.0, 0.42, 0.05);
  const white = vec3(1.0, 0.72, 0.32);
  const c = mix(mix(mix(red, orange, smoothstep(0.16, 0.5, T)), yellow, smoothstep(0.75, 1.25, T)), white, smoothstep(1.4, 2.1, T));
  return c.mul(pow(max(T.sub(0.2), float(0)), float(1.9)));
});

// Compresses bright light along its own colour. ACES alone pushes thick fire to cream white, because every channel
// saturates. Dividing all three by the peak keeps the orange ratio through any depth of flames.
export const holdHue = (c) => c.div(max(max(c.x, c.y), c.z).mul(0.22).add(1));
