import { wrapLanguageModel, type LanguageModel } from "ai";
import { resolveModel } from "@copilotkit/runtime/v2";
import { createFixtureModel } from "./fixture-model";
import { providerTraceMiddleware } from "./provider-trace";

/**
 * ALL model configuration lives in this file.
 *
 * Today: one "provider/model" string (AGENT_MODEL) resolved by CopilotKit's
 * own resolveModel(), which reads the provider's API key from the environment.
 *
 * To add an OpenAI-compatible / local endpoint later, build a LanguageModel
 * here (e.g. createOpenAI({ baseURL, apiKey }).chat(modelId) from
 * @ai-sdk/openai) and return it from buildBaseModel(). Nothing else changes:
 * BuiltInAgent accepts any AI SDK LanguageModel.
 */
const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";

const KEY_ENV_BY_PROVIDER: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
};

export interface ModelInfo {
  fixture: boolean;
  /** Label safe to show in the browser. Never contains a key. */
  label: string;
  /** Name of the env var the selected provider needs, if known. */
  keyEnv?: string;
  hasCredentials: boolean;
  providerTrace: boolean;
}

export function modelInfo(): ModelInfo {
  const fixture = process.env.FIXTURE_MODE === "1";
  const spec = process.env.AGENT_MODEL?.trim() || DEFAULT_MODEL;
  const keyEnv = KEY_ENV_BY_PROVIDER[spec.split("/")[0] ?? ""];
  return {
    fixture,
    label: fixture ? "fixture/scripted-weekend-planner" : spec,
    keyEnv,
    hasCredentials: fixture || !keyEnv || Boolean(process.env[keyEnv]?.trim()),
    providerTrace: process.env.PROVIDER_TRACE !== "0",
  };
}

function buildBaseModel(): LanguageModel {
  if (process.env.FIXTURE_MODE === "1") return createFixtureModel();
  return resolveModel(process.env.AGENT_MODEL?.trim() || DEFAULT_MODEL);
}

export function createModel(): LanguageModel {
  const base = buildBaseModel();
  if (process.env.PROVIDER_TRACE === "0") return base;
  return wrapLanguageModel({
    model: base as Parameters<typeof wrapLanguageModel>[0]["model"],
    middleware: providerTraceMiddleware,
  });
}
