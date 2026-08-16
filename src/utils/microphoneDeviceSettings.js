export const MICROPHONE_DEVICE_DEFAULTS = Object.freeze({deviceId: "default"});
export const MICROPHONE_DEVICE_SETTINGS_EVENT = "classworks-microphone-device-settings-changed";

export function sanitizeMicrophoneDeviceSettings(value = {}) {
  const deviceId = typeof value.deviceId === "string" && value.deviceId.trim()
    ? value.deviceId.trim()
    : MICROPHONE_DEVICE_DEFAULTS.deviceId;
  return {deviceId};
}

export function microphoneDeviceSettingsKey(bindingId) {
  return `classworks-v2-microphone-device:${bindingId || "unbound"}`;
}

export function loadMicrophoneDeviceSettings(bindingId, storage = localStorage) {
  try {
    return sanitizeMicrophoneDeviceSettings(JSON.parse(storage.getItem(microphoneDeviceSettingsKey(bindingId))) || {});
  } catch {
    return {...MICROPHONE_DEVICE_DEFAULTS};
  }
}

export function saveMicrophoneDeviceSettings(bindingId, settings, storage = localStorage) {
  const sanitized = sanitizeMicrophoneDeviceSettings(settings);
  storage.setItem(microphoneDeviceSettingsKey(bindingId), JSON.stringify(sanitized));
  if (typeof window !== "undefined" && storage === localStorage) {
    window.dispatchEvent(new window.CustomEvent(MICROPHONE_DEVICE_SETTINGS_EVENT, {
      detail: {bindingId, settings: sanitized},
    }));
  }
  return sanitized;
}

export async function listMicrophoneDevices({requestPermission = false} = {}) {
  if (!navigator.mediaDevices?.enumerateDevices) return {state: "unsupported", devices: []};
  let stream;
  try {
    if (requestPermission) {
      stream = await navigator.mediaDevices.getUserMedia({audio: true, video: false});
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {state: "granted", devices: devices.filter(device => device.kind === "audioinput")};
  } catch (error) {
    return {state: "error", devices: [], error};
  } finally {
    stream?.getTracks().forEach(track => track.stop());
  }
}

export async function testMicrophoneInput(deviceId = "default", {durationMs = 1400, intervalMs = 70} = {}) {
  const AudioContextApi = window.AudioContext || window.webkitAudioContext;
  if (!navigator.mediaDevices?.getUserMedia || !AudioContextApi) {
    throw new window.DOMException("Microphone API unavailable", "NotSupportedError");
  }

  let stream;
  let context;
  let source;
  try {
    const audio = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    };
    if (deviceId) audio.deviceId = {exact: deviceId};
    stream = await navigator.mediaDevices.getUserMedia({audio, video: false});
    context = new AudioContextApi({latencyHint: "interactive"});
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    if (context.state === "suspended") await context.resume();

    const samples = [];
    const buffer = new Float32Array(analyser.fftSize);
    const count = Math.max(4, Math.ceil(durationMs / intervalMs));
    for (let index = 0; index < count; index += 1) {
      await new Promise(resolve => window.setTimeout(resolve, intervalMs));
      analyser.getFloatTimeDomainData(buffer);
      let sumSquares = 0;
      for (const sample of buffer) sumSquares += sample * sample;
      samples.push(Math.sqrt(sumSquares / buffer.length));
    }

    const averageRms = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const peakRms = Math.max(...samples);
    const dbfs = peakRms > 0 ? 20 * Math.log10(peakRms) : -100;
    const state = peakRms >= 0.003 ? "working" : peakRms >= 0.0003 ? "weak" : "silent";
    return {
      state,
      averageRms,
      peakRms,
      dbfs,
      deviceId: stream.getAudioTracks()[0]?.getSettings?.().deviceId || deviceId,
      label: stream.getAudioTracks()[0]?.label || "麦克风",
    };
  } finally {
    try {
      source?.disconnect();
    } catch {
      // 设备初始化失败时可能尚未连接节点。
    }
    stream?.getTracks().forEach(track => track.stop());
    try {
      await context?.close();
    } catch {
      // 浏览器可能已经关闭 AudioContext。
    }
  }
}
