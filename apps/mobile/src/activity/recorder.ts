/**
 * Activity recorder — where prepared in-app events are collected for a FUTURE
 * activity feed. It stores events locally (idempotently, newest-first, capped) and
 * sends nothing. A push service would be a different implementation of the same
 * interface; today the KV recorder simply accumulates what a feed would show.
 */
import type { JsonStore } from "../data/storage";
import { StorageKeys } from "../data/storage";
import type { ActivityEvent } from "./events";

const MAX_EVENTS = 200;

export interface ActivityRecorder {
  /** Persist events, ignoring any whose deterministic id was already recorded. */
  record(events: ActivityEvent[]): Promise<void>;
  /** The recorded activity feed, newest first. */
  list(): Promise<ActivityEvent[]>;
}

/** Discards everything — the default when no feed is wired. */
export class NoopActivityRecorder implements ActivityRecorder {
  async record(_events: ActivityEvent[]): Promise<void> {
    void _events; // intentionally does nothing (no in-app feed, no push)
  }
  async list(): Promise<ActivityEvent[]> {
    return [];
  }
}

/** Local, idempotent, capped recorder backed by the demo/app key-value store. */
export class KvActivityRecorder implements ActivityRecorder {
  constructor(private readonly store: JsonStore) {}

  async record(events: ActivityEvent[]): Promise<void> {
    if (events.length === 0) return;
    const existing = await this.store.read<ActivityEvent[]>(StorageKeys.activityEvents, []);
    const seen = new Set(existing.map((e) => e.id));
    const fresh = events.filter((e) => !seen.has(e.id));
    if (fresh.length === 0) return;
    const merged = [...fresh, ...existing].slice(0, MAX_EVENTS);
    await this.store.write(StorageKeys.activityEvents, merged);
  }

  async list(): Promise<ActivityEvent[]> {
    return this.store.read<ActivityEvent[]>(StorageKeys.activityEvents, []);
  }
}
