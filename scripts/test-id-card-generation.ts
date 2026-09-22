import assert from "node:assert/strict";
import { formatIdCardDate, idCardDetails } from "@/lib/id-card-content";
import { idCardDownloadUrl, validTillFromRequest } from "@/lib/id-card-generation";

const employee = { employeeNumber: "EMP-001", firstName: "Ada", lastName: "Lovelace", position: "Engineer", joiningDate: "2020-01-02", phone: "1234567890", profile: { bloodGroup: "O+" } };
const details = idCardDetails(employee, { issuedAt: new Date("2026-09-22T20:00:00.000Z"), validTill: "2028-01-02" });

assert.equal(formatIdCardDate(new Date("2026-09-22T20:00:00.000Z")), "23/09/2026", "issue date uses the generation instant in IST");
assert.equal(formatIdCardDate("2028-01-02"), "02/01/2028", "picker calendar dates retain their selected day");
assert.deepEqual(details.find(([label]) => label === "Issued Date"), ["Issued Date", "23/09/2026"]);
assert.deepEqual(details.find(([label]) => label === "Valid Till"), ["Valid Till", "02/01/2028"]);
assert.equal(idCardDownloadUrl(" DEVICE-001 ", 30, 70, "2028-01-02"), "/api/id-cards?deviceCode=DEVICE-001&format=pdf&photoX=30&photoY=70&validTill=2028-01-02", "download carries validTill");
assert.equal(idCardDownloadUrl("DEVICE-001", 50, 50, "").includes("validTill"), false, "blank validity remains optional");
assert.equal(validTillFromRequest("2028-01-02"), "2028-01-02");
assert.equal(validTillFromRequest("02/01/2028"), undefined, "endpoint rejects non-picker date formats");
assert.equal(validTillFromRequest("2028-02-30"), undefined, "endpoint rejects impossible calendar dates");
console.log("ID-card generation tests passed");
