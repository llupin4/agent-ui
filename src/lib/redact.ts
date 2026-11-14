/**
 * Credential redaction for trace entries, logs and exports.
 * Key-based (headers / config objects) plus value-based (token-shaped strings).
 */
const SENSITIVE_KEY =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[-_]?key|apikey|access[-_]?token|refresh[-_]?token|id[-_]?token|auth[-_]?token|token|secret|client[-_]?secret|password|passwd|credentials?|private[-_]?key|x-copilotcloud-public-api-key)$/i;

const VALUE_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
  /\bBasic\s+[A-Za-z0-9+/=]{8,}/g,
  /\bsk-[A-Za-z0-9_-]{12,}/g, // OpenAI / Anthropic style keys
  /\bAIza[0-9A-Za-z_-]{20,}/g, // Google API keys
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, // JWTs
];

export const REDACTED = "[REDACTED]";

export function redactString(value: string): string {
  let out = value;
  for (const pattern of VALUE_PATTERNS) out = out.replace(pattern, REDACTED);
  return out;
}

/** Returns a deep, JSON-safe copy with credentials removed. */
export function redact<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (typeof value === "string") return redactString(value) as T;
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint") return String(value) as T;
    if (typeof value === "function") return undefined as T;
    return value;
  }
  if (depth > 40) return "[max depth]" as T;
  if (seen.has(value)) return "[circular]" as T;
  seen.add(value);
  if (value instanceof Date) return value.toISOString() as T;
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) } as T;
  }
  if (value instanceof Uint8Array) return `[binary ${value.byteLength} bytes]` as T;
  // `seen` tracks ancestors only, so an object referenced twice (but not
  // cyclically) is copied both times instead of being reported as circular.
  try {
    if (Array.isArray(value)) {
      return value.map((item) => redact(item, depth + 1, seen)) as T;
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1, seen);
    }
    return out as T;
  } finally {
    seen.delete(value);
  }
}
