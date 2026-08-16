"use client";

import { useEffect, useRef, useState } from "react";

export type MapPoint = { lat: number; lng: number; at?: string; accuracy?: number | null };

type LeafletModule = typeof import("leaflet");

let leafletPromise: Promise<LeafletModule> | null = null;
function loadLeaflet(): Promise<LeafletModule> {
  if (!leafletPromise) leafletPromise = import("leaflet");
  return leafletPromise;
}

/**
 * Leaflet map that draws one or more routes (polylines) and/or markers.
 * Rendered client-side only (no SSR). The map initializes once and content
 * redraws whenever the routes/markers props change.
 */
export function RouteMap({
  routes,
  markers,
  height = 420,
}: {
  routes?: { label: string; points: MapPoint[]; color?: string }[];
  markers?: { label: string; point: MapPoint }[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [L, setL] = useState<LeafletModule | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const drawnKeyRef = useRef("");

  // Init the map once leaflet is loaded.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((mod) => {
      if (cancelled || !containerRef.current) return;
      const map = mod.map(containerRef.current, { zoomControl: true }).setView([20.5937, 78.9629], 5);
      mod.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      layerRef.current = mod.layerGroup().addTo(map);
      mapRef.current = map;
      setL(mod);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Redraw content when routes/markers change (after map + leaflet ready).
  useEffect(() => {
    if (!L || !mapRef.current || !layerRef.current) return;
    const key = JSON.stringify({ routes, markers });
    if (drawnKeyRef.current === key) return;
    drawnKeyRef.current = key;

    layerRef.current.clearLayers();
    const bounds: [number, number][] = [];

    for (const r of routes ?? []) {
      if (r.points.length === 0) continue;
      const latlngs = r.points.map((p) => [p.lat, p.lng] as [number, number]);
      L.polyline(latlngs, { color: r.color ?? "#6366f1", weight: 4, opacity: 0.85 }).addTo(layerRef.current!);
      const first = latlngs[0];
      const last = latlngs[latlngs.length - 1];
      L.circleMarker(first, { radius: 7, color: "#10b981", fillColor: "#10b981", fillOpacity: 1 }).addTo(layerRef.current!);
      L.circleMarker(last, { radius: 7, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1 }).addTo(layerRef.current!);
      // divIcon instead of the default marker image — no asset 404s, works offline.
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#6366f1;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      L.marker(last, { icon }).bindPopup(`<b>${r.label}</b>`).addTo(layerRef.current!);
      bounds.push(...latlngs);
    }

    for (const m of markers ?? []) {
      L.circleMarker([m.point.lat, m.point.lng], {
        radius: 8,
        color: "#6366f1",
        fillColor: "#6366f1",
        fillOpacity: 0.9,
      })
        .bindPopup(`<b>${m.label}</b>${m.point.at ? `<br/>${new Date(m.point.at).toLocaleTimeString()}` : ""}`)
        .addTo(layerRef.current!);
      bounds.push([m.point.lat, m.point.lng]);
    }

    if (bounds.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
    }
  }, [L, routes, markers]);

  return <div ref={containerRef} className="z-0 w-full overflow-hidden rounded-xl border border-edge" style={{ height }} />;
}
