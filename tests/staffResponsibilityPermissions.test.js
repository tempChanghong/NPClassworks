import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const component = readFileSync(
  new URL("../src/components/admin/StaffResponsibilityManager.vue", import.meta.url),
  "utf8",
);

test("staff permission preview treats school owners and admins as full-school teaching managers", () => {
  assert.match(component, /\["OWNER", "ADMIN"\]\.includes/);
  assert.match(component, /全校全部年级、行政班与走班教学空间/);
  assert.match(component, /全校教学业务管理/);
  assert.match(component, /isSchoolManager\(selectedPermissionPerson\)/);
});
