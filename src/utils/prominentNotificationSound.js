import {getSoundPath, playSound} from "./soundList.js";

// Teams 警报本身动态较强；保留一定增强以适应教室环境，但避免 2 倍增益过于刺耳。
export const PROMINENT_NOTIFICATION_GAIN = 1.5;

let audioContext = null;
const decodedBuffers = new Map();

function resolveAudioContextApi() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

async function loadDecodedBuffer(context, path, fetchImpl) {
  if (!decodedBuffers.has(path)) {
    decodedBuffers.set(path, (async () => {
      const response = await fetchImpl(path);
      if (!response.ok) throw new Error(`提示音加载失败（HTTP ${response.status}）`);
      return context.decodeAudioData(await response.arrayBuffer());
    })());
  }

  try {
    return await decodedBuffers.get(path);
  } catch (error) {
    decodedBuffers.delete(path);
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
} = {}) {
  const path = getSoundPath(filename);
  if (!path) return null;

  if (!AudioContextApi || typeof fetchImpl !== "function") {
    return fallback(filename);
  }

  try {
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextApi();
    }
    if (audioContext.state === "suspended") await audioContext.resume();
    if (audioContext.state !== "running") throw new Error("音频上下文未启动");

    const source = audioContext.createBufferSource();
    source.buffer = await loadDecodedBuffer(audioContext, path, fetchImpl);

    const gain = audioContext.createGain();
    gain.gain.value = PROMINENT_NOTIFICATION_GAIN;

    const limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 1;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;

    source.connect(gain).connect(limiter).connect(audioContext.destination);
    source.start();
    return source;
  } catch (error) {
    console.warn("增强提示音播放失败，已退回普通播放:", error);
    return fallback(filename);
  }
}
