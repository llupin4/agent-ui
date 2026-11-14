"use client";

import { memo, useMemo, useState, useSyncExternalStore } from "react";
import { MAX_TRACE_ENTRIES, traceStore } from "@/lib/trace-store";
import type { TraceEntry } from "@/lib/trace-types";

const VISIBLE_ROWS = 300;
const EMPTY: TraceEntry[] = [];

const BOUNDARY_LABEL: Record<TraceEntry["boundary"], string> = {
  "browser-runtime": "browser <-> runtime",
  "model-provider": "runtime <-> model provider (AI SDK)",
  app: "app (derived)",
};

const FILTERS = {
  all: () => true,
  requests: (e: TraceEntry) => e.direction === "out",
  a2ui: (e: TraceEntry) =>
    e.type === "A2UI_USER_ACTION" || e.type.startsWith("ACTIVITY") || Boolean(e.surfaceIds?.length) ||
    (e.type.startsWith("TOOL_CALL") && JSON.stringify(e.payload).includes("render_a2ui")),
  tools: (e: TraceEntry) => e.type.startsWith("TOOL_CALL"),
  text: (e: TraceEntry) => e.type.startsWith("TEXT_MESSAGE"),
  lifecycle: (e: TraceEntry) => /^(RUN_|STEP_|HTTP_)/.test(e.type),
  state: (e: TraceEntry) => /STATE|MESSAGES_SNAPSHOT/.test(e.type),
  errors: (e: TraceEntry) => /ERROR|FAILED/.test(e.type),
  provider: (e: TraceEntry) => e.boundary === "model-provider",
} satisfies Record<string, (e: TraceEntry) => boolean>;

type FilterKey = keyof typeof FILTERS;
const NOISY = new Set(["TEXT_MESSAGE_CONTENT", "TOOL_CALL_ARGS", "TEXT_MESSAGE_CHUNK", "TOOL_CALL_CHUNK"]);

function time(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function short(id?: string): string | undefined {
  return id && id.length > 14 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}

const Row = memo(function Row({ entry }: { entry: TraceEntry }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const arrow = entry.direction === "out" ? "->" : entry.direction === "in" ? "<-" : "::";
  const ids = [
    entry.threadId && `thread ${short(entry.threadId)}`,
    entry.runId && `run ${short(entry.runId)}`,
    entry.messageId && `msg ${short(entry.messageId)}`,
    entry.toolCallId && `tool ${short(entry.toolCallId)}`,
    entry.surfaceIds?.length && `surface ${entry.surfaceIds.join(",")}`,
  ].filter(Boolean);

  return (
    <li className={`trace-row dir-${entry.direction} ${/ERROR|FAILED/.test(entry.type) ? "is-error" : ""}`}>
      <button className="trace-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="trace-seq">{entry.source === "server" ? "s" : "b"}#{entry.seq}</span>
        <span className="trace-time">{time(entry.ts)}</span>
        <span className="trace-arrow" title={entry.direction}>{arrow}</span>
        <span className="trace-type">{entry.type}</span>
        <span className={`trace-kind kind-${entry.kind}`}>{entry.kind}</span>
        <span className="trace-summary">{entry.summary}</span>
      </button>
      <div className="trace-meta">
        <span className={`trace-boundary b-${entry.boundary}`}>{BOUNDARY_LABEL[entry.boundary]}</span>
        {ids.map((id) => (
          <span key={String(id)} className="trace-id">{id}</span>
        ))}
      </div>
      {open && (
        <div className="trace-body">
          <button
            className="btn btn-small"
            onClick={async () => {
              await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? "Copied" : "Copy entry"}
          </button>
          <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
        </div>
      )}
    </li>
  );
});

export function TracePane({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const entries = useSyncExternalStore(traceStore.subscribe, traceStore.getSnapshot, () => EMPTY);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [hideDeltas, setHideDeltas] = useState(true);
  const [onlyThread, setOnlyThread] = useState(false);
  const [serverCursor, setServerCursor] = useState(0);
  const [serverNote, setServerNote] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const test = FILTERS[filter];
    return entries.filter(
      (e) =>
        test(e) &&
        (!hideDeltas || !NOISY.has(e.type)) &&
        (!onlyThread || !e.threadId || e.threadId === threadId),
    );
  }, [entries, filter, hideDeltas, onlyThread, threadId]);
  const visible = filtered.slice(-VISIBLE_ROWS);

  async function loadServerTrace() {
    try {
      const response = await fetch(`/api/trace/server?after=${serverCursor}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { entries: fresh } = (await response.json()) as { entries: TraceEntry[] };
      if (fresh.length) {
        traceStore.addServerEntries(fresh);
        setServerCursor(fresh[fresh.length - 1].seq);
      }
      setServerNote(`${fresh.length} new server entr${fresh.length === 1 ? "y" : "ies"}`);
    } catch (error) {
      setServerNote(`Could not load server trace: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function exportTrace() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            app: "a2ui-playground",
            activeThreadId: threadId,
            notes: [
              "kind=captured: protocol object as observed at that boundary. kind=derived: computed by this app.",
              "browser-runtime entries are observed in the browser via an AG-UI agent subscriber (no HTTP headers).",
              "model-provider entries are AI SDK call options / normalized stream summaries observed on the server, not raw HTTP.",
              "Credentials are redacted. b#/s# sequence numbers are per source (browser / server).",
            ],
            droppedOldEntries: traceStore.getDropped(),
            entries,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `a2ui-trace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="trace-pane" aria-label="Protocol details">
      <header className="trace-toolbar">
        <strong>Details</strong>
        <select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)} aria-label="Filter">
          {Object.keys(FILTERS).map((key) => (
            <option key={key} value={key}>{key}</option>
          ))}
        </select>
        <label><input type="checkbox" checked={hideDeltas} onChange={(e) => setHideDeltas(e.target.checked)} /> hide deltas</label>
        <label><input type="checkbox" checked={onlyThread} onChange={(e) => setOnlyThread(e.target.checked)} /> this session</label>
        <span className="spacer" />
        <button className="btn btn-small" onClick={loadServerTrace} title="Fetch model-provider entries recorded on the server">Load server trace</button>
        <button className="btn btn-small" onClick={exportTrace}>Export JSON</button>
        <button className="btn btn-small" onClick={() => traceStore.clear()}>Clear</button>
        <button className="btn btn-small" onClick={onClose} aria-label="Close details">Close</button>
      </header>
      <p className="trace-legend">
        <b>-&gt;</b> sent, <b>&lt;-</b> received. <b>captured</b> = payload as observed at the labeled boundary;
        {" "}<b>derived</b> = computed by this app. Browser entries come from an AG-UI subscriber and never include
        HTTP headers; they do not show what the model provider received - use &quot;Load server trace&quot; for the AI SDK
        boundary. For CopilotKit&apos;s own event view open the Inspector (floating CopilotKit button, dev mode on localhost).
        {serverNote ? ` ${serverNote}.` : ""}
      </p>
      <p className="trace-count">
        Showing {visible.length} of {filtered.length} matching ({entries.length} captured, max {MAX_TRACE_ENTRIES}
        {traceStore.getDropped() ? `, ${traceStore.getDropped()} oldest dropped` : ""}).
      </p>
      <ol className="trace-list">
        {visible.map((entry) => (
          <Row key={`${entry.source}-${entry.seq}`} entry={entry} />
        ))}
        {visible.length === 0 && <li className="trace-empty">Nothing captured yet. Send a message.</li>}
      </ol>
    </aside>
  );
}
