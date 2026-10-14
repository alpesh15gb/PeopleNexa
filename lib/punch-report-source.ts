export function nearestReportSource<T extends { punchTime: Date; source: string; device: { name: string; serialNumber: string } | null; realtimeDevice: { name: string; serialNumber: string } | null }>(punches: T[], at: Date | null) {
  if (!at) return null;
  const nearest = punches.reduce<T | null>((best, punch) => !best || Math.abs(punch.punchTime.getTime() - at.getTime()) < Math.abs(best.punchTime.getTime() - at.getTime()) ? punch : best, null);
  if (!nearest || Math.abs(nearest.punchTime.getTime() - at.getTime()) > 1000) return null;
  return nearest.source === "mobile" ? { name: "Mobile app", serialNumber: "" } : nearest.device ?? nearest.realtimeDevice;
}
