const DEVICE_ID_KEY = 'npclassworks-device-id'
let memoryDeviceId = ''

function createDeviceId() {
  if (globalThis.crypto?.randomUUID) return `device-${globalThis.crypto.randomUUID()}`
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function readDeviceId() {
  if (memoryDeviceId) return memoryDeviceId
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY)
    if (stored) return stored
    memoryDeviceId = createDeviceId()
    localStorage.setItem(DEVICE_ID_KEY, memoryDeviceId)
    return memoryDeviceId
  } catch {
    memoryDeviceId ||= createDeviceId()
    return memoryDeviceId
  }
}

export const loadFingerprint = () => {
  return Promise.resolve({
    get: async () => ({visitorId: readDeviceId(), source: 'local-device-id'}),
  })
}

export const getVisitorId = async () => readDeviceId()

export const getFingerprintData = async () => ({visitorId: readDeviceId(), source: 'local-device-id'})
