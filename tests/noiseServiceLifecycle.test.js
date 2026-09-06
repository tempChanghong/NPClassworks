import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "vite";
import {fileURLToPath} from "node:url";
import {deferred, eventually, memoryStorage} from "./helpers/flowHarness.js";

test("microphone lifecycle ignores cancelled asynchronous starts", async t => {
  const originals = new Map();
  const contexts = [];
  const requests = [];
  const intervals = new Set();
  let nextModule;
  let nextClose;
  let nextResume;
  class AudioContext {
    constructor() {
      this.resuming = nextResume; nextResume = null;
      this.state = this.resuming ? "suspended" : "running";
      this.module = nextModule; nextModule = null;
      this.closing = nextClose; nextClose = null;
      this.audioWorklet = {addModule: () => this.module?.promise || Promise.resolve()};
      contexts.push(this);
    }
    createMediaStreamSource() { return {connect() {}}; }
    createBiquadFilter() { return {frequency: {}, connect() {}}; }
    createGain() { return {gain: {}, connect() {}}; }
    async resume() { this.resumeCalled = true; await this.resuming?.promise; this.state = "running"; }
    async close() { this.closed = true; await this.closing?.promise; this.state = "closed"; }
  }
  const browser = Object.assign(new globalThis.EventTarget(), {
    AudioContext, AudioWorkletNode: class {constructor() { this.port = {}; } connect() {}},
    location: {origin: "http://localhost"}, isSecureContext: true,
    DOMException: globalThis.DOMException,
    setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn),
    localStorage: memoryStorage(),
  });
  for (const [key, value] of Object.entries({window: browser, localStorage: browser.localStorage,
    navigator: {mediaDevices: {getUserMedia() { const request = deferred(); requests.push(request); return request.promise; }}}})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});
  }
  const vite = await createServer({configFile: false, envFile: false, logLevel: "error",
    resolve: {alias: {"@": fileURLToPath(new URL("../src", import.meta.url))}},
    ssr: {noExternal: ["@wydev/noise-core"]}, optimizeDeps: {noDiscovery: true, include: []},
    server: {middlewareMode: true, hmr: false, watch: null}});
  t.after(() => vite.close());
  const {noiseService: service} = await vite.ssrLoadModule("/src/utils/noiseService.js");
  t.beforeEach(() => service.stop());
  t.after(async () => {
    await service.stop(); service.unsubscribeSettings?.(); await vite.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  function stream() {
    const track = Object.assign(new globalThis.EventTarget(), {stopped: false, stop() { this.stopped = true; }, getSettings: () => ({})});
    return {track, getTracks: () => [track], getAudioTracks: () => [track]};
  }
  await t.test("permission resolves after stop without changing paused state", async () => {
    const starting = service.start(); const media = stream();
    await service.stop(); requests.at(-1).resolve(media); await starting;
    assert.equal(service.status, "paused"); assert.equal(media.track.stopped, true);
  });
  await t.test("old permission response cannot replace a new active microphone", async () => {
    const old = service.start(); const oldRequest = requests.at(-1);
    await service.stop();
    const current = service.start(); const media = stream(); requests.at(-1).resolve(media); await current;
    const stale = stream(); oldRequest.resolve(stale); await old;
    assert.equal(service.stream, media); assert.equal(media.track.stopped, false);
    assert.equal(stale.track.stopped, true); assert.equal(service.status, "active");
    await service.stop();
  });
  await t.test("stop during worklet loading does not become an error", async () => {
    nextModule = deferred(); const module = nextModule;
    const starting = service.start(); const media = stream(); requests.at(-1).resolve(media);
    await Promise.resolve(); await service.stop(); module.resolve(); await starting;
    assert.equal(service.status, "paused"); assert.equal(media.track.stopped, true);
  });
  await t.test("slow old context close cannot erase a newly started context", async () => {
    nextClose = deferred(); const closing = nextClose;
    const first = service.start(); requests.at(-1).resolve(stream()); await first;
    const stopping = service.stop();
    const second = service.start(); const media = stream(); requests.at(-1).resolve(media); await second;
    const currentContext = contexts.at(-1); closing.resolve(); await stopping;
    assert.equal(service.audioContext, currentContext); assert.equal(service.stream, media);
    assert.equal(service.status, "active"); await service.stop();
  });
  await t.test("late permission rejection cannot stop a new active session", async () => {
    const first = service.start(); const request = requests.at(-1);
    await service.stop();
    const second = service.start(); const media = stream(); requests.at(-1).resolve(media); await second;
    request.resolve(Promise.reject(new Error("late denial"))); await first;
    assert.equal(service.status, "active"); assert.equal(service.stream, media);
  });
  await t.test("stop during resume prevents reactivation", async () => {
    nextResume = deferred(); const resume = nextResume;
    const starting = service.start(); requests.at(-1).resolve(stream());
    await eventually(() => assert.equal(contexts.at(-1).resumeCalled, true));
    await service.stop(); resume.resolve(); await starting;
    assert.equal(service.status, "paused");
  });
  await t.test("ended events from an old track cannot stop a new session", async () => {
    const first = service.start(); const old = stream(); requests.at(-1).resolve(old); await first;
    await service.stop();
    const second = service.start(); const current = stream(); requests.at(-1).resolve(current); await second;
    old.track.dispatchEvent(new globalThis.Event("ended"));
    assert.equal(service.status, "active"); assert.equal(current.track.stopped, false);
  });
  await t.test("stopping during device test releases late input and prevents automatic resume", async () => {
    const first = service.start(); requests.at(-1).resolve(stream()); await first;
    const previousCount = requests.length;
    const testing = service.testMicrophoneDevice();
    const rejected = assert.rejects(testing, {name: "AbortError"});
    await eventually(() => assert.equal(requests.length, previousCount + 1));
    const request = requests.at(-1); const count = requests.length;
    await service.stop(); const late = stream(); request.resolve(late); await rejected;
    assert.equal(late.track.stopped, true); assert.equal(service.status, "paused");
    assert.equal(requests.length, count);
  });
});
