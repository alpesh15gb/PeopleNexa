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

function strongPassword(password: string) {
  return password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

export function RegisterForm({ baseDomain = "peoplenexa.in" }: { baseDomain?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [slug, setSlug] = useState("");
  const [slugState, setSlugState] = useState<"idle" | "checking" | "available" | "taken">("idle");

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

    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (!strongPassword(password)) {
      setError("Password must be at least 12 characters and include upper-case, lower-case and a number.");
      return;
    }

    setLoading(true);
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
      toast("success", `Welcome to PeopleNexa, ${data.companyName}!`);
      router.push("/admin");
      router.refresh();
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
          <Input name="companyName" required minLength={2} maxLength={120} placeholder="Acme Corp" className="h-11" />
        </Field>

        <Field label="Workspace subdomain" hint="This becomes your team's web address">
          <div className="flex items-center overflow-hidden rounded-xl border border-input bg-card-2 focus-within:ring-2 focus-within:ring-ring/40">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme-corp"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              className="h-11 w-2/5 min-w-0 flex-1 bg-transparent px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <span className="hidden select-none whitespace-nowrap pr-3.5 text-[12.5px] text-muted-foreground sm:block">.{baseDomain}</span>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center border-l border-edge">
              {slugState === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {slugState === "available" && <Check className="h-4 w-4 text-emerald-400" />}
              {slugState === "taken" && <X className="h-4 w-4 text-rose-400" />}
            </span>
          </div>
          <p className={cn("mt-1.5 text-[12px]", slugState === "taken" ? "text-rose-300" : slugState === "available" ? "text-emerald-400" : "text-muted-foreground")}>
            {slugState === "available" && `Great — ${normalize(slug)}.${baseDomain} is yours!`}
            {slugState === "taken" && `${normalize(slug)}.${baseDomain} is already taken.`}
            {slugState === "idle" && "Letters, numbers and dashes — e.g. acme-corp, my-company"}
          </p>
        </Field>

        <Field label="Your full name">
          <Input name="name" required minLength={2} maxLength={100} placeholder="Admin" className="h-11" />
        </Field>
        <Field label="Work email">
          <Input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="admin@yourcompany.com" className="h-11" />
        </Field>
        <Field label="Password" hint="12+ characters with upper-case, lower-case and a number">
          <Input name="password" type="password" required minLength={12} autoComplete="new-password" placeholder="Create a strong password" className="h-11" />
        </Field>
      </div>

      {error && <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3.5 py-2.5 text-[13px] text-rose-300">{error}</p>}

      <Button type="submit" size="lg" loading={loading} className="mt-6 w-full">
        <Rocket className="h-4 w-4" />
        Create company
      </Button>
    </form>
  );
}
