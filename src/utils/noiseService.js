import {
  getNoiseControlSettings,
  resetNoiseControlSettings,
  saveNoiseControlSettings,
  subscribeSettingsEvent,
} from "@wydev/noise-core"
import {analyzeNoiseWindow, estimatedDbFromRms} from "@/utils/noiseScoring"

export {getNoiseControlSettings, resetNoiseControlSettings, saveNoiseControlSettings}

const FRAME_MS = 100
const SCORE_WINDOW_MS = 60_000
const SLICE_MS = 30_000
const HISTORY_KEY = "noise-slices-v2"
const HISTORY_RETENTION_MS = 14 * 24 * 60 * 60 * 1000
const MAX_HISTORY_SLICES = 5000

const dbfsFromRms = rms => rms > 0 ? 20 * Math.log10(rms) : -100
const createId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

class ClassworksNoiseService {
  constructor() {
    this.status = "paused"
    this.listeners = new Set()
    this.audioContext = null
    this.stream = null
    this.sourceNode = null
    this.processorNode = null
    this.silentGain = null
    this.fallbackAnalyser = null
    this.fallbackBuffer = null
    this.fallbackTimer = null
    this.ringBuffer = []
    this.windowFrames = []
    this.sliceFrames = []
    this.sliceStart = 0
    this.lastCompletedSlice = null
    this.currentScore = null
    this.currentScoreDetail = null
    this.signalHealth = {quality: "no-signal", confidence: 0, coverage: 0}
    this.calibration = null
    this.settings = getNoiseControlSettings()
    this.unsubscribeSettings = subscribeSettingsEvent(event => {
      this.settings = event.detail
    })
  }

  subscribe(listener) {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  snapshot() {
    const latest = this.ringBuffer.at(-1)
    return {
      status: this.status,
      currentDbfs: latest?.dbfs ?? -100,
      currentDisplayDb: latest?.displayDb ?? 20,
      ringBuffer: [...this.ringBuffer],
      lastSlice: this.lastCompletedSlice,
      currentScore: this.currentScore,
      currentScoreDetail: this.currentScoreDetail,
      signalHealth: {...this.signalHealth},
    }
  }

  emit() {
    if (!this.listeners.size) return
    const snapshot = this.snapshot()
    this.listeners.forEach(listener => listener(snapshot))
  }

  async start() {
    if (["active", "initializing"].includes(this.status)) return
    this.status = "initializing"
    this.emit()
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
        throw new window.DOMException("Microphone API unavailable", "NotSupportedError")
      }
      this.audioContext = new window.AudioContext({latencyHint: "playback"})
      const audioSettings = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      }
      if (this.settings.microphoneDeviceId) {
        audioSettings.deviceId = {exact: this.settings.microphoneDeviceId}
      }
      this.stream = await navigator.mediaDevices.getUserMedia({audio: audioSettings})
      this.stream.getAudioTracks().forEach(track => {
        track.addEventListener("ended", () => this.handleTrackEnded(), {once: true})
      })
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
      const highPass = this.audioContext.createBiquadFilter()
      highPass.type = "highpass"
      highPass.frequency.value = 80
      const lowPass = this.audioContext.createBiquadFilter()
      lowPass.type = "lowpass"
      lowPass.frequency.value = 8000
      this.sourceNode.connect(highPass)
      highPass.connect(lowPass)

      if (this.audioContext.audioWorklet && typeof window.AudioWorkletNode !== "undefined") {
        await this.startWorklet(lowPass)
      } else {
        this.startFallback(lowPass)
      }
      if (this.audioContext.state === "suspended") await this.audioContext.resume()
      this.sliceStart = Date.now()
      this.status = "active"
      this.emit()
    } catch (error) {
      console.error("噪声监测启动失败", error)
      await this.releaseAudioResources()
      this.status = error?.name === "NotAllowedError" || error?.name === "SecurityError"
        ? "permission-denied"
        : error?.name === "NotFoundError" || error?.name === "NotSupportedError"
          ? "unavailable"
          : "error"
      this.emit()
    }
  }

  async startWorklet(inputNode) {
    const workletUrl = new URL("/noise-meter-worklet.js", window.location.origin).href
    await this.audioContext.audioWorklet.addModule(workletUrl)
    this.processorNode = new window.AudioWorkletNode(this.audioContext, "classworks-noise-meter")
    this.processorNode.port.onmessage = event => this.consumeFeature(event.data)
    this.silentGain = this.audioContext.createGain()
    this.silentGain.gain.value = 0
    inputNode.connect(this.processorNode)
    this.processorNode.connect(this.silentGain)
    this.silentGain.connect(this.audioContext.destination)
  }

  startFallback(inputNode) {
    this.fallbackAnalyser = this.audioContext.createAnalyser()
    this.fallbackAnalyser.fftSize = 2048
    this.fallbackAnalyser.smoothingTimeConstant = 0
    this.fallbackBuffer = new Float32Array(this.fallbackAnalyser.fftSize)
    inputNode.connect(this.fallbackAnalyser)
    this.fallbackTimer = window.setInterval(() => {
      if (!this.fallbackAnalyser || this.status !== "active") return
      this.fallbackAnalyser.getFloatTimeDomainData(this.fallbackBuffer)
      let sumSquares = 0
      let peak = 0
      let clipped = 0
      let zeroCrossings = 0
      let previous = 0
      for (const sample of this.fallbackBuffer) {
        sumSquares += sample * sample
        peak = Math.max(peak, Math.abs(sample))
        if (Math.abs(sample) >= 0.99) clipped += 1
        if ((sample >= 0) !== (previous >= 0)) zeroCrossings += 1
        previous = sample
      }
      this.consumeFeature({
        rms: Math.sqrt(sumSquares / this.fallbackBuffer.length),
        peak,
        clippedRatio: clipped / this.fallbackBuffer.length,
        zeroRatio: zeroCrossings / this.fallbackBuffer.length,
      })
    }, FRAME_MS)
  }

  consumeFeature(feature) {
    if (this.status !== "active") return
    const timestamp = Date.now()
    const dbfs = dbfsFromRms(feature.rms)
    const frame = {
      timestamp,
      rms: feature.rms,
      dbfs,
      peakDbfs: dbfsFromRms(feature.peak),
      clippedRatio: feature.clippedRatio || 0,
      zeroRatio: feature.zeroRatio || 0,
      displayDb: estimatedDbFromRms(feature.rms, this.settings.baselineRms, this.settings.baselineDb),
    }
    this.ringBuffer.push({t: timestamp, dbfs: frame.dbfs, displayDb: frame.displayDb})
    if (this.ringBuffer.length > 100) this.ringBuffer.shift()
    this.windowFrames.push(frame)
    this.windowFrames = this.windowFrames.filter(item => timestamp - item.timestamp <= SCORE_WINDOW_MS)
    this.sliceFrames.push(frame)
    this.processCalibration(frame)

    const analysis = analyzeNoiseWindow(this.windowFrames)
    this.currentScore = analysis.score
    this.currentScoreDetail = analysis.scoreDetail
    this.signalHealth = {
      quality: analysis.quality,
      confidence: analysis.confidence,
      coverage: analysis.coverage,
      baselineDbfs: analysis.baselineDbfs,
      eventCount: analysis.eventCount,
    }
    if (timestamp - this.sliceStart >= SLICE_MS) this.finalizeSlice(timestamp, analysis)
    this.emit()
  }

  processCalibration(frame) {
    if (!this.calibration) return
    this.calibration.rmsValues.push(frame.rms)
    if (Date.now() - this.calibration.startedAt < 3000) return
    const valid = this.calibration.rmsValues.filter(value => value > 0)
    if (!valid.length) {
      this.calibration.callback?.(false, "未检测到有效麦克风信号")
    } else {
      const averageRms = valid.reduce((sum, value) => sum + value, 0) / valid.length
      saveNoiseControlSettings({baselineDb: this.calibration.targetDb, baselineRms: averageRms})
      this.settings = getNoiseControlSettings()
      this.calibration.callback?.(true, "估算声级校准完成")
    }
    this.calibration = null
  }

  calibrate(targetDb, callback) {
    if (this.status !== "active") {
      callback?.(false, "请先启动监测")
      return
    }
    this.calibration = {targetDb, callback, startedAt: Date.now(), rmsValues: []}
  }

  finalizeSlice(end, analysis = analyzeNoiseWindow(this.sliceFrames, {windowMs: SLICE_MS})) {
    if (!this.sliceFrames.length) {
      this.sliceStart = end
      return
    }
    const displayValues = this.sliceFrames.map(frame => frame.displayDb).sort((a, b) => a - b)
    const average = displayValues.reduce((sum, value) => sum + value, 0) / displayValues.length
    const p95 = displayValues[Math.min(displayValues.length - 1, Math.floor(displayValues.length * 0.95))]
    const summary = {
      id: createId(),
      start: this.sliceStart,
      end,
      frames: this.sliceFrames.length,
      raw: {
        avgDbfs: this.sliceFrames.reduce((sum, frame) => sum + frame.dbfs, 0) / this.sliceFrames.length,
        p50Dbfs: analysis.baselineDbfs,
        segmentCount: analysis.eventCount,
        sampledDurationMs: this.sliceFrames.length * FRAME_MS,
        coverage: analysis.coverage,
        confidence: analysis.confidence,
        quality: analysis.quality,
      },
      display: {avgDb: average, p95Db: p95},
      score: analysis.score,
      scoreDetail: analysis.scoreDetail,
      model: "relative-activity-v2",
    }
    this.lastCompletedSlice = summary
    this.saveSlice(summary)
    this.sliceFrames = []
    this.sliceStart = end
  }

  saveSlice(slice) {
    try {
      const existing = this.getHistory()
      const now = Date.now()
      const retained = [...existing, slice]
        .filter(item => Number.isFinite(item?.end) && now - item.end < HISTORY_RETENTION_MS)
        .slice(-MAX_HISTORY_SLICES)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(retained))
    } catch (error) {
      console.warn("无法保存噪声统计", error)
    }
  }

  getHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]")
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  clearHistory() {
    localStorage.removeItem(HISTORY_KEY)
    this.lastCompletedSlice = null
    this.emit()
  }

  async stop() {
    if (this.status === "paused") return
    if (this.status === "active" && this.sliceFrames.length) this.finalizeSlice(Date.now())
    this.status = "paused"
    this.calibration = null
    await this.releaseAudioResources()
    this.emit()
  }

  async releaseAudioResources() {
    window.clearInterval(this.fallbackTimer)
    this.fallbackTimer = null
    if (this.processorNode) this.processorNode.port.onmessage = null
    this.stream?.getTracks().forEach(track => track.stop())
    try {
      await this.audioContext?.close()
    } catch {
      // AudioContext 可能已经由浏览器关闭。
    }
    this.audioContext = null
    this.stream = null
    this.sourceNode = null
    this.processorNode = null
    this.silentGain = null
    this.fallbackAnalyser = null
    this.fallbackBuffer = null
  }

  handleTrackEnded() {
    if (this.status !== "active") return
    this.status = "error"
    void this.releaseAudioResources()
    this.emit()
  }
}

export const noiseService = new ClassworksNoiseService()
