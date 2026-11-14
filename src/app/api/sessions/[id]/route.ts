import { getSession, renameSession } from "@/lib/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  return Response.json({ session });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { title?: unknown };
  if (typeof body.title !== "string") {
    return Response.json({ error: "title must be a string" }, { status: 400 });
  }
  const session = renameSession(id, body.title);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  return Response.json({ session });
}
