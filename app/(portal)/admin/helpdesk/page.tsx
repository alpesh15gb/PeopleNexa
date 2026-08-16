import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { HelpdeskPanel } from "./helpdesk-panel";

export const dynamic = "force-dynamic";

export default async function HelpdeskPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");
  return <HelpdeskPanel />;
}
