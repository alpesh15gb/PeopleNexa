"use client";

import { Button } from "@/components/ui/button";
import type { recordPagination } from "@/lib/document-expense-pagination";

export type HelpdeskPage = ReturnType<typeof recordPagination>;

export function HelpdeskPagination({ pagination, onPage }: { pagination: HelpdeskPage | null; onPage: (page: number) => void }) {
  if (!pagination?.total) return null;
  const { page, pageCount, offset, pageSize, total } = pagination;
  return (
    <nav aria-label="Ticket pages" className="flex flex-wrap items-center justify-between gap-2 border-t border-edge pt-3 text-sm">
      <span className="text-muted-foreground">Showing {offset + 1}–{Math.min(offset + pageSize, total)} of {total} tickets</span>
      {pageCount > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</Button>
        </div>
      )}
    </nav>
  );
}
