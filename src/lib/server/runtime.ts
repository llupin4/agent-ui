import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
  type CopilotRuntimeFetchHandler,
} from "@copilotkit/runtime/v2";
import { SqliteAgentRunner } from "@copilotkit/sqlite-runner";
import { redactString } from "../redact";
import { createAgent } from "./agent";
import { modelInfo } from "./model";
import { runnerDbPath } from "./paths";
import { recordRun } from "./sessions";

export const RUNTIME_BASE_PATH = "/api/copilotkit";

function debugConfig() {
  const mode = (process.env.RUNTIME_DEBUG ?? "on").toLowerCase();
  if (mode === "off" || mode === "0" || mode === "false") return false;
  return { events: true, lifecycle: true, verbose: mode === "verbose" };
}

/** Pulls what the session index needs out of a run request body. */
async function noteRun(request: Request): Promise<void> {
  try {
    const body = (await request.clone().json()) as {
      threadId?: string;
      runId?: string;
      messages?: Array<{ role?: string; content?: unknown }>;
      forwardedProps?: { a2uiAction?: unknown };
    };
    if (!body.threadId) return;
    const firstUser = body.messages?.find((m) => m.role === "user");
    const text = typeof firstUser?.content === "string" ? firstUser.content : undefined;
    recordRun(body.threadId, text);
    console.log(
      `[run] thread=${body.threadId} run=${body.runId} messages=${body.messages?.length ?? 0}` +
        (body.forwardedProps?.a2uiAction ? " (carries an A2UI user action)" : ""),
    );
  } catch (error) {
    console.error("[run] could not record session for run request:", error);
  }
}

// The SQLite connection is the only thing kept across dev-mode module
// reloads. The runtime and agent are rebuilt whenever this module (or the
// prompt / tools / model files it imports) is re-evaluated, so edits apply
// without restarting the server.
const globalStore = globalThis as unknown as { __a2uiRunner?: SqliteAgentRunner };

function runner(): SqliteAgentRunner {
  // Durable runs: every run's AG-UI events are stored and replayed on connect.
  return (globalStore.__a2uiRunner ??= new SqliteAgentRunner({ dbPath: runnerDbPath() }));
}

function build(): CopilotRuntimeFetchHandler {
  const info = modelInfo();
  console.log(
    `[runtime] model=${info.label} fixture=${info.fixture} credentials=${info.hasCredentials} runnerDb=${runnerDbPath()}`,
  );

  const runtime = new CopilotRuntime({
    agents: { default: createAgent() },
    runner: runner(),
    // Dynamic A2UI: the middleware injects a `render_a2ui` tool that the
    // agent's own model calls; streamed args become A2UI v0.9 operations.
    // No schema/catalog is set here, so the browser's catalog (basic catalog)
    // is what gets described to the model and used for validation.
    a2ui: { injectA2UITool: true },
    debug: debugConfig(),
  });

  return createCopilotRuntimeHandler({
    runtime,
    basePath: RUNTIME_BASE_PATH,
    hooks: {
      onBeforeHandler: async ({ route, request }) => {
        if (route.method === "agent/run") await noteRun(request);
        else if (route.method === "agent/connect") {
          console.log(`[connect] replay request for agent=${route.agentId}`);
        }
      },
      onError: ({ error, route }) => {
        console.error(
          `[runtime error] route=${route?.method ?? "unrouted"}:`,
          redactString(error instanceof Error ? (error.stack ?? error.message) : String(error)),
        );
      },
    },
  });
}

let handler: CopilotRuntimeFetchHandler | undefined;

export function getRuntimeHandler(): CopilotRuntimeFetchHandler {
  return (handler ??= build());
}
