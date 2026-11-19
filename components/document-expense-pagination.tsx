import Link from "next/link";
import { recordPageHref, type RecordSearchParams, type recordPagination } from "@/lib/document-expense-pagination";

const pageLink = "rounded-md border border-edge px-3 py-2 text-sm font-medium hover:bg-tint";

export function DocumentExpensePagination({ path, params, pagination, label }: {
  path: string;
  params: RecordSearchParams;
  pagination: ReturnType<typeof recordPagination>;
  label: "documents" | "claims" | "entries" | "audit entries" | "notifications";
}) {
  const { page, pageCount, offset, pageSize, total } = pagination;
  if (total === 0) return null;

  return (
    <nav aria-label={`Pagination for ${label}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge bg-card px-4 py-3">
      <p className="text-sm text-muted-foreground">Showing {offset + 1}–{Math.min(offset + pageSize, total)} of {total} {label}</p>
      {pageCount > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {page > 1 && <Link prefetch={false} href={recordPageHref(path, params, page - 1)} className={pageLink}>Previous</Link>}
          <span className="px-1 text-sm text-muted-foreground">Page {page} of {pageCount}</span>
          {page < pageCount && <Link prefetch={false} href={recordPageHref(path, params, page + 1)} className={pageLink}>Next</Link>}
        </div>
      )}
    </nav>
  );
}
