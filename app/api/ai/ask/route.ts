import { NextRequest, NextResponse } from "next/server";
import { getSession, requireActiveSession } from "@/lib/session";
import { askAi } from "@/lib/ai";

/** POST — ask a natural-language question over the tenant's data. */
export async function POST(req: NextRequest) {
  const session = await requireActiveSession().catch(() => null);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  if (question.length > 500) return NextResponse.json({ error: "Question too long." }, { status: 400 });

  const result = await askAi(session.tenantId, question);
  return NextResponse.json(result);
}
