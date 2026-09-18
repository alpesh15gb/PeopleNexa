"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { EmployeesTable } from "../employees/employees-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type TableProps = ComponentProps<typeof EmployeesTable>;

export function EmployeeMasterManagement({ branches, departments, shifts, viewerRole }: Pick<TableProps, "branches" | "departments" | "shifts" | "viewerRole">) {
  const [employees, setEmployees] = useState<TableProps["employees"]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/employees").then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not load employees.");
      setEmployees(data.employees ?? []);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load employees."));
  }, []);
  return <Card><CardHeader><CardTitle>Employee administration</CardTitle><CardDescription>Create, update, deactivate, import, export, upload photos, manage device access, and remove employee records.</CardDescription></CardHeader><CardContent className="p-0">{error ? <p className="p-6 text-sm text-destructive">{error}</p> : <EmployeesTable employees={employees} branches={branches} departments={departments} shifts={shifts} viewerRole={viewerRole} />}</CardContent></Card>;
}
