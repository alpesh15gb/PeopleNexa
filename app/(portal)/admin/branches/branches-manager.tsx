"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, MapPin, LocateFixed, X } from "lucide-react";
import { Circle, GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geofenceRadius: number;
  isDefault: boolean;
  locationId: string | null;
  _count: { employees: number };
}

interface BranchLocation {
  id: string;
  name: string;
  code: string;
}

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  role: string;
  branchId: string | null;
}

// Tiny local loader for the geofence picker. Returns null (keeping the manual
// inputs) when the API key is missing.
const BRANCH_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const BRANCH_MAP_FALLBACK = { lat: 28.6139, lng: 77.209 };

function BranchGeofenceMap({
  lat,
  lng,
  radius,
  onPick,
}: {
  lat: string;
  lng: string;
  radius: string;
  onPick: (lat: string, lng: string) => void;
}) {
  const { isLoaded } = useJsApiLoader({
    id: "peoplenexa-branch-geofence",
    googleMapsApiKey: BRANCH_MAPS_API_KEY,
  });
  if (!BRANCH_MAPS_API_KEY) return null;
  if (!isLoaded) {
    return <div className="h-[220px] w-full animate-pulse rounded-xl border border-edge bg-tint" aria-hidden="true" />;
  }
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  const hasCenter =
    lat.trim() !== "" && lng.trim() !== "" && Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
  const center = hasCenter ? { lat: parsedLat, lng: parsedLng } : BRANCH_MAP_FALLBACK;
  const parsedRadius = Number(radius);
  const circleRadius = Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : 0;
  return (
    <div className="overflow-hidden rounded-xl border border-edge">
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: 220 }}
        center={center}
        zoom={hasCenter ? 15 : 5}
        onClick={(e) => {
          const ll = e.latLng;
          if (!ll) return;
          onPick(ll.lat().toFixed(6), ll.lng().toFixed(6));
        }}
      >
        {hasCenter && <Marker position={center} />}
        {hasCenter && circleRadius > 0 && (
          <Circle
            center={center}
            radius={circleRadius}
            options={{
              fillColor: "#6366f1",
              fillOpacity: 0.15,
              strokeColor: "#6366f1",
              strokeOpacity: 0.8,
              strokeWeight: 2,
              clickable: false,
              editable: false,
              draggable: false,
            }}
          />
        )}
      </GoogleMap>
      <p className="border-t border-edge bg-tint px-3 py-1.5 text-[11.5px] text-muted-foreground">
        Click the map to set the geofence center — the latitude/longitude fields update automatically.
      </p>
    </div>
  );
}

export function BranchesManager({
  branches,
  employees,
  locations,
}: {
  branches: Branch[];
  employees: Staff[];
  locations: BranchLocation[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(false);
  const [managingBranch, setManagingBranch] = useState<Branch | null>(null);
  const [savingManager, setSavingManager] = useState(false);
  // New manager-login form (non-employee account: email + password only).
  const [mgrName, setMgrName] = useState("");
  const [mgrEmail, setMgrEmail] = useState("");
  const [mgrPassword, setMgrPassword] = useState("");
  const [creatingMgr, setCreatingMgr] = useState(false);
  // Controlled geofence fields so map clicks and manual edits stay in sync.
  const [geoLat, setGeoLat] = useState("");
  const [geoLng, setGeoLng] = useState("");
  const [geoRadius, setGeoRadius] = useState("200");

  useEffect(() => {
    if (editing && typeof editing === "object") {
      setGeoLat(editing.latitude != null ? String(editing.latitude) : "");
      setGeoLng(editing.longitude != null ? String(editing.longitude) : "");
      setGeoRadius(String(editing.geofenceRadius ?? 200));
    } else if (editing === "new") {
      setGeoLat("");
      setGeoLng("");
      setGeoRadius("200");
    }
  }, [editing]);

  useEffect(() => {
    if (managingBranch) {
      setMgrName("");
      setMgrEmail("");
      setMgrPassword("");
    }
  }, [managingBranch]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      code: form.get("code"),
      address: form.get("address"),
      latitude: form.get("latitude"),
      longitude: form.get("longitude"),
      geofenceRadius: form.get("geofenceRadius"),
    };
    try {
      const res = await fetch(editing && typeof editing === "object" ? `/api/branches/${editing.id}` : "/api/branches", {
        method: editing && typeof editing === "object" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to save branch");
        return;
      }
      toast("success", editing ? "Branch updated" : "Branch created");
      setEditing(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function remove(branch: Branch) {
    setLoading(true);
    try {
      const res = await fetch(`/api/branches/${branch.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast("error", data.error ?? "Failed to delete");
        return;
      }
      toast("success", "Branch removed");
      setConfirmDelete(null);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function setManager(branchId: string, employeeId: string | null, currentManagerId?: string | null) {
    setSavingManager(true);
    try {
      // Promote first, demote after: a failed second step leaves two managers
      // (visible and fixable) instead of zero (silent loss of coverage).
      if (employeeId) {
        const res = await fetch(`/api/employees/${employeeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "branch_manager", branchId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast("error", data.error ?? "Failed to assign manager");
          return;
        }
        if (currentManagerId && currentManagerId !== employeeId) {
          await fetch(`/api/employees/${currentManagerId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: "employee" }),
          });
        }
        toast("success", "Branch manager assigned");
      } else {
        if (currentManagerId) {
          await fetch(`/api/employees/${currentManagerId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: "employee" }),
          });
        }
        toast("success", "Branch manager removed");
      }
      setManagingBranch(null);
      router.refresh();
    } catch {
      toast("error", "Something went wrong.");
    } finally {
      setSavingManager(false);
    }
  }

  async function createManagerLogin() {
    if (!managingBranch || creatingMgr) return;
    if (!mgrName.trim() || !mgrEmail.trim() || mgrPassword.length < 12) {
      toast("error", "Enter a name, a valid email, and a password of at least 12 characters.");
      return;
    }
    setCreatingMgr(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: mgrName.trim(),
          email: mgrEmail.trim(),
          password: mgrPassword,
          branchId: managingBranch.id,
          loginOnly: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("error", data.error ?? "Failed to create manager login");
        return;
      }
      toast("success", `Manager login created (${data.employee?.employeeNumber ?? "MGR"}) — share the email + password with them.`);
      setMgrName("");
      setMgrEmail("");
      setMgrPassword("");
      setManagingBranch(null);
      router.refresh();
    } catch {
      toast("error", "Something went wrong.");
    } finally {
      setCreatingMgr(false);
    }
  }

  async function useMyLocation() {
    if (!navigator.geolocation) {
      toast("error", "Geolocation is not supported in this browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLat(pos.coords.latitude.toFixed(6));
        setGeoLng(pos.coords.longitude.toFixed(6));
        toast("success", "Location captured — use it as the geofence center");
      },
      () => toast("error", "Could not get your location"),
      { enableHighAccuracy: true }
    );
  }

  const isNew = editing === "new";

  // ── Locations (city level above branches) ─────────────────────────────
  const [locName, setLocName] = useState("");
  const [locCode, setLocCode] = useState("");
  const [locBusy, setLocBusy] = useState(false);
  const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? null;

  async function addLocation() {
    if (locBusy) return;
    if (!locName.trim() || !locCode.trim()) {
      toast("error", "Enter a location name and code (e.g. Hyderabad, HYD).");
      return;
    }
    setLocBusy(true);
    try {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: locName.trim(), code: locCode.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("error", data.error ?? "Failed to add location");
        return;
      }
      setLocName("");
      setLocCode("");
      toast("success", "Location added");
      router.refresh();
    } catch {
      toast("error", "Something went wrong.");
    } finally {
      setLocBusy(false);
    }
  }

  async function deleteLocation(id: string) {
    if (locBusy) return;
    setLocBusy(true);
    try {
      const res = await fetch(`/api/locations/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("error", data.error ?? "Failed to delete location");
        return;
      }
      toast("success", "Location removed");
      router.refresh();
    } catch {
      toast("error", "Something went wrong.");
    } finally {
      setLocBusy(false);
    }
  }

  // Cards sorted by location, then name — the hierarchy reads top to bottom.
  const sortedBranches = [...branches].sort((a, b) => {
    const la = locationName(a.locationId) ?? "";
    const lb = locationName(b.locationId) ?? "";
    return la.localeCompare(lb) || a.name.localeCompare(b.name);
  });

  return (
    <>
      <div className="flex items-center justify-between border-b border-edge px-5 py-3">
        <p className="text-[13px] text-muted-foreground">{branches.length} branches</p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-3.5 w-3.5" /> New branch
        </Button>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {sortedBranches.map((b) => (
          <div key={b.id} className="card-surface group rounded-xl p-4 transition-colors hover:border-edge-strong">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-[15px] font-semibold">
                  {b.name}
                  {b.isDefault && <Badge tone="violet" className="ml-2">Default</Badge>}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {b.code} · {b._count.employees} employees
                  {locationName(b.locationId) ? ` · ${locationName(b.locationId)}` : ""}
                </p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                <MapPin className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">{b.address || "No address"}</p>
            <div className="mt-2 flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <span className="rounded-md bg-tint px-2 py-1 font-mono">
                {b.latitude != null ? `${b.latitude.toFixed(4)}, ${b.longitude?.toFixed(4)}` : "No coordinates"}
              </span>
              <span className="rounded-md bg-tint px-2 py-1">{b.geofenceRadius}m</span>
            </div>
            {(() => {
              const manager = employees.find((e) => e.role === "branch_manager" && e.branchId === b.id);
              return (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-edge bg-tint px-2.5 py-1.5">
                  <p className="min-w-0 truncate text-[12px] text-muted-foreground">
                    {manager ? (
                      <>Manager: <span className="font-semibold text-foreground">{manager.firstName} {manager.lastName}</span></>
                    ) : (
                      "No branch manager"
                    )}
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setManagingBranch(b)}>
                    {manager ? "Change" : "Assign"}
                  </Button>
                </div>
              );
            })()}
            <div className="mt-3 flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setEditing(b)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              {!b.isDefault && (
                <Button size="sm" variant="outline" className="text-rose-300" onClick={() => setConfirmDelete(b)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={isNew ? "New branch" : `Edit ${editing && typeof editing === "object" ? editing.name : ""}`}
        description="Set coordinates and a geofence radius to verify employee clock-ins by location."
      >
        <form id="branch-form" onSubmit={onSubmit} className="space-y-4">
          <BranchGeofenceMap
            lat={geoLat}
            lng={geoLng}
            radius={geoRadius}
            onPick={(la, ln) => {
              setGeoLat(la);
              setGeoLng(ln);
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Branch name">
              <Input name="name" required defaultValue={editing && typeof editing === "object" ? editing.name : ""} />
            </Field>
            <Field label="Branch code">
              <Input name="code" required defaultValue={editing && typeof editing === "object" ? editing.code : ""} placeholder="e.g. MAIN" />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input name="address" defaultValue={editing && typeof editing === "object" ? editing.address ?? "" : ""} />
            </Field>
            <Field label="Latitude">
              <Input name="latitude" type="number" step="any" value={geoLat} onChange={(e) => setGeoLat(e.target.value)} />
            </Field>
            <Field label="Longitude">
              <Input name="longitude" type="number" step="any" value={geoLng} onChange={(e) => setGeoLng(e.target.value)} />
            </Field>
            <Field label="Geofence radius (meters)">
              <Input name="geofenceRadius" type="number" min={10} value={geoRadius} onChange={(e) => setGeoRadius(e.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={useMyLocation} className="w-full">
                <LocateFixed className="h-4 w-4" /> Use my location
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" loading={loading}>Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete ${confirmDelete?.name ?? "branch"}?`}
        description={
          confirmDelete && confirmDelete._count.employees > 0
            ? `${confirmDelete._count.employees} employee(s) are assigned to this branch. They will become unassigned.`
            : "This cannot be undone."
        }
        busy={loading}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove(confirmDelete)}
      />

      <Modal
        open={managingBranch !== null}
        onClose={() => setManagingBranch(null)}
        title={managingBranch ? `Manager — ${managingBranch.name}` : "Branch manager"}
        description="They sign in with a scoped login: this branch's dashboard, attendance, employees and leaves."
      >
        {(() => {
          const current = managingBranch
            ? employees.find((e) => e.role === "branch_manager" && e.branchId === managingBranch.id)?.id ?? ""
            : "";
          return (
            <div className="space-y-4">
              <Field label="Branch manager">
                <Select
                  value={current}
                  disabled={savingManager}
                  onChange={(e) => managingBranch && setManager(managingBranch.id, e.target.value || null, current || null)}
                >
                  <option value="">None</option>
                  {employees
                    .filter((e) => e.role !== "admin")
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName} ({e.employeeNumber})
                        {e.role === "branch_manager" && e.branchId !== managingBranch?.id ? " — manages elsewhere" : ""}
                      </option>
                    ))}
                </Select>
              </Field>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Assigning sets their role to branch manager for this branch. Removing demotes them back to employee.
              </p>
              <div className="rounded-xl border border-edge bg-tint p-3.5">
                <p className="text-[13px] font-semibold">Or create a manager-only login</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  For someone who is not staff — just email + password. They can run this branch but never
                  appear in attendance, payroll, or seat counts.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Full name">
                    <Input value={mgrName} onChange={(e) => setMgrName(e.target.value)} placeholder="e.g. Ramesh Gupta" />
                  </Field>
                  <Field label="Login email">
                    <Input type="email" value={mgrEmail} onChange={(e) => setMgrEmail(e.target.value)} placeholder="manager@example.com" />
                  </Field>
                  <Field label="Password (min 12 characters)" className="sm:col-span-2">
                    <Input
                      type="password"
                      value={mgrPassword}
                      onChange={(e) => setMgrPassword(e.target.value)}
                      placeholder="Share this with them privately"
                      autoComplete="new-password"
                    />
                  </Field>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" onClick={createManagerLogin} loading={creatingMgr}>
                    Create manager login
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </>
  );
}
