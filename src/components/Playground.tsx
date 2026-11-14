"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CopilotChat,
  CopilotKitProvider,
  useAgent,
  useConfigureSuggestions,
  useDefaultRenderTool,
} from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { redactString } from "@/lib/redact";
import { traceStore } from "@/lib/trace-store";
import { TracePane } from "./TracePane";
import { TraceRecorder } from "./TraceRecorder";

const AGENT_ID = "default";

export interface PlaygroundConfig {
  modelLabel: string;
  fixture: boolean;
  hasCredentials: boolean;
  keyEnv?: string;
}

interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  runCount: number;
}

interface UiError {
  id: number;
  message: string;
}

/** Starter prompts shown as clickable pills before the first message. */
const STARTER_PROMPTS = [
  { title: "Rainy-day ideas", message: "Suggest indoor weekend activities under $20." },
  { title: "Outdoors", message: "Plan something outdoors for Saturday morning." },
  { title: "With kids", message: "What are some family activities for kids this weekend?" },
  { title: "Preference form", message: "Ask me my weekend preferences with a short form, then suggest activities." },
];

function Starters() {
  // Built-in generic card for server tool calls (search_weekend_activities).
  useDefaultRenderTool();
  useConfigureSuggestions({ suggestions: STARTER_PROMPTS, available: "before-first-message" }, []);
  return null;
}

/** Refreshes the session list when a run ends (titles / ordering change). */
function RunWatcher({ onRunEnded }: { onRunEnded: () => void }) {
  const { agent } = useAgent({ agentId: AGENT_ID });
  useEffect(() => {
    const subscription = agent.subscribe({ onRunFinalized: () => onRunEnded(), onRunFailed: () => onRunEnded() });
    return () => subscription.unsubscribe();
  }, [agent, onRunEnded]);
  return null;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${url} failed: HTTP ${response.status}`);
  return (await response.json()) as T;
}

/**
 * The runner reports a failed model call to the browser only as a generic
 * INCOMPLETE_STREAM run error. The real cause is recorded on the server at
 * the model-provider boundary, so look it up and show it next to the generic
 * message. Best effort: needs PROVIDER_TRACE enabled.
 */
async function explainError(message: string): Promise<string> {
  try {
    const { entries } = await api<{ entries: Array<{ type: string; ts: number; summary?: string }> }>("/api/trace/server");
    const cause = entries.filter((e) => e.type === "PROVIDER_ERROR" && Date.now() - e.ts < 20_000).pop();
    if (cause?.summary) return `${message} - server-side cause (model-provider boundary): ${cause.summary}`;
  } catch {
    /* fall through to the original message */
  }
  return message;
}

export function Playground({ config }: { config: PlaygroundConfig }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [errors, setErrors] = useState<UiError[]>([]);

  const reportError = useCallback((message: string) => {
    const safe = redactString(message);
    console.error("[playground]", safe);
    setErrors((current) => {
      // The same failure can be reported twice (once with its server-side
      // cause attached); keep the more detailed message only.
      if (current.some((e) => e.message.startsWith(safe))) return current;
      const rest = current.filter((e) => !safe.startsWith(e.message));
      return [...rest.slice(-3), { id: Date.now() + Math.random(), message: safe }];
    });
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const { sessions: rows } = await api<{ sessions: Session[] }>("/api/sessions");
      setSessions(rows);
      return rows;
    } catch (error) {
      reportError(error instanceof Error ? error.message : String(error));
      return [];
    }
  }, [reportError]);

  const select = useCallback((id: string) => {
    setActiveId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("session", id);
    window.history.replaceState(null, "", url);
  }, []);

  const newSession = useCallback(async () => {
    try {
      const { session } = await api<{ session: Session }>("/api/sessions", { method: "POST" });
      setSessions((current) => [session, ...current.filter((s) => s.id !== session.id)]);
      select(session.id);
    } catch (error) {
      reportError(error instanceof Error ? error.message : String(error));
    }
  }, [reportError, select]);

  // Initial load: ?session=<id> wins, else the most recent session, else a new one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await refreshSessions();
      if (cancelled) return;
      const fromUrl = new URL(window.location.href).searchParams.get("session");
      if (fromUrl) select(fromUrl);
      else if (rows[0]) select(rows[0].id);
      else await newSession();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      agentId={AGENT_ID}
      onError={({ error, code, context }) => {
        traceStore.add({
          boundary: "app",
          direction: "local",
          type: "CLIENT_ERROR",
          kind: "derived",
          threadId: context?.threadId,
          runId: context?.runId,
          summary: `${code}: ${error.message}`,
          payload: { code, message: error.message, context },
        });
        void explainError(`${code}: ${error.message}`).then(reportError);
      }}
    >
      <TraceRecorder agentId={AGENT_ID} />
      <RunWatcher onRunEnded={refreshSessions} />
      <Starters />
      <div className={`shell ${detailsOpen ? "with-details" : ""}`}>
        <nav className="sidebar" aria-label="Sessions">
          <button className="btn btn-primary" onClick={newSession}>+ New session</button>
          <h2>Saved sessions</h2>
          <ul>
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  className={`session ${session.id === activeId ? "active" : ""}`}
                  onClick={() => select(session.id)}
                  title={session.id}
                >
                  <span className="session-title">{session.title || "Untitled session"}</span>
                  <span className="session-sub">
                    {new Date(session.updatedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} - {session.runCount} run{session.runCount === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))}
            {sessions.length === 0 && <li className="muted">No sessions yet.</li>}
          </ul>
        </nav>

        <main className="main">
          <header className="topbar">
            <h1>A2UI playground</h1>
            <button className="btn" onClick={() => setDetailsOpen((v) => !v)} aria-pressed={detailsOpen}>
              {detailsOpen ? "Hide details" : "View details"}
            </button>
            <span className={`badge ${config.fixture ? "badge-warn" : ""}`} title="Model the server-side agent uses">
              {config.fixture ? "FIXTURE MODE - scripted model, not live" : `model: ${config.modelLabel}`}
            </span>
            <span className="badge">synthetic activity data</span>
          </header>

          {!config.hasCredentials && (
            <div className="banner banner-warn" role="alert">
              No API key found for <code>{config.modelLabel}</code>. Set <code>{config.keyEnv}</code> in <code>.env.local</code> and
              restart, or run with <code>FIXTURE_MODE=1</code> to use the scripted fixture model.
            </div>
          )}
          {errors.map((error) => (
            <div key={error.id} className="banner banner-error" role="alert">
              <span>{error.message}</span>
              <button className="btn btn-small" onClick={() => setErrors((c) => c.filter((e) => e.id !== error.id))}>Dismiss</button>
            </div>
          ))}

          <section className="chat">
            {activeId ? (
              <CopilotChat
                key={activeId}
                agentId={AGENT_ID}
                threadId={activeId}
                labels={{ chatInputPlaceholder: "Ask for weekend activity ideas..." }}
              />
            ) : (
              <p className="muted">Loading session...</p>
            )}
          </section>
        </main>

        {detailsOpen && activeId && <TracePane threadId={activeId} onClose={() => setDetailsOpen(false)} />}
      </div>
    </CopilotKitProvider>
  );
}
