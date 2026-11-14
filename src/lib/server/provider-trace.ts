import type { LanguageModelMiddleware } from "ai";
import { addServerTrace } from "./server-trace";

/**
 * Observes the AI SDK <-> model-provider boundary using the SDK's supported
 * language-model middleware hook.
 *
 * What this sees: the call options the AI SDK hands to the provider adapter
 * (prompt, tools, settings), the request body the adapter reports sending
 * (when the adapter exposes it), and the normalized stream parts coming back.
 * What it does NOT see: raw HTTP headers or bytes on the wire.
 *
 * The stream is observed with a pass-through TransformStream: parts are
 * forwarded as they arrive, so streaming and cancellation are unchanged and
 * the stream is never read twice.
 */
let callCounter = 0;

export const providerTraceMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  wrapStream: async ({ doStream, params, model }) => {
    const callId = `provider-call-${++callCounter}`;
    addServerTrace({
      boundary: "model-provider",
      direction: "out",
      type: "PROVIDER_CALL",
      kind: "captured",
      runId: callId,
      summary: `${model.provider} / ${model.modelId} - ${params.prompt.length} prompt messages, ${params.tools?.length ?? 0} tools`,
      payload: {
        note: "AI SDK call options passed to the provider adapter (not raw HTTP).",
        provider: model.provider,
        modelId: model.modelId,
        params,
      },
    });

    let result: Awaited<ReturnType<typeof doStream>>;
    try {
      result = await doStream();
    } catch (error) {
      addServerTrace({
        boundary: "model-provider",
        direction: "in",
        type: "PROVIDER_ERROR",
        kind: "captured",
        runId: callId,
        summary: error instanceof Error ? error.message : String(error),
        payload: { error },
      });
      throw error;
    }

    if (result.request?.body !== undefined) {
      addServerTrace({
        boundary: "model-provider",
        direction: "out",
        type: "PROVIDER_REQUEST_BODY",
        kind: "captured",
        runId: callId,
        summary: "Request body as reported by the provider adapter",
        payload: { body: result.request.body },
      });
    }

    let text = "";
    let partCount = 0;
    const toolCalls: unknown[] = [];
    let finish: unknown;
    const errors: unknown[] = [];

    const tap = new TransformStream({
      transform(part, controller) {
        partCount += 1;
        if (part.type === "text-delta") text += part.delta;
        else if (part.type === "tool-call") toolCalls.push(part);
        else if (part.type === "finish") finish = part;
        else if (part.type === "error") errors.push(part.error);
        controller.enqueue(part);
      },
      flush() {
        addServerTrace({
          boundary: "model-provider",
          direction: "in",
          type: "PROVIDER_STREAM_SUMMARY",
          kind: "derived",
          runId: callId,
          summary: `${partCount} stream parts, ${toolCalls.length} tool calls, ${text.length} text chars`,
          payload: {
            note: "Aggregated by this app from normalized AI SDK stream parts after the stream ended. Individual deltas are not stored.",
            text,
            toolCalls,
            finish,
            errors,
            responseHeadersPresent: result.response?.headers !== undefined,
          },
        });
      },
    });

    return { ...result, stream: result.stream.pipeThrough(tap) };
  },
};
