"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

export function AuditFilter({ action, entity }: { action: string; entity: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [actionVal, setActionVal] = useState(action);
  const [entityVal, setEntityVal] = useState(entity);

  const push = (nextAction: string, nextEntity: string) => {
    const next = new URLSearchParams(params.toString());
    if (nextAction.trim()) next.set("action", nextAction.trim());
    else next.delete("action");
    if (nextEntity.trim()) next.set("entity", nextEntity.trim());
    else next.delete("entity");
    const qs = next.toString();
    router.replace(qs ? `/admin/audit?${qs}` : "/admin/audit");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="Filter by action"
        placeholder="Filter action…"
        value={actionVal}
        onChange={(e) => {
          setActionVal(e.target.value);
          push(e.target.value, entityVal);
        }}
        className="h-10 w-full sm:w-48"
      />
      <Input
        aria-label="Filter by entity"
        placeholder="Filter entity…"
        value={entityVal}
        onChange={(e) => {
          setEntityVal(e.target.value);
          push(actionVal, e.target.value);
        }}
        className="h-10 w-full sm:w-48"
      />
    </div>
  );
}
