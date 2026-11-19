import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function DocumentListFilters({ path, query, status, searchEmployees = false }: { path: string; query: string; status: string; searchEmployees?: boolean }) {
  return <form action={path} className="flex flex-wrap items-center gap-2 rounded-xl border border-edge bg-card p-3">
    <Input name="q" aria-label="Search documents" defaultValue={query} maxLength={100} placeholder={searchEmployees ? "Document, type or employee" : "Document or type"} className="min-w-32 flex-1" />
    <Select name="status" aria-label="Document expiry" defaultValue={status} className="w-auto">
      <option value="">All expiry statuses</option>
      <option value="expiring">Expiring within 60 days</option>
      <option value="expired">Expired</option>
      <option value="current">Current or no expiry</option>
    </Select>
    <Button type="submit" size="sm" variant="outline">Filter files</Button>
    {(query || status) && <Link href={path} className="px-2 text-sm text-primary hover:underline">Clear filters</Link>}
  </form>;
}
