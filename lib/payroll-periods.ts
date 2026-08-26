import { fyFromMonth } from "./payroll";

const pad = (n: number) => String(n).padStart(2, "0");

/** The three calendar months in the Indian financial-year quarter containing a month. */
export function quarterMonths(month: string): string[] {
  const [year, calendarMonth] = month.split("-").map(Number);
  const quarter = Math.floor((((calendarMonth + 8) % 12) / 3) + 1); // Apr=Q1 … Mar=Q4
  const startMonth = [4, 7, 10, 1][quarter - 1];
  const startYear = year;
  return [0, 1, 2].map((offset) => {
    const monthNumber = startMonth + offset;
    const resultYear = monthNumber > 12 ? startYear + 1 : startYear;
    return `${resultYear}-${pad(((monthNumber - 1) % 12) + 1)}`;
  });
}

/** The twelve calendar months in the Indian financial year containing a month. */
export function fiscalYearMonths(month: string): string[] {
  const fyStartYear = Number(fyFromMonth(month).slice(0, 4));
  return [
    ...Array.from({ length: 9 }, (_, index) => `${fyStartYear}-${pad(index + 4)}`),
    ...Array.from({ length: 3 }, (_, index) => `${fyStartYear + 1}-${pad(index + 1)}`),
  ];
}
