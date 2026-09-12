import {getSoundPath, playSound} from "./soundList.js";

// Teams 警报本身动态较强；保留一定增强以适应教室环境，但避免 2 倍增益过于刺耳。
export const PROMINENT_NOTIFICATION_GAIN = 1.5;
export const GENTLE_NOTIFICATION_GAIN = 1.2;

let audioContext = null;
const contextBuffers = new WeakMap();
const PREPARATION_TIMEOUT_MS = 5000;

async function withPreparationTimeout(operation, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error("提示音准备超时，本次不再播放"), {code: "AUDIO_PREPARATION_TIMEOUT"});
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout]); }
  finally { clearTimeout(timer); }
}

function resolveAudioContextApi() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

async function loadDecodedBuffer(context, path, fetchImpl, timeoutMs) {
  if (!contextBuffers.has(context)) contextBuffers.set(context, new Map());
  const decodedBuffers = contextBuffers.get(context);
  if (!decodedBuffers.has(path)) {
    decodedBuffers.set(path, withPreparationTimeout(async signal => {
      const response = await fetchImpl(path, {signal});
      if (signal.aborted) throw signal.reason;
      if (!response.ok) throw new Error(`提示音加载失败（HTTP ${response.status}）`);
      const data = await response.arrayBuffer();
      if (signal.aborted) throw signal.reason;
      return context.decodeAudioData(data);
    }, timeoutMs));
  }
  const pending = decodedBuffers.get(path);
  try {
    return await pending;
  } catch (error) {
    if (decodedBuffers.get(path) === pending) decodedBuffers.delete(path);
    throw error;
  }
}

/**
 * 播放更醒目的通知提示音。
 *
 * HTMLMediaElement 的音量上限本来就是 1，因此这里通过 Web Audio 做有限增益，
 * 再用压缩器限制峰值，兼顾教室一体机上的响度和失真。浏览器不支持或阻止
 * Web Audio 时会自动退回普通 Audio 播放。
 */
export async function playProminentNotificationSound(filename, {
  AudioContextApi = resolveAudioContextApi(),
  fetchImpl = globalThis.fetch,
  fallback = playSound,
  gainValue = PROMINENT_NOTIFICATION_GAIN,
  timeoutMs = PREPARATION_TIMEOUT_MS,
} = {}) {
  timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : PREPARATION_TIMEOUT_MS;
  const path = getSoundPath(filename);
  if (!path) return null;
  const deadline = Date.now() + timeoutMs;

  if (!AudioContextApi || typeof fetchImpl !== "function") {
    return fallback(filename);
  }

  try {
    if (
      !audioContext
      || audioContext.state === "closed"
      || (AudioContextApi && !(audioContext instanceof AudioContextApi))
    ) {
      audioContext = new AudioContextApi();
    }
    const context = audioContext;
    if (context.state === "suspended") await withPreparationTimeout(() => context.resume(), timeoutMs);
    if (context.state !== "running") throw new Error("音频上下文未启动");

    const remaining = Math.max(1, deadline - Date.now());
    const loading = loadDecodedBuffer(context, path, fetchImpl, remaining);
    const buffer = await withPreparationTimeout(() => loading, remaining);
    if (Date.now() >= deadline) throw Object.assign(new Error("提示音准备超时，本次不再播放"), {code: "AUDIO_PREPARATION_TIMEOUT"});
    const source = context.createBufferSource();
    source.buffer = buffer;

    const gain = context.createGain();
    gain.gain.value = Math.min(2, Math.max(0.5, Number(gainValue) || 1));

    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 1;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;

    source.connect(gain).connect(limiter).connect(context.destination);
    source.start();
    return source;
  } catch (error) {
    // A timed-out attempt must not start another potentially delayed playback.
    // Its failed cache entry is removed, so the next notification can try again.
    if (error?.code === "AUDIO_PREPARATION_TIMEOUT") {
      console.warn(error.message);
      return null;
    }
    console.warn("增强提示音播放失败，已退回普通播放:", error);
    return fallback(filename);
  }
}
