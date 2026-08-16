import { NextRequest, NextResponse } from "next/server";
import { LANG_COOKIE, isLang } from "@/lib/i18n";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const lang = String(body.lang ?? "");
  if (!isLang(lang)) {
    return NextResponse.json({ error: "invalid language" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}
