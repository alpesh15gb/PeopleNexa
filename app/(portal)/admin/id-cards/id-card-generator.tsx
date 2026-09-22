"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ID_CARD_ARTBOARD, ID_CARD_FONT, ID_CARD_LAYOUT, ID_CARD_SIZE, idCardDetails } from "@/lib/id-card-content";
import { safeLogoUrl } from "@/lib/branding-url";
import type { CompanyBranding } from "@/lib/company-branding";
import type { IdCardTemplate } from "@/lib/configuration";

type Employee = { id: string; employeeNumber: string; deviceCode: string | null; firstName: string; lastName: string; position: string | null; joiningDate: string | null; idCardIssuedAt: string | null; idCardValidUntil: string | null; phone: string | null; profilePicture: string | null; profile: { bloodGroup: string | null } | null };

export function IdCardGenerator() {
  const [deviceCode, setDeviceCode] = useState("");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [branding, setBranding] = useState<CompanyBranding | null>(null);
  const [template, setTemplate] = useState<IdCardTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [photoX, setPhotoX] = useState(50);
  const [photoY, setPhotoY] = useState(50);
  const toast = useToast();

  async function lookup(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`/api/id-cards?deviceCode=${encodeURIComponent(deviceCode.trim())}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not find employee.");
      setEmployee(data.employee); setBranding(data.branding); setTemplate(data.template); setPhotoX(50); setPhotoY(50);
    } catch (error) {
      setEmployee(null); setBranding(null); setTemplate(null);
      toast("error", error instanceof Error ? error.message : "Could not find employee.");
    } finally { setLoading(false); }
  }

  return <div className="space-y-6">
    <form onSubmit={lookup} className="flex max-w-xl gap-3"><Field label="Device ID"><Input value={deviceCode} onChange={(event) => setDeviceCode(event.target.value)} placeholder="Enter biometric Device ID" required /></Field><Button className="mt-6" type="submit" loading={loading}><Search className="h-4 w-4" /> Find employee</Button></form>
    {employee && <>
      <div className="grid gap-6 lg:grid-cols-2"><IdCardPreviewSide title="Front" employee={employee} branding={branding} template={template} photoPosition={{ x: photoX, y: photoY }} front /><IdCardPreviewSide title="Back" employee={employee} branding={branding} template={template} /></div>
      {employee.profilePicture && <section className="max-w-[306px] space-y-3 rounded-xl border border-edge bg-tint p-4"><div><h2 className="text-sm font-semibold">Photo framing</h2><p className="mt-1 text-xs text-muted-foreground">Adjust the photo position for this card. The PDF uses the same framing.</p></div><Field label="Horizontal position"><Input type="range" min="0" max="100" value={photoX} onChange={(event) => setPhotoX(Number(event.target.value))} /></Field><Field label="Vertical position"><Input type="range" min="0" max="100" value={photoY} onChange={(event) => setPhotoY(Number(event.target.value))} /></Field></section>}
      <a href={`/api/id-cards?deviceCode=${encodeURIComponent(deviceCode.trim())}&format=pdf&photoX=${photoX}&photoY=${photoY}`}><Button><Download className="h-4 w-4" /> Download front and back PDF</Button></a>
    </>}
  </div>;
}

export function IdCardPreviewSide({ title, employee, branding, template, front = false, photoPosition = { x: 50, y: 50 } }: { title: string; employee: Employee; branding: CompanyBranding | null; template: IdCardTemplate | null; front?: boolean; photoPosition?: { x: number; y: number } }) {
  const logo = safeLogoUrl(branding?.logoUrl);
  const contact = [branding?.address, branding?.contact].filter(Boolean).join(" | ");
  const background = front ? template?.frontBackgroundUrl ?? "/id-cards/1.png" : template?.backBackgroundUrl ?? "/id-cards/2.png";
  const fields = idCardDetails(employee);
  const at = (box: { x: number; y: number; width: number; height: number }) => ({ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` });
  const dynamicFont: CSSProperties = { fontFamily: `var(--font-id-card), ${ID_CARD_FONT.family}, Arial, sans-serif` };
  const cqw = (points: number) => `${(points / ID_CARD_SIZE.widthPt) * 100}cqw`;
  const fieldStyle: CSSProperties = { ...dynamicFont, fontSize: cqw(ID_CARD_LAYOUT.fields.fontSize), lineHeight: ID_CARD_LAYOUT.fields.lineHeight, ...at(ID_CARD_LAYOUT.fields) };
  const companyNameStyle: CSSProperties = { ...dynamicFont, ...at(ID_CARD_LAYOUT.branding.companyName), fontSize: cqw(ID_CARD_LAYOUT.branding.companyName.fontSize), lineHeight: ID_CARD_LAYOUT.branding.companyName.lineHeight };
  const contactStyle: CSSProperties = { ...dynamicFont, ...at(ID_CARD_LAYOUT.branding.contact), fontSize: cqw(ID_CARD_LAYOUT.branding.contact.fontSize), lineHeight: ID_CARD_LAYOUT.branding.contact.lineHeight, WebkitLineClamp: ID_CARD_LAYOUT.branding.contact.maxLines, WebkitBoxOrient: "vertical", display: "-webkit-box" };
  return <section><h2 className="mb-3 text-sm font-semibold">{title}</h2><div className="relative mx-auto w-full max-w-[306px] overflow-hidden bg-white shadow-lg" data-testid="id-card-preview-canvas" style={{ aspectRatio: ID_CARD_ARTBOARD.width / ID_CARD_ARTBOARD.height, overflow: "hidden", containerType: "inline-size" }}>
    <img src={background} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full" data-testid="id-card-artwork" style={{ objectFit: "contain" }} />
    {front && <>
      {!template && branding?.hasConfiguredValues && <><div className="absolute bg-white" style={at(ID_CARD_LAYOUT.header)} />{logo && <img src={logo} alt="" className="absolute object-contain" style={at(ID_CARD_LAYOUT.branding.logo)} />}<p className="absolute overflow-hidden text-center font-semibold text-[#985016]" style={{ ...companyNameStyle, left: logo ? companyNameStyle.left : "6%", width: logo ? companyNameStyle.width : "88%", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{branding.companyName}</p><div className="absolute bg-white" style={at(ID_CARD_LAYOUT.footer)} /><p className="absolute overflow-hidden text-center text-[#985016]" style={contactStyle}>{contact}</p></>}
      {(!template || template.frontContentPanel === "clean") && <div className="absolute bg-white" data-testid="id-card-content-panel" style={at(ID_CARD_LAYOUT.frontContentPanel)} />}
      <div className="absolute box-border overflow-hidden bg-white/30" data-testid="id-card-photo" style={{ ...at(ID_CARD_LAYOUT.photo), border: `${cqw(ID_CARD_LAYOUT.photo.borderWidth)} solid #ef7600`, borderRadius: cqw(ID_CARD_LAYOUT.photo.radius) }}>{employee.profilePicture ? <img src={employee.profilePicture} alt={`${employee.firstName} ${employee.lastName}`} className="h-full w-full object-cover" style={{ objectPosition: `${photoPosition.x}% ${photoPosition.y}%` }} /> : <span className="flex h-full items-center justify-center font-semibold text-[#985016]" style={{ ...dynamicFont, fontSize: cqw(ID_CARD_LAYOUT.fields.fontSize) }}>PHOTO</span>}</div>
      <div className="absolute overflow-hidden font-semibold text-[#985016]" data-testid="id-card-details" style={fieldStyle}>{fields.map(([label, value], index) => <div key={label} className="absolute grid min-w-0" data-testid="id-card-detail-row" style={{ top: `${(index * (ID_CARD_LAYOUT.fields.rowHeight + ID_CARD_LAYOUT.fields.gap) / ID_CARD_LAYOUT.fields.height) * 100}%`, width: "100%", height: `${(ID_CARD_LAYOUT.fields.rowHeight / ID_CARD_LAYOUT.fields.height) * 100}%`, gridTemplateColumns: `${ID_CARD_LAYOUT.fields.labelWidth * 100}% ${100 - ID_CARD_LAYOUT.fields.labelWidth * 100}%` }}><span className="min-w-0 overflow-hidden whitespace-nowrap pr-[0.4cqw]">{label}</span><span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">: {value}</span></div>)}</div>
    </>}
  </div></section>;
}
