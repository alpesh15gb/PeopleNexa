import { redirect } from "next/navigation";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { requireActiveSession } from "@/lib/session";
import { IdCardGenerator } from "./id-card-generator";

export default async function IdCardsPage() {
  const session = await requireActiveSession();
  if (session.role !== "admin" && session.role !== "location_manager") redirect("/admin");
  return <div className="animate-fade-up space-y-6"><PageHeader title="ID cards" description="Look up an employee, review both sides of the card, and download a print-ready PDF." /><Card><CardContent className="p-4 sm:p-6"><IdCardGenerator /></CardContent></Card></div>;
}
