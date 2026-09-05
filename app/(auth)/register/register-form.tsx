"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Rocket, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

export function RegisterForm({ baseDomain = "peoplenexa.in" }: { baseDomain?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [slug, setSlug] = useState("");
  const [slugState, setSlugState] = useState<"idle" | "checking" | "available" | "taken">("idle");

  // Debounced availability check as the user types.
  useEffect(() => {
    const s = normalize(slug);
    if (s.length < 2) {
      setSlugState("idle");
      return;
    }
    let cancelled = false;
    setSlugState("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/slug?slug=${encodeURIComponent(s)}`);
        const data = await res.json();
        if (!cancelled) setSlugState(data.available ? "available" : "taken");
      } catch {
        if (!cancelled) setSlugState("idle");
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [slug]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const s = normalize(slug);
    if (s.length < 2) {
      setError("Please choose a workspace subdomain.");
      return;
    }
    if (slugState !== "available") {
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
    <form onSubmit={onSubmit} className="card-surface rounded-2xl p-6 sm:p-7">
      <div className="space-y-4">
        <Field label="Company name">
          <Input name="companyName" required placeholder="Acme Corp" className="h-11" />
        </Field>

        <Field label="Workspace subdomain" hint="This becomes your team's web address">
          <div className="flex items-center overflow-hidden rounded-xl border border-input bg-card-2 focus-within:ring-2 focus-within:ring-ring/40">
            <label htmlFor="register-slug" className="sr-only">
              Workspace subdomain
            </label>
            <input
              id="register-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme-corp"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="slug-availability"
              className="h-11 w-2/5 min-w-0 flex-1 bg-transparent px-3.5 text-base text-foreground outline-none placeholder:text-muted-foreground/60 sm:text-sm"
            />
            <span aria-hidden="true" className="select-none whitespace-nowrap pr-3.5 text-[12.5px] text-muted-foreground">
              .{baseDomain}
            </span>
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center border-l border-edge">
              {slugState === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
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
              slugState === "taken" ? "text-rose-300" : slugState === "available" ? "text-emerald-400" : "text-muted-foreground"
            )}
          >
            {slugState === "available" && `Great — ${normalize(slug)}.${baseDomain} is yours!`}
            {slugState === "taken" && `${normalize(slug)}.${baseDomain} is already taken.`}
            {slugState === "idle" && "Letters, numbers and dashes — e.g. acme-corp, my-company"}
          </p>
        </Field>

        <Field label="Your full name">
          <Input name="name" required placeholder="Admin" className="h-11" />
        </Field>
        <Field label="Work email">
          <Input name="email" type="email" required autoComplete="email" placeholder="admin@yourcompany.com" className="h-11" />
        </Field>
        <Field label="Password" hint="At least 6 characters">
          <Input name="password" type="password" required autoComplete="new-password" placeholder="Create a password" className="h-11" />
        </Field>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3.5 py-2.5 text-[13px] text-rose-300">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" loading={loading} className="mt-6 w-full">
        <Rocket className="h-4 w-4" />
        Create company
      </Button>
    </form>
  );
}
