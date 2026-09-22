import PDFDocument from "pdfkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ID_CARD_ARTBOARD, ID_CARD_LAYOUT, idCardDetails } from "@/lib/id-card-content";
import { loadBrandLogo, safeLogoUrl, type CompanyBranding } from "@/lib/company-branding";
import type { IdCardTemplate } from "@/lib/configuration";

export type IdCardData = { employeeNumber: string; deviceCode: string | null; firstName: string; lastName: string; position: string | null; joiningDate: Date | null; idCardIssuedAt?: Date | null; idCardValidUntil?: Date | null; phone: string | null; profilePicture: string | null; profile: { bloodGroup: string | null } | null };

const brown = "#985016";
const width = 153;
const height = width * (ID_CARD_ARTBOARD.height / ID_CARD_ARTBOARD.width);
const photoFrame = { x: width * ID_CARD_LAYOUT.photo.x, y: height * ID_CARD_LAYOUT.photo.y, width: width * ID_CARD_LAYOUT.photo.width, height: height * ID_CARD_LAYOUT.photo.height, radius: 4 };
function photo(value: string | null) { if (!value?.startsWith("data:image/")) return null; const encoded = value.split(",", 2)[1]; return encoded ? Buffer.from(encoded, "base64") : null; }

export async function renderIdCardPdf(employee: IdCardData, crop = { x: 50, y: 50 }, branding?: CompanyBranding, template?: IdCardTemplate | null): Promise<Buffer> {
  const [front, back] = await Promise.all([cardBackground(template?.frontBackgroundUrl, "1.png"), cardBackground(template?.backBackgroundUrl, "2.png")]);
  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  doc.registerFont("CanvaSans", path.join(process.cwd(), "canva-sans-regular.otf"));
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  drawBackground(doc, front);
  // Uploaded artwork owns its header, footer and motif, so app branding is
  // drawn only on the bundled fallback artwork.
  if (!template && branding?.hasConfiguredValues) await drawBranding(doc, branding);
  if (!template || template.frontContentPanel === "clean") drawFrontContentPanel(doc);
  const image = photo(employee.profilePicture);
  if (image) { try { const source = (doc as unknown as { openImage: (value: Buffer) => { width: number; height: number } }).openImage(image); const scale = Math.max(photoFrame.width / source.width, photoFrame.height / source.height); const imageWidth = source.width * scale; const imageHeight = source.height * scale; const imageX = photoFrame.x - (imageWidth - photoFrame.width) * (crop.x / 100); const imageY = photoFrame.y - (imageHeight - photoFrame.height) * (crop.y / 100); doc.save().roundedRect(photoFrame.x, photoFrame.y, photoFrame.width, photoFrame.height, photoFrame.radius).clip().image(image, imageX, imageY, { width: imageWidth, height: imageHeight }).restore(); } catch { /* The supplied template remains usable when a legacy photo is invalid. */ } }
  doc.roundedRect(photoFrame.x, photoFrame.y, photoFrame.width, photoFrame.height, photoFrame.radius).lineWidth(1.5).strokeColor("#ef7600").stroke();
  const fields = idCardDetails(employee);
  const fieldsX = width * ID_CARD_LAYOUT.fields.x;
  const fieldsY = height * ID_CARD_LAYOUT.fields.y;
  const fieldsWidth = width * ID_CARD_LAYOUT.fields.width;
  const rowHeight = height * ID_CARD_LAYOUT.fields.rowHeight;
  const rowGap = height * ID_CARD_LAYOUT.fields.gap;
  fields.forEach(([label, value], index) => {
    const y = fieldsY + index * (rowHeight + rowGap);
    doc.font("CanvaSans").fontSize(6.5).fillColor(brown).text(label, fieldsX, y, { width: fieldsWidth * 0.34, height: rowHeight, lineBreak: false, ellipsis: true });
    doc.text(`: ${value}`, fieldsX + fieldsWidth * 0.34, y, { width: fieldsWidth * 0.66, height: rowHeight, lineBreak: false, ellipsis: true });
  });
  doc.addPage({ size: [width, height], margin: 0 }); drawBackground(doc, back);
  doc.end(); return done;
}

async function cardBackground(source: string | undefined, fallback: string) {
  const image = await loadBrandLogo(safeLogoUrl(source));
  return image ?? readFile(path.join(process.cwd(), "public", "id-cards", fallback));
}

function drawBackground(doc: PDFKit.PDFDocument, image: Buffer) {
  const source = (doc as unknown as { openImage: (value: Buffer) => { width: number; height: number } }).openImage(image);
  const scale = Math.max(width / source.width, height / source.height);
  const imageWidth = source.width * scale;
  const imageHeight = source.height * scale;
  doc.image(image, (width - imageWidth) / 2, (height - imageHeight) / 2, { width: imageWidth, height: imageHeight });
}

function drawFrontContentPanel(doc: PDFKit.PDFDocument) {
  doc.rect(
    width * ID_CARD_LAYOUT.frontContentPanel.x,
    height * ID_CARD_LAYOUT.frontContentPanel.y,
    width * ID_CARD_LAYOUT.frontContentPanel.width,
    height * ID_CARD_LAYOUT.frontContentPanel.height,
  ).fill("white");
}

async function drawBranding(doc: PDFKit.PDFDocument, branding: CompanyBranding) {
  // Branding belongs to the front header/footer; the back artwork owns its instructions.
  doc.rect(width * ID_CARD_LAYOUT.header.x, height * ID_CARD_LAYOUT.header.y, width * ID_CARD_LAYOUT.header.width, height * ID_CARD_LAYOUT.header.height).fill("white");
  const logo = await loadBrandLogo(branding.logoUrl);
  if (logo) { try { doc.image(logo, 9, 7, { fit: [34, 34] }); } catch { /* Invalid remote image must not prevent card generation. */ } }
  doc.font("Helvetica-Bold").fontSize(8).fillColor(brown).text(branding.companyName, logo ? 49 : 9, 17, { width: logo ? 95 : 135, align: "center", ellipsis: true });
  doc.rect(width * ID_CARD_LAYOUT.footer.x, height * ID_CARD_LAYOUT.footer.y, width * ID_CARD_LAYOUT.footer.width, height * ID_CARD_LAYOUT.footer.height).fill("white");
  const contact = [branding.address, branding.contact].filter(Boolean).join(" | ");
  if (contact) doc.font("Helvetica").fontSize(5.5).fillColor(brown).text(contact, 7, height - 29, { width: width - 14, align: "center", ellipsis: true, height: 21 });
}
