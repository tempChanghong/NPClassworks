import assert from "node:assert/strict";
import {before, after, beforeEach, test} from "node:test";
import {createFlowHarness, deferred} from "./helpers/flowHarness.js";
import {createOAuthVerifier, oauthChallenge} from "../src/utils/oauthHandoff.js";
let h;
before(async () => {h = await createFlowHarness();});
after(async () => {await h?.close();});
beforeEach(() => h.reset());

test("login challenge matches its browser secret and callback exchanges via POST after clearing URL", async () => {
  const verifier = createOAuthVerifier(); assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(await oauthChallenge(verifier), /^[A-Za-z0-9_-]{43}$/);
  const oldLocation = window.location, oldHistory = window.history;
  let navigation, cleaned = false;
  window.location = {origin: "http://127.0.0.1", href: "http://127.0.0.1/?success=true&oauth_code=one-use", assign(url) {navigation = new URL(url);}};
  window.history = {replaceState() {cleaned = true;}};
  try {
    await h.api.startOAuthLogin("stcn");
    h.routes.set("POST /accounts/oauth/exchange", async (req, reply) => {
      assert.equal(cleaned, true); assert.equal(req.body.code, "one-use");
      assert.equal(await oauthChallenge(req.body.verifier), navigation.searchParams.get("handoff_challenge"));
      reply({access_token: "new-access", refresh_token: "new-refresh"});
    });
    assert.equal(await h.api.captureOAuthCallback(), true);
    assert.equal(h.api.getAccountTokens().accessToken, "new-access");
  } finally {window.location = oldLocation; window.history = oldHistory;}
});

test("a delayed OAuth exchange cannot enter a newer account session or expired screen exit", async () => {
  const oldLocation = window.location, oldHistory = window.history;
  window.location = {origin: "http://127.0.0.1", href: "http://127.0.0.1/?success=true&oauth_code=one-use", assign() {}};
  window.history = {replaceState() {}};
  try {
    for (const screen of [false, true]) {
      h.reset(); if (screen) {h.newStore({screen: true}); h.unlockScreen();}
      await h.api.startOAuthLogin("stcn");
      const reached = deferred(), release = deferred();
      h.routes.set("POST /accounts/oauth/exchange", async (_req, reply) => {reached.resolve(); await release.promise; reply({access_token: "stale", refresh_token: "stale-refresh"});});
      const pending = h.api.captureOAuthCallback(); await reached.promise;
      if (screen) h.screenExit.endScreenTemporaryExit();
      else h.api.saveAccountTokens({accessToken: "other", refreshToken: "other-refresh"});
      release.resolve(); await pending;
      assert.equal(h.api.getAccountTokens().accessToken, screen ? "" : "other");
    }
  } finally {window.location = oldLocation; window.history = oldHistory;}
});

test("a failed handoff does not refresh or revoke an existing independent login", async () => {
  const oldLocation = window.location, oldHistory = window.history;
  window.location = {origin: "http://127.0.0.1", href: "http://127.0.0.1/?success=true&oauth_code=expired", assign() {}};
  window.history = {replaceState() {}};
  try {
    h.api.saveAccountTokens({accessToken: "existing", refreshToken: "existing-refresh"});
    await h.api.startOAuthLogin("stcn");
    h.routes.set("POST /accounts/oauth/exchange", (req, reply) => {
      assert.equal(req.headers.authorization, undefined);
      reply({code: "OAUTH_HANDOFF_INVALID"}, 401);
    });
    await h.api.captureOAuthCallback();
    assert.equal(h.api.getAccountTokens().accessToken, "existing");
    assert.equal(h.requests.filter(req => req.path === "/accounts/refresh").length, 0);
  } finally {window.location = oldLocation; window.history = oldHistory;}
});
