// Keys to events. main.js listens on the bus, so nothing here knows about the sim.
import { bus } from './events.js';

export function mountInput() {
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') bus.emit('beamToggled', {});
    if (e.code === 'KeyC') bus.emit('orbitToggled', {});
  });
}
