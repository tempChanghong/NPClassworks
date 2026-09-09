import assert from "node:assert/strict";
import {after, before, beforeEach, test} from "node:test";
import {createFlowHarness, eventually} from "./helpers/flowHarness.js";

let h;
let originalLoad;
let requests;
before(async () => {
  h = await createFlowHarness();
  originalLoad = h.api.classworksV2Api.notificationScreenDeliveries;
});
after(async () => { await h?.close(); });
beforeEach(() => {
  h.reset(); h.newStore(); requests = [];
  h.api.classworksV2Api.notificationScreenDeliveries = (...args) => {
    const request = originalLoad(...args);
    requests.push(request);
    return request;
  };
});

function holdDeliveries(id = "notice") {
  const replies = [];
  h.routes.set(`GET /api/v2/publications/${id}/screen-deliveries`, (_request, reply) => replies.push(reply));
  return replies;
}

function confirmed(id = "notice") {
  return {publicationId: id, revision: 1, screens: [{binding: {id: "screen-a"},
    delivery: {revision: 1, acknowledgedAt: new Date().toISOString()}}]};
}

test("delivery loading coalesces repeated refresh actions and permits a later refresh", async () => {
  const replies = holdDeliveries();
  const {state} = await h.openNotificationDelivery({id: "notice"});
  await eventually(() => assert.equal(replies.length, 1));
  await Promise.all([state.load(), state.load()]);
  assert.equal(replies.length, 1);
  replies[0](confirmed());
  await eventually(() => assert.equal(state.loading.value, false));
  const refresh = state.load();
  await eventually(() => assert.equal(replies.length, 2));
  replies[1](confirmed());
  await refresh;
  assert.equal(state.deliveryState(state.result.value.screens[0]).label, "当前版本已由大屏确认");
});

test("a late delivery response cannot replace a newer result after reopening the same notice", async () => {
  const replies = holdDeliveries();
  const {state, props} = await h.openNotificationDelivery({id: "notice"});
  await eventually(() => assert.equal(replies.length, 1));
  props.modelValue = false;
  props.modelValue = true;
  await eventually(() => assert.equal(replies.length, 2));
  replies[1](confirmed());
  await eventually(() => assert.equal(state.loading.value, false));
  const current = state.result.value;
  replies[0]({publicationId: "notice", revision: 1, screens: []});
  await requests[0];
  assert.equal(state.result.value, current);
  assert.equal(state.error.value, "");
});

test("a stale failure cannot clear the new notice's loading indicator or replace its result", async () => {
  const oldReplies = holdDeliveries("old");
  const newReplies = holdDeliveries("new");
  const {state, props} = await h.openNotificationDelivery({id: "old"});
  await eventually(() => assert.equal(oldReplies.length, 1));
  props.publication = {id: "new"};
  await eventually(() => assert.equal(newReplies.length, 1));
  oldReplies[0]({message: "旧请求失败"}, 500);
  await assert.rejects(requests[0]);
  assert.equal(state.loading.value, true);
  assert.equal(state.error.value, "");
  newReplies[0](confirmed("new"));
  await eventually(() => assert.equal(state.loading.value, false));
  assert.equal(state.result.value.publicationId, "new");
});

test("delivery responses after unmount cannot update the disposed dialog", async () => {
  const replies = holdDeliveries();
  const dialog = await h.openNotificationDelivery({id: "notice"});
  await eventually(() => assert.equal(replies.length, 1));
  dialog.unmount();
  replies[0](confirmed());
  await requests[0];
  assert.equal(dialog.state.result.value, null);
});
