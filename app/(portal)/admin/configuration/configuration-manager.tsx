"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Eye,
  Plus,
  Save,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DASHBOARD_WIDGETS,
  type DashboardWidgetKey,
  type DashboardWidgetSize,
} from "@/lib/configuration";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

type Profile = {
  legalName?: string | null;
  displayName?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  taxId?: string | null;
  registrationNo?: string | null;
  legalDetails?: unknown;
} | null;
type Location = { id: string; name: string; code: string; profile: Profile };
type ConfigurationRecord = {
  id: string;
  kind: string;
  version: number;
  active: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  activatedBy: string | null;
  activatedAt: Date | null;
  location: { name: string } | null;
  payload: unknown;
};
type Widget = {
  key: DashboardWidgetKey;
  enabled: boolean;
  order: number;
  size: DashboardWidgetSize;
};
const labels: Record<DashboardWidgetKey, string> = {
  total_employees: "Total employees",
  present: "Present",
  late: "Late",
  permission: "Permission",
  absent: "Absent",
  pending_leaves: "Pending leaves",
  pending_leave_requests: "Leave requests",
  attendance_trend: "Attendance trend",
  device_attendance: "Biometric attendance",
  project_attendance: "Project attendance",
  todays_attendance: "Today's attendance",
  driving_license_expiry: "License expiry",
  birthdays: "Birthdays",
  anniversaries: "Anniversaries",
  new_joiners: "New joiners",
  departments: "Departments",
  gender_ratio: "Gender ratio",
};
const defaultWidgets = (): Widget[] =>
  DASHBOARD_WIDGETS.map((key, order) => ({
    key,
    order,
    enabled: true,
    size:
      key.includes("attendance") || key === "pending_leaves"
        ? "wide"
        : "standard",
  }));

export function ConfigurationManager({
  tenant,
  locations,
  records,
}: {
  tenant: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    profile: Profile;
  };
  locations: Location[];
  records: ConfigurationRecord[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [idCardScope, setIdCardScope] = useState("");
  const [idCardFormKey, setIdCardFormKey] = useState(0);
  const [dashboardScope, setDashboardScope] = useState("");
  const [widgets, setWidgets] = useState<Widget[]>(defaultWidgets);
  const [preview, setPreview] = useState(false);
  async function request(method: string, body: unknown) {
    const response = await fetch("/api/configuration", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(data.error ?? "Could not save configuration.");
    return data;
  }
  async function saveProfile(
    event: FormEvent<HTMLFormElement>,
    action: "tenant-profile" | "location-profile",
  ) {
    event.preventDefault();
    if (action === "location-profile" && !locationId) return;
    setBusy(true);
    try {
      await request("PUT", {
        action,
        ...(action === "location-profile" ? { locationId } : {}),
        ...Object.fromEntries(new FormData(event.currentTarget)),
      });
      toast(
        "success",
        action === "tenant-profile"
          ? "Company profile saved"
          : "Location profile saved",
      );
      router.refresh();
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      await request("POST", {
        kind: "id_card",
        locationId: idCardScope || null,
        effectiveFrom: form.get("effectiveFrom"),
        effectiveTo: form.get("effectiveTo") || null,
        payload: {
          frontBackgroundUrl: form.get("frontBackgroundUrl"),
          backBackgroundUrl: form.get("backBackgroundUrl"),
          frontContentPanel: form.get("frontContentPanel"),
        },
      });
      toast("success", "Inactive ID-card template created");
      formElement.reset();
      setIdCardFormKey((key) => key + 1);
      router.refresh();
    } catch (error) {
      toast(
        "error",
        error instanceof Error ? error.message : "Could not create template",
      );
    } finally {
      setBusy(false);
    }
  }
  async function createDashboard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await request("POST", {
        kind: "dashboard",
        locationId: dashboardScope || null,
        effectiveFrom: form.get("effectiveFrom"),
        effectiveTo: form.get("effectiveTo") || null,
        payload: { widgets },
      });
      toast(
        "success",
        "Inactive dashboard layout created. Activate it when ready.",
      );
      router.refresh();
    } catch (error) {
      toast(
        "error",
        error instanceof Error ? error.message : "Could not create layout",
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggle(record: ConfigurationRecord) {
    setBusy(true);
    try {
      await request("PATCH", { id: record.id, active: !record.active });
      toast(
        "success",
        record.active ? "Configuration deactivated" : "Configuration activated",
      );
      router.refresh();
    } catch (error) {
      toast(
        "error",
        error instanceof Error ? error.message : "Could not update",
      );
    } finally {
      setBusy(false);
    }
  }
  const updateWidget = (key: DashboardWidgetKey, changes: Partial<Widget>) =>
    setWidgets((current) =>
      current.map((widget) =>
        widget.key === key ? { ...widget, ...changes } : widget,
      ),
    );
  const profile = tenant.profile;
  const selected = locations.find((location) => location.id === locationId);
  const templates = records.filter((record) => record.kind === "id_card");
  const layouts = records.filter((record) => record.kind === "dashboard");
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <ProfileCard
          title="Company master profile"
          profile={profile}
          fallback={{
            legalName: tenant.name,
            address: tenant.address,
            contactEmail: tenant.email,
            contactPhone: tenant.phone,
          }}
          onSubmit={(event) => saveProfile(event, "tenant-profile")}
          busy={busy}
        />
        <Card>
          <CardHeader>
            <CardTitle>Location master profile</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">Select a location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} ({location.code})
                </option>
              ))}
            </Select>
            {selected ? (
              <div className="mt-4">
                <ProfileForm
                  key={selected.id}
                  profile={selected.profile}
                  locationId={selected.id}
                  onSubmit={(event) => saveProfile(event, "location-profile")}
                  busy={busy}
                />
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Create a location before adding a profile.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dashboard layouts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex gap-3 rounded-xl border border-sky-400/20 bg-sky-500/5 p-3 text-[13px] text-muted-foreground">
            <ShieldAlert className="h-5 w-5 shrink-0 text-sky-600" />
            Drafts and preview never affect users. Only an explicitly activated
            valid layout is used; a location layout overrides the tenant layout,
            otherwise the dashboard remains unchanged.
          </div>
          <form onSubmit={createDashboard} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Scope">
                <Select
                  value={dashboardScope}
                  onChange={(event) => setDashboardScope(event.target.value)}
                >
                  <option value="">Tenant-wide (inherited)</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} override
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Effective from">
                <Input name="effectiveFrom" type="date" required />
              </Field>
              <Field label="Effective to (optional)">
                <Input name="effectiveTo" type="date" />
              </Field>
            </div>
            <div className="overflow-x-auto rounded-xl border border-edge">
              <table className="w-full min-w-[38rem] text-left text-sm">
                <thead className="bg-tint text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">Widget</th>
                    <th className="p-3">Enabled</th>
                    <th className="p-3">Order</th>
                    <th className="p-3">Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {widgets.map((widget) => (
                    <tr key={widget.key}>
                      <td className="p-3 font-medium">{labels[widget.key]}</td>
                      <td className="p-3">
                        <input
                          aria-label={`Enable ${labels[widget.key]}`}
                          type="checkbox"
                          checked={widget.enabled}
                          onChange={(event) =>
                            updateWidget(widget.key, {
                              enabled: event.target.checked,
                            })
                          }
                        />
                      </td>
                      <td className="p-3">
                        <Input
                          aria-label={`${labels[widget.key]} order`}
                          type="number"
                          min="0"
                          max={DASHBOARD_WIDGETS.length - 1}
                          value={widget.order}
                          onChange={(event) =>
                            updateWidget(widget.key, {
                              order: Number(event.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="p-3">
                        <Select
                          aria-label={`${labels[widget.key]} size`}
                          value={widget.size}
                          onChange={(event) =>
                            updateWidget(widget.key, {
                              size: event.target.value as DashboardWidgetSize,
                            })
                          }
                        >
                          <option value="compact">Compact</option>
                          <option value="standard">Standard</option>
                          <option value="wide">Wide</option>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPreview(!preview)}
              >
                <Eye className="h-4 w-4" />{" "}
                {preview ? "Hide preview" : "Preview draft"}
              </Button>
              <Button type="submit" loading={busy}>
                <Plus className="h-4 w-4" /> Create vNext
              </Button>
            </div>
          </form>
          {preview && (
            <div className="rounded-xl border border-dashed border-primary/40 bg-tint p-4">
              <p className="mb-3 text-sm font-medium">Draft preview</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[...widgets]
                  .filter((widget) => widget.enabled)
                  .sort((a, b) => a.order - b.order)
                  .map((widget) => (
                    <div
                      key={widget.key}
                      className={`rounded-lg border border-edge bg-card p-3 text-xs ${widget.size === "wide" ? "sm:col-span-3" : widget.size === "standard" ? "sm:col-span-2" : ""}`}
                    >
                      {widget.order + 1}. {labels[widget.key]}{" "}
                      <span className="text-muted-foreground">
                        ({widget.size})
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
          <ConfigurationList
            records={layouts}
            empty="No dashboard layouts yet. The existing dashboard remains unchanged."
            busy={busy}
            onToggle={toggle}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>ID-card templates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex gap-3 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3 text-[13px] text-muted-foreground">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500" />
            Uploaded artwork is used exactly as designed: logo, watermark and
            the location footer stay untouched, and only the photo and employee
            details print into the middle zone. Choose the clean panel only when
            the artwork's middle area is too busy to read over. A valid active
            location template overrides the tenant template; without either,
            cards retain `public/id-cards/1.png` and `2.png`.
          </div>
          <form onSubmit={createTemplate} className="grid gap-3 md:grid-cols-2">
            <Field label="Scope">
              <Select
                value={idCardScope}
                onChange={(event) => setIdCardScope(event.target.value)}
              >
                <option value="">Tenant-wide (inherited)</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} override
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Effective from">
              <Input name="effectiveFrom" type="date" required />
            </Field>
            <MediaInput
              key={`front-${idCardFormKey}`}
              name="frontBackgroundUrl"
              label="Front background"
              locationId={idCardScope || null}
              required
            />
            <MediaInput
              key={`back-${idCardFormKey}`}
              name="backBackgroundUrl"
              label="Back background"
              locationId={idCardScope || null}
              required
            />
            <Field label="Front content treatment">
              <Select name="frontContentPanel" defaultValue="preserve">
                <option value="preserve">
                  Preserve template artwork (recommended)
                </option>
                <option value="clean">Clean dynamic panel</option>
              </Select>
            </Field>
            <Field label="Effective to (optional)">
              <Input name="effectiveTo" type="date" />
            </Field>
            <div className="flex items-end">
              <Button type="submit" loading={busy}>
                <Plus className="h-4 w-4" /> Create vNext
              </Button>
            </div>
          </form>
          <ConfigurationList
            records={templates}
            empty="No ID-card templates. Current card artwork remains active."
            busy={busy}
            onToggle={toggle}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Payroll & leave settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/payroll/configuration"
            className="rounded-xl border border-edge p-5 hover:bg-tint"
          >
            <h3 className="font-semibold">Payroll settings</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Pay schedule, salary structure, deductions and contributions. Save
              progress and apply changes from one workspace.
            </p>
          </Link>
          <Link
            href="/admin/leaves/policies"
            className="rounded-xl border border-edge p-5 hover:bg-tint"
          >
            <h3 className="font-semibold">Leave settings</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Allowances, approvals, earned leave, carry forward and employee
              balance allocation.
            </p>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigurationList({
  records,
  empty,
  busy,
  onToggle,
  policy = false,
  onOpenPeriod,
}: {
  records: ConfigurationRecord[];
  empty: string;
  busy: boolean;
  onToggle: (record: ConfigurationRecord) => void;
  policy?: boolean;
  onOpenPeriod?: (record: ConfigurationRecord) => void;
}) {
  return (
    <div className="divide-y divide-edge rounded-xl border border-edge">
      {records.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        records.map((record) => (
          <div
            key={record.id}
            className="flex flex-wrap items-center justify-between gap-3 p-3"
          >
            <div>
              <p className="text-sm font-medium">
                {record.location?.name ?? "Tenant-wide"} v{record.version}{" "}
                {policy ? (
                  <span className="text-amber-600">DRAFT / NOT APPLIED</span>
                ) : (
                  record.active && (
                    <span className="text-emerald-600">Active</span>
                  )
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Effective {new Date(record.effectiveFrom).toLocaleDateString()}
                {record.effectiveTo
                  ? ` to ${new Date(record.effectiveTo).toLocaleDateString()}`
                  : ""}
                {policy &&
                  (record.active
                    ? ` · activation recorded ${record.activatedAt ? new Date(record.activatedAt).toLocaleString() : ""}`
                    : " · inactive")}
              </p>
            </div>
            <div className="flex gap-2">
              {onOpenPeriod && record.active && (
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy}
                  onClick={() => onOpenPeriod(record)}
                >
                  Open & allocate
                </Button>
              )}
              <Button
                size="sm"
                variant={record.active ? "outline" : "primary"}
                loading={busy}
                onClick={() => onToggle(record)}
              >
                {record.active ? (
                  "Deactivate"
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Record activation
                  </>
                )}
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
function ProfileCard({
  title,
  profile,
  fallback,
  onSubmit,
  busy,
}: {
  title: string;
  profile: Profile;
  fallback: Partial<NonNullable<Profile>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ProfileForm
          profile={profile}
          fallback={fallback}
          onSubmit={onSubmit}
          busy={busy}
        />
      </CardContent>
    </Card>
  );
}
function ProfileForm({
  profile,
  fallback = {},
  locationId = null,
  onSubmit,
  busy,
}: {
  profile: Profile;
  fallback?: Partial<NonNullable<Profile>>;
  locationId?: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
}) {
  const value = (key: keyof NonNullable<Profile>) =>
    profile?.[key] ?? fallback[key] ?? "";
  const legalNotes =
    profile?.legalDetails &&
    typeof profile.legalDetails === "object" &&
    "notes" in profile.legalDetails &&
    typeof profile.legalDetails.notes === "string"
      ? profile.legalDetails.notes
      : "";
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Legal name">
        <Input name="legalName" defaultValue={value("legalName") as string} />
      </Field>
      <Field label="Display name">
        <Input
          name="displayName"
          defaultValue={value("displayName") as string}
        />
      </Field>
      <MediaInput
        name="logoUrl"
        label="Company logo"
        locationId={locationId}
        defaultValue={value("logoUrl") as string}
      />
      <Field label="Website">
        <Input
          name="website"
          type="url"
          defaultValue={value("website") as string}
        />
      </Field>
      <Field label="Contact name">
        <Input
          name="contactName"
          defaultValue={value("contactName") as string}
        />
      </Field>
      <Field label="Contact email">
        <Input
          name="contactEmail"
          type="email"
          defaultValue={value("contactEmail") as string}
        />
      </Field>
      <Field label="Contact phone">
        <Input
          name="contactPhone"
          type="tel"
          defaultValue={value("contactPhone") as string}
        />
      </Field>
      <Field label="Tax ID">
        <Input name="taxId" defaultValue={value("taxId") as string} />
      </Field>
      <Field label="Registration no.">
        <Input
          name="registrationNo"
          defaultValue={value("registrationNo") as string}
        />
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <Input name="address" defaultValue={value("address") as string} />
      </Field>
      <Field label="Legal details" className="sm:col-span-2">
        <Input name="legalDetails" defaultValue={legalNotes} />
      </Field>
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" loading={busy}>
          <Save className="h-4 w-4" /> Save profile
        </Button>
      </div>
    </form>
  );
}
function MediaInput({
  name,
  label,
  locationId,
  defaultValue = "",
  required = false,
  onUploadingChange,
}: {
  name: string;
  label: string;
  locationId: string | null;
  defaultValue?: string;
  required?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const uploadId = useRef(0);
  const toast = useToast();
  async function upload(file: File) {
    const id = ++uploadId.current;
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (locationId) form.set("locationId", locationId);
      const response = await fetch("/api/media", {
        method: "POST",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error ?? "Could not upload image.");
      if (id === uploadId.current && typeof data.url === "string")
        setValue(data.url);
    } catch (error) {
      if (id === uploadId.current)
        toast(
          "error",
          error instanceof Error ? error.message : "Could not upload image.",
        );
    } finally {
      if (id === uploadId.current) {
        setUploading(false);
        onUploadingChange?.(false);
      }
    }
  }
  return (
    <Field label={label} className="space-y-2">
      <input type="hidden" name={name} value={value} required={required} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[11px] border border-input bg-card px-3.5 text-sm font-medium hover:bg-tint">
          <Upload className="h-4 w-4" />{" "}
          {uploading ? "Uploading..." : "Upload image"}
          <input
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              uploadId.current++;
              setValue("");
              onUploadingChange?.(false);
            }}
          >
            <X className="h-4 w-4" /> Remove
          </Button>
        )}
      </div>
      {value && (
        <img
          src={value}
          alt={`${label} preview`}
          className="h-24 max-w-full rounded-lg border border-edge bg-tint object-contain"
        />
      )}
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Use an existing image URL instead
        </summary>
        <Input
          className="mt-2"
          value={value}
          onChange={(event) => {
            uploadId.current++;
            setValue(event.target.value);
          }}
          placeholder="HTTPS or legacy data URL"
        />
      </details>
      <p className="text-xs text-muted-foreground">PNG or JPEG, up to 5 MB.</p>
    </Field>
  );
}
