ALTER TABLE "EmployeeEducation" ADD COLUMN "courseType" TEXT;
ALTER TABLE "EmployeeEducation" ADD COLUMN "educationMode" TEXT;
ALTER TABLE "EmployeeEducation" ADD COLUMN "startDate" TIMESTAMP(3);

ALTER TABLE "EmployeeWorkExperience" ADD COLUMN "companyMobile" TEXT;
ALTER TABLE "EmployeeWorkExperience" ADD COLUMN "companyEmail" TEXT;
ALTER TABLE "EmployeeWorkExperience" ADD COLUMN "companyAddress" TEXT;
ALTER TABLE "EmployeeWorkExperience" ADD COLUMN "companyWebsite" TEXT;
ALTER TABLE "EmployeeWorkExperience" ADD COLUMN "jobType" TEXT;
ALTER TABLE "EmployeeWorkExperience" ADD COLUMN "ctc" DOUBLE PRECISION;
ALTER TABLE "EmployeeWorkExperience" ADD COLUMN "reportingName" TEXT;
ALTER TABLE "EmployeeWorkExperience" ADD COLUMN "reportingTitle" TEXT;
ALTER TABLE "EmployeeWorkExperience" ADD COLUMN "reportingMobile" TEXT;
ALTER TABLE "EmployeeWorkExperience" ADD COLUMN "reportingEmail" TEXT;
ALTER TABLE "EmployeeWorkExperience" ADD COLUMN "reasonForLeaving" TEXT;
ALTER TABLE "EmployeeWorkExperience" ADD COLUMN "noticePeriod" TEXT;

CREATE TABLE "EmployeeProfile" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "middleName" TEXT, "nameAsOnAadhaar" TEXT, "nickName" TEXT, "gender" TEXT,
  "dateOfBirthCertificate" TIMESTAMP(3), "actualDateOfBirth" TIMESTAMP(3), "celebrateDatePreference" TEXT, "maritalStatus" TEXT,
  "spouseName" TEXT, "marriageDate" TIMESTAMP(3), "bloodGroup" TEXT, "whatsappNumber" TEXT, "otherMobile" TEXT, "personalEmail" TEXT,
  "placeOfBirth" TEXT, "nationality" TEXT, "citizenship" TEXT, "fatherName" TEXT, "motherName" TEXT, "emergencyContactName" TEXT,
  "emergencyContactNumber" TEXT, "emergencyContactRelation" TEXT, "currentAddress" JSONB, "permanentAddress" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id"), CONSTRAINT "EmployeeProfile_employeeId_key" UNIQUE ("employeeId")
);

CREATE TABLE "EmployeeEmploymentProfile" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "rejoiningDate" TIMESTAMP(3), "statusUpdatedAt" TIMESTAMP(3), "employmentMode" TEXT,
  "natureOfEmployment" TEXT, "probationPeriod" TEXT, "totalExperience" TEXT, "salaryGroup" TEXT, "ctc" DOUBLE PRECISION,
  "salaryPaymentMode" TEXT, "paySalaryFrom" TEXT, "tdsAllowed" BOOLEAN, "pfAllowed" BOOLEAN, "esicAllowed" BOOLEAN, "ptLocation" TEXT,
  "autoCreditLeave" BOOLEAN, "subDepartment" TEXT, "grade" TEXT, "vehicleCategory" TEXT, "vehicleClass" TEXT, "vehicleSubClass" TEXT,
  "licenseRequired" BOOLEAN, "extensionNumber" TEXT, "secondManagerCode" TEXT, "hrManagerCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeEmploymentProfile_pkey" PRIMARY KEY ("id"), CONSTRAINT "EmployeeEmploymentProfile_employeeId_key" UNIQUE ("employeeId")
);

CREATE TABLE "EmployeeDependent" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "firstName" TEXT NOT NULL, "middleName" TEXT, "lastName" TEXT, "relation" TEXT,
  "dateOfBirth" TIMESTAMP(3), "aadhaarNumber" TEXT, "mobile" TEXT, "email" TEXT, "occupation" TEXT, "nomineeShare" DOUBLE PRECISION,
  "address" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeDependent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeReference" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "relation" TEXT, "name" TEXT NOT NULL, "mobile" TEXT, "email" TEXT,
  "occupation" TEXT, "address" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeBankAccount" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "accountNumber" TEXT NOT NULL, "ifscCode" TEXT, "accountHolder" TEXT,
  "accountType" TEXT, "bankName" TEXT, "bankBranch" TEXT, "status" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeDependent_employeeId_idx" ON "EmployeeDependent"("employeeId");
CREATE INDEX "EmployeeReference_employeeId_idx" ON "EmployeeReference"("employeeId");
CREATE INDEX "EmployeeBankAccount_employeeId_idx" ON "EmployeeBankAccount"("employeeId");

ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeEmploymentProfile" ADD CONSTRAINT "EmployeeEmploymentProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeDependent" ADD CONSTRAINT "EmployeeDependent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeReference" ADD CONSTRAINT "EmployeeReference_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeBankAccount" ADD CONSTRAINT "EmployeeBankAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
