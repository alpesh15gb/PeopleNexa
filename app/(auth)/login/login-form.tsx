"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const slug = String(form.get("slug") ?? "").toLowerCase().trim();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(slug ? { "X-Tenant-Slug": slug } : {}),
        },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          ...(slug ? { slug } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Invalid email or password");
        return;
      }
      toast("success", "Login successful — welcome back!");
      router.push(data.role === "admin" ? "/admin" : "/employee");
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
        <Field label="Workspace (optional)" hint="Your workspace subdomain, e.g. acme-corp">
          <Input
            name="slug"
            autoComplete="off"
            spellCheck={false}
            placeholder="your-workspace"
            className="h-11"
          />
        </Field>
        <Field label="Email address">
          <Input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="admin@yourcompany.com"
            className="h-11"
          />
        </Field>
        <Field label="Password">
          <div className="relative">
            <Input
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              className="h-11 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-tint hover:text-foreground"
            >
              {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
            </button>
          </div>
        </Field>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3.5 py-2.5 text-[13px] text-rose-300">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" loading={loading} className="mt-6 w-full">
        <LogIn className="h-4 w-4" />
        Sign in
      </Button>
    </form>
  );
}
