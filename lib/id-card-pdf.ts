import PDFDocument from "pdfkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ID_CARD_FONT, ID_CARD_LAYOUT, ID_CARD_SIZE, idCardDetails } from "@/lib/id-card-content";
import { loadBrandLogo, safeLogoUrl, type CompanyBranding } from "@/lib/company-branding";
import type { IdCardTemplate } from "@/lib/configuration";

export type IdCardData = { employeeNumber: string; deviceCode: string | null; firstName: string; lastName: string; position: string | null; joiningDate: Date | null; idCardIssuedAt?: Date | null; idCardValidUntil?: Date | null; phone: string | null; profilePicture: string | null; profile: { bloodGroup: string | null } | null };

const brown = "#985016";
const width = ID_CARD_SIZE.widthPt;
const height = ID_CARD_SIZE.heightPt;
const pointBox = (box: { x: number; y: number; width: number; height: number }) => ({ x: width * box.x, y: height * box.y, width: width * box.width, height: height * box.height });
const photoFrame = pointBox(ID_CARD_LAYOUT.photo);
const fontPath = (weight: "400Regular" | "600SemiBold") => path.join(process.cwd(), "node_modules", "@expo-google-fonts", "inter", weight, `Inter_${weight}.ttf`);

function photo(value: string | null) { if (!value?.startsWith("data:image/")) return null; const encoded = value.split(",", 2)[1]; return encoded ? Buffer.from(encoded, "base64") : null; }

export async function renderIdCardPdf(employee: IdCardData, crop = { x: 50, y: 50 }, branding?: CompanyBranding, template?: IdCardTemplate | null): Promise<Buffer> {
  const [front, back] = await Promise.all([cardBackground(template?.frontBackgroundUrl, "1.png"), cardBackground(template?.backBackgroundUrl, "2.png")]);
  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  doc.registerFont(ID_CARD_FONT.regular, fontPath("400Regular"));
  doc.registerFont(ID_CARD_FONT.semibold, fontPath("600SemiBold"));
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  drawBackground(doc, front);
  if (!template && branding?.hasConfiguredValues) await drawBranding(doc, branding);
  if (!template || template.frontContentPanel === "clean") drawFrontContentPanel(doc);
  drawPhoto(doc, employee.profilePicture, crop);
  drawFields(doc, idCardDetails(employee));
  doc.addPage({ size: [width, height], margin: 0 });
  drawBackground(doc, back);
  doc.end();
  return done;
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
  const panel = pointBox(ID_CARD_LAYOUT.frontContentPanel);
  doc.rect(panel.x, panel.y, panel.width, panel.height).fill("white");
}

function drawPhoto(doc: PDFKit.PDFDocument, source: string | null, crop: { x: number; y: number }) {
  const image = photo(source);
  if (image) {
    try {
      const sourceImage = (doc as unknown as { openImage: (value: Buffer) => { width: number; height: number } }).openImage(image);
      const scale = Math.max(photoFrame.width / sourceImage.width, photoFrame.height / sourceImage.height);
      const imageWidth = sourceImage.width * scale;
      const imageHeight = sourceImage.height * scale;
      const imageX = photoFrame.x - (imageWidth - photoFrame.width) * (crop.x / 100);
      const imageY = photoFrame.y - (imageHeight - photoFrame.height) * (crop.y / 100);
      doc.save().roundedRect(photoFrame.x, photoFrame.y, photoFrame.width, photoFrame.height, ID_CARD_LAYOUT.photo.radius).clip().image(image, imageX, imageY, { width: imageWidth, height: imageHeight }).restore();
    } catch { /* A legacy invalid photo must not prevent card generation. */ }
  }
  doc.roundedRect(photoFrame.x, photoFrame.y, photoFrame.width, photoFrame.height, ID_CARD_LAYOUT.photo.radius).lineWidth(ID_CARD_LAYOUT.photo.borderWidth).strokeColor("#ef7600").stroke();
}

function drawFields(doc: PDFKit.PDFDocument, fields: ReturnType<typeof idCardDetails>) {
  const box = pointBox(ID_CARD_LAYOUT.fields);
  const labelWidth = box.width * ID_CARD_LAYOUT.fields.labelWidth;
  const rowHeight = height * ID_CARD_LAYOUT.fields.rowHeight;
  const rowGap = height * ID_CARD_LAYOUT.fields.gap;
  fields.forEach(([label, value], index) => {
    const y = box.y + index * (rowHeight + rowGap);
    const options = { height: rowHeight, lineBreak: false, ellipsis: ID_CARD_LAYOUT.fields.overflow === "ellipsis" };
    doc.font(ID_CARD_FONT.semibold).fontSize(ID_CARD_LAYOUT.fields.fontSize).fillColor(brown).text(label, box.x, y, { ...options, width: labelWidth });
    doc.text(`: ${value}`, box.x + labelWidth, y, { ...options, width: box.width - labelWidth });
  });
}

async function drawBranding(doc: PDFKit.PDFDocument, branding: CompanyBranding) {
  const header = pointBox(ID_CARD_LAYOUT.header);
  const footer = pointBox(ID_CARD_LAYOUT.footer);
  const logoBox = pointBox(ID_CARD_LAYOUT.branding.logo);
  const name = pointBox(ID_CARD_LAYOUT.branding.companyName);
  const contactBox = pointBox(ID_CARD_LAYOUT.branding.contact);
  doc.rect(header.x, header.y, header.width, header.height).fill("white");
  const logo = await loadBrandLogo(branding.logoUrl);
  if (logo) { try { doc.image(logo, logoBox.x, logoBox.y, { fit: [logoBox.width, logoBox.height] }); } catch { /* Invalid remote image must not prevent card generation. */ } }
  doc.font(ID_CARD_FONT.semibold).fontSize(ID_CARD_LAYOUT.branding.companyName.fontSize).fillColor(brown).text(branding.companyName, logo ? name.x : width * 0.06, name.y, { width: logo ? name.width : width * 0.88, height: name.height, align: "center", lineBreak: false, ellipsis: true });
  doc.rect(footer.x, footer.y, footer.width, footer.height).fill("white");
  const contact = [branding.address, branding.contact].filter(Boolean).join(" | ");
  if (contact) doc.font(ID_CARD_FONT.regular).fontSize(ID_CARD_LAYOUT.branding.contact.fontSize).fillColor(brown).text(contact, contactBox.x, contactBox.y, { width: contactBox.width, height: contactBox.height, align: "center", lineGap: ID_CARD_LAYOUT.branding.contact.fontSize * (ID_CARD_LAYOUT.branding.contact.lineHeight - 1), ellipsis: true });
}
