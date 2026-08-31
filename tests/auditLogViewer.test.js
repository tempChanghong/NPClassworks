import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/components/admin/AuditLogViewer.vue", import.meta.url), "utf8");

test("audit result filter is not shadowed by the API response", () => {
  assert.match(source, /const resultFilter = ref\("ALL"\)/);
  assert.match(source, /success: resultFilter\.value/);
  assert.match(source, /const response = await classworksV2Api\.auditLogs/);
  assert.doesNotMatch(source, /const result = await classworksV2Api\.auditLogs/);
});
