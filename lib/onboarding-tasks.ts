export const starterOnboardingTasks = {
  contact: "Confirm personal and emergency contact details",
  documents: "Submit required employment documents",
  equipment: "Set up work accounts and equipment",
  manager: "Meet your manager and team",
  orientation: "Attend new-hire orientation",
  policies: "Read the company policies",
} as const;

export type OnboardingSignIn = "missing" | "temporary" | "ready";

export function getOnboardingHandoff({ active, total, done, signIn }: {
  active: boolean;
  total: number;
  done: number;
  signIn?: OnboardingSignIn;
}) {
  if (!active) return { state: "history", label: "History only" } as const;
  if (total === 0) return { state: "assign", label: "HR · Assign tasks" } as const;
  if (done === total) return { state: "complete", label: "Checklist complete" } as const;
  if (signIn === "missing") return { state: "setup", label: "HR · Set up sign-in" } as const;
  if (signIn === "temporary") return { state: "first-sign-in", label: "HR → Employee · First sign-in" } as const;
  return { state: "tasks", label: "Employee · Complete tasks" } as const;
}
