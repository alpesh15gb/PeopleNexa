export const EMPLOYEE_IMPORT_MAX_ROWS = 2500;

export function parseEmployeeImportCsv(source: string): Record<string, string>[] {
  const rows: string[][] = [];
  const text = source.replace(/^\uFEFF/, "");
  let cell = "";
  let row: string[] = [];
  let quoted = false;

  function finishRow() {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
    if (rows.length > EMPLOYEE_IMPORT_MAX_ROWS + 1) {
      throw new Error(`Import up to ${EMPLOYEE_IMPORT_MAX_ROWS} employees per file.`);
    }
    row = [];
    cell = "";
  }

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index++;
      finishRow();
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("A quoted CSV field is missing its closing quote.");
  finishRow();

  const [headers, ...employees] = rows;
  if (!headers || !employees.length) throw new Error("The CSV needs a header row and at least one employee row.");
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error("Every CSV column must have a unique header.");
  }
  if (!["employeeNumber", "deviceCode", "email"].some((header) => headers.includes(header))) {
    throw new Error("Include an employeeNumber, deviceCode, or email column. Download the template for the supported columns.");
  }
  return employees.map((values, index) => {
    if (values.slice(headers.length).some(Boolean)) {
      throw new Error(`Employee row ${index + 1} contains a value with no column header.`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""]));
  });
}
