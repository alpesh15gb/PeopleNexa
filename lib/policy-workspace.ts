/** User-facing policy edits have one working copy; published records are history. */
export type PolicyWorkspaceRecord = {
  id: string;
  version: number;
  active: boolean;
  activatedAt?: Date | string | null;
  effectiveFrom: Date | string;
  effectiveTo: Date | string | null;
  payload: unknown;
};

export function workingPolicy<T extends PolicyWorkspaceRecord>(
  records: T[],
): T | null {
  const publishedVersion = Math.max(
    0,
    ...records
      .filter((record) => record.active || record.activatedAt)
      .map((record) => record.version),
  );
  return (
    [...records]
      .filter(
        (record) =>
          !record.active &&
          !record.activatedAt &&
          record.version > publishedVersion,
      )
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function samePolicy(
  record: PolicyWorkspaceRecord,
  input: {
    payload: unknown;
    effectiveFrom: Date | string;
    effectiveTo: Date | string | null;
  },
) {
  return (
    new Date(record.effectiveFrom).getTime() ===
      new Date(input.effectiveFrom).getTime() &&
    (record.effectiveTo ? new Date(record.effectiveTo).getTime() : null) ===
      (input.effectiveTo ? new Date(input.effectiveTo).getTime() : null) &&
    canonical(record.payload) === canonical(input.payload)
  );
}

/** Records must already be filtered to the tenant, policy kind and scope. */
export function policySavePlan<T extends PolicyWorkspaceRecord>(
  records: T[],
  input: { payload: unknown; effectiveFrom: Date; effectiveTo: Date | null },
  apply: boolean,
) {
  const working = workingPolicy(records);
  const identical = records.find(
    (record) =>
      record.active &&
      samePolicy(record, {
        ...input,
        effectiveTo: policyTimeline(
          records,
          record.id,
          input.effectiveFrom,
          input.effectiveTo,
        ).effectiveTo,
      }),
  );
  const unchanged =
    identical && !working
      ? identical
      : working && !apply && samePolicy(working, input)
        ? working
        : null;
  return {
    working,
    unchanged,
    nextVersion: Math.max(0, ...records.map((record) => record.version)) + 1,
  };
}

/** Publish a dated change without removing policies needed by earlier months. */
export function policyTimeline(
  records: PolicyWorkspaceRecord[],
  id: string,
  from: Date,
  until: Date | null,
) {
  const later = records
    .filter(
      (record) =>
        record.active &&
        record.id !== id &&
        new Date(record.effectiveFrom) > from,
    )
    .sort(
      (a, b) =>
        new Date(a.effectiveFrom).getTime() -
        new Date(b.effectiveFrom).getTime(),
    )[0];
  const nextStart = later ? new Date(later.effectiveFrom).getTime() : null;
  const effectiveTo =
    nextStart !== null && (!until || until.getTime() >= nextStart)
      ? new Date(nextStart - 1)
      : until;
  const changes = records
    .filter(
      (record) =>
        record.active &&
        record.id !== id &&
        new Date(record.effectiveFrom) <= from &&
        (!record.effectiveTo || new Date(record.effectiveTo) >= from),
    )
    .map((record) => {
      const sameStart =
        new Date(record.effectiveFrom).getTime() === from.getTime();
      return {
        id: record.id,
        active: !sameStart,
        effectiveTo: sameStart
          ? record.effectiveTo
            ? new Date(record.effectiveTo)
            : null
          : new Date(from.getTime() - 1),
      };
    });
  return { effectiveTo, changes };
}
