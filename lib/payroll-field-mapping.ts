export type PayrollFieldMapping = {
  group: "Employee Details" | "Attendance" | "Earnings" | "Deductions" | "Result";
  column: string;
  source: "Employee Master" | "Location payroll rule" | "Automatic calculation" | "Controlled adjustment";
  actionLabel: string;
  actionHref: string;
  availability: "employee" | "attendance" | "leave" | "policy" | "tds" | "pf" | "pt" | "welfare" | "health" | "mess" | "calculated" | "hold" | "adjustment";
};

export const payrollFieldMappings: PayrollFieldMapping[] = [
  { group: "Employee Details", column: "S.No", source: "Automatic calculation", actionLabel: "Open payroll", actionHref: "/admin/payroll", availability: "calculated" },
  { group: "Employee Details", column: "Emp Code", source: "Employee Master", actionLabel: "Open Employee Master", actionHref: "/admin/employee-master", availability: "employee" },
  { group: "Employee Details", column: "Name", source: "Employee Master", actionLabel: "Open Employee Master", actionHref: "/admin/employee-master", availability: "employee" },
  { group: "Employee Details", column: "Designation", source: "Employee Master", actionLabel: "Manage designations", actionHref: "/admin/designations", availability: "employee" },
  { group: "Employee Details", column: "DOJ", source: "Employee Master", actionLabel: "Open Employee Master", actionHref: "/admin/employee-master", availability: "employee" },
  { group: "Attendance", column: "Days in Month", source: "Automatic calculation", actionLabel: "Open payroll", actionHref: "/admin/payroll", availability: "calculated" },
  { group: "Attendance", column: "Present Days", source: "Automatic calculation", actionLabel: "Review attendance", actionHref: "/admin/attendance", availability: "attendance" },
  { group: "Attendance", column: "Leave Days", source: "Automatic calculation", actionLabel: "Review leave", actionHref: "/admin/leaves", availability: "leave" },
  { group: "Attendance", column: "Absent Days", source: "Automatic calculation", actionLabel: "Review attendance", actionHref: "/admin/attendance", availability: "attendance" },
  { group: "Attendance", column: "Approved Leave", source: "Automatic calculation", actionLabel: "Review leave", actionHref: "/admin/leaves", availability: "leave" },
  { group: "Attendance", column: "LOP", source: "Location payroll rule", actionLabel: "Open payroll rules", actionHref: "/admin/payroll/configuration#payroll-policy-editor", availability: "policy" },
  { group: "Attendance", column: "Total Payable Days", source: "Automatic calculation", actionLabel: "Open payroll", actionHref: "/admin/payroll", availability: "calculated" },
  { group: "Earnings", column: "Gross Salary", source: "Employee Master", actionLabel: "Open Employee Master", actionHref: "/admin/employee-master", availability: "employee" },
  { group: "Earnings", column: "Total Earned Salary", source: "Automatic calculation", actionLabel: "Open payroll", actionHref: "/admin/payroll", availability: "calculated" },
  { group: "Deductions", column: "Hold Salary", source: "Controlled adjustment", actionLabel: "Open payroll", actionHref: "/admin/payroll", availability: "hold" },
  { group: "Deductions", column: "TDS", source: "Location payroll rule", actionLabel: "Open payroll rules", actionHref: "/admin/payroll/configuration#payroll-policy-editor", availability: "tds" },
  { group: "Deductions", column: "Group Health Insurance", source: "Location payroll rule", actionLabel: "Open salary components", actionHref: "/admin/payroll/configuration#payroll-policy-editor", availability: "health" },
  { group: "Deductions", column: "PT", source: "Location payroll rule", actionLabel: "Open payroll rules", actionHref: "/admin/payroll/configuration#payroll-policy-editor", availability: "pt" },
  { group: "Deductions", column: "PF", source: "Location payroll rule", actionLabel: "Open payroll rules", actionHref: "/admin/payroll/configuration#payroll-policy-editor", availability: "pf" },
  { group: "Deductions", column: "Staff Welfare", source: "Location payroll rule", actionLabel: "Open payroll rules", actionHref: "/admin/payroll/configuration#payroll-policy-editor", availability: "welfare" },
  { group: "Deductions", column: "Mess", source: "Controlled adjustment", actionLabel: "Open salary components", actionHref: "/admin/payroll/configuration#payroll-policy-editor", availability: "mess" },
  { group: "Deductions", column: "Total Deductions", source: "Automatic calculation", actionLabel: "Open payroll", actionHref: "/admin/payroll", availability: "calculated" },
  { group: "Result", column: "Net Payable Salary", source: "Automatic calculation", actionLabel: "Open payroll", actionHref: "/admin/payroll", availability: "calculated" },
  { group: "Result", column: "Remarks", source: "Controlled adjustment", actionLabel: "Open payroll", actionHref: "/admin/payroll", availability: "adjustment" },
];
