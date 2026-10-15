"use client";
import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const EvidenceMap = dynamic(() => import("@/app/(portal)/admin/journeys/route-map").then(module => module.RouteMap), { ssr: false, loading: () => <div className="h-[360px] animate-pulse rounded-xl bg-tint" role="status">Loading map…</div> });

export function PunchPhoto({ src, label = "Punch selfie", children, className }: { src: string; label?: string; children?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false), [zoom, setZoom] = useState(false), [failed, setFailed] = useState(false);
  return <>
    <button type="button" aria-label={`View full image: ${label}`} className={className ?? "text-primary underline"} onClick={() => { setZoom(false); setFailed(false); setOpen(true); }}>{children ?? "View selfie"}</button>
    <Modal open={open} onClose={() => setOpen(false)} title={label} size="xl">
      {failed ? <p role="alert" className="text-sm text-muted-foreground">This image is unavailable or has expired. Refresh the page and try again.</p> : <>
        <div className="mb-3"><Button type="button" variant="outline" aria-pressed={zoom} onClick={() => setZoom(value => !value)}>{zoom ? "Fit to screen" : "Zoom in"}</Button></div>
        <div className="max-h-[65dvh] overflow-auto rounded-xl bg-black/20">
          <img src={src} alt={label} onError={() => setFailed(true)} className={zoom ? "block w-[200%] max-w-none" : "mx-auto block max-h-[65dvh] max-w-full object-contain"} />
        </div>
      </>}
    </Modal>
  </>;
}

export function PunchLocation({ lat, lng, label = "Punch location", accuracy, children, className }: { lat: number; lng: number; label?: string; accuracy?: number | null; children?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!valid) return <span>Location not recorded</span>;
  return <>
    <button type="button" aria-label={`View map: ${label}`} className={className ?? "text-primary underline"} onClick={() => setOpen(true)}>{children ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`}</button>
    <Modal open={open} onClose={() => setOpen(false)} title={label} description={`${lat.toFixed(6)}, ${lng.toFixed(6)}${accuracy == null ? "" : ` · GPS accuracy ±${Math.round(accuracy)}m`}`} size="xl">
      {open && <div className="overflow-hidden rounded-xl"><EvidenceMap markers={[{ label: "Punch location", point: { lat, lng } }]} height={360} /></div>}
    </Modal>
  </>;
}
