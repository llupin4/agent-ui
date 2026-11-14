import { randomUUID } from "node:crypto";
import { createSession, listSessions } from "@/lib/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ sessions: listSessions() });
}

export async function POST() {
  return Response.json({ session: createSession(randomUUID()) }, { status: 201 });
}
