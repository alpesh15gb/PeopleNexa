export type RecordSearchParams = Record<string, string | string[] | undefined>;
export const RECORD_PAGE_SIZE = 50;

export function recordPageNumber(value: string | string[] | undefined | null) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function recordPagination(total: number, requestedPage: number, pageSize = RECORD_PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  return { total, page, pageSize, pageCount, offset: (page - 1) * pageSize };
}

export function recordPageHref(path: string, params: RecordSearchParams, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  if (page > 1) query.set("page", String(page));
  return query.size > 0 ? `${path}?${query}` : path;
}

export function recordPageRedirect(path: string, params: RecordSearchParams, pagination: ReturnType<typeof recordPagination>) {
  return params.page !== undefined && recordPageNumber(params.page) !== pagination.page
    ? recordPageHref(path, params, pagination.page)
    : null;
}

export function recordApiPaging(params: URLSearchParams, largestPageSize: number) {
  const pageValues = params.getAll("page");
  const sizeValues = params.getAll("pageSize");
  if (pageValues.length > 1 || sizeValues.length > 1) return null;
  const page = pageValues.length ? recordPageNumber(pageValues[0]) : 1;
  const pageSize = sizeValues.length ? recordPageNumber(sizeValues[0]) : largestPageSize;
  return page !== null && pageSize !== null && pageSize <= largestPageSize ? { page, pageSize } : null;
}
