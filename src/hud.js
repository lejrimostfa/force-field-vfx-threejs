// Corner read-out and sliders. The HUD only talks to the bus: it listens for stats and emits paramChanged.
import { bus } from './events.js';

function mountSliders(tunables, params) {
  const panel = document.getElementById('tune');
  for (const { name, label, max } of tunables) {
    const row = document.createElement('label');
    const text = document.createElement('span');
    const input = Object.assign(document.createElement('input'), { type: 'range', min: 0, max, step: max / 200 });
    input.value = params[name].value;
    const show = () => { text.textContent = `${label} ${Number(input.value).toFixed(max < 1 ? 3 : 1)}`; };
    input.addEventListener('input', () => {
      show();
      bus.emit('paramChanged', { name, value: Number(input.value) });
    });
    show();
    row.append(text, input);
    panel.append(row);
  }
}

export function mountHud(quality, tunables) {
  const el = document.getElementById('hud');
  const line = (s) => { el.textContent = s; };
  line(`${quality.name} ${quality.res.join('x')}  loading, the first run compiles shaders and can take 20 s`);
  const help = document.getElementById('help');
  if (help) help.textContent = 'drag: orbit   wheel: zoom   space: beam on or off   c: camera move';
  const levels = document.getElementById('levels');
  for (const name of ['low', 'med', 'high', 'ultra']) {
    const a = Object.assign(document.createElement('a'), { href: `?q=${name}`, textContent: name });
    if (name === quality.name) a.className = 'on';
    levels.append(a);
  }
  bus.on('paramsReady', ({ params }) => mountSliders(tunables, params));
  bus.on('statsUpdated', ({ fps, gpuMs, cells }) => {
    line(`${quality.name} ${quality.res.join('x')}  ${(cells / 1e6).toFixed(1)}M cells  ${fps.toFixed(0)} fps  gpu ${gpuMs.toFixed(1)} ms`);
  });
  bus.on('fxFailed', ({ message }) => { el.textContent = `GPU error: ${message}`; el.style.color = '#f66'; });
}
