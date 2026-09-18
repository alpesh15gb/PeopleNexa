import PDFDocument from "pdfkit";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type IdCardData = { employeeNumber: string; deviceCode: string | null; firstName: string; lastName: string; position: string | null; joiningDate: Date | null; phone: string | null; profilePicture: string | null; profile: { bloodGroup: string | null } | null };

const brown = "#985016";
function date(value: Date | null) { return value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" }).format(value) : "-"; }
function photo(value: string | null) { if (!value?.startsWith("data:image/")) return null; const encoded = value.split(",", 2)[1]; return encoded ? Buffer.from(encoded, "base64") : null; }

export async function renderIdCardPdf(employee: IdCardData): Promise<Buffer> {
  const width = 153; const height = 244;
  const [front, back] = await Promise.all([readFile(path.join(process.cwd(), "public", "id-cards", "keystone-front.png")), readFile(path.join(process.cwd(), "public", "id-cards", "keystone-back.png"))]);
  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.image(front, 0, 0, { width, height });
  const image = photo(employee.profilePicture);
  if (image) { try { doc.image(image, 46, 58, { fit: [55, 69], align: "center", valign: "center" }); } catch { /* The supplied template remains usable when a legacy photo is invalid. */ } }
  // The supplied front contains sample values. Cover only that value column before adding the selected employee.
  doc.opacity(0.94).rect(52, 132, 100, 87).fill("#ffffff"); doc.opacity(1);
  const values = [employee.deviceCode ?? employee.employeeNumber, `${employee.firstName} ${employee.lastName}`.trim(), employee.position ?? "-", date(employee.joiningDate), employee.profile?.bloodGroup ?? "-", employee.phone ?? "-"];
  const positions = [134, 145, 164, 183, 196, 207];
  values.forEach((value, index) => doc.font("Helvetica-Bold").fontSize(index === 1 ? 7.4 : 8.4).fillColor(brown).text(`: ${value}`, 52, positions[index], { width: 98, align: "left" }));
  doc.addPage({ size: [width, height], margin: 0 }); doc.image(back, 0, 0, { width, height });
  doc.end(); return done;
}
