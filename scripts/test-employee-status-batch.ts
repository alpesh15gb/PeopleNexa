import assert from "node:assert/strict";
import { runEmployeeStatusBatch, type StatusBatchResult } from "../lib/employee-status-batch";

async function run() {
  const results: StatusBatchResult[] = [];
  const requested: string[] = [];
  const responses = [
    Response.json({ deviceFailures: [{ deviceId: "gate" }] }, { status: 207 }),
    Response.json({ unchanged: true }),
    Response.json({ error: "Use individual controls." }, { status: 400 }),
    new Response("Gateway timeout", { status: 504 }),
  ];
  const request = (async (url, init) => {
    requested.push(String(url));
    assert.deepEqual(JSON.parse(String(init?.body)), { status: "inactive", reason: "Attendance review", bulkSelection: true });
    return responses.shift()!;
  }) as typeof fetch;
  await runEmployeeStatusBatch(["employee/1", "employee-2", "employee-3", "employee-4", "never-submit"], "inactive", "Attendance review", (result) => results.push(result), request);
  assert.equal(requested[0], "/api/employees/employee%2F1/status");
  assert.equal(requested.length, 4, "Stop after unconfirmed commit; never retry or submit the remaining row");
  assert.deepEqual(results.map((result) => result.outcome), ["updated", "unchanged", "failed", "uncertain"]);
  assert.match(results[0].message, /Status saved.*device block/);

  for (const mode of ["network", "unauthorized", "malformed"] as const) {
    let calls = 0;
    const outcomes: StatusBatchResult[] = [];
    await runEmployeeStatusBatch(["a", "b"], "active", "", (result) => outcomes.push(result), (async () => {
      calls++;
      if (mode === "network") throw new Error("connection lost");
      if (mode === "malformed") return new Response("not JSON");
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }) as typeof fetch);
    assert.equal(calls, 1);
    assert.equal(outcomes[0].outcome, mode === "unauthorized" ? "failed" : "uncertain");
  }
  console.log("employee status batch tests passed: partial results, device failures, unchanged status, timeout, network, auth and malformed responses");
}
void run();
