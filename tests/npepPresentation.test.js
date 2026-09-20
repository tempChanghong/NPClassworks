import test from "node:test";
import assert from "node:assert/strict";
import {npepConnectivity, npepErrorMessage, npepRecordingName, npepAutomaticName} from "../src/utils/npepPresentation.js";

test("NPEP freshness ages locally and old samples cannot imply active authorization", () => {
  const time = Date.parse("2026-09-21T00:00:00Z");
  const device = {state: "ACTIVE", connectivity: "ONLINE", lastSeenAt: new Date(time).toISOString()};
  assert.equal(npepConnectivity(device, time + 60000), "在线");
  assert.equal(npepConnectivity(device, time + 60001), "观测已过时，请刷新");
  assert.equal(npepConnectivity({...device, state: "REVOKED"}, time), "不在授权中");
  assert.equal(npepConnectivity({...device, lastSeenAt: null}, time), "尚未上报");
  assert.equal(npepConnectivity({...device, lastSeenAt: "invalid"}, time), "观测时间未知");
  assert.equal(npepConnectivity({...device, connectivity: "OFFLINE"}, time), "已失联");
  assert.equal(npepRecordingName("IDLE"), "未录制");
  assert.equal(npepAutomaticName("ENABLED"), "已启用");
});
test("NPEP errors translate codes without displaying server text or request secrets", () => {
  assert.match(npepErrorMessage({response: {data: {error: {code: "RATE_LIMITED", retryAfterSeconds: 12}}}}), /12 秒/);
  assert.match(npepErrorMessage({response: {data: {error: {code: "TEMPORARILY_UNAVAILABLE", message: "secret"}}}}), /未启用/);
  assert.ok(!npepErrorMessage({message: "secret", response: {data: {error: {message: "secret"}}}}).includes("secret"));
});
