"use client";

import { useEffect } from "react";
import { useAgent } from "@copilotkit/react-core/v2";
import { operationNamesOf, surfaceIdsOf, traceStore } from "@/lib/trace-store";

type AnyEvent = Record<string, unknown> & { type: string };

function summarize(event: AnyEvent): { summary?: string; surfaceIds?: string[] } {
  switch (event.type) {
    case "TEXT_MESSAGE_CONTENT":
    case "TEXT_MESSAGE_CHUNK":
      return { summary: JSON.stringify(event.delta ?? "") };
    case "TOOL_CALL_START":
      return { summary: `tool ${String(event.toolCallName)}` };
    case "TOOL_CALL_ARGS":
      return { summary: String(event.delta ?? "").slice(0, 80) };
    case "TOOL_CALL_RESULT":
      return { summary: String(event.content ?? "").slice(0, 100) };
    case "RUN_ERROR":
      return { summary: String(event.message ?? "run error") };
    case "ACTIVITY_SNAPSHOT":
    case "ACTIVITY_DELTA": {
      const content = (event.content ?? {}) as Record<string, unknown>;
      const operations = content.a2ui_operations;
      if (operations) {
        const surfaceIds = surfaceIdsOf(operations);
        return {
          surfaceIds,
          summary: `A2UI ops: ${operationNamesOf(operations).join(", ")} -> ${surfaceIds.join(", ")}`,
        };
      }
      return {
        summary: `${String(event.activityType ?? "activity")} ${content.status ? `status=${String(content.status)}` : ""}`,
      };
    }
    default:
      return {};
  }
}

const RUNTIME_PATH = "/api/copilotkit";

/**
 * Observe-only tap on outgoing runtime requests. It records the method, path
 * and JSON body of calls to the runtime URL, then returns the ORIGINAL fetch
 * promise untouched: the response and its SSE stream are never read here, so
 * streaming, cancellation and request count are unaffected.
 */
function installRequestTap(): void {
  const w = window as unknown as { __a2uiFetchTapped?: boolean };
  if (w.__a2uiFetchTapped) return;
  w.__a2uiFetchTapped = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, window.location.href);
      if (url.pathname.startsWith(RUNTIME_PATH)) recordRequest(url, input, init);
    } catch {
      /* tracing must never break a request */
    }
    return original(input, init);
  };
}

function recordRequest(url: URL, input: RequestInfo | URL, init?: RequestInit): void {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const path = url.pathname.slice(RUNTIME_PATH.length) || "/";
  let body: unknown = undefined;
  if (typeof init?.body === "string") {
    try { body = JSON.parse(init.body); } catch { body = init.body; }
  } else if (init?.body) {
    body = "[non-text body not captured]";
  }
  const parsed = (body && typeof body === "object" ? body : {}) as {
    threadId?: string;
    runId?: string;
    messages?: Array<{ role?: string }>;
    forwardedProps?: { a2uiAction?: { userAction?: Record<string, unknown> } };
  };
  const isRun = /\/run$/.test(path);
  const isConnect = /\/connect$/.test(path);
  const action = parsed.forwardedProps?.a2uiAction;
  traceStore.add({
    boundary: "browser-runtime",
    direction: "out",
    type: isRun ? "HTTP_RUN_REQUEST" : isConnect ? "HTTP_CONNECT_REQUEST" : "HTTP_REQUEST",
    kind: "captured",
    threadId: parsed.threadId,
    runId: isRun ? parsed.runId : undefined,
    summary:
      `${method} ${RUNTIME_PATH}${path}` +
      (isRun ? ` - ${parsed.messages?.length ?? 0} messages${action ? ", carries a2uiAction" : ""}` : "") +
      (isConnect ? " - replay stored events, no model call" : ""),
    payload: {
      note: "Outgoing HTTP request as issued by the browser. Header values pass through credential redaction.",
      method,
      url: url.pathname + url.search,
      headers: init?.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init?.headers,
      body,
    },
  });
  if (isRun && action?.userAction) {
    const surfaceId = action.userAction.surfaceId;
    traceStore.add({
      boundary: "browser-runtime",
      direction: "out",
      type: "A2UI_USER_ACTION",
      kind: "derived",
      threadId: parsed.threadId,
      runId: parsed.runId,
      surfaceIds: typeof surfaceId === "string" ? [surfaceId] : undefined,
      summary: `action "${String(action.userAction.name)}" from component ${String(action.userAction.sourceComponentId)}`,
      payload: {
        note: "Extracted from body.forwardedProps.a2uiAction of the HTTP_RUN_REQUEST above; it travels inside that request, not separately.",
        a2uiAction: action,
      },
    });
  }
}

if (typeof window !== "undefined") installRequestTap();

/**
 * Records what crosses the browser <-> runtime boundary by subscribing to the
 * same agent instance <CopilotChat> uses (incoming events) plus the request
 * tap above (outgoing requests). Both are passive: nothing here starts a run
 * or reads the HTTP stream, so there is no duplicate request and no second
 * stream consumer.
 */
export function TraceRecorder({ agentId }: { agentId: string }) {
  const { agent } = useAgent({ agentId });

  useEffect(() => {
    const subscription = agent.subscribe({
      onEvent: ({ event, input }) => {
        const any = event as unknown as AnyEvent;
        traceStore.add({
          boundary: "browser-runtime",
          direction: "in",
          type: any.type,
          kind: "captured",
          threadId: (any.threadId as string | undefined) ?? input.threadId,
          runId: (any.runId as string | undefined) ?? input.runId,
          messageId: any.messageId as string | undefined,
          toolCallId: any.toolCallId as string | undefined,
          ...summarize(any),
          payload: event,
        });
      },
      onRunFailed: ({ error, input }) => {
        traceStore.add({
          boundary: "browser-runtime",
          direction: "local",
          type: "RUN_FAILED",
          kind: "derived",
          threadId: input.threadId,
          runId: input.runId,
          summary: error.message,
          payload: { name: error.name, message: error.message },
        });
      },
      onStateChanged: ({ state, input }) => {
        traceStore.add({
          boundary: "app",
          direction: "local",
          type: "CLIENT_STATE",
          kind: "derived",
          threadId: input?.threadId,
          runId: input?.runId,
          summary: "Agent state held by the client after applying events",
          payload: state,
        });
      },
    });
    return () => subscription.unsubscribe();
  }, [agent]);

  return null;
}
