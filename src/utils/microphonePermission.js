export function classifyMicrophoneError(error, {secureContext = true} = {}) {
  if (!secureContext) return "insecure-context"
  const name = error?.name || ""
  if (["NotAllowedError", "SecurityError"].includes(name)) return "permission-denied"
  if (["NotFoundError", "DevicesNotFoundError"].includes(name)) return "unavailable"
  if (["NotReadableError", "TrackStartError", "AbortError"].includes(name)) return "device-busy"
  if (name === "OverconstrainedError") return "constraints-error"
  if (name === "NotSupportedError" || name === "TypeError") return "unsupported"
  return "error"
}

export async function queryMicrophonePermission() {
  if (typeof window === "undefined" || !window.isSecureContext) return "insecure-context"
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported"
  try {
    const permission = await navigator.permissions?.query?.({name: "microphone"})
    return permission?.state || "prompt"
  } catch {
    return "prompt"
  }
}

export async function requestMicrophonePermission() {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return {state: "insecure-context", devices: []}
  }
  if (!navigator.mediaDevices?.getUserMedia) return {state: "unsupported", devices: []}
  let stream = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio: true, video: false})
    const devices = await navigator.mediaDevices.enumerateDevices?.() || []
    return {
      state: "granted",
      devices: devices.filter(device => device.kind === "audioinput"),
    }
  } catch (error) {
    return {
      state: classifyMicrophoneError(error, {secureContext: window.isSecureContext}),
      devices: [],
      error,
    }
  } finally {
    stream?.getTracks().forEach(track => track.stop())
  }
}

export function microphonePermissionLabel(state) {
  return ({
    granted: "麦克风已授权",
    prompt: "等待授权",
    denied: "麦克风权限已拒绝",
    "permission-denied": "麦克风权限已拒绝",
    unavailable: "未检测到麦克风",
    "device-busy": "麦克风正被其他程序占用",
    "constraints-error": "已选择的麦克风不可用",
    "insecure-context": "必须通过 HTTPS 或 localhost 使用麦克风",
    unsupported: "当前浏览器不支持麦克风采集",
    error: "麦克风启动失败",
  })[state] || "等待检查麦克风"
}
