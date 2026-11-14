import { readServerTrace } from "@/lib/server/server-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-observed trace entries (model-provider boundary). Already redacted. */
export async function GET(request: Request) {
  const after = Number(new URL(request.url).searchParams.get("after") ?? 0) || 0;
  return Response.json({ entries: readServerTrace(after) });
}
