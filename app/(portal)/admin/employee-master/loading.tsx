import { Card, CardContent, PageHeader } from "@/components/ui/card";
export default function EmployeeMasterLoading() {
  return <div className="space-y-6"><PageHeader title="Employee Master" /><Card><CardContent className="p-6 text-sm text-muted-foreground" role="status">Loading employees…</CardContent></Card></div>;
}
