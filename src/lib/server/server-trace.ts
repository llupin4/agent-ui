import { redact } from "../redact";
import type { TraceEntry } from "../trace-types";

/**
 * Bounded in-memory buffer for things only the server can observe (the
 * model-provider boundary). Not persisted; cleared on restart.
 */
const MAX_ENTRIES = 300;

interface Store {
  seq: number;
  entries: TraceEntry[];
}
const globalStore = globalThis as unknown as { __a2uiServerTrace?: Store };
const store: Store = (globalStore.__a2uiServerTrace ??= { seq: 0, entries: [] });

export function addServerTrace(
  entry: Omit<TraceEntry, "seq" | "ts" | "source">,
): void {
  store.entries.push({
    ...entry,
    payload: redact(entry.payload),
    seq: ++store.seq,
    ts: Date.now(),
    source: "server",
  });
  if (store.entries.length > MAX_ENTRIES) {
    store.entries.splice(0, store.entries.length - MAX_ENTRIES);
  }
}

export function readServerTrace(afterSeq = 0): TraceEntry[] {
  return store.entries.filter((entry) => entry.seq > afterSeq);
}
