import { redirect } from "next/navigation";

export default async function AdminEmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const source = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["q", "department", "branch", "status", "page", "employee"]) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) query.set(key, value);
  }
  redirect(`/admin/employee-master${query.size ? `?${query}` : ""}`);
}
