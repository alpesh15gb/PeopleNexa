"use client";

import { TimeWorkspaceError } from "@/components/time-workspace-error";

export default function ErrorBoundary({ retry, unstable_retry, reset }: { retry?: () => void; unstable_retry?: () => void; reset: () => void }) {
  return <TimeWorkspaceError label="leave management" retry={retry ?? unstable_retry ?? reset} />;
}
