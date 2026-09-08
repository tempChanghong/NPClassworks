import assert from "node:assert/strict";
import {before, after, beforeEach, test} from "node:test";
import {createFlowHarness, deferred} from "./helpers/flowHarness.js";

let h;
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => h.reset());
const login = {schoolCode: "school", username: "teacher", password: "1234"};

test("expiry blocks account requests before the timer runs, preserving the screen token", async t => {
  h.newStore({screen: true}); h.unlockScreen();
  h.api.saveAccountTokens({accessToken: "teacher-a", refreshToken: "refresh-a"});
  await h.api.classworksV2Api.profile();
  const calls = h.requests.filter(req => req.path === "/accounts/profile").length;
  const expired = Date.now() + 16 * 60000;
  t.mock.method(Date, "now", () => expired);
  await assert.rejects(h.api.classworksV2Api.profile(), {code: "ERR_CANCELED"});
  assert.equal(h.requests.filter(req => req.path === "/accounts/profile").length, calls);
  assert.deepEqual(h.api.getAccountTokens(), {accessToken: "", refreshToken: ""});
  assert.equal(h.api.getClassroomScreenToken(), "screen-a-token");
});

test("a delayed login cannot inherit a second unlock after the first was ended", async () => {
  h.newStore({screen: true}); h.unlockScreen();
  const started = deferred(), release = deferred();
  h.routes.set("POST /accounts/local/login", async (_req, reply) => {
    started.resolve(); await release.promise;
    reply({access_token: "old-login", refresh_token: "old-refresh", account: {id: "old"}});
  });
  const rejected = assert.rejects(h.api.loginWithSchoolAccount(login), {code: "ERR_CANCELED"});
  await started.promise;
  h.screenExit.endScreenTemporaryExit();
  h.unlockScreen();
  release.resolve(); await rejected;
  assert.equal(h.api.getAccountTokens().accessToken, "");
});

test("a late PIN response cannot reopen an explicitly ended exit", () => {
  h.newStore({screen: true});
  const pendingPin = h.screenExit.readScreenTemporaryExit();
  h.unlockScreen(); h.screenExit.endScreenTemporaryExit();
  assert.throws(() => h.screenExit.beginScreenTemporaryExit(pendingPin.token, pendingPin.server, pendingPin.epoch), /重新验证 PIN/);
  assert.equal(h.screenExit.screenAccountAccessAllowed(), false);
  h.unlockScreen();
  assert.equal(h.screenExit.screenAccountAccessAllowed(), true);
});

test("signout clears state immediately and slow logout cannot clear a later account", async () => {
  const store = h.newStore();
  h.api.saveAccountTokens({accessToken: "old", refreshToken: "old-refresh"});
  await store.bootstrapTeacher();
  const started = deferred(), release = deferred();
  h.routes.set("POST /accounts/logout", async (req, reply) => {
    assert.equal(req.headers.authorization, "Bearer old"); started.resolve(); await release.promise; reply({});
  });
  const signout = store.signOutTeacher();
  assert.equal(store.account, null);
  assert.equal(store.schoolMemberships.length, 0);
  assert.equal(h.api.getAccountTokens().accessToken, "");
  await started.promise;
  h.api.saveAccountTokens({accessToken: "new", refreshToken: "new-refresh"});
  await store.bootstrapTeacher();
  release.resolve(); await signout;
  assert.equal(store.account.id, "new");
  assert.equal(h.api.getAccountTokens().accessToken, "new");
});

test("ordinary and authorized screen logins remain usable", async () => {
  h.routes.set("POST /accounts/local/login", (_req, reply) => reply({access_token: "valid", refresh_token: "refresh", account: {id: "teacher"}}));
  assert.equal((await h.api.loginWithSchoolAccount(login)).id, "teacher");
  h.newStore({screen: true});
  await assert.rejects(h.api.loginWithSchoolAccount(login), {code: "ERR_CANCELED"});
  h.unlockScreen();
  assert.equal((await h.api.loginWithSchoolAccount(login)).id, "teacher");
});

test("invalid, stale-binding and wrong-server leases cannot grant access", () => {
  h.newStore({screen: true}); h.unlockScreen();
  const key = h.screenExit.SCREEN_EXIT_KEY;
  const original = JSON.parse(h.storage.getItem(key));
  for (const patch of [{expiresAt: Infinity}, {expiresAt: original.expiresAt + 1},
    {token: "other-screen"}, {server: "https://other.example"}, {startedAt: Date.now() + 10000}]) {
    h.storage.setItem(key, JSON.stringify({...original, ...patch}));
    assert.equal(h.screenExit.screenAccountAccessAllowed(), false);
  }
  h.storage.setItem(key, "invalid json");
  assert.equal(h.screenExit.screenAccountAccessAllowed(), false);
});

test("unreadable storage and failed lease writes do not unlock a screen", t => {
  h.newStore({screen: true});
  const write = t.mock.method(h.storage, "setItem", () => { throw new Error("storage blocked"); });
  assert.throws(() => h.unlockScreen(), /storage blocked/);
  assert.equal(h.screenExit.screenAccountAccessAllowed(), false);
  write.mock.restore();
  t.mock.method(h.storage, "getItem", () => { throw new Error("unreadable"); });
  assert.equal(h.screenExit.screenAccountAccessAllowed(), false);
});

test("OAuth callbacks on a screen require the current initiated exit context", () => {
  h.newStore({screen: true}); h.unlockScreen();
  const oldLocation = window.location, oldHistory = window.history;
  window.location = {origin: "http://127.0.0.1", href: "http://127.0.0.1/?success=true&access_token=oauth&refresh_token=oauth-refresh", assign() {}};
  window.history = {replaceState() {}};
  try {
    h.api.startOAuthLogin("provider");
    assert.equal(h.api.captureOAuthCallback(), true);
    assert.equal(h.api.getAccountTokens().accessToken, "oauth");
    h.api.clearAccountTokens();
    h.api.startOAuthLogin("provider");
    h.screenExit.endScreenTemporaryExit(); h.unlockScreen();
    h.api.captureOAuthCallback();
    assert.equal(h.api.getAccountTokens().accessToken, "");
    assert.match(h.api.consumeOAuthError(), /重新验证 PIN/);
  } finally { window.location = oldLocation; window.history = oldHistory; }
});

test("a server-authorized setup session releases a stale binding on an uninitialized instance", async () => {
  h.newStore({screen: true});
  h.routes.set("POST /api/v2/setup/session", (_req, reply) => reply({token: "validated-setup"}));
  await h.api.createInstanceSetupSession("server-validated-key");
  assert.equal(h.api.getClassroomScreenToken(), "");
  assert.equal(sessionStorage.getItem("classworks-v2-setup-token"), "validated-setup");
});
