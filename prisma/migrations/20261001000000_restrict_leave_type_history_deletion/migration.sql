-- Preserve leave requests and policy allocations when a leave type is removed.
ALTER TABLE "LeaveRequest" DROP CONSTRAINT "LeaveRequest_leaveTypeId_fkey";
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LeavePolicyBalance" DROP CONSTRAINT "LeavePolicyBalance_leaveTypeId_fkey";
ALTER TABLE "LeavePolicyBalance" ADD CONSTRAINT "LeavePolicyBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
