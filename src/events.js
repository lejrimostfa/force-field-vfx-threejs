// The app's event bus. The sim loop and the renderer emit here. The HUD only listens.
//   statsUpdated: { fps, gpuMs, cpuMs, frame, cells }   sent about twice a second by main.js
//   fxFailed: { message }                               a GPU validation error, the HUD shows it
//   beamToggled, orbitToggled: {}                       sent by input.js, handled in main.js
//   paramsReady: { params }                             start values, the HUD reads them once
//   paramChanged: { name, value }                       sent by a HUD slider, applied in main.js
import { EventBus } from './eventBus.ts';

export const bus = new EventBus();
