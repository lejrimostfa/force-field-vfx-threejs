# Force Field VFX in three.js

Real-time 3D fire and smoke in the browser, on three.js WebGPU. A fire jet hits a spherical shield, flames wrap around it, and the fire turns into thick smoke as it slows down and cools.

**[Open the live demo](https://lejrimostfa.github.io/force-field-vfx-threejs/)**

Needs WebGPU: a recent desktop Chrome or Edge is the safest choice. The first load compiles shaders and can take about 20 seconds.

Controls: drag or two fingers to orbit, pinch or wheel to zoom, space toggles the jet, `c` toggles the automatic camera. The sliders change the simulation live. The links under the title switch quality: `low`, `med`, `high`, `ultra`.

The look is inspired by the [Niagara force field by RedefineFX](https://x.com/RedefineFX/status/2118724452817223895). This is an independent recreation, made only with code. It uses no assets, footage or project files from the original.

## How it works

The sim is a 3D gas solver in compute shaders, written in TSL. It runs as a fixed chain of precompiled passes.

- **Two grids.** Gas runs at full resolution, velocity and pressure at half. The visible detail lives in the gas, so the pressure solve costs 8 times less.
- **Advection.** Gas uses MacCormack, which keeps filaments sharp. Velocity stays semi-Lagrangian: MacCormack there leaves plateaus with grid aligned edges, and the gas creases into rectangular bricks. The smoother flow also gives the thick folds.
- **Wind and push.** Air relaxes toward a steady wind along the jet. Gas that lags behind it or flows back is driven forward, also after the impact, so the fire wraps the shield and nothing returns toward the shooter.
- **Turbulence.** Divergence-free noise, baked once from random waves. It swirls the gas instead of compressing it, and it has no lattice to print into the image.
- **Smoke comes from fire.** Gas that slows down loses heat faster, and the heat it loses turns into soot. The fast jet stays clean by itself.
- **Light.** There are no three.js lights. Each frame the fire feeds low resolution light volumes through diffusion. Smoke, floor and cliff all read them.
- **Rendering.** A raymarch in compute, then a temporal filter and bloom. Thick fire is compressed along its own color, so it stays orange instead of turning white.

## Run it locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5199/?q=high`.
