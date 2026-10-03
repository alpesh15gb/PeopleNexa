"use client";

import { Switch } from "@/components/ui/switch";

import { useState } from "react";
import { Save, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function FaceSettingsPanel({
  initial,
}: {
  initial: { enabled: boolean; matchThreshold: number; reviewThreshold: number };
}) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [matchThreshold, setMatchThreshold] = useState<number | null>(initial.matchThreshold);
  const [reviewThreshold, setReviewThreshold] = useState<number | null>(initial.reviewThreshold);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/face", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, matchThreshold, reviewThreshold }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast("success", enabled ? "Face match settings saved" : "Face matching disabled");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand text-white">
            <ScanFace className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-base font-semibold">Face match</h3>
            <p className="text-[12px] text-muted-foreground">
              Selfie verification thresholds for punch attendance — gray-zone scores go to the
              regularization review queue.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Match threshold" hint="Accept at or above this score (default 0.62)">
              <NumberInput
                min={0}
                max={1}
                step={0.01}
                value={matchThreshold}
                onValueChange={setMatchThreshold}
                className="h-11 w-40 font-mono"
              />
            </Field>
            <Field label="Review threshold" hint="Scores below this auto-reject; gray zone goes to review (default 0.50)">
              <NumberInput
                min={0}
                max={1}
                step={0.01}
                value={reviewThreshold}
                onValueChange={setReviewThreshold}
                className="h-11 w-40 font-mono"
              />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-edge bg-tint px-4 py-3.5">
            <div>
              <p id="face-enable-label" className="text-[13.5px] font-medium">Enable face matching</p>
              <p className="text-[12px] text-muted-foreground">
                Kill-switch — when off, punches skip face verification entirely.
              </p>
            </div>
            <Switch
              checked={enabled}
              aria-labelledby="face-enable-label"
              onCheckedChange={setEnabled}
            />
          </div>

          <Button onClick={save} loading={saving}>
            <Save className="h-4 w-4" /> Save face settings
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card-surface rounded-2xl p-5">
          <h4 className="text-[13px] font-semibold">How it works</h4>
          <ul className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-muted-foreground">
            <li>• Score ≥ match threshold → accepted automatically.</li>
            <li>• Score in [review threshold, match threshold) → human review.</li>
            <li>• Score &lt; review threshold → rejected (admin-only approve).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
