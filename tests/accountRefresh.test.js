import assert from "node:assert/strict";
import {before, after, beforeEach, test} from "node:test";
import {createFlowHarness, deferred} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => {
  h.reset();
  h.api.clearAccountTokens();
  h.api.saveAccountTokens({accessToken: "expired-a", refreshToken: "refresh-a"});
  h.routes.set("GET /accounts/profile", (req, reply) => req.headers.authorization === "Bearer renewed-a"
    ? reply({id: "teacher-a"}) : reply({message: "access expired"}, 401));
});

test("concurrent 401 responses share one bounded refresh and retry with the new access token", async () => {
  let refreshes = 0;
  h.routes.set("POST /accounts/refresh", (req, reply) => {
    refreshes++;
    assert.equal(req.body.refresh_token, "refresh-a");
    reply({access_token: "renewed-a"});
  });
  const profiles = await Promise.all(Array.from({length: 4}, () => h.api.classworksV2Api.profile()));
  assert.ok(profiles.every((profile) => profile.id === "teacher-a"));
  assert.equal(refreshes, 1);
  assert.equal(h.api.getAccountTokens().refreshToken, "refresh-a");
});

test("temporary refresh failure preserves credentials through teacher bootstrap and can recover", async () => {
  const store = h.newStore();
  h.routes.set("POST /accounts/refresh", (_req, reply) => reply({message: "temporarily unavailable"}, 503));
  await store.bootstrapTeacher();
  assert.equal(h.api.getAccountTokens().refreshToken, "refresh-a");
  assert.match(store.teacherError, /temporarily unavailable/);
  h.routes.set("POST /accounts/refresh", (_req, reply) => reply({access_token: "renewed-a"}));
  await store.bootstrapTeacher();
  assert.equal(store.account.id, "teacher-a");
});

test("a hung refresh times out without clearing the login", {timeout: 15000}, async () => {
  const release = deferred();
  h.routes.set("POST /accounts/refresh", async (_req, reply) => {
    await release.promise; reply({access_token: "renewed-a"});
  });
  try {
    await assert.rejects(h.api.classworksV2Api.profile(), (error) => {
      assert.equal(error.code, "ECONNABORTED");
      assert.equal(error.config.timeout, h.api.ACCOUNT_REFRESH_TIMEOUT_MS);
      return true;
    });
    assert.equal(h.api.getAccountTokens().refreshToken, "refresh-a");
  } finally { release.resolve(); }
});

test("invalid refresh credentials expire the local login", async () => {
  h.routes.set("POST /accounts/refresh", (_req, reply) => reply({message: "refresh expired"}, 401));
  await assert.rejects(h.api.classworksV2Api.profile());
  assert.deepEqual(h.api.getAccountTokens(), {accessToken: "", refreshToken: ""});
});

for (const status of [200, 401, 503]) {
  test(`old-account refresh response (${status}) cannot overwrite or clear a new login`, async () => {
    const started = deferred(); const release = deferred();
    h.routes.set("POST /accounts/refresh", async (req, reply) => {
      if (req.body.refresh_token === "refresh-a") {
        started.resolve(); await release.promise;
        reply(status === 200 ? {access_token: "renewed-a"} : {message: "old failure"}, status);
      } else reply({access_token: "renewed-b"});
    });
    const old = h.api.classworksV2Api.profile();
    const rejected = assert.rejects(old, {code: "ERR_CANCELED"});
    await started.promise;
    h.api.clearAccountTokens();
    h.api.saveAccountTokens({accessToken: "expired-b", refreshToken: "refresh-b"});
    h.routes.set("GET /accounts/profile", (req, reply) => req.headers.authorization === "Bearer renewed-b"
      ? reply({id: "teacher-b"}) : reply({}, 401));
    try {
      assert.equal((await h.api.classworksV2Api.profile()).id, "teacher-b");
    } finally { release.resolve(); }
    await rejected;
    assert.deepEqual(h.api.getAccountTokens(), {accessToken: "renewed-b", refreshToken: "refresh-b"});
    assert.equal(h.requests.filter((req) => req.path === "/accounts/profile" && req.headers.authorization === "Bearer renewed-a").length, 0);
  });
}

test("signout during refresh cannot resurrect the old login", async () => {
  const started = deferred(); const release = deferred();
  h.routes.set("POST /accounts/refresh", async (_req, reply) => {
    started.resolve(); await release.promise; reply({access_token: "renewed-a"});
  });
  const rejected = assert.rejects(h.api.classworksV2Api.profile(), {code: "ERR_CANCELED"});
  await started.promise;
  h.api.clearAccountTokens(); release.resolve();
  await rejected;
  assert.deepEqual(h.api.getAccountTokens(), {accessToken: "", refreshToken: ""});
});
