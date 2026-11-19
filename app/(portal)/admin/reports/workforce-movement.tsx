import Link from "next/link";
import { Card, CardContent, PageHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { dayRangeIST } from "@/lib/dates";
import { istDateKey } from "@/lib/ist";
import { employeeLocationScope } from "@/lib/location-scope";
import { prisma } from "@/lib/prisma";

export async function WorkforceMovement({ tenantId, locationId, month, locale, showExits }: { tenantId: string; locationId: string | null; month: string; locale: string; showExits: boolean }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(year, monthNumber + index - 6, 1)).toISOString().slice(0, 7));
  const start = dayRangeIST(`${months[0]}-01`).start;
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7);
  const end = dayRangeIST(`${nextMonth}-01`).start;
  const peopleScope = { tenantId, loginOnly: false, ...(locationId ? employeeLocationScope(locationId) : {}) };
  const [joiners, exits] = await Promise.all([
    prisma.employee.findMany({ where: { ...peopleScope, joiningDate: { gte: start, lt: end } }, select: { joiningDate: true } }),
    showExits ? prisma.exitRequest.findMany({ where: { tenantId, status: "completed", lastWorkingDay: { gte: start, lt: end }, employee: peopleScope }, select: { lastWorkingDay: true } }) : [],
  ]);
  const movement = new Map(months.map((key) => [key, { joined: 0, exited: 0 }]));
  for (const row of joiners) {
    if (!row.joiningDate) continue;
    const period = movement.get(istDateKey(row.joiningDate).slice(0, 7));
    if (period) period.joined++;
  }
  for (const row of exits) {
    const period = movement.get(istDateKey(row.lastWorkingDay).slice(0, 7));
    if (period) period.exited++;
  }
  const formatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-5">
      <Link href="/admin/reports" className="inline-flex text-sm font-medium text-primary hover:underline">Report library</Link>
      <PageHeader title="Workforce movement" description={showExits ? "Joiners and completed exit requests by month." : "Employee joiners by month."} />
      <form action="/admin/reports" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="type" value="workforce-movement" />
        <label className="space-y-1 text-sm font-medium"><span>Ending month</span><Input type="month" name="month" defaultValue={month} required /></label>
        <Button type="submit">Run report</Button>
      </form>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-edge bg-tint"><tr><th scope="col" className="p-4">Month</th><th scope="col" className="p-4 text-right">Joined</th>{showExits && <th scope="col" className="p-4 text-right">Completed exits</th>}</tr></thead>
            <tbody className="divide-y divide-edge">
              {[...movement].reverse().map(([key, row]) => (
                <tr key={key}><th scope="row" className="p-4 font-medium">{formatter.format(new Date(`${key}-01T12:00:00Z`))}</th><td className="p-4 text-right tabular-nums">{row.joined}</td>{showExits && <td className="p-4 text-right tabular-nums">{row.exited}</td>}</tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
