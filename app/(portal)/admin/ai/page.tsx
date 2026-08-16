import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { AiPanel } from "./ai-panel";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Ask AI</h1>
        <p className="text-[13px] text-muted-foreground">Ask questions about your team, attendance, leaves, payroll and more — answered live from your data.</p>
      </div>
      <AiPanel />
    </div>
  );
}
