// Live values shared with the shaders. The sim reads them through uniforms, so tuning never rebuilds a pipeline.
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { DT } from '../config.js';

export function makeParams() {
  return {
    dt: uniform(DT),
    time: uniform(0),
    // Beam: from the attacker's hands to the shield.
    nozzle: uniform(new THREE.Vector3(9.4, 1.5, 0)),
    target: uniform(new THREE.Vector3(-1.2, 2.0, 0)),
    beamOn: uniform(1),
    beamSpeed: uniform(34),
    beamR0: uniform(0.3),
    beamR1: uniform(0.8),
    // Shield: a sphere the gas cannot enter.
    shieldC: uniform(new THREE.Vector3(-2.2, 2.0, 0)),
    shieldR: uniform(2.1),
    wrap: uniform(42),
    // Combustion.
    burnRate: uniform(2.2),
    heat: uniform(0.85),
    sootYield: uniform(1),
    expansion: uniform(1.5),
    cool: uniform(1.1),
    sootFade: uniform(0.45),
    dustFade: uniform(0.35),
    // Forces.
    buoyancy: uniform(2.8),
    weight: uniform(0),
    drag: uniform(0.7),
    wind: uniform(6),
    confine: uniform(24),
    subgrid: uniform(8),
    viscosity: uniform(0.03),
    turbulence: uniform(36),
    // Look gains. Tuned live through window.__gasfx.params.
    thickness: uniform(0.75),
    relief: uniform(0.7),
    edge: uniform(0.35),
    smokeAlbedo: uniform(0.3),
    flameBody: uniform(5),
    emitGain: uniform(8.5),
    fireOnSmoke: uniform(2.2),
    farOnSmoke: uniform(1.6),
    fireOnRock: uniform(15),
    lampOnSmoke: uniform(720),
    lampOnRock: uniform(3.2),
    // Blue key light, a lamp low on the left of the stage.
    keyPos: uniform(new THREE.Vector3(-12.5, 1.8, 1.5)),
  };
}
