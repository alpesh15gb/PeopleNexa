"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const BLUE_FOCUS = "focus:border-primary focus:ring-ring/25 focus-visible:ring-ring/40";

export function LoginForm({ workspace }: { workspace: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const slug = String(form.get("slug") ?? "").toLowerCase().trim();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier: form.get("identifier"),
          password: form.get("password"),
          ...(slug ? { slug } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Invalid employee ID, email or password");
        return;
      }
      toast("success", "Login successful — welcome back!");
      router.replace(data.next);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-busy={loading} className="rounded-2xl border border-edge bg-card p-5 sm:p-7">
      <div className="space-y-4">
        {!workspace && <Field label="Workspace" hint="The first part of your workspace address">
          <Input
            name="slug"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="your-workspace"
            autoCapitalize="none"
            className={`h-11 ${BLUE_FOCUS}`}
          />
        </Field>}
        <Field label="Employee ID or email">
          <Input
            name="identifier"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Your employee code or email"
            className={`h-11 ${BLUE_FOCUS}`}
          />
        </Field>
        <Field label="Password" htmlFor="workspace-password">
          <div id="workspace-password-controls" className="relative">
            <Input
              name="password"
              id="workspace-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              className={`h-11 pr-11 ${BLUE_FOCUS}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-tint hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:transform-none"
            >
              {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
            </button>
          </div>
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
        <LogIn className="h-4 w-4" aria-hidden="true" />
        Sign in
      </Button>
    </form>
  );
}
