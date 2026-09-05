// Bulk salary bank-file generators. Formats follow the banks' published specs:
//  - HDFC eNET salary (within HDFC): CSV — Account No, C, Amount(2dp), Narration
//  - ICICI PAB-SAL salary transfer: fixed-width — Name(32) DebitA/c(12) BeneA/c(34) IFSC(11) Network(3)
//  - Generic NEFT-style CSV (accepted by most banks: SBI, Axis, Kotak, etc.)

export interface BankRow {
  name: string;
  accountNumber: string;
  ifscCode: string;
  amount: number; // net salary
}

export type BankFormat = "hdfc" | "icici" | "generic";

const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
const clean = (s: string) => s.replace(/[^A-Za-z0-9.\- ]/g, " ").trim();

/** HDFC eNET — salary to HDFC accounts: AccountNo,C,Amount(2dp),Narration. */
export function hdfcSalaryCsv(rows: BankRow[], narration: string): string {
  const lines = rows.map((r) => {
    const acct = clean(r.accountNumber).replace(/\s/g, "");
    const amount = r.amount.toFixed(2);
    return [acct, "C", amount, clean(narration)].join(",");
  });
  return lines.join("\r\n") + "\r\n";
}

/** ICICI PAB-SAL — fixed-width salary transfer file. */
export function iciciSalaryFile(rows: BankRow[], debitAccount: string): string {
  const debit = clean(debitAccount).replace(/\s/g, "").slice(0, 12).padStart(12, "0");
  const lines = rows.map((r) => {
    const name = clean(r.name).slice(0, 32);
    const bene = clean(r.accountNumber).replace(/\s/g, "").slice(0, 34);
    const ifsc = clean(r.ifscCode).toUpperCase().slice(0, 11);
    // Amount in paise, 13-digit zero-padded (per ICICI PAB-SAL spec).
    // Without this column the bank import pays 0 / rejects the file.
    const paise = Math.max(0, Math.round(r.amount * 100));
    const amount = String(paise).slice(0, 13).padStart(13, "0");
    return `${pad(name, 32)}${pad(debit, 12)}${pad(bene, 34)}${pad(ifsc, 11)}${amount}NFT`;
  });
  return lines.join("\r\n") + "\r\n";
}

/** Generic NEFT-style CSV: Beneficiary Name, Account Number, IFSC, Amount. */
export function genericNefCsv(rows: BankRow[], narration: string): string {
  const header = "Beneficiary Name,Account Number,IFSC Code,Amount,Narration";
  const lines = rows.map((r) => {
    const esc = (s: string) => `"${clean(s).replace(/"/g, '""')}"`;
    return [esc(r.name), esc(r.accountNumber.replace(/\s/g, "")), esc(r.ifscCode.toUpperCase()), r.amount.toFixed(2), esc(narration)].join(",");
  });
  return [header, ...lines].join("\r\n") + "\r\n";
}

export function buildBankFile(format: BankFormat, rows: BankRow[], debitAccount: string, narration: string): string {
  switch (format) {
    case "hdfc":
      return hdfcSalaryCsv(rows, narration);
    case "icici":
      return iciciSalaryFile(rows, debitAccount);
    case "generic":
      return genericNefCsv(rows, narration);
  }
}

export function bankFileName(format: BankFormat, month: string): string {
  const base = `salary-${month}`;
  switch (format) {
    case "hdfc":
      return `${base}-hdfc.csv`;
    case "icici":
      return `${base}-icici.txt`;
    case "generic":
      return `${base}-neft.csv`;
  }
}
