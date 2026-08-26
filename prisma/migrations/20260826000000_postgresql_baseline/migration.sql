-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "plan" TEXT NOT NULL DEFAULT 'trial',
    "seats" INTEGER NOT NULL DEFAULT 10,
    "subscriptionExpiry" TIMESTAMP(3),
    "config" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperAdmin" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantModule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "ipAddress" TEXT,
    "type" TEXT NOT NULL DEFAULT 'biometric',
    "protocol" TEXT NOT NULL DEFAULT 'attlog',
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSeenAt" TIMESTAMP(3),
    "config" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCommand" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "rawData" TEXT,
    "userId" TEXT,
    "punchTime" TIMESTAMP(3),
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geofenceRadius" INTEGER NOT NULL DEFAULT 200,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "isNightShift" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'employee',
    "status" TEXT NOT NULL DEFAULT 'active',
    "position" TEXT,
    "salary" DOUBLE PRECISION,
    "joiningDate" TIMESTAMP(3),
    "profilePicture" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "ifscCode" TEXT,
    "pan" TEXT,
    "uan" TEXT,
    "salaryStructure" JSONB,
    "managerId" TEXT,
    "payMode" TEXT NOT NULL DEFAULT 'monthly',
    "workBasisRate" DOUBLE PRECISION,
    "branchId" TEXT,
    "departmentId" TEXT,
    "shiftId" TEXT,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Punch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "deviceId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'mobile',
    "punchTime" TIMESTAMP(3) NOT NULL,
    "inOutHint" TEXT NOT NULL DEFAULT 'unknown',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "selfie" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Punch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT,
    "shiftId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "punchInTime" TIMESTAMP(3),
    "punchOutTime" TIMESTAMP(3),
    "punchInLat" DOUBLE PRECISION,
    "punchInLng" DOUBLE PRECISION,
    "punchOutLat" DOUBLE PRECISION,
    "punchOutLng" DOUBLE PRECISION,
    "punchInSelfie" TEXT,
    "punchOutSelfie" TEXT,
    "status" TEXT NOT NULL,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "punches" JSONB,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "maxDays" INTEGER NOT NULL,
    "isCarryForward" BOOLEAN NOT NULL DEFAULT false,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "encashable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "isHalfDay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunchCorrection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "currentIn" TIMESTAMP(3),
    "currentOut" TIMESTAMP(3),
    "requestedIn" TIMESTAMP(3),
    "requestedOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PunchCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'travel',
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "receiptUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "baseSalary" DOUBLE PRECISION NOT NULL,
    "basicSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimePay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gratuity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pfEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pfEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esicEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esicEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "professionalTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lwf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lateFines" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loanDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductions" DOUBLE PRECISION NOT NULL,
    "adjustments" JSONB,
    "presentDays" INTEGER NOT NULL DEFAULT 0,
    "lateDays" INTEGER NOT NULL DEFAULT 0,
    "halfDays" INTEGER NOT NULL DEFAULT 0,
    "absentDays" INTEGER NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netSalary" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLoan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'advance',
    "amount" DOUBLE PRECISION NOT NULL,
    "outstanding" DOUBLE PRECISION NOT NULL,
    "emiCount" INTEGER NOT NULL DEFAULT 1,
    "emiAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startMonth" TEXT NOT NULL,
    "lastDeductedMonth" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "tag" TEXT,
    "serialNumber" TEXT,
    "value" DOUBLE PRECISION,
    "purchaseDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'available',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAssignment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "note" TEXT,
    "assignedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'app',
    "at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "docType" TEXT NOT NULL DEFAULT 'other',
    "number" TEXT,
    "issuedDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "fileUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kpi" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'core',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "selfSummary" TEXT,
    "managerSummary" TEXT,
    "overallRating" INTEGER,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewScore" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "selfScore" INTEGER,
    "managerScore" INTEGER,
    "managerComment" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewFeedback" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgPost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isAnnouncement" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueBy" TIMESTAMP(3),
    "createdBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExitRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resignationDate" TIMESTAMP(3) NOT NULL,
    "lastWorkingDay" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "fAndF" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExitRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxDeclaration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanOverride" (
    "planKey" TEXT NOT NULL,
    "label" TEXT,
    "pricePerSeat" INTEGER,
    "annualPricePerSeat" INTEGER,
    "trialDays" INTEGER,
    "seats" INTEGER,
    "modules" TEXT[],
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanOverride_pkey" PRIMARY KEY ("planKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_code_key" ON "Tenant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdmin_email_key" ON "SuperAdmin"("email");

-- CreateIndex
CREATE INDEX "TenantModule_tenantId_idx" ON "TenantModule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantModule_tenantId_module_key" ON "TenantModule"("tenantId", "module");

-- CreateIndex
CREATE INDEX "License_tenantId_idx" ON "License"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_serialNumber_key" ON "Device"("serialNumber");

-- CreateIndex
CREATE INDEX "Device_tenantId_idx" ON "Device"("tenantId");

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_status_idx" ON "DeviceCommand"("deviceId", "status");

-- CreateIndex
CREATE INDEX "DeviceLog_deviceId_processed_idx" ON "DeviceLog"("deviceId", "processed");

-- CreateIndex
CREATE INDEX "DeviceLog_tenantId_punchTime_idx" ON "DeviceLog"("tenantId", "punchTime");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_tenantId_code_key" ON "Branch"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenantId_name_key" ON "Department"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_tenantId_name_key" ON "Shift"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenantId_employeeNumber_key" ON "Employee"("tenantId", "employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenantId_email_key" ON "Employee"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Punch_tenantId_employeeId_punchTime_idx" ON "Punch"("tenantId", "employeeId", "punchTime");

-- CreateIndex
CREATE INDEX "Attendance_tenantId_date_idx" ON "Attendance"("tenantId", "date");

-- CreateIndex
CREATE INDEX "Attendance_tenantId_status_idx" ON "Attendance"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_employeeId_date_key" ON "Attendance"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_tenantId_code_key" ON "LeaveType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "PunchCorrection_tenantId_status_idx" ON "PunchCorrection"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PunchCorrection_employeeId_date_idx" ON "PunchCorrection"("employeeId", "date");

-- CreateIndex
CREATE INDEX "ExpenseClaim_tenantId_status_idx" ON "ExpenseClaim"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ExpenseClaim_employeeId_idx" ON "ExpenseClaim"("employeeId");

-- CreateIndex
CREATE INDEX "Payslip_tenantId_month_idx" ON "Payslip"("tenantId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_employeeId_month_key" ON "Payslip"("employeeId", "month");

-- CreateIndex
CREATE INDEX "EmployeeLoan_tenantId_employeeId_idx" ON "EmployeeLoan"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "Asset_tenantId_status_idx" ON "Asset"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_tenantId_tag_key" ON "Asset"("tenantId", "tag");

-- CreateIndex
CREATE INDEX "AssetAssignment_assetId_returnedAt_idx" ON "AssetAssignment"("assetId", "returnedAt");

-- CreateIndex
CREATE INDEX "AssetAssignment_employeeId_returnedAt_idx" ON "AssetAssignment"("employeeId", "returnedAt");

-- CreateIndex
CREATE INDEX "Notification_employeeId_isRead_idx" ON "Notification"("employeeId", "isRead");

-- CreateIndex
CREATE INDEX "LocationPing_tenantId_employeeId_at_idx" ON "LocationPing"("tenantId", "employeeId", "at");

-- CreateIndex
CREATE INDEX "Document_tenantId_expiryDate_idx" ON "Document"("tenantId", "expiryDate");

-- CreateIndex
CREATE INDEX "Document_employeeId_idx" ON "Document"("employeeId");

-- CreateIndex
CREATE INDEX "Kpi_tenantId_idx" ON "Kpi"("tenantId");

-- CreateIndex
CREATE INDEX "PerformanceReview_tenantId_status_idx" ON "PerformanceReview"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceReview_tenantId_employeeId_period_key" ON "PerformanceReview"("tenantId", "employeeId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewScore_reviewId_kpiId_key" ON "ReviewScore"("reviewId", "kpiId");

-- CreateIndex
CREATE INDEX "ReviewFeedback_reviewId_idx" ON "ReviewFeedback"("reviewId");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_status_idx" ON "Ticket"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Ticket_requesterId_idx" ON "Ticket"("requesterId");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_idx" ON "TicketMessage"("ticketId");

-- CreateIndex
CREATE INDEX "OrgPost_tenantId_createdAt_idx" ON "OrgPost"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "OrgComment_postId_idx" ON "OrgComment"("postId");

-- CreateIndex
CREATE INDEX "Policy_tenantId_active_idx" ON "Policy"("tenantId", "active");

-- CreateIndex
CREATE INDEX "RosterAssignment_tenantId_date_idx" ON "RosterAssignment"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RosterAssignment_tenantId_employeeId_date_key" ON "RosterAssignment"("tenantId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "OnboardingTask_tenantId_employeeId_idx" ON "OnboardingTask"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "ExitRequest_tenantId_status_idx" ON "ExitRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_tenantId_idx" ON "WebhookEndpoint"("tenantId");

-- CreateIndex
CREATE INDEX "TaxDeclaration_tenantId_fy_idx" ON "TaxDeclaration"("tenantId", "fy");

-- CreateIndex
CREATE UNIQUE INDEX "TaxDeclaration_employeeId_fy_key" ON "TaxDeclaration"("employeeId", "fy");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_tenantId_month_idx" ON "PayrollAdjustment"("tenantId", "month");

-- AddForeignKey
ALTER TABLE "TenantModule" ADD CONSTRAINT "TenantModule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceLog" ADD CONSTRAINT "DeviceLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Punch" ADD CONSTRAINT "Punch_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Punch" ADD CONSTRAINT "Punch_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchCorrection" ADD CONSTRAINT "PunchCorrection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchCorrection" ADD CONSTRAINT "PunchCorrection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewScore" ADD CONSTRAINT "ReviewScore_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewScore" ADD CONSTRAINT "ReviewScore_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewFeedback" ADD CONSTRAINT "ReviewFeedback_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewFeedback" ADD CONSTRAINT "ReviewFeedback_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgPost" ADD CONSTRAINT "OrgPost_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgPost" ADD CONSTRAINT "OrgPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgComment" ADD CONSTRAINT "OrgComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "OrgPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgComment" ADD CONSTRAINT "OrgComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterAssignment" ADD CONSTRAINT "RosterAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterAssignment" ADD CONSTRAINT "RosterAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterAssignment" ADD CONSTRAINT "RosterAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitRequest" ADD CONSTRAINT "ExitRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitRequest" ADD CONSTRAINT "ExitRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDeclaration" ADD CONSTRAINT "TaxDeclaration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDeclaration" ADD CONSTRAINT "TaxDeclaration_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

