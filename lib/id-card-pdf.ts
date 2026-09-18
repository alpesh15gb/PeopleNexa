import PDFDocument from "pdfkit";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type IdCardData = { employeeNumber: string; deviceCode: string | null; firstName: string; lastName: string; position: string | null; joiningDate: Date | null; phone: string | null; profilePicture: string | null; profile: { bloodGroup: string | null } | null };

const brown = "#985016";
const width = 153;
// Keep the supplied 591 × 1004 template at its native aspect ratio.
const height = width * (1004 / 591);
const photoFrame = { x: width * 0.28, y: height * 0.23, width: width * 0.37, height: height * 0.295, radius: 4 };
function date(value: Date | null) { return value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" }).format(value) : "-"; }
function photo(value: string | null) { if (!value?.startsWith("data:image/")) return null; const encoded = value.split(",", 2)[1]; return encoded ? Buffer.from(encoded, "base64") : null; }

export async function renderIdCardPdf(employee: IdCardData): Promise<Buffer> {
  const [front, back] = await Promise.all([readFile(path.join(process.cwd(), "public", "id-cards", "1.png")), readFile(path.join(process.cwd(), "public", "id-cards", "2.png"))]);
  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  doc.registerFont("CanvaSans", path.join(process.cwd(), "canva-sans-regular.otf"));
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.image(front, 0, 0, { width, height });
  const image = photo(employee.profilePicture);
  if (image) { try { doc.save().roundedRect(photoFrame.x, photoFrame.y, photoFrame.width, photoFrame.height, photoFrame.radius).clip().image(image, photoFrame.x, photoFrame.y, { cover: [photoFrame.width, photoFrame.height], align: "center", valign: "center" }).restore(); } catch { /* The supplied template remains usable when a legacy photo is invalid. */ } }
  doc.roundedRect(photoFrame.x, photoFrame.y, photoFrame.width, photoFrame.height, photoFrame.radius).lineWidth(1.5).strokeColor("#ef7600").stroke();
  const values = [employee.employeeNumber, `${employee.firstName} ${employee.lastName}`.trim(), employee.position ?? "-", date(employee.joiningDate), employee.profile?.bloodGroup ?? "-", employee.phone ?? "-"];
  const labels = ["Emp. ID", "Emp. Name", "Designation", "DOJ", "Blood Group", "Contact"];
  const positions = [139, 151, 163, 175, 187, 199];
  values.forEach((value, index) => { doc.font("CanvaSans").fontSize(6.5).fillColor(brown).text(labels[index], 5, positions[index], { width: 47 }); doc.text(`: ${value}`, 52, positions[index], { width: 98, align: "left" }); });
  doc.addPage({ size: [width, height], margin: 0 }); doc.image(back, 0, 0, { width, height });
  doc.end(); return done;
}
