import assert from "node:assert/strict";
import { ID_CARD_ARTBOARD, ID_CARD_LAYOUT, idCardDetails, idCardFieldsHeight } from "@/lib/id-card-content";

const fields = idCardDetails({ employeeNumber: "EMP-001", firstName: "Ada", lastName: "Lovelace", position: "Engineer", joiningDate: "2020-01-02", phone: "1234567890", profile: { bloodGroup: "O+" } });
const fieldsHeight = idCardFieldsHeight();
assert.equal(ID_CARD_ARTBOARD.width / ID_CARD_ARTBOARD.height, 591 / 1004);
assert.equal(fields.length, 6);
assert.equal(new Set(fields.map(([label]) => label)).size, fields.length);
assert.ok(fields.every(([, value]) => value.length > 0));
assert.ok(ID_CARD_LAYOUT.photo.y + ID_CARD_LAYOUT.photo.height < ID_CARD_LAYOUT.fields.y);
assert.equal(ID_CARD_LAYOUT.fields.height, fieldsHeight);
assert.ok(ID_CARD_LAYOUT.fields.y + ID_CARD_LAYOUT.fields.height <= ID_CARD_LAYOUT.footer.y);
assert.ok(ID_CARD_LAYOUT.photo.y + ID_CARD_LAYOUT.photo.height <= ID_CARD_LAYOUT.legacyEmployeeRegion.y);
assert.ok(ID_CARD_LAYOUT.legacyEmployeeRegion.y + ID_CARD_LAYOUT.legacyEmployeeRegion.height <= ID_CARD_LAYOUT.footer.y + Number.EPSILON);
console.log("ID-card layout geometry tests passed");
