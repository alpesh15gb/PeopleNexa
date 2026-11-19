export function ylrWorkbookImportEnabled(config: unknown): boolean {
  return config !== null && typeof config === "object" && "legacyYlrWorkbookImport" in config && config.legacyYlrWorkbookImport === true;
}
