// World layout and quality presets. One unit is about one metre. res is the gas grid, march the raymarch resolution scale.
// The sim box sits on the ground: y = 0 is its floor, z = -6 is the cliff.
export const WORLD = { min: [-12, 0, -6], size: [24, 12, 12] };

export const QUALITY = {
  low: { res: [128, 64, 64], jacobi: 16, steps: 48, march: 0.5 },
  med: { res: [192, 96, 96], jacobi: 24, steps: 64, march: 0.5 },
  high: { res: [256, 128, 128], jacobi: 32, steps: 96, march: 0.75 },
  ultra: { res: [320, 160, 160], jacobi: 40, steps: 128, march: 1 },
};

export const DT = 1 / 60;

// Live sliders. name is a key of makeParams() in gas/params.js.
export const TUNABLES = [
  { name: 'wind', label: 'Wind', max: 20 },
  { name: 'turbulence', label: 'Turbulence', max: 150 },
  { name: 'confine', label: 'Eddies', max: 80 },
  { name: 'subgrid', label: 'Fine tearing', max: 20 },
  { name: 'viscosity', label: 'Viscosity', max: 0.3 },
  { name: 'thickness', label: 'Smoke thickness', max: 4 },
  { name: 'sootYield', label: 'Smoke from fire', max: 4 },
];

// Reads ?q=high&paused&size=1280x720 from the URL. Defaults suit the live demo. size fixes the render resolution, so
// a capture survives the window changing size around it.
export function readOptions() {
  const u = new URLSearchParams(location.search);
  // Unknown machines start at med, phones at low. The HUD links to the other levels.
  const phone = navigator.maxTouchPoints > 0 && Math.min(innerWidth, innerHeight) < 600;
  const q = u.get('q') ?? (phone ? 'low' : 'med');
  const size = u.get('size')?.split('x').map(Number) ?? null;
  return { name: q, ...(QUALITY[q] ?? QUALITY.high), autoRun: u.get('paused') === null, size };
}
