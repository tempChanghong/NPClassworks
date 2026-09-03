import test from "node:test";
import assert from "node:assert/strict";
import {
  playProminentNotificationSound,
  PROMINENT_NOTIFICATION_GAIN,
} from "../src/utils/prominentNotificationSound.js";

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
