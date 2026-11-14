import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";

/**
 * FIXTURE MODEL - not a live model.
 *
 * A scripted stand-in for the model provider so the full loop
 * (BuiltInAgent -> server tool -> render_a2ui -> A2UI middleware -> runner ->
 * browser -> user action -> agent) can be exercised without credentials.
 * Only the provider is fake; every layer above it is the real code path.
 * All text it produces is prefixed with FIXTURE_LABEL.
 */
export const FIXTURE_LABEL = "[FIXTURE - scripted, not a live model]";
const A2UI_ACTION_PREFIX = "A2UI user action:";

type StreamPart = Record<string, unknown> & { type: string };
type PromptMessage = { role: string; content: unknown };

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

let textCounter = 0;
function textParts(text: string): StreamPart[] {
  const id = `fixture-text-${Date.now()}-${++textCounter}`;
  const words = text.split(/(?<=\s)/);
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id },
    ...words.map((delta) => ({ type: "text-delta", id, delta })),
    { type: "text-end", id },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
  ];
}

let toolCallCounter = 0;
function toolCallParts(toolName: string, args: unknown): StreamPart[] {
  const id = `fixture-call-${Date.now()}-${++toolCallCounter}`;
  const json = JSON.stringify(args);
  const deltas = json.match(/[\s\S]{1,48}/g) ?? [json];
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-input-start", id, toolName },
    ...deltas.map((delta) => ({ type: "tool-input-delta", id, delta })),
    { type: "tool-input-end", id },
    { type: "tool-call", toolCallId: id, toolName, input: json },
    { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage },
  ];
}

function messageText(message: PromptMessage): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((part) => (part?.type === "text" ? String(part.text) : ""))
    .join("");
}

function searchArgsFrom(text: string) {
  const lower = text.toLowerCase();
  const args: Record<string, unknown> = { limit: 3 };
  if (lower.includes("indoor") || lower.includes("rain")) args.setting = "indoor";
  else if (lower.includes("outdoor") || lower.includes("outside")) args.setting = "outdoor";
  for (const category of ["outdoors", "food", "culture", "games", "family"]) {
    if (lower.includes(category)) args.category = category;
  }
  if (lower.includes("kid")) args.category = "family";
  const budget = lower.match(/(?:under|below|max|<)\s*\$?(\d+)/);
  if (budget) args.maxCostUsd = Number(budget[1]);
  if (lower.includes("free")) args.maxCostUsd = 0;
  return args;
}

function surfaceArgs(items: unknown[], setting: string) {
  return {
    surfaceId: "weekend-options",
    components: [
      { id: "root", component: "Column", children: ["title", "note", "list", "divider", "prefs-title", "setting", "submit"] },
      { id: "title", component: "Text", variant: "h3", text: "Weekend options" },
      { id: "note", component: "Text", variant: "caption", text: "Synthetic data - fixture-generated surface" },
      { id: "list", component: "Column", children: { componentId: "card", path: "/items" } },
      { id: "card", component: "Card", child: "card-body" },
      { id: "card-body", component: "Column", children: ["name", "blurb", "meta", "pick"] },
      { id: "name", component: "Text", variant: "h4", text: { path: "name" } },
      { id: "blurb", component: "Text", text: { path: "blurb" } },
      { id: "meta", component: "Text", variant: "caption", text: { path: "meta" } },
      { id: "pick", component: "Button", variant: "primary", child: "pick-label", action: { event: { name: "select_activity", context: { activityId: { path: "id" }, name: { path: "name" } } } } },
      { id: "pick-label", component: "Text", text: "Pick this" },
      { id: "divider", component: "Divider" },
      { id: "prefs-title", component: "Text", variant: "h5", text: "Not quite right? Adjust and resubmit" },
      { id: "setting", component: "ChoicePicker", label: "Setting", variant: "mutuallyExclusive", value: { path: "/prefs/setting" }, options: [{ label: "Indoor", value: "indoor" }, { label: "Outdoor", value: "outdoor" }] },
      { id: "submit", component: "Button", child: "submit-label", action: { event: { name: "submit_preferences", context: { setting: { path: "/prefs/setting" } } } } },
      { id: "submit-label", component: "Text", text: "Update suggestions" },
    ],
    data: { items, prefs: { setting: [setting] } },
  };
}

function respond(prompt: PromptMessage[]): StreamPart[] {
  const last = prompt[prompt.length - 1];

  if (last?.role === "tool" && Array.isArray(last.content)) {
    // One tool message can carry several results; the newest is last.
    const result = last.content[last.content.length - 1] as { toolName?: string; output?: { value?: unknown } };
    if (result?.toolName === "search_weekend_activities") {
      let value = result.output?.value as unknown;
      if (typeof value === "string") {
        try { value = JSON.parse(value); } catch { /* keep raw */ }
      }
      const parsed = (value ?? {}) as { activities?: Array<Record<string, unknown>>; query?: { setting?: string } };
      const items = (parsed.activities ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        blurb: a.blurb,
        meta: `${a.setting} - ${a.durationHours}h - $${a.costUsd} - best in the ${a.bestTime}`,
      }));
      if (items.length === 0) {
        return textParts(`${FIXTURE_LABEL} No synthetic activities matched those filters.`);
      }
      return toolCallParts("render_a2ui", surfaceArgs(items, parsed.query?.setting ?? "indoor"));
    }
    if (result?.toolName === "render_a2ui") {
      if (JSON.stringify(result.output ?? "").includes("failed")) {
        return textParts(`${FIXTURE_LABEL} The surface failed validation, so nothing was rendered. See the error above.`);
      }
      return textParts(`${FIXTURE_LABEL} I rendered a few synthetic options above. Pick one, or adjust the setting and resubmit.`);
    }
    return textParts(`${FIXTURE_LABEL} Tool ${result?.toolName ?? "?"} returned.`);
  }

  const text = last ? messageText(last) : "";
  const actionAt = text.indexOf(A2UI_ACTION_PREFIX);
  if (actionAt >= 0) {
    let action: { name?: string; context?: Record<string, unknown> } = {};
    try { action = JSON.parse(text.slice(actionAt + A2UI_ACTION_PREFIX.length)); } catch { /* ignore */ }
    if (action.name === "submit_preferences") {
      const raw = action.context?.setting;
      const setting = Array.isArray(raw) ? raw[0] : raw;
      return toolCallParts("search_weekend_activities", { setting: setting === "outdoor" ? "outdoor" : "indoor", limit: 3 });
    }
    return textParts(
      `${FIXTURE_LABEL} Received structured action "${action.name ?? "unknown"}" with context ${JSON.stringify(action.context ?? {})}. Noted - "${String(action.context?.name ?? "that option")}" is your pick.`,
    );
  }

  if (/weekend|activit|suggest|plan|idea|something to do/i.test(text)) {
    return toolCallParts("search_weekend_activities", searchArgsFrom(text));
  }
  if (/fixture error/i.test(text)) {
    throw new Error("Fixture model: simulated provider failure (you asked for 'fixture error').");
  }
  return textParts(`${FIXTURE_LABEL} You said: "${text.slice(0, 200)}". Ask for weekend activity suggestions to see an A2UI surface.`);
}

export function createFixtureModel() {
  return new MockLanguageModelV3({
    provider: "fixture",
    modelId: "scripted-weekend-planner",
    doStream: (async (options: { prompt: PromptMessage[] }) => ({
      stream: simulateReadableStream({
        chunks: respond(options.prompt),
        initialDelayInMs: 150,
        chunkDelayInMs: 35,
      }),
    })) as never,
  });
}
