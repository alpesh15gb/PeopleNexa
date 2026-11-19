"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Rocket, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const BLUE_FOCUS = "focus:border-primary focus:ring-ring/25 focus-visible:ring-ring/40";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32)
    .replace(/-$/, "");

export function RegisterForm({ baseDomain = "peoplenexa.in" }: { baseDomain?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [slug, setSlug] = useState("");
  const address = normalize(slug);
  const [availability, setAvailability] = useState<{ slug: string; status: "available" | "taken" | "unknown" } | null>(null);
  const slugState = address.length < 2 ? "idle" : availability?.slug === address ? availability.status : "checking";

  // Debounced availability check as the user types.
  useEffect(() => {
    if (address.length < 2) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/slug?slug=${encodeURIComponent(address)}`, { signal: controller.signal });
        const data = await res.json();
        if (!controller.signal.aborted) setAvailability({ slug: address, status: res.ok && typeof data.available === "boolean" ? (data.available ? "available" : "taken") : "unknown" });
      } catch {
        if (!controller.signal.aborted) setAvailability({ slug: address, status: "unknown" });
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [address]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError("");
    const s = normalize(slug);
    if (s.length < 2) {
      setError("Please choose a workspace subdomain.");
      return;
    }
    if (slugState === "taken") {
      setError("That subdomain is not available. Pick another one.");
      return;
    }
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.get("companyName"),
          slug: s,
          name: form.get("name"),
          email: form.get("email"),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Registration failed");
        return;
      }
      const returnedSlug = String(data.slug ?? s).toLowerCase();
      const workspaceUrl = `https://${returnedSlug}.${baseDomain}/admin`;
      toast("success", `Welcome to PeopleNexa, ${data.companyName}! Your workspace: ${workspaceUrl}`);
      const hostname = window.location.hostname.toLowerCase();
      const isLocal =
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
      if (isLocal) {
        router.push("/admin");
        router.refresh();
      } else {
        window.location.href = workspaceUrl;
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-busy={loading} className="rounded-2xl border border-edge bg-card p-5 sm:p-7">
      <div className="space-y-4">
        <Field label="Company name">
          <Input name="companyName" required maxLength={120} placeholder="Acme Corp" className={`h-11 ${BLUE_FOCUS}`} />
        </Field>

        <Field label="Workspace subdomain" htmlFor="register-slug" hint="This becomes your team's web address">
          <div id="register-slug-controls" className="flex items-center overflow-hidden rounded-xl border border-input bg-card-2 transition-colors duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/40 motion-reduce:transition-none">
            <input
              id="register-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme-corp"
              autoComplete="off"
              autoCapitalize="none"
              required
              aria-invalid={slugState === "taken" || undefined}
              spellCheck={false}
              aria-describedby="slug-availability"
              className="h-11 w-2/5 min-w-0 flex-1 bg-transparent px-3.5 text-base text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:text-sm"
            />
            <span aria-hidden="true" className="shrink-0 select-none whitespace-nowrap pr-3.5 text-[11px] text-muted-foreground sm:text-[12.5px]">
              .{baseDomain}
            </span>
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center border-l border-edge">
              {slugState === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" />}
              {slugState === "available" && <Check className="h-4 w-4 text-emerald-400" />}
              {slugState === "taken" && <X className="h-4 w-4 text-rose-400" />}
            </span>
          </div>
          <p
            id="slug-availability"
            role="status"
            aria-live="polite"
            className={cn(
              "mt-1.5 text-[12px]",
              slugState === "taken" ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {slugState === "available" && `${address}.${baseDomain} is available.`}
            {slugState === "taken" && `${address}.${baseDomain} is already taken.`}
            {slugState === "checking" && `Checking ${address}.${baseDomain}…`}
            {slugState === "unknown" && "The address will be checked when you create the workspace."}
            {slugState === "idle" && "Letters, numbers and dashes — e.g. acme-corp, my-company"}
          </p>
        </Field>

        <Field label="Your full name">
          <Input name="name" required maxLength={120} placeholder="Admin" className={`h-11 ${BLUE_FOCUS}`} />
        </Field>
        <Field label="Work email">
          <Input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="admin@yourcompany.com" className={`h-11 ${BLUE_FOCUS}`} />
        </Field>
        <Field label="Password" hint="At least 6 characters">
          <Input name="password" type="password" required minLength={6} maxLength={72} autoComplete="new-password" placeholder="Create a password" className={`h-11 ${BLUE_FOCUS}`} />
        </Field>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-[13px] text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        loading={loading}
        className="mt-6 w-full"
      >
        <Rocket className="h-4 w-4" aria-hidden="true" />
        Create workspace
      </Button>
    </form>
  );
}
