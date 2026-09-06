import assert from "node:assert/strict";
import test from "node:test";
import {createFlowHarness, deferred, eventually} from "./helpers/flowHarness.js";

test("noise history UI handles asynchronous reads, clears and write failures", async t => {
  const harness = await createFlowHarness();
  t.after(() => harness.close());
  const card = await harness.openNoiseCard();
  const {state, noiseService: service} = card;
  const rows = [];
  const originalStore = service.historyStore;
  service.historyStore = {
    async append(slice) { rows.push(slice); }, async read() { return [...rows]; }, async clear() { rows.length = 0; },
  };
  t.after(() => { service.historyStore = originalStore; });

  await t.test("latest completed statistics are loaded after the asynchronous save commits", async () => {
    const slice = {id: "saved", start: Date.now() - 30000, end: Date.now()};
    service.lastCompletedSlice = slice;
    await service.saveSlice(slice);
    await eventually(() => assert.equal(state.history[0]?.id, "saved"));
  });
  await t.test("a late history read cannot repopulate a successfully cleared list", async () => {
    const waiting = deferred(); const read = service.historyStore.read;
    service.historyStore.read = () => waiting.promise;
    const reading = state.refreshHistory();
    await Promise.resolve(); await Promise.resolve();
    service.historyStore.read = read;
    await state.handleClearHistory();
    waiting.resolve([{id: "stale"}]); await reading;
    assert.deepEqual(state.history, []);
  });
  await t.test("failed clearing preserves visible rows and offers an error", async () => {
    state.history = [{id: "keep"}];
    const clear = service.historyStore.clear;
    service.historyStore.clear = async () => { throw new Error("storage unavailable"); };
    await state.handleClearHistory();
    assert.equal(state.history[0].id, "keep"); assert.match(state.historyReadError, /清除失败/);
    service.historyStore.clear = clear;
  });
  await t.test("a failed save is visible and does not prevent later saves", async () => {
    const append = service.historyStore.append;
    service.historyStore.append = async () => { throw new Error("quota exceeded"); };
    await service.saveSlice({id: "failed"});
    assert.match(state.historyError, /未能保存/);
    service.historyStore.append = append;
    await service.saveSlice({id: "recovered"});
    assert.equal(state.historyError, "");
    assert.equal(rows.at(-1).id, "recovered");
  });
  await t.test("clearing during a save is ordered after that write", async () => {
    const waiting = deferred(); const append = service.historyStore.append;
    service.historyStore.append = async slice => { await waiting.promise; rows.push(slice); };
    const writing = service.saveSlice({id: "in-flight"});
    await Promise.resolve();
    const clearing = service.clearHistory();
    waiting.resolve(); await Promise.all([writing, clearing]);
    assert.deepEqual(rows, []);
    service.historyStore.append = append;
  });
  card.unmount();
});
