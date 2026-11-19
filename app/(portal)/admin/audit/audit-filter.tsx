import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuditFilter({ action, entity, q }: { action: string; entity: string; q: string }) {
  return (
    <form action="/admin/audit" aria-label="Audit log filters" className="flex flex-wrap items-center gap-2 rounded-xl border border-edge bg-card p-3">
      <Input type="search" aria-label="Search audit summaries" name="q" defaultValue={q} maxLength={200} placeholder="Search summary or record ID" className="w-full sm:w-60" />
      <Input aria-label="Filter by action" name="action" defaultValue={action} maxLength={200} placeholder="Action code" className="w-full sm:w-44" />
      <Input aria-label="Filter by entity" name="entity" defaultValue={entity} maxLength={200} placeholder="Entity type" className="w-full sm:w-40" />
      <Button type="submit" variant="outline">Apply filters</Button>
      {(action || entity || q) && <Link href="/admin/audit" className="rounded-lg px-3 py-2 text-sm text-primary hover:underline">Clear filters</Link>}
    </form>
  );
}
