// Run: npm run check:redaction
import assert from "node:assert/strict";
import { redact, REDACTED } from "../src/lib/redact.ts";

const shared = { a: 1 };
const input = {
  headers: { Authorization: "Bearer abcdefghijklmnop123456", Cookie: "sid=1", "x-api-key": "k", "content-type": "application/json" },
  config: { apiKey: "sk-ant-REALKEY1234567890", api_key: "x", password: "hunter2", nested: [{ access_token: "t" }] },
  text: "my key is sk-proj-ABCDEFGHIJKLMNOP1234 and header Bearer zzzzzzzzzzzzzzzz ok",
  google: "AIzaSyA1234567890abcdefghijklmnopqrstu",
  twice: [shared, shared],
  keep: { threadId: "t-1", content: "hello" },
};
const out = redact(input) as typeof input;
const json = JSON.stringify(out);

assert.equal(out.headers.Authorization, REDACTED);
assert.equal(out.headers.Cookie, REDACTED);
assert.equal(out.headers["x-api-key"], REDACTED);
assert.equal(out.headers["content-type"], "application/json");
assert.equal(out.config.apiKey, REDACTED);
assert.equal(out.config.api_key, REDACTED);
assert.equal(out.config.password, REDACTED);
assert.equal(out.config.nested[0].access_token, REDACTED);
for (const secret of ["abcdefghijklmnop123456", "REALKEY", "hunter2", "sk-proj-", "zzzzzzzz", "AIzaSy"]) {
  assert.ok(!json.includes(secret), `leaked: ${secret}`);
}
assert.deepEqual(out.twice, [{ a: 1 }, { a: 1 }], "shared references must not be reported as circular");
assert.deepEqual(out.keep, input.keep);
const loop: Record<string, unknown> = {}; loop.self = loop;
assert.equal((redact(loop) as { self: unknown }).self, "[circular]");
assert.equal(input.config.apiKey, "sk-ant-REALKEY1234567890", "input must not be mutated");
console.log("redaction checks passed");
