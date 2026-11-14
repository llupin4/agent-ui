/** Which hop of the pipeline an entry was observed on. */
export type TraceBoundary =
  | "browser-runtime" // AG-UI over HTTP/SSE, observed in the browser
  | "model-provider" // AI SDK call into the model provider, observed on the server
  | "app"; // this app's own bookkeeping (not a protocol payload)

export type TraceDirection = "out" | "in" | "local";

export interface TraceEntry {
  /** Monotonic per-source sequence number (capture order). */
  seq: number;
  /** Epoch milliseconds at capture. */
  ts: number;
  source: "browser" | "server";
  boundary: TraceBoundary;
  direction: TraceDirection;
  /** AG-UI event type, or an app-level label such as RUN_REQUEST. */
  type: string;
  /**
   * "captured" = the payload is the protocol object as observed at this hop.
   * "derived"  = computed by this app from captured data (summaries, state).
   */
  kind: "captured" | "derived";
  threadId?: string;
  runId?: string;
  messageId?: string;
  toolCallId?: string;
  surfaceIds?: string[];
  /** One-line human summary. */
  summary?: string;
  payload: unknown;
}
