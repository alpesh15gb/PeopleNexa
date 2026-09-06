"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MapPin } from "lucide-react";
import { Select } from "@/components/ui/select";

export function BranchPicker({
  branches,
  value,
  basePath = "/admin/attendance",
}: {
  branches: { id: string; name: string }[];
  value: string;
  basePath?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <div className="relative">
      <MapPin
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Select
        aria-label="Filter by branch"
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value) next.set("branch", e.target.value);
          else next.delete("branch");
          const qs = next.toString();
          router.push(qs ? `${basePath}?${qs}` : basePath);
        }}
        className="h-10 w-full pl-9 sm:w-52"
      >
        <option value="">All branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
