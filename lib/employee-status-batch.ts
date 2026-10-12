export type EmployeeStatus = "active" | "inactive";
export type StatusBatchResult = { id: string; outcome: "updated" | "unchanged" | "failed" | "uncertain"; message: string };

/** One employee per request avoids tying the whole selection to one proxy deadline. */
export async function runEmployeeStatusBatch(
  ids: string[], status: EmployeeStatus, reason: string,
  onResult: (result: StatusBatchResult) => void,
  request: typeof fetch = fetch,
) {
  for (const id of ids) {
    try {
      const response = await request(`/api/employees/${encodeURIComponent(id)}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason, bulkSelection: true }),
      });
      const data = await response.json().catch(() => null);
      // A timeout or broken response may occur after the database commit. Never retry automatically.
      if (response.status >= 500 || response.status === 408 || !data) {
        onResult({ id, outcome: "uncertain", message: "Result unconfirmed. Refresh and check this employee before retrying. Remaining employees were not submitted." });
        break;
      }
      if (!response.ok) {
        onResult({ id, outcome: "failed", message: data.error ?? "Could not update status." });
        if (response.status === 401 || response.status === 403) break;
      } else {
        onResult({ id, outcome: data.unchanged ? "unchanged" : "updated", message: data.deviceFailures?.length
          ? `Status saved; ${data.deviceFailures.length} device block(s) failed. Review Device access.`
          : data.unchanged ? `Already ${status}.` : `Marked ${status}.` });
      }
    } catch {
      onResult({ id, outcome: "uncertain", message: "Connection interrupted. Check this employee before retrying. Remaining employees were not submitted." });
      break;
    }
  }
}
