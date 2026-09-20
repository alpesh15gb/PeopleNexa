"use client";

import { useState, type FormEvent } from "react";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ID_CARD_LAYOUT, idCardDetails } from "@/lib/id-card-content";
import { safeLogoUrl } from "@/lib/branding-url";
import type { CompanyBranding } from "@/lib/company-branding";
import type { IdCardTemplate } from "@/lib/configuration";

type Employee = { employeeNumber: string; deviceCode: string | null; firstName: string; lastName: string; position: string | null; joiningDate: string | null; phone: string | null; profilePicture: string | null; profile: { bloodGroup: string | null } | null };

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
      <div className="grid gap-6 lg:grid-cols-2"><CardSide title="Front" employee={employee} branding={branding} template={template} photoPosition={{ x: photoX, y: photoY }} front /><CardSide title="Back" employee={employee} branding={branding} template={template} /></div>
      {employee.profilePicture && <section className="max-w-[306px] space-y-3 rounded-xl border border-edge bg-tint p-4"><div><h2 className="text-sm font-semibold">Photo framing</h2><p className="mt-1 text-xs text-muted-foreground">Adjust the photo position for this card. The PDF uses the same framing.</p></div><Field label="Horizontal position"><Input type="range" min="0" max="100" value={photoX} onChange={(event) => setPhotoX(Number(event.target.value))} /></Field><Field label="Vertical position"><Input type="range" min="0" max="100" value={photoY} onChange={(event) => setPhotoY(Number(event.target.value))} /></Field></section>}
      <a href={`/api/id-cards?deviceCode=${encodeURIComponent(deviceCode.trim())}&format=pdf&photoX=${photoX}&photoY=${photoY}`}><Button><Download className="h-4 w-4" /> Download front and back PDF</Button></a>
    </>}
  </div>;
}

function CardSide({ title, employee, branding, template, front = false, photoPosition = { x: 50, y: 50 } }: { title: string; employee: Employee; branding: CompanyBranding | null; template: IdCardTemplate | null; front?: boolean; photoPosition?: { x: number; y: number } }) {
  const logo = safeLogoUrl(branding?.logoUrl);
  const contact = [branding?.address, branding?.contact].filter(Boolean).join(" | ");
  const background = front ? template?.frontBackgroundUrl ?? "/id-cards/1.png" : template?.backBackgroundUrl ?? "/id-cards/2.png";
  const fields = idCardDetails(employee);
  const fieldStyle = { fontFamily: "Canva Sans, Arial, sans-serif", fontSize: "10px", lineHeight: 1, gridTemplateColumns: "34% 66%", top: `${ID_CARD_LAYOUT.fields.y * 100}%`, left: `${ID_CARD_LAYOUT.fields.x * 100}%`, width: `${ID_CARD_LAYOUT.fields.width * 100}%`, rowGap: `${ID_CARD_LAYOUT.fields.gap * 100}%`, gridAutoRows: `${ID_CARD_LAYOUT.fields.rowHeight * 100}%` };
  return <section><h2 className="mb-3 text-sm font-semibold">{title}</h2><div className="relative mx-auto aspect-[591/1004] w-full max-w-[306px] overflow-hidden bg-white bg-cover bg-center shadow-lg" style={{ backgroundImage: `url(${JSON.stringify(background)})`, backgroundSize: "cover", backgroundPosition: "center" }}>
    {branding?.hasConfiguredValues && <><div className="absolute inset-x-0 top-0 h-[22%] bg-white"><div className="absolute inset-x-[6%] top-[12%] h-[64%]">{logo && <img src={logo} alt="" className="h-full w-[25%] object-contain" />}<p className={`absolute top-[30%] truncate text-center text-[10px] font-bold text-[#985016] ${logo ? "left-[30%] w-[68%]" : "left-0 w-full"}`}>{branding.companyName}</p></div></div><div className="absolute inset-x-0 bottom-0 h-[15%] overflow-hidden bg-white px-[5%] pt-[5%] text-center text-[7px] leading-tight text-[#985016] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{contact}</div></>}
    {front && <><div className="absolute box-border overflow-hidden rounded-md border-[3px] border-[#ef7600] bg-white/30" style={{ left: `${ID_CARD_LAYOUT.photo.x * 100}%`, top: `${ID_CARD_LAYOUT.photo.y * 100}%`, width: `${ID_CARD_LAYOUT.photo.width * 100}%`, height: `${ID_CARD_LAYOUT.photo.height * 100}%` }}>{employee.profilePicture ? <img src={employee.profilePicture} alt={`${employee.firstName} ${employee.lastName}`} className="h-full w-full object-cover" style={{ objectPosition: `${photoPosition.x}% ${photoPosition.y}%` }} /> : <span className="flex h-full items-center justify-center text-[7px] font-semibold text-[#985016]">PHOTO</span>}</div><div className="absolute grid overflow-hidden font-bold leading-tight text-[#985016]" style={fieldStyle}>{fields.map(([label, value]) => <div key={label} className="contents"><span className="min-w-0 overflow-hidden whitespace-nowrap pr-1">{label}</span><span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">: {value}</span></div>)}</div></>}
  </div></section>;
}
