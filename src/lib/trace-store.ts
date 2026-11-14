import { redact } from "./redact";
import type { TraceEntry } from "./trace-types";

/**
 * Bounded, browser-side trace buffer.
 *
 * Capture is O(1) and never triggers React work by itself; subscribers (the
 * details pane, only while it is open) are notified at most every
 * NOTIFY_INTERVAL_MS so token streaming stays smooth.
 */
export const MAX_TRACE_ENTRIES = 2000;
const NOTIFY_INTERVAL_MS = 150;

type NewEntry = Omit<TraceEntry, "seq" | "ts" | "source"> & {
  source?: TraceEntry["source"];
  ts?: number;
};

class TraceStore {
  private entries: TraceEntry[] = [];
  private snapshot: TraceEntry[] = [];
  private seq = 0;
  private dropped = 0;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  add(entry: NewEntry): void {
    this.entries.push({
      ...entry,
      payload: redact(entry.payload),
      seq: ++this.seq,
      ts: entry.ts ?? Date.now(),
      source: entry.source ?? "browser",
    });
    if (this.entries.length > MAX_TRACE_ENTRIES) {
      const overflow = this.entries.length - MAX_TRACE_ENTRIES;
      this.entries.splice(0, overflow);
      this.dropped += overflow;
    }
    this.scheduleNotify();
  }

  /** Server entries keep their own seq/ts; they are merged by timestamp for display. */
  addServerEntries(entries: TraceEntry[]): void {
    for (const entry of entries) {
      this.entries.push({ ...entry, payload: redact(entry.payload) });
    }
    this.entries.sort((a, b) => a.ts - b.ts || a.seq - b.seq);
    if (this.entries.length > MAX_TRACE_ENTRIES) {
      const overflow = this.entries.length - MAX_TRACE_ENTRIES;
      this.entries.splice(0, overflow);
      this.dropped += overflow;
    }
    this.scheduleNotify();
  }

  clear(): void {
    this.entries = [];
    this.dropped = 0;
    this.scheduleNotify();
  }

  getSnapshot = (): TraceEntry[] => this.snapshot;
  getDropped = (): number => this.dropped;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    // A late subscriber must see what was captured while nobody listened.
    if (this.snapshot.length !== this.entries.length) this.snapshot = [...this.entries];
    return () => this.listeners.delete(listener);
  };

  private scheduleNotify(): void {
    if (this.listeners.size === 0 || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.snapshot = [...this.entries];
      for (const listener of this.listeners) listener();
    }, NOTIFY_INTERVAL_MS);
  }
}

export const traceStore = new TraceStore();

/** Surface ids referenced by an A2UI operations array. */
export function surfaceIdsOf(operations: unknown): string[] {
  if (!Array.isArray(operations)) return [];
  const ids = new Set<string>();
  for (const op of operations) {
    if (!op || typeof op !== "object") continue;
    for (const body of Object.values(op as Record<string, unknown>)) {
      const id = (body as { surfaceId?: unknown } | null)?.surfaceId;
      if (typeof id === "string") ids.add(id);
    }
  }
  return [...ids];
}

export function operationNamesOf(operations: unknown): string[] {
  if (!Array.isArray(operations)) return [];
  return operations.flatMap((op) =>
    op && typeof op === "object"
      ? Object.keys(op as object).filter((key) => key !== "version")
      : [],
  );
}
