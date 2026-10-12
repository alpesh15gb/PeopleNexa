/** Export retained HR master fields, excluding credentials and binary payloads. */
export function employeeExportSourceFields(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value)
    .filter(([key, entry]) => /^(OFF|PER|RPT|BANK|ID|EDU|WRK|DEP|REF)_/.test(key)
      && !/password|secret|token|base64/i.test(key) && entry != null && entry !== "")
    .map(([key, entry]) => [key, typeof entry === "object" ? JSON.stringify(entry) : String(entry)]);
}
