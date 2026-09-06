import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";

let h;
const heartbeat = "POST /api/v2/classroom-screens/heartbeat";
const ack = "POST /api/v2/classroom-screens/commands/reload/ack";
const pause = () => new Promise(resolve => setTimeout(resolve, 50));
before(async () => { h = await createFlowHarness(); });
after(async () => { await h?.close(); });
beforeEach(() => {
  h.reset(); navigator.onLine = true; document.visibilityState = "visible";
  window.location.reload = () => {};
});

test("slow heartbeat absorbs foreground bursts until its command acknowledgement finishes", async () => {
  const response = deferred();
  const acknowledgement = deferred();
  h.routes.set(heartbeat, async (_req, reply) => {
    await response.promise;
    reply({receivedAt: "current", commands: [{id: "unknown", type: "UNSUPPORTED"}]});
  });
  h.routes.set("POST /api/v2/classroom-screens/commands/unknown/ack", async (_req, reply) => {
    await acknowledgement.promise; reply({});
  });
  const store = h.newStore({screen: true});
  store.initializeScreenSync();
  try {
    await eventually(() => assert.equal(h.requests.length, 1));
    for (let i = 0; i < 15; i++) window.dispatchEvent(new globalThis.Event("visibilitychange"));
    await pause();
    assert.equal(h.requests.length, 1);
    response.resolve();
    await eventually(() => assert.equal(h.requests.length, 2));
    for (let i = 0; i < 15; i++) void store.sendScreenHeartbeat();
    await pause();
    assert.equal(h.requests.length, 2, "command execution is part of the heartbeat's single flight");
  } finally {
    store.stopScreenSync(); response.resolve(); acknowledgement.resolve(); await pause();
  }
});

for (const replacement of ["binding", "same-binding-restart", "token", "stop"]) {
  test(`late heartbeat cannot apply state or execute commands after ${replacement}`, async () => {
    const response = deferred();
    h.routes.set(heartbeat, async (_req, reply) => {
      await response.promise; reply({receivedAt: "old", commands: [{id: "reload", type: "RELOAD_APP"}]});
    });
    h.routes.set(ack, (_req, reply) => reply({}));
    const store = h.newStore({screen: true});
    store.initializeScreenSync();
    try {
      await eventually(() => assert.equal(h.requests.length, 1));
      store.screenHeartbeatAt = "new";
      if (replacement === "binding") store.screenSession = {binding: {id: "screen-b"}, workspaces: []};
      if (replacement === "token") h.api.saveClassroomScreenToken("new-token");
      if (replacement === "stop") store.stopScreenSync();
      if (replacement === "same-binding-restart") {
        h.routes.set(heartbeat, (_req, reply) => reply({receivedAt: "new", commands: []}));
        store.initializeScreenSync();
        await eventually(() => assert.equal(h.requests.length, 2));
      }
      response.resolve(); await pause();
      assert.equal(store.screenHeartbeatAt, "new");
      assert.equal(h.requests.filter(req => req.path.includes("/commands/")).length, 0);
    } finally { store.stopScreenSync(); response.resolve(); await pause(); }
  });
}

test("refresh command's late session and feed responses cannot overwrite a replacement binding", async () => {
  const response = deferred();
  h.routes.set(heartbeat, (_req, reply) => reply({receivedAt: "old", commands: [{id: "refresh", type: "REFRESH_DATA"}]}));
  h.routes.set("GET /api/v2/classroom-screens/session", async (_req, reply) => {
    await response.promise; reply({binding: {id: "screen-a"}, workspaces: []});
  });
  h.routes.set("GET /api/v2/classroom-screens/feed", async (_req, reply) => {
    await response.promise; reply({items: [{id: "old-content"}]});
  });
  const store = h.newStore({screen: true});
  store.initializeScreenSync();
  try {
    await eventually(() => assert.equal(h.requests.length, 3));
    store.screenSession = {binding: {id: "screen-b"}, workspaces: []};
    store.feed = [{id: "new-content"}];
    store.screenLoading = false; store.feedLoading = false;
    h.api.saveClassroomScreenToken("screen-b-token");
    store.stopScreenSync();
    response.resolve(); await pause();
    assert.equal(store.screenSession.binding.id, "screen-b");
    assert.equal(store.feed[0].id, "new-content");
    assert.equal(store.screenLoading, false);
    assert.equal(store.feedLoading, false);
    assert.equal(h.storage.getItem("classworks-v2-screen-session-cache"), null);
    assert.equal(h.requests.filter(req => req.path.includes("/commands/")).length, 0);
  } finally { store.stopScreenSync(); response.resolve(); await pause(); }
});

test("reload command is acknowledged once, works in its session, and cancels on stop", async (t) => {
  const timers = new Map();
  const reload = t.mock.method(window.location, "reload", () => {});
  const schedule = window.setTimeout;
  const cancel = window.clearTimeout;
  t.mock.method(window, "setTimeout", (callback, delay) => {
    if (delay !== 300) return schedule(callback, delay);
    const id = {}; timers.set(id, callback); return id;
  });
  t.mock.method(window, "clearTimeout", id => { if (!timers.delete(id)) cancel(id); });
  h.routes.set(heartbeat, (_req, reply) => reply({receivedAt: "now", commands: [{id: "reload", type: "RELOAD_APP"}]}));
  h.routes.set(ack, (_req, reply) => reply({}));
  const store = h.newStore({screen: true});
  store.initializeScreenSync();
  try {
    await eventually(() => assert.equal(timers.size, 1));
    const [id, callback] = timers.entries().next().value;
    timers.delete(id); callback();
    assert.equal(reload.mock.callCount(), 1);
    await store.sendScreenHeartbeat();
    assert.equal(timers.size, 1);
    const staleCallback = [...timers.values()][0];
    store.stopScreenSync();
    assert.equal(timers.size, 0);
    staleCallback();
    assert.equal(reload.mock.callCount(), 1);
    assert.equal(h.requests.filter(req => req.path.includes("/commands/")).length, 2);
  } finally { store.stopScreenSync(); }
});

test("failed heartbeat releases the running guard for the next attempt", async () => {
  h.routes.set(heartbeat, (_req, reply) => reply({message: "temporary failure"}, 503));
  const store = h.newStore({screen: true});
  store.initializeScreenSync();
  try {
    await eventually(() => assert.equal(h.requests.length, 1));
    await pause();
    h.routes.set(heartbeat, (_req, reply) => reply({receivedAt: "recovered", commands: []}));
    await store.sendScreenHeartbeat();
    assert.equal(store.screenHeartbeatAt, "recovered");
    assert.equal(h.requests.length, 2);
  } finally { store.stopScreenSync(); }
});

test("healthy refresh command updates configuration and content before acknowledging success", async () => {
  h.routes.set(heartbeat, (_req, reply) => reply({receivedAt: "now", commands: [{id: "refresh", type: "REFRESH_DATA"}]}));
  h.routes.set("GET /api/v2/classroom-screens/session", (_req, reply) => reply({binding: {id: "screen-a"}, workspaces: [], marker: "updated"}));
  h.publications.push({id: "latest"});
  const store = h.newStore({screen: true});
  h.routes.set("POST /api/v2/classroom-screens/commands/refresh/ack", (req, reply) => {
    assert.equal(store.screenSession.marker, "updated");
    assert.equal(store.feed[0].id, "latest");
    assert.equal(req.body.success, true);
    reply({});
  });
  store.initializeScreenSync();
  try {
    await eventually(() => assert.equal(h.requests.filter(req => req.path.includes("/commands/")).length, 1));
    await pause();
    assert.equal(store.screenLoading, false);
    assert.equal(store.feedLoading, false);
    assert.equal(JSON.parse(h.storage.getItem("classworks-v2-screen-session-cache")).value.marker, "updated");
  } finally { store.stopScreenSync(); }
});

test("a reload acknowledgement arriving after stop cannot schedule a page reload", async () => {
  const response = deferred();
  let reloads = 0;
  window.location.reload = () => { reloads++; };
  h.routes.set(heartbeat, (_req, reply) => reply({receivedAt: "now", commands: [{id: "reload", type: "RELOAD_APP"}]}));
  h.routes.set(ack, async (_req, reply) => { await response.promise; reply({}); });
  const store = h.newStore({screen: true});
  store.initializeScreenSync();
  try {
    await eventually(() => assert.equal(h.requests.length, 2));
    store.stopScreenSync();
    response.resolve();
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(reloads, 0);
  } finally { response.resolve(); store.stopScreenSync(); }
});

test("stopping a pending refresh command clears its loading state without applying late content", async () => {
  const response = deferred();
  h.routes.set(heartbeat, (_req, reply) => reply({receivedAt: "now", commands: [{id: "refresh", type: "REFRESH_DATA"}]}));
  h.routes.set("GET /api/v2/classroom-screens/session", async (_req, reply) => {
    await response.promise; reply({binding: {id: "screen-a"}, marker: "late"});
  });
  h.routes.set("GET /api/v2/classroom-screens/feed", async (_req, reply) => {
    await response.promise; reply({items: [{id: "late"}]});
  });
  const store = h.newStore({screen: true});
  store.initializeScreenSync();
  try {
    await eventually(() => assert.equal(h.requests.length, 3));
    assert.equal(store.screenLoading, true);
    assert.equal(store.feedLoading, true);
    store.stopScreenSync(); response.resolve();
    await eventually(() => {
      assert.equal(store.screenLoading, false);
      assert.equal(store.feedLoading, false);
    });
    assert.equal(store.screenSession.marker, undefined);
    assert.equal(store.feed.length, 0);
    assert.equal(h.requests.length, 3);
  } finally { response.resolve(); store.stopScreenSync(); }
});

test("a newer session bootstrap owns its state even if an older request completes last", async () => {
  const response = deferred();
  let calls = 0;
  h.routes.set("GET /api/v2/classroom-screens/session", async (_req, reply) => {
    const call = ++calls;
    if (call === 1) await response.promise;
    reply({binding: {id: "screen-a"}, marker: call});
  });
  const store = h.newStore({screen: true});
  const old = store.bootstrapClassroomScreen();
  try {
    await eventually(() => assert.equal(calls, 1));
    await store.bootstrapClassroomScreen();
    response.resolve(); await old;
    assert.equal(store.screenSession.marker, 2);
    assert.equal(store.screenLoading, false);
  } finally { response.resolve(); await old; }
});
