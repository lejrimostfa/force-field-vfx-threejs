// Per-step sources, split by grid. gasSources runs at full resolution: beam, combustion, dust, shield, sponge.
// velSources runs on the half resolution velocity grid: jet, buoyancy, drag, expansion, shield skin.
// Smoke is what fire becomes. Gas that slows down loses its heat faster, and the heat it loses turns into thick black
// soot. The fast jet stays clean by itself, with no zone set by hand, and smoke grows straight out of the flames.
import { clamp, dot, exp, length, max, min, mix, normalize, smoothstep, vec3, vec4 } from 'three/tsl';
import { load, sample } from './grid.js';

// Beam: closest point on the nozzle to target segment, with a slow wobble so the jet never looks like a tube.
function beamAt(p, f, w) {
  const ab = p.target.sub(p.nozzle);
  const t = clamp(dot(w.sub(p.nozzle), ab).div(dot(ab, ab)), 0, 1).toVar();
  const wob = sample(f.noise, vec3(t.mul(0.12), p.time.mul(0.05), 0.3)).xyz.sub(0.5).mul(t).mul(1.3);
  const axis = p.nozzle.add(ab.mul(t)).add(wob);
  // The radius breathes along the jet, so flames lick off it instead of forming an even tube.
  const licks = sample(f.noise, vec3(t.mul(0.6).sub(p.time.mul(0.55)), p.time.mul(0.12), 0.5)).x.mul(1.3).add(0.35);
  const radius = mix(p.beamR0, p.beamR1, t).mul(licks).toVar();
  const core = smoothstep(radius.mul(0.3), radius, length(w.sub(axis))).oneMinus().mul(p.beamOn).toVar();
  const pulse = sample(f.noise, vec3(t.mul(0.4).sub(p.time.mul(0.4)), 0.2, 0.7)).x.mul(1.6).toVar();
  return { core, pulse, t, dir: normalize(ab) };
}

// Wind along the jet, on the ground plane. Air relaxes toward this velocity, so it settles at a steady speed.
function windAt(p) {
  const flat = p.target.sub(p.nozzle).mul(vec3(1, 0, 1));
  return normalize(flat).mul(p.wind);
}

// 0 inside the shield, 1 outside, with a soft skin.
const outside = (p, d) => smoothstep(p.shieldR.sub(0.12), p.shieldR.add(0.12), d);

// Fades to 0 near the open faces. The floor stays closed.
function spongeAt(uvw) {
  const edge = min(min(uvw.x, uvw.x.oneMinus()), min(uvw.z, min(uvw.z.oneMinus().mul(0.45), uvw.y.oneMinus())));
  return smoothstep(0, 0.09, edge);
}

export function gasSources(g, p, f, gasIn, gasOut) {
  return g.kernel('gasSources', () => {
    const w = g.world().toVar();
    const uvw = g.uvw();
    const gs = load(gasIn, g.coord());
    const T = gs.x.toVar(), soot = gs.y.toVar(), dust = gs.z.toVar(), fuel = gs.w.toVar();

    // The jet is held hot along its core and only carries fuel on its last stretch, so it stays straight and clean.
    const { core, pulse, t } = beamAt(p, f, w);
    fuel.assign(max(fuel, core.mul(pulse).mul(smoothstep(0.55, 0.9, t))));
    T.assign(max(T, core.mul(0.8).add(smoothstep(0.65, 1, core).mul(pulse).mul(1.25))));

    // Impact: the jet feeds a fire on the shield skin. The flames that wrap the sphere start here.
    const contact = p.shieldC.add(normalize(p.nozzle.sub(p.shieldC)).mul(p.shieldR.add(0.35)));
    const off = w.sub(contact);
    const gust = sample(f.noise, w.mul(0.05).add(vec3(p.time.mul(0.25), 0.6, 0.1))).x.mul(1.4);
    const flare = exp(dot(off, off).mul(-0.9)).mul(p.beamOn).mul(gust).toVar();
    fuel.assign(max(fuel, flare));
    T.assign(max(T, flare.mul(1.9)));

    const burn = min(fuel, p.burnRate.mul(p.dt).mul(smoothstep(0.1, 0.28, T))).toVar();
    fuel.subAssign(burn);
    T.addAssign(burn.mul(p.heat));

    // Speed relative to the wind: gas carried by the wind has slowed down as far as the fire is concerned.
    const air = sample(f.vel[0], uvw).xyz.sub(windAt(p)).toVar();
    const slow = smoothstep(5, 16, length(air)).oneMinus().toVar();
    const before = T.toVar();
    T.assign(T.mul(exp(p.cool.mul(slow.mul(1.2).add(1)).negate().mul(p.dt))).sub(T.mul(T).mul(T).mul(T).mul(p.dt).mul(0.4)).max(0));
    soot.addAssign(before.sub(T).mul(p.sootYield).mul(slow).mul(smoothstep(0.35, 0.95, T).oneMinus()));
    soot.mulAssign(exp(p.sootFade.negate().mul(p.dt)));
    // Dust stays a thin layer on the floor. Higher up it clears fast, or the flow fills the box with a dark curtain.
    const clearing = smoothstep(0.15, 0.9, w.y).mul(7);
    dust.mulAssign(exp(p.dustFade.add(clearing).negate().mul(p.dt)));

    // Fast air close to the floor lifts dust. The noise breaks it into streaks.
    const lift = max(length(air.xz).sub(2.5), 0).mul(exp(w.y.negate().mul(3.2)));
    dust.addAssign(lift.mul(sample(f.noise, w.mul(vec3(0.045, 0.1, 0.045))).x).mul(p.dt).mul(0.6));

    const keep = outside(p, length(w.sub(p.shieldC))).mul(spongeAt(uvw));
    const out = vec4(T, soot, dust, fuel).mul(keep);
    g.store(gasOut, vec4(min(out.xyz, vec3(4)), min(out.w, 1)));
  });
}

export function velSources(v, p, f, gasNow, velIn, velOut) {
  return v.kernel('velSources', () => {
    const w = v.world().toVar();
    const uvw = v.uvw();
    const u = load(velIn, v.coord()).xyz.toVar();
    const gs = sample(gasNow, uvw).toVar();

    const { core, dir } = beamAt(p, f, w);
    u.assign(mix(u, dir.mul(p.beamSpeed), core.mul(0.92)));

    u.y.addAssign(p.buoyancy.mul(gs.x).sub(p.weight.mul(gs.y)).mul(p.dt));
    const wind = windAt(p).toVar();
    u.assign(mix(wind, u, exp(p.drag.negate().mul(p.dt))));
    // One-way push. Whatever lags behind the wind or flows back at the shooter is driven forward, also after the
    // collision: the blast against the shield would otherwise send flames back along the jet. Faster gas is left alone.
    const ahead = normalize(wind).toVar();
    const lag = max(p.wind.sub(dot(u, ahead)), 0);
    u.addAssign(ahead.mul(lag).mul(exp(p.push.negate().mul(p.dt)).oneMinus()));

    const toC = w.sub(p.shieldC).toVar();
    const d = length(toC).toVar();
    const nrm = toC.div(max(d, 0.001));
    const skin = smoothstep(p.shieldR, p.shieldR.add(0.5), d).oneMinus();
    u.subAssign(nrm.mul(min(dot(u, nrm), 0)).mul(skin));
    // Art direction: a light pull toward the skin keeps the flames wrapped around the sphere past its equator.
    u.subAssign(nrm.mul(skin).mul(p.wrap).mul(p.dt));
    // The open faces relax to the wind, not to zero: a still border would block the flow at the box entrance.
    u.assign(mix(wind, u, spongeAt(uvw).mul(0.15).add(0.85)));
    const keep = outside(p, d);

    // Burning gas pushes outward. Same rate as gasSources, read back from the fuel and temperature here.
    const burn = min(gs.w.div(p.dt), p.burnRate.mul(smoothstep(0.1, 0.28, gs.x)));
    // Keep the step under 6 gas cells so advection stays stable when the jet slams the shield.
    const vmax = (v.h / 2) * 6 * 60;
    const speed = max(length(u), 0.001);
    v.store(velOut, vec4(u.mul(min(speed, vmax).div(speed)).mul(keep), burn.mul(p.expansion).mul(keep)));
  });
}
