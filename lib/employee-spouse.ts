export function shouldShowSpouseDetails(maritalStatus: unknown) {
  return maritalStatus === "Married";
}

export function updateMaritalStatus<T extends Record<string, unknown>>(
  profile: T,
  maritalStatus: string,
): T & { maritalStatus: string } {
  return { ...profile, maritalStatus };
}
