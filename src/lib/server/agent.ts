import { BuiltInAgent, defineTool } from "@copilotkit/runtime/v2";
import { z } from "zod";
import { searchActivities } from "./activities";
import { createModel } from "./model";

/** Edit this to change how the agent behaves. */
export const AGENT_PROMPT = `You are a weekend activity planner in a personal A2UI playground.

All activity data comes from the search_weekend_activities tool and is SYNTHETIC
(invented for this demo). Say so briefly when presenting options; never present it as real.

When the user asks for suggestions:
1. Call search_weekend_activities with filters inferred from the request.
2. Call render_a2ui to show the results as an interactive surface: one Card per
   activity (name, short blurb, cost/duration) with a Button whose action event is
   named "select_activity" and whose context includes the activity id and name.
   Optionally add simple preference inputs (e.g. a ChoicePicker for indoor/outdoor)
   bound to the data model, plus a Button with an action event named
   "submit_preferences" whose context carries those values.
3. After rendering, add one short sentence in chat. Do not repeat the options as text.

When you receive an A2UI user action:
- select_activity: acknowledge the chosen activity by name and offer one next step.
- submit_preferences: search again with the new preferences and render an updated surface.

Keep chat replies short. Use only components from the provided A2UI catalog.`;

/** Server-side tools. Add more defineTool() entries here. */
const searchWeekendActivities = defineTool({
  name: "search_weekend_activities",
  description:
    "Search the local SYNTHETIC weekend activity dataset. Returns up to `limit` activities.",
  parameters: z.object({
    category: z.enum(["outdoors", "food", "culture", "games", "family"]).optional(),
    setting: z.enum(["indoor", "outdoor"]).optional(),
    maxCostUsd: z.number().optional().describe("Maximum cost per person in USD"),
    maxDurationHours: z.number().optional(),
    limit: z.number().int().min(1).max(5).optional().describe("Default 3"),
  }),
  execute: async (query) => {
    const activities = searchActivities(query);
    console.log(
      `[tool] search_weekend_activities ${JSON.stringify(query)} -> ${activities.length} result(s)`,
    );
    return { synthetic: true, query, activities };
  },
});

export function createAgent() {
  return new BuiltInAgent({
    model: createModel(),
    prompt: AGENT_PROMPT,
    tools: [searchWeekendActivities],
    // search -> render_a2ui -> closing sentence needs several model steps.
    maxSteps: 6,
  });
}
