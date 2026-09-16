import { requireSession } from "@/lib/session";
import { todayKey } from "@/lib/dates";
import { PageHeader, Card, CardContent } from "@/components/ui/card";
import { PunchDetailsTable } from "./punch-details-table";

export default async function PunchDetailsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; q?: string; page?: string }> }) {
  await requireSession(); const p = await searchParams; const from = p.from ?? todayKey(); const to = p.to ?? from; const q = p.q ?? ""; const page = Math.max(1, Number(p.page ?? 1));
  const qs = new URLSearchParams({ from, to, q, page: String(page), size: "50" }).toString();
  return <div className="animate-fade-up space-y-6"><PageHeader title="Punch Details" description="Raw biometric punches with the source machine." /><Card><CardContent className="p-5"><form className="flex flex-wrap gap-3"><input name="from" type="date" defaultValue={from} className="rounded-lg border border-edge bg-card px-3 py-2"/><input name="to" type="date" defaultValue={to} className="rounded-lg border border-edge bg-card px-3 py-2"/><input name="q" defaultValue={q} placeholder="Employee name or code" className="rounded-lg border border-edge bg-card px-3 py-2"/><button className="rounded-lg bg-primary px-4 py-2 text-white">View</button></form></CardContent></Card><PunchDetailsTable apiUrl={`/api/reports/punch-details?${qs}`} /></div>;
}
