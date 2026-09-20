import {before, beforeEach, after, test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => { h.reset(); h.api.saveAccountTokens({accessToken: "old-access", refreshToken: "session-a"}); });
const envelope = (id, data = {}) => ({protocolVersion: "0.1", requestId: id, serverTime: new Date().toISOString(), data});

test("NPEP administrator renewal retries the same approval ID and body with the new access token", async () => {
  const ids = [], pairingId = randomUUID();
  const path = `/api/v2/npep/schools/school/pairings/${pairingId}/approve`;
  h.routes.set("POST /accounts/refresh", (_req, reply) => reply({access_token: "renewed"}));
  h.routes.set(`POST ${path}`, (req, reply) => {
    ids.push(req.body.requestId);
    assert.deepEqual(req.body.capabilities, ["device.status"]);
    assert.equal(req.headers["x-npep-version"], "0.1");
    if (req.headers.authorization === "Bearer old-access") return reply({error: {code: "AUTH_INVALID"}}, 401);
    assert.equal(req.headers.authorization, "Bearer renewed");
    reply(envelope(req.body.requestId, {state: "APPROVED"}), 200, true);
  });
  const result = await h.api.npepAdminApi.approve("school", pairingId, "screen");
  assert.equal(result.data.state, "APPROVED");
  assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
});

test("NPEP ignores a successful response from a previous account session", async () => {
  const held = deferred();
  h.routes.set("GET /api/v2/npep/schools/school/devices", async (req, reply) => {
    await held.promise;
    reply(envelope(req.headers["x-request-id"], {items: [{deviceName: "private old account"}], nextCursor: null}), 200, true);
  });
  const result = h.api.npepAdminApi.devices("school").catch(error => error);
  await eventually(() => assert.ok(h.requests.some(req => req.path.endsWith("/devices"))));
  h.api.saveAccountTokens({accessToken: "different-account", refreshToken: "session-b"});
  held.resolve();
  assert.equal((await result).code, "ERR_CANCELED");
});

test("NPEP rejects mismatched envelopes and does not put short codes in persistent diagnostics", async () => {
  h.routes.set("GET /api/v2/npep/info", (_req, reply) => reply(envelope(randomUUID()), 200, true));
  await assert.rejects(h.api.npepAdminApi.info(), /响应不兼容/);
  h.routes.set("POST /api/v2/npep/schools/school/pairings/resolve", (_req, reply) => reply({error: {code: "NOT_FOUND", message: "ABCD2345"}}, 404));
  await assert.rejects(h.api.npepAdminApi.resolve("school", "ABCD2345"));
  for (let index = 0; index < localStorage.length; index++) assert.ok(!localStorage.getItem(localStorage.key(index)).includes("ABCD2345"));
});
