type DesignationStore = {
  designation: {
    upsert(args: {
      where: { tenantId_normalizedName: { tenantId: string; normalizedName: string } };
      create: { tenantId: string; name: string; normalizedName: string };
      update: Record<string, never>;
    }): Promise<unknown>;
  };
};

export function normalizeDesignationName(value: unknown): string | null {
  const name = String(value ?? "").replace(/\s+/g, " ").trim();
  return name || null;
}

// Empty updates intentionally retain a designation that an administrator deactivated.
export async function ensureDesignations(store: DesignationStore, tenantId: string, values: Iterable<unknown>) {
  const names = new Map<string, string>();
  for (const value of values) {
    const name = normalizeDesignationName(value);
    if (name && name.length <= 100) names.set(name.toLowerCase(), name);
  }
  await Promise.all([...names].map(([normalizedName, name]) => store.designation.upsert({
    where: { tenantId_normalizedName: { tenantId, normalizedName } },
    create: { tenantId, name, normalizedName },
    update: {},
  })));
}
