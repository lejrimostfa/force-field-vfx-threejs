// Keyboard and camera gestures to events. main.js listens on the bus, so nothing here knows about the sim.
// OrbitControls reads a two finger swipe as a mouse wheel and zooms. On a trackpad people expect it to orbit, so the
// wheel listener below runs first and takes those events. Pinch and a real mouse wheel still reach OrbitControls.
import * as THREE from 'three/webgpu';
import { bus } from './events.js';

const SPIN = 0.0035;

// A pinch arrives as wheel plus ctrl. A mouse wheel moves one axis by whole, large steps. The rest is a trackpad swipe.
const isSwipe = (e) => !e.ctrlKey && (e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 40);

export function mountInput(controls, camera, surface) {
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); bus.emit('beamToggled', {}); }
    if (e.code === 'KeyC') bus.emit('orbitToggled', {});
  });
  const offset = new THREE.Vector3();
  const round = new THREE.Spherical();
  surface.addEventListener('wheel', (e) => {
    bus.emit('cameraGrabbed', {});
    if (!isSwipe(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    offset.copy(camera.position).sub(controls.target);
    round.setFromVector3(offset);
    round.theta += e.deltaX * SPIN;
    round.phi = THREE.MathUtils.clamp(round.phi + e.deltaY * SPIN, controls.minPolarAngle + 0.01, controls.maxPolarAngle);
    camera.position.copy(controls.target).add(offset.setFromSpherical(round));
    controls.update();
  }, { capture: true, passive: false });
  controls.addEventListener('start', () => bus.emit('cameraGrabbed', {}));
}
