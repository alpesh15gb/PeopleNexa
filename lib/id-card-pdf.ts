import PDFDocument from "pdfkit";

export type IdCardData = { employeeNumber: string; deviceCode: string | null; firstName: string; lastName: string; position: string | null; joiningDate: Date | null; phone: string | null; profilePicture: string | null; profile: { bloodGroup: string | null } | null };

const orange = "#ef7600";
const brown = "#985016";
const address = "H.No: 8-2-350/5/1, Road No-03,\nBanjara Hills, Hyderabad, Telangana 500034\nPhone: 9393645644\nEmail: hyd@keystoneinfra.com";

function date(value: Date | null) { return value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" }).format(value) : "-"; }
function photo(value: string | null) { if (!value?.startsWith("data:image/")) return null; const encoded = value.split(",", 2)[1]; return encoded ? Buffer.from(encoded, "base64") : null; }
function line(doc: PDFKit.PDFDocument, label: string, value: string, y: number) { doc.font("Helvetica-Bold").fontSize(8.5).fillColor(brown).text(label, 9, y, { width: 48 }); doc.font("Helvetica-Bold").text(`: ${value}`, 58, y, { width: 85, align: "left" }); }

export async function renderIdCardPdf(employee: IdCardData): Promise<Buffer> {
  const width = 153; const height = 244;
  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const name = `${employee.firstName} ${employee.lastName}`.trim();
  const id = employee.deviceCode ?? employee.employeeNumber;
  doc.rect(0, 0, width, height).fill("#ffffff");
  doc.opacity(0.08).fillColor(orange).font("Helvetica-Bold").fontSize(105).text("K", 34, 85, { width: 90, align: "center" }); doc.opacity(1);
  doc.font("Helvetica-Bold").fontSize(17).fillColor(orange).text("K", 68, 8, { width: 18, align: "center" });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(brown).text("KEYSTONE INFRA PVT. LTD.", 5, 27, { width: width - 10, align: "center" });
  doc.roundedRect(43, 44, 67, 91, 4).lineWidth(2).strokeColor(orange).stroke();
  const image = photo(employee.profilePicture);
  if (image) { try { doc.image(image, 46, 47, { fit: [61, 85], align: "center", valign: "center" }); } catch { /* Invalid legacy image data falls back to placeholder. */ } }
  else { doc.rect(46, 47, 61, 85).fill("#e8f6ff"); doc.fillColor("#7fb3d5").font("Helvetica").fontSize(7).text("PHOTO", 46, 87, { width: 61, align: "center" }); }
  line(doc, "Emp. ID", id, 140); line(doc, "Emp. Name", name, 151); line(doc, "Designation", employee.position ?? "-", 170); line(doc, "DOJ", date(employee.joiningDate), 190); line(doc, "Blood Group", employee.profile?.bloodGroup ?? "-", 201); line(doc, "Contact", employee.phone ?? "-", 212);
  doc.rect(0, 224, width, 3).fill(orange); doc.font("Helvetica").fontSize(6.7).fillColor(brown).text(address, 7, 229, { width: width - 14, align: "center", lineGap: 1 });

  doc.addPage({ size: [width, height], margin: 0 });
  doc.rect(0, 0, width, height).fill("#ffffff"); doc.opacity(0.08).fillColor(orange).font("Helvetica-Bold").fontSize(110).text("K", 34, 93, { width: 90, align: "center" }); doc.opacity(1);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(brown).text("Instructions", 9, 12); doc.rect(0, 27, width, 3).fill(orange);
  const instructions = ["This Identity Card Must Be Worn and prominently displayed by employee on duty and produced on demand by Security Staff Or Any Authorized Management representative", "This Card Is Not Transferable. Misuse Of Any Kind Will Invite Disciplinary Action", "Loss Of Card Must Be Immediately Intimated To Human Resource Dept", "On Cessation Of Employment, employee must Return This Card To Human Resource Dept"];
  let y = 36;
  for (const item of instructions) { doc.fillColor(brown).font("Helvetica-Bold").fontSize(6).text("•", 7, y); doc.fontSize(7.4).text(item, 18, y, { width: 128, align: "center", lineGap: 2 }); y += 47; }
  doc.font("Helvetica-Bold").fontSize(7.2).fillColor(brown).text("If Found Please return This Card To:", 8, 190, { width: 137, align: "center" }); doc.fontSize(9).text("KEYSTONE INFRA PVT. LTD.", 8, 205, { width: 137, align: "center" }); doc.rect(0, 220, width, 3).fill(orange); doc.font("Helvetica").fontSize(6.7).text(address, 7, 225, { width: width - 14, align: "center", lineGap: 1 });
  doc.end(); return done;
}
