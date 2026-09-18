import { redirect } from "next/navigation";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { requireActiveSession } from "@/lib/session";
import { IdCardGenerator } from "./id-card-generator";

export default async function IdCardsPage() {
  const session = await requireActiveSession();
  if (session.role !== "admin") redirect("/admin");
  return <div className="animate-fade-up space-y-6"><PageHeader title="ID Cards" description="Find an employee by biometric Device ID, review the front and back, then download a print-ready PDF." /><Card><CardContent className="p-6"><IdCardGenerator /></CardContent></Card></div>;
}
