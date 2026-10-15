"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function PWARegister() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname.startsWith("/employee") && pathname !== "/login" && pathname !== "/change-password") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration is best-effort; the app works fine without it.
    });
  }, [pathname]);
  return null;
}
