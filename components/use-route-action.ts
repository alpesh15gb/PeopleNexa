"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Open a form when linked directly and remove the action when the form closes. */
export function useRouteAction(action: string) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requested = params.get("action") === action;
  const [open, setOpen] = useState(requested);

  useEffect(() => {
    setOpen(requested);
  }, [requested]);

  function setFormOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen || !requested) return;
    const next = new URLSearchParams(params.toString());
    next.delete("action");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return [open, setFormOpen] as const;
}
