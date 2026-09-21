export function shouldShowSpouseDetails(maritalStatus: unknown) {
  return maritalStatus === "Married";
}

export function updateMaritalStatus<T extends Record<string, unknown>>(
  profile: T,
  maritalStatus: string,
): T & { maritalStatus: string } {
  return { ...profile, maritalStatus };
}

export function updateSpouseDetails<T extends Record<string, unknown>>(
  profile: T,
  field: "spouseName" | "spouseContactNumber",
  value: string,
): T & Record<typeof field, string> {
  return { ...profile, [field]: value } as T & Record<typeof field, string>;
}
