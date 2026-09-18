import PDFDocument from "pdfkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { idCardDetails } from "@/lib/id-card-content";

export type IdCardData = { employeeNumber: string; deviceCode: string | null; firstName: string; lastName: string; position: string | null; joiningDate: Date | null; phone: string | null; profilePicture: string | null; profile: { bloodGroup: string | null } | null };

const brown = "#985016";
const width = 153;
// Keep the supplied 591 × 1004 template at its native aspect ratio.
const height = width * (1004 / 591);
const photoFrame = { x: width * 0.28, y: height * 0.23, width: width * 0.37, height: height * 0.295, radius: 4 };
function photo(value: string | null) { if (!value?.startsWith("data:image/")) return null; const encoded = value.split(",", 2)[1]; return encoded ? Buffer.from(encoded, "base64") : null; }

export async function renderIdCardPdf(employee: IdCardData, crop = { x: 50, y: 50 }): Promise<Buffer> {
  const [front, back] = await Promise.all([readFile(path.join(process.cwd(), "public", "id-cards", "1.png")), readFile(path.join(process.cwd(), "public", "id-cards", "2.png"))]);
  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  doc.registerFont("CanvaSans", path.join(process.cwd(), "canva-sans-regular.otf"));
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.image(front, 0, 0, { width, height });
  const image = photo(employee.profilePicture);
  if (image) { try { const source = (doc as unknown as { openImage: (value: Buffer) => { width: number; height: number } }).openImage(image); const scale = Math.max(photoFrame.width / source.width, photoFrame.height / source.height); const imageWidth = source.width * scale; const imageHeight = source.height * scale; const imageX = photoFrame.x - (imageWidth - photoFrame.width) * (crop.x / 100); const imageY = photoFrame.y - (imageHeight - photoFrame.height) * (crop.y / 100); doc.save().roundedRect(photoFrame.x, photoFrame.y, photoFrame.width, photoFrame.height, photoFrame.radius).clip().image(image, imageX, imageY, { width: imageWidth, height: imageHeight }).restore(); } catch { /* The supplied template remains usable when a legacy photo is invalid. */ } }
  doc.roundedRect(photoFrame.x, photoFrame.y, photoFrame.width, photoFrame.height, photoFrame.radius).lineWidth(1.5).strokeColor("#ef7600").stroke();
  const fields = idCardDetails(employee);
  const positions = [139, 151, 163, 175, 187, 199];
  fields.forEach(([label, value], index) => { doc.font("CanvaSans").fontSize(6.5).fillColor(brown).text(label, 5, positions[index], { width: 47 }); doc.text(`: ${value}`, 52, positions[index], { width: 98, align: "left", lineBreak: false }); });
  doc.addPage({ size: [width, height], margin: 0 }); doc.image(back, 0, 0, { width, height });
  doc.end(); return done;
}
