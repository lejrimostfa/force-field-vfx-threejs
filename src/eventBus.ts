// Typed event bus. Every system emits here. UI, audio and HUD listen. Nothing listens by calling the logic directly.
// Source: SlowSpace src/shared/events.ts (itself from SpyArena), plus clear() from GrandFantasyTheft bus.ts.
// The game passes its own event table: `type GameEvents = { playerDied: { id: number }; ... }`.

/** Event name to payload type. Declare it as a `type`, not an `interface`, so it satisfies Record. */
export type EventMap = Record<string, unknown>;

type Handler<E extends EventMap, K extends keyof E> = (payload: E[K]) => void;
/** Listens to every event. Used by relays (network, telemetry, replay log). */
export type AnyHandler<E extends EventMap> = <K extends keyof E>(type: K, payload: E[K]) => void;

export class EventBus<E extends EventMap> {
  private readonly handlers = new Map<keyof E, Set<Handler<E, never>>>();
  /** Called after the handlers of the event itself. */
  private readonly taps = new Set<AnyHandler<E>>();

  /** Subscribes. Returns the unsubscribe function. */
  on<K extends keyof E>(type: K, handler: Handler<E, K>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<E, never>);
    return () => this.off(type, handler);
  }

  /** Subscribes for one call only. */
  once<K extends keyof E>(type: K, handler: Handler<E, K>): () => void {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof E>(type: K, handler: Handler<E, K>): void {
    this.handlers.get(type)?.delete(handler as Handler<E, never>);
  }

  /** Listens to all events. Returns the unsubscribe function. */
  onAny(handler: AnyHandler<E>): () => void {
    this.taps.add(handler);
    return () => this.taps.delete(handler);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (set) for (const handler of [...set]) (handler as Handler<E, K>)(payload);
    for (const tap of [...this.taps]) tap(type, payload);
  }

  /** Number of listeners, taps included. Tests use it to catch leaks after a restart. */
  listenerCount(type?: keyof E): number {
    if (type !== undefined) return this.handlers.get(type)?.size ?? 0;
    let n = this.taps.size;
    for (const set of this.handlers.values()) n += set.size;
    return n;
  }

  /** Drops every listener. Call it on page teardown. */
  clear(): void {
    this.handlers.clear();
    this.taps.clear();
  }
}
