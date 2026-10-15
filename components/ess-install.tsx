"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function EssInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false), [help, setHelp] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const done = () => { setInstalled(true); setPrompt(null); };
    update(); standalone.addEventListener("change", update);
    window.addEventListener("beforeinstallprompt", capture); window.addEventListener("appinstalled", done);
    return () => { standalone.removeEventListener("change", update); window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", done); };
  }, []);
  if (installed) return null;
  return <div className="rounded-xl border border-edge bg-card p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Install PeopleNexa ESS</p><p className="text-xs text-muted-foreground">Open ESS from your home screen. Location is used only when you clock in or out.</p></div>
    <Button type="button" variant="outline" onClick={async () => {
      if (!prompt) { setHelp(value => !value); return; }
      try { await prompt.prompt(); await prompt.userChoice; } finally { setPrompt(null); }
    }}>Install ESS</Button></div>
    {help && <p className="mt-3 text-xs text-muted-foreground">Android: open the browser menu and choose Install app or Add to Home screen. iPhone: open in Safari, tap Share, then Add to Home Screen. Installation requires an online HTTPS connection.</p>}
  </div>;
}
