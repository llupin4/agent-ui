# A2UI playground

A single-user playground for agent-generated interactive UI: a CopilotKit chat whose
agent renders real A2UI surfaces, with a details pane showing what travels between
browser, runtime and model, and SQLite-backed sessions that restore after a refresh
or server restart.

Demo: a weekend activity planner over **synthetic** local data.

## Run it

```bash
npm install
cp .env.example .env.local      # then set ANTHROPIC_API_KEY (or change AGENT_MODEL)
npm run dev                     # http://localhost:3000
```

No API key? `FIXTURE_MODE=1 npm run dev` swaps the model for a scripted, clearly
labeled fixture model. Everything above the model (BuiltInAgent, tools, A2UI
middleware, runner, persistence) is the real code path.

Other commands: `npm run typecheck`, `npm run lint`, `npm run build && npm start`,
`npm run check:redaction`.

Try: "Suggest indoor weekend activities under $20", then click **Pick this** on a
card, or change the setting and click **Update suggestions**. Starter prompts appear
as pills in an empty session.

## Versions

| Package | Version |
| --- | --- |
| next / react | 16.4.6 / 19.3.0 |
| @copilotkit/react-core, runtime, sqlite-runner | 1.88.0 (v2 APIs only: `/v2` entry points) |
| @ag-ui/a2ui-middleware / @ag-ui/client | 0.0.16 / 1.0.2 |
| @a2ui/web_core (renderer core) | 0.15.0 |
| ai (AI SDK) | 6.0.332 |
| better-sqlite3 | 12.x |

**A2UI protocol: v0.9**, basic catalog
(`https://a2ui.org/specification/v0_9/basic_catalog.json`). Node 22.

## Architecture

```
browser                                   server (Next.js route handlers)
CopilotKitProvider + CopilotChat  --SSE-->  /api/copilotkit/*  CopilotRuntime (v2)
  A2UI renderer (built in)                    A2UIMiddleware  (injects render_a2ui)
  TraceRecorder / TracePane                   BuiltInAgent    (prompt + tools)
  session sidebar  --------------------->   /api/sessions     sessions.sqlite (app)
                                              SqliteAgentRunner -> runner.sqlite
                                              AI SDK model (+ provider trace)
```

The loop: user message -> `search_weekend_activities` (server tool) -> the model calls
`render_a2ui` -> the middleware turns the streamed arguments into A2UI operations
(`createSurface`, `updateComponents`, `updateDataModel`) delivered as `ACTIVITY_SNAPSHOT`
events -> the browser renders the surface -> a button click is sent back as
`forwardedProps.a2uiAction` in a new run -> the model sees it as an
`A2UI user action:` message and replies or re-renders.

Dynamic generation uses the agent's own model; no separate model is configured.

## Where to change things

| What | File |
| --- | --- |
| Agent prompt, tools | `src/lib/server/agent.ts` |
| Synthetic data | `src/lib/server/activities.ts` |
| Model / provider | `src/lib/server/model.ts` (the only file to touch for an OpenAI-compatible endpoint) |
| Runtime, A2UI middleware options, server-side catalog `schema` | `src/lib/server/runtime.ts` |
| Client catalog / theme (`a2ui={{ catalog, theme }}`), starter prompts | `src/components/Playground.tsx` |
| Persistence | `src/lib/server/paths.ts`, `src/lib/server/sessions.ts` |
| Fixture script | `src/lib/server/fixture-model.ts` |

## Observability

- **Inspector (built in):** in `npm run dev` on localhost, the floating CopilotKit
  button opens it (AG-UI Events, Context). It is disabled in production builds and it
  fetches some of its content from CopilotKit's servers.
- **Server logs:** `RUNTIME_DEBUG=on|verbose|off` controls the runtime's event/lifecycle
  logging. The app also logs one line per run, connect and tool execution.
- **View details (this app):** bounded (2000 entries), redacted, filterable trace with
  per-entry copy and JSON export. Each entry is labeled with its boundary and whether
  it is `captured` (protocol payload as observed) or `derived` (computed by the app).
  - `browser <-> runtime`: outgoing HTTP requests (method, path, JSON body) via an
    observe-only fetch tap that never reads the response, and incoming AG-UI events via
    an agent subscriber. A2UI operations and surface ids are in `ACTIVITY_SNAPSHOT`
    entries; user actions appear as `A2UI_USER_ACTION`.
  - `runtime <-> model provider`: click **Load server trace**. Recorded with the AI SDK
    language-model middleware hook: call options, the request body the adapter reports,
    and a per-call stream summary. This is not raw HTTP; headers are not visible.
  - Not separately captured: the in-process hop between BuiltInAgent and the runtime
    before the A2UI middleware runs. Use `RUNTIME_DEBUG=verbose` logs for that.

## Persistence

Two files in `./data` (gitignored):

- `runner.sqlite` - owned by `SqliteAgentRunner`. Stores each run's AG-UI events and
  replays them on `POST /agent/default/connect`. This is the only store of
  conversation content, including A2UI surfaces. The app never reads its tables.
- `sessions.sqlite` - owned by this app. One row per session (id = threadId, title,
  timestamps, run count). Needed because the runner in 1.88 does not provide the
  thread list endpoints (`/info` reports `threadEndpoints.list: false`).

Reopening a session issues one connect request and no run: no model call, no tool
execution. The active session id is kept in the URL (`?session=`).

## Verification status

Executed (fixture model, headless Chrome, dev and production builds):

- Type check, lint, production build, redaction check.
- Streaming: text deltas arrive spread over time; A2UI args stream progressively.
- A2UI render, `select_activity` round trip, `submit_preferences` re-render.
  One run request per user interaction.
- Refresh and full server restart (new process): surfaces and text restored with one
  connect, zero runs, zero tool executions. Continuing afterwards sent prior context
  to the model.
- Stop endpoint cancels a run and the thread accepts a new run.
- Errors are shown as banners with the server-side cause attached.
- Trace capture, filters, server trace loading; Inspector opens in dev.

Not verified: **live model behavior.** No API key was available. Without a key the
request reached Anthropic and was rejected for the missing key, so wiring is confirmed
up to authentication, but whether a live model produces valid surfaces is untested.

## Known limitations

- The middleware's injected usage guide describes `ChoicePicker` with `selections`,
  while the renderer's schema requires `value`. A live model may produce a rejected
  surface first; the middleware shows a retry/failed state when that happens.
- The runner reports a failed model call to the browser only as
  `INCOMPLETE_STREAM`. The app looks up the real cause from the provider trace
  (needs `PROVIDER_TRACE=1`).
- Clicking a surface button while a run is in progress gives a "thread is locked" error.
- Edits made inside a surface but not submitted are not persisted; restore replays
  what the agent sent.
- No session delete: the runner exposes no supported way to delete a thread's runs.
- Provider and browser traces are in memory only and reset on reload / restart.
- CopilotKit sends anonymous telemetry by default; set
  `COPILOTKIT_TELEMETRY_DISABLED=true` to turn it off.
