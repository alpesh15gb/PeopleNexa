import assert from "node:assert/strict";
import { ID_CARD_ARTBOARD, ID_CARD_LAYOUT, idCardDetails } from "@/lib/id-card-content";

const fieldsHeight = 6 * ID_CARD_LAYOUT.fields.rowHeight + 5 * ID_CARD_LAYOUT.fields.gap;
assert.equal(ID_CARD_ARTBOARD.width / ID_CARD_ARTBOARD.height, 591 / 1004);
assert.equal(idCardDetails({ employeeNumber: "1", firstName: "A", lastName: "B", position: null, joiningDate: null, phone: null, profile: null }).length, 6);
assert.ok(ID_CARD_LAYOUT.photo.y + ID_CARD_LAYOUT.photo.height < ID_CARD_LAYOUT.fields.y);
assert.ok(ID_CARD_LAYOUT.fields.y + fieldsHeight < 1);
console.log("ID-card layout geometry tests passed");
