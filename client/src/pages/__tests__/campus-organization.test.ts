import assert from "node:assert/strict";
import test from "node:test";
import { CAMPUS_DEPARTMENTS } from "@shared/campus";
import { insertCampusDepartmentSchema } from "@shared/schema";
import { getTerminology } from "@shared/terminology";

test("Campus terminology maps existing entities without changing the shared model", () => {
  const terms = getTerminology("higher_education");
  assert.equal(terms.consumer, "Student");
  assert.equal(terms.creditor, "Department");
  assert.equal(terms.settlement, "Payment Plan");
});

test("Campus provides the requested university department examples", () => {
  for (const name of ["Student Accounts", "Housing", "Parking", "Admissions", "Dining", "Athletics", "Bookstore", "Financial Aid", "Registrar", "Continuing Education"]) {
    assert.ok(CAMPUS_DEPARTMENTS.includes(name as typeof CAMPUS_DEPARTMENTS[number]));
  }
});

test("department input accepts organization fields but never a caller-supplied tenant", () => {
  const parsed = insertCampusDepartmentSchema.parse({
    name: "Student Accounts",
    code: "STUACCT",
    description: "University receivables",
    color: "#2563eb",
    tenantId: "00000000-0000-0000-0000-000000000000",
  });
  assert.equal(parsed.name, "Student Accounts");
  assert.equal("tenantId" in parsed, false);
  assert.throws(() => insertCampusDepartmentSchema.parse({ name: "Housing", code: "not valid!" }));
});
