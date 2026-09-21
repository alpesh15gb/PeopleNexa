export function optionalEmployeeEmail(value: unknown): string | null {
  const email = String(value ?? "").toLowerCase().trim();
  return email || null;
}

export function optionalEmployeePosition(value: unknown): string | null {
  const position = String(value ?? "").trim();
  return position || null;
}

export function shouldProvisionEmployeeLogin(email: string | null, password: string) {
  return Boolean(email && password);
}
