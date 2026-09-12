import test from "node:test";
import assert from "node:assert/strict";
import {setImmediate} from "node:timers";
import {
  GENTLE_NOTIFICATION_GAIN,
  playProminentNotificationSound,
  PROMINENT_NOTIFICATION_GAIN,
} from "../src/utils/prominentNotificationSound.js";

for (const phase of ["resume", "fetch", "body", "decode"]) {
  test(`stalled ${phase} times out, permits retry and never plays its late result`, async () => {
    let finish;
    const stalled = new Promise(resolve => { finish = resolve; });
    let stall = true, starts = 0, fetches = 0, fallbackCalls = 0, signal;
    class Context {
      state = phase === "resume" ? "suspended" : "running";
      destination = {};
      async resume() { if (stall) await stalled; this.state = "running"; }
      async decodeAudioData() { if (stall && phase === "decode") await stalled; return {}; }
      createBufferSource() { return {connect: target => target, start: () => { starts++; }}; }
      createGain() { return {gain: {}, connect: target => target}; }
      createDynamicsCompressor() { return {threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect: target => target}; }
    }
    const options = {
      AudioContextApi: Context, timeoutMs: 20, fallback: () => { fallbackCalls++; },
      fetchImpl: async (path, options) => {
        fetches++; signal = options.signal;
        if (stall && phase === "fetch") await stalled;
        return {ok: true, arrayBuffer: async () => {
          if (stall && phase === "body") await stalled;
          return new ArrayBuffer(1);
        }};
      },
    };
    assert.equal(await playProminentNotificationSound(`timeout-${phase}.mp3`, options), null);
    assert.equal(starts, 0);
    assert.equal(fallbackCalls, 0);
    if (phase !== "resume") assert.equal(signal.aborted, true);
    stall = false;
    await playProminentNotificationSound(`timeout-${phase}.mp3`, {...options, timeoutMs: 1000});
    assert.equal(starts, 1);
    const successfulFetches = fetches;
    finish();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(starts, 1);
    await playProminentNotificationSound(`timeout-${phase}.mp3`, {...options, timeoutMs: 1000});
    assert.equal(fetches, successfulFetches);
    assert.equal(starts, 2);
  });
}

test("prominent notification sound falls back when Web Audio is unavailable", async () => {
  const calls = [];
  const playback = await playProminentNotificationSound("notice.mp3", {
    AudioContextApi: null,
    fallback: (filename) => {
      calls.push(filename);
      return {filename};
    },
  });

  assert.deepEqual(calls, ["notice.mp3"]);
  assert.deepEqual(playback, {filename: "notice.mp3"});
});

test("notification playback accepts a gentler explicit gain", async () => {
  let gainNode;
  class FakeAudioContext {
    constructor() {
      this.state = "running";
      this.destination = {};
    }
    async decodeAudioData() { return {}; }
    createBufferSource() {
      return {connect: (target) => target, start() {}};
    }
    createGain() {
      gainNode = {gain: {value: 1}, connect: (target) => target};
      return gainNode;
    }
    createDynamicsCompressor() {
      return {
        threshold: {value: 0}, knee: {value: 0}, ratio: {value: 0},
        attack: {value: 0}, release: {value: 0}, connect: (target) => target,
      };
    }
  }
  await playProminentNotificationSound("gentle.mp3", {
    AudioContextApi: FakeAudioContext,
    fetchImpl: async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(1)}),
    gainValue: GENTLE_NOTIFICATION_GAIN,
  });
  assert.equal(gainNode.gain.value, 1.2);
});

test("prominent notification sound boosts gain and limits peaks", async () => {
  assert.equal(PROMINENT_NOTIFICATION_GAIN, 1.5);
  let createdContext;
  let started = false;

  class FakeAudioContext {
    constructor() {
      createdContext = this;
      this.state = "running";
      this.destination = {};
    }

    async decodeAudioData() {
      return {decoded: true};
    }

    createBufferSource() {
      return {
        buffer: null,
        connect(target) { return target; },
        start() { started = true; },
      };
    }

    createGain() {
      this.gainNode = {
        gain: {value: 1},
        connect(target) { return target; },
      };
      return this.gainNode;
    }

    createDynamicsCompressor() {
      this.limiterNode = {
        threshold: {value: 0},
        knee: {value: 0},
        ratio: {value: 0},
        attack: {value: 0},
        release: {value: 0},
        connect(target) { return target; },
      };
      return this.limiterNode;
    }
  }

  const playback = await playProminentNotificationSound("notice.mp3", {
    AudioContextApi: FakeAudioContext,
    fetchImpl: async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(4),
    }),
    fallback: () => assert.fail("Web Audio playback should not fall back"),
  });

  assert.ok(playback);
  assert.equal(started, true);
  assert.equal(createdContext.gainNode.gain.value, PROMINENT_NOTIFICATION_GAIN);
  assert.equal(createdContext.limiterNode.threshold.value, -2);
  assert.equal(createdContext.limiterNode.ratio.value, 20);
});
