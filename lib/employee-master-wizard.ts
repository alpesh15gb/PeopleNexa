export const employeeMasterWizardSteps = [
  { key: "official", label: "Work details" },
  { key: "personal", label: "Personal & contact" },
  { key: "background", label: "Family, education & career" },
  { key: "records", label: "Licence, banking & documents" },
] as const;

export type EmployeeMasterWizardStep =
  (typeof employeeMasterWizardSteps)[number]["key"];

export function adjacentEmployeeMasterWizardStep(
  current: EmployeeMasterWizardStep,
  direction: "previous" | "next",
) {
  const index = employeeMasterWizardSteps.findIndex((step) => step.key === current);
  return employeeMasterWizardSteps[index + (direction === "next" ? 1 : -1)]?.key;
}
