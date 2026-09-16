CREATE TABLE "EmployeeEducation" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "qualification" TEXT NOT NULL,
  "specialization" TEXT,
  "institution" TEXT NOT NULL,
  "board" TEXT,
  "completionYear" INTEGER,
  "grade" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeEducation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EmployeeWorkExperience" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "employer" TEXT NOT NULL,
  "jobTitle" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "location" TEXT,
  "responsibilities" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeWorkExperience_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeeEducation_employeeId_idx" ON "EmployeeEducation"("employeeId");
CREATE INDEX "EmployeeWorkExperience_employeeId_idx" ON "EmployeeWorkExperience"("employeeId");
ALTER TABLE "EmployeeEducation" ADD CONSTRAINT "EmployeeEducation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkExperience" ADD CONSTRAINT "EmployeeWorkExperience_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
