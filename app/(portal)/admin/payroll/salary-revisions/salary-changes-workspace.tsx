"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, NumberInput } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/utils";
import { formatDate } from "@/lib/dates";

type Employee = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  salary: number | null;
};
type Revision = {
  id: string;
  employeeId: string;
  currentSalary: number;
  newSalary: number;
  effectiveFrom: Date;
  reason: string | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  submittedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  cancelledAt: Date | null;
  employee: { employeeNumber: string; firstName: string; lastName: string };
};

export function SalaryRevisions({
  employees,
  revisions,
  canApprove,
  currentUserId,
}: {
  employees: Employee[];
  revisions: Revision[];
  canApprove: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [salary, setSalary] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<{
    revision: Revision;
    action: "submit" | "approve" | "cancel";
  } | null>(null);
  const employee = employees.find((item) => item.id === employeeId);
  async function request(method: "POST" | "PATCH", body: unknown) {
    const response = await fetch("/api/payroll/salary-revisions", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(data.error ?? "Could not save the salary change.");
    return data;
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy("create");
    try {
      await request("POST", {
        ...Object.fromEntries(new FormData(form)),
        employeeId,
        newSalary: salary,
      });
      toast(
        "success",
        "Salary change saved. Submit it for approval when ready.",
      );
      setOpen(false);
      setEmployeeId("");
      setSalary(null);
      router.refresh();
    } catch (error) {
      toast(
        "error",
        error instanceof Error
          ? error.message
          : "Could not save salary change.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function transition() {
    if (!confirmation) return;
    setBusy(confirmation.revision.id);
    try {
      await request("PATCH", {
        id: confirmation.revision.id,
        action: confirmation.action,
      });
      toast(
        "success",
        {
          submit: "Sent for approval.",
          approve: "Salary change approved.",
          cancel: "Salary change cancelled.",
        }[confirmation.action],
      );
      setConfirmation(null);
      router.refresh();
    } catch (error) {
      toast(
        "error",
        error instanceof Error
          ? error.message
          : "Could not update salary change.",
      );
    } finally {
      setBusy(null);
    }
  }
  const visible = revisions.filter(
    (revision) =>
      (!status || revision.status === status) &&
      `${revision.employee.firstName} ${revision.employee.lastName} ${revision.employee.employeeNumber}`
        .toLowerCase()
        .includes(filter.trim().toLowerCase()),
  );
  const awaiting = revisions.filter(
    (revision) => revision.status === "submitted",
  ).length;
  const scheduled = revisions.filter(
    (revision) => revision.status === "approved",
  ).length;
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div>
          <h2 className="text-lg font-semibold">Plan a salary change</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose an employee, set the new monthly salary, and send it for
            approval.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          New salary change
        </Button>
      </section>
      <section
        aria-label="Salary change summary"
        className="grid grid-cols-3 gap-3"
      >
        {[
          ["Awaiting approval", awaiting],
          ["Approved changes", scheduled],
          [
            "Drafts",
            revisions.filter((item) => item.status === "draft").length,
          ],
        ].map(([label, count]) => (
          <div
            key={label}
            className="rounded-xl border border-edge bg-card p-4"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{count}</p>
          </div>
        ))}
      </section>
      <section className="overflow-hidden rounded-2xl border border-edge bg-card">
        <div className="flex flex-wrap gap-3 border-b border-edge p-4">
          <div className="relative min-w-48 flex-1">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
            />
            <Input
              className="pl-9"
              aria-label="Search salary changes"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search name or employee ID"
            />
          </div>
          <Select
            className="w-auto min-w-40"
            aria-label="Filter salary changes by status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All changes</option>
            <option value="draft">Draft</option>
            <option value="submitted">Awaiting approval</option>
            <option value="approved">Approved</option>
            <option value="applied">Applied</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        <div className="divide-y divide-edge">
          {visible.map((revision) => (
            <article key={revision.id} className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    {revision.employee.firstName} {revision.employee.lastName}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {revision.employee.employeeNumber} · from{" "}
                    {formatDate(revision.effectiveFrom)}
                  </p>
                </div>
                <Badge
                  tone={
                    revision.status === "submitted"
                      ? "warning"
                      : ["approved", "applied"].includes(revision.status)
                        ? "success"
                        : "neutral"
                  }
                >
                  {revision.status === "submitted"
                    ? "Awaiting approval"
                    : revision.status}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-tint p-3 text-sm">
                <span>{formatMoney(revision.currentSalary)}</span>
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 text-muted-foreground"
                />
                <strong>{formatMoney(revision.newSalary)}</strong>
                <span className="text-xs text-muted-foreground">
                  {revision.currentSalary > 0
                    ? `${((revision.newSalary / revision.currentSalary - 1) * 100).toFixed(1)}% change`
                    : "New salary"}
                </span>
              </div>
              {revision.reason && (
                <p className="text-sm text-muted-foreground">
                  {revision.reason}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {revision.status === "draft" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      setConfirmation({ revision, action: "submit" })
                    }
                  >
                    Send for approval
                  </Button>
                )}
                {revision.status === "submitted" &&
                  canApprove &&
                  revision.createdBy !== currentUserId && (
                    <Button
                      size="sm"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        setConfirmation({ revision, action: "approve" })
                      }
                    >
                      Approve change
                    </Button>
                  )}
                {revision.status === "submitted" &&
                  revision.createdBy === currentUserId && (
                    <p className="text-xs text-muted-foreground">
                      Another administrator must approve your change.
                    </p>
                  )}
                {["draft", "submitted", "approved"].includes(
                  revision.status,
                ) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      setConfirmation({ revision, action: "cancel" })
                    }
                  >
                    Cancel change
                  </Button>
                )}
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Activity</summary>
                <p className="mt-1">
                  Created {formatDate(revision.createdAt)}
                  {revision.reviewedAt
                    ? ` · reviewed ${formatDate(revision.reviewedAt)}`
                    : ""}
                </p>
              </details>
            </article>
          ))}
        </div>
        {!visible.length && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {revisions.length
              ? "No changes match your search."
              : "No salary changes yet. Create one when an employee's salary needs to change."}
          </p>
        )}
      </section>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="New salary change"
        size="sm"
      >
        <form onSubmit={create} className="space-y-4">
          <Field label="Employee">
            <Select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              required
            >
              <option value="">Select employee</option>
              {employees
                .filter((item) => item.salary && item.salary > 0)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.firstName} {item.lastName} · {item.employeeNumber}
                  </option>
                ))}
            </Select>
          </Field>
          {employee && (
            <p className="rounded-xl bg-tint p-3 text-sm">
              Current monthly salary:{" "}
              <strong>{formatMoney(employee.salary ?? 0)}</strong>
            </p>
          )}
          <Field label="New monthly salary">
            <NumberInput
              min={1}
              step="0.01"
              required
              value={salary}
              onValueChange={setSalary}
            />
          </Field>
          <Field label="Effective date">
            <Input name="effectiveFrom" type="date" required />
          </Field>
          <Field label="Reason (optional)">
            <Input name="reason" maxLength={500} />
          </Field>
          <p className="text-xs text-muted-foreground">
            This changes the monthly salary base after approval. Existing
            finalized and paid payroll stays unchanged. Salary components are
            managed in Payroll settings.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={busy === "create"}>
              Save change
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={confirmation !== null}
        onClose={() => {
          if (!busy) setConfirmation(null);
        }}
        title={
          confirmation?.action === "approve"
            ? "Approve salary change?"
            : confirmation?.action === "cancel"
              ? "Cancel salary change?"
              : "Send for approval?"
        }
        size="sm"
      >
        {confirmation && (
          <>
            <p className="text-sm">
              {confirmation.revision.employee.firstName}{" "}
              {confirmation.revision.employee.lastName} ·{" "}
              {formatMoney(confirmation.revision.currentSalary)} →{" "}
              {formatMoney(confirmation.revision.newSalary)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Effective {formatDate(confirmation.revision.effectiveFrom)}.
              Previously finalized payroll will not change.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={Boolean(busy)}
                onClick={() => setConfirmation(null)}
              >
                Go back
              </Button>
              <Button
                loading={Boolean(busy)}
                variant={
                  confirmation.action === "cancel" ? "danger" : "primary"
                }
                onClick={() => void transition()}
              >
                Confirm
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
