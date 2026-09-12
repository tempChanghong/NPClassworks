import {
  getNoiseControlSettings,
  resetNoiseControlSettings,
  saveNoiseControlSettings,
  subscribeSettingsEvent,
} from "@wydev/noise-core"
import {analyzeNoiseWindow, estimatedDbFromRms} from "@/utils/noiseScoring"
import {classifyMicrophoneError} from "@/utils/microphonePermission"
import {testMicrophoneInput} from "@/utils/microphoneDeviceSettings"
import {createNoiseHistoryStore} from "@/utils/noiseHistoryStore"

export {getNoiseControlSettings, resetNoiseControlSettings, saveNoiseControlSettings}

const FRAME_MS = 100
const ANALYSIS_INTERVAL_MS = 500
const SCORE_WINDOW_MS = 60_000
const SLICE_MS = 30_000

const dbfsFromRms = rms => rms > 0 ? 20 * Math.log10(rms) : -100
const createId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`

class ClassworksNoiseService {
  constructor() {
    this.generation = 0
    this.microphoneTest = null
    this.historyStore = createNoiseHistoryStore()
    this.historyGeneration = 0
    this.historyWrite = Promise.resolve()
    this.historyError = ""
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
    this.lastAnalysisAt = 0
    this.activityGuard = null
    this.calibration = null
    this.settings = getNoiseControlSettings()
    this.preferredDeviceId = this.settings.microphoneDeviceId || "default"
    this.currentMicrophone = {deviceId: this.preferredDeviceId, label: "系统默认麦克风"}
    this.unsubscribeSettings = subscribeSettingsEvent(event => {
      this.settings = event.detail
      this.preferredDeviceId = this.settings.microphoneDeviceId || this.preferredDeviceId
      this.emit()
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
      microphone: {...this.currentMicrophone},
      thresholdDb: Number.isFinite(this.settings?.maxLevelDb) ? this.settings.maxLevelDb : 55,
      historyError: this.historyError,
    }
  }

  emit() {
    if (!this.listeners.size) return
    const snapshot = this.snapshot()
    this.listeners.forEach(listener => listener(snapshot))
  }

  async start({deviceId} = {}) {
    if (["active", "initializing"].includes(this.status)) return
    const generation = ++this.generation
    this.microphoneTest?.abort()
    this.microphoneTest = null
    const isCurrent = () => {
      this.activityGuard?.()
      return generation === this.generation
    }
    if (deviceId) this.preferredDeviceId = deviceId
    this.status = "initializing"
    this.emit()
    if (!isCurrent()) return
    try {
      const AudioContextImpl = window.AudioContext || window.webkitAudioContext
      if (!navigator.mediaDevices?.getUserMedia || !AudioContextImpl) {
        throw new window.DOMException("Microphone API unavailable", "NotSupportedError")
      }
      const context = new AudioContextImpl({latencyHint: "playback"})
      this.audioContext = context
      const audioSettings = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      }
      if (this.preferredDeviceId) {
        audioSettings.deviceId = {exact: this.preferredDeviceId}
      }
      const stream = await navigator.mediaDevices.getUserMedia({audio: audioSettings})
      if (!isCurrent()) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      this.stream = stream
      this.stream.getAudioTracks().forEach(track => {
        const trackSettings = track.getSettings?.() || {}
        this.currentMicrophone = {
          deviceId: trackSettings.deviceId || this.preferredDeviceId,
          label: track.label || (this.preferredDeviceId === "default" ? "系统默认麦克风" : "已选择的麦克风"),
        }
        track.addEventListener("ended", () => {
          if (isCurrent()) this.handleTrackEnded()
        }, {once: true})
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
        await this.startWorklet(lowPass, context, isCurrent)
      } else {
        this.startFallback(lowPass)
      }
      if (!isCurrent()) return
      if (context.state === "suspended") await context.resume()
      if (!isCurrent()) return
      this.ringBuffer = []
      this.windowFrames = []
      this.sliceFrames = []
      this.currentScore = null
      this.currentScoreDetail = null
      this.signalHealth = {quality: "no-signal", confidence: 0, coverage: 0}
      this.sliceStart = Date.now()
      this.lastAnalysisAt = 0
      this.status = "active"
      this.emit()
    } catch (error) {
      if (!isCurrent()) return
      console.error("噪声监测启动失败", error)
      await this.releaseAudioResources()
      if (!isCurrent()) return
      const errorCode = classifyMicrophoneError(error, {secureContext: window.isSecureContext})
      this.status = errorCode === "permission-denied"
        ? "permission-denied"
        : ["unavailable", "unsupported", "insecure-context"].includes(errorCode)
          ? "unavailable"
          : "error"
      this.signalHealth = {...this.signalHealth, errorCode}
      this.emit()
    }
  }

  async startWorklet(inputNode, context, isCurrent) {
    const workletUrl = new URL("/noise-meter-worklet.js", window.location.origin).href
    await context.audioWorklet.addModule(workletUrl)
    if (!isCurrent()) return
    this.processorNode = new window.AudioWorkletNode(this.audioContext, "classworks-noise-meter")
    this.processorNode.port.onmessage = event => {
      if (isCurrent()) this.consumeFeature(event.data)
    }
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
    this.activityGuard?.()
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

    if (!this.lastAnalysisAt || timestamp - this.lastAnalysisAt >= ANALYSIS_INTERVAL_MS) {
      const analysis = analyzeNoiseWindow(this.windowFrames)
      this.lastAnalysisAt = timestamp
      this.currentScore = analysis.score
      this.currentScoreDetail = analysis.scoreDetail
      this.signalHealth = {
        quality: analysis.quality,
        confidence: analysis.confidence,
        coverage: analysis.coverage,
        baselineDbfs: analysis.baselineDbfs,
        eventCount: analysis.eventCount,
      }
    }
    if (timestamp - this.sliceStart >= SLICE_MS) {
      this.finalizeSlice(timestamp)
    }
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

  async setMicrophoneDevice(deviceId = "default", {restart = false, label = ""} = {}) {
    const normalized = typeof deviceId === "string" && deviceId.trim() ? deviceId.trim() : "default"
    // The schedule listener may already be starting this newly selected device.
    const shouldRestart = restart && normalized !== this.preferredDeviceId && ["active", "initializing"].includes(this.status)
    const stopping = shouldRestart ? this.stop() : null
    const generation = this.generation
    await stopping
    if (generation !== this.generation) return
    this.preferredDeviceId = normalized
    this.currentMicrophone = {
      deviceId: normalized,
      label: label || (normalized === "default" ? "系统默认麦克风" : "已选择的麦克风"),
    }
    saveNoiseControlSettings({microphoneDeviceId: normalized})
    this.settings = getNoiseControlSettings()
    if (shouldRestart) await this.start({deviceId: normalized})
    else this.emit()
  }

  async testMicrophoneDevice(deviceId = "default", {diagnostic = false, onPhase, signal} = {}) {
    const shouldResume = ["active", "initializing"].includes(this.status)
    const stopping = this.stop()
    const generation = this.generation
    await stopping
    if (generation !== this.generation) throw new window.DOMException("Microphone test cancelled", "AbortError")
    const controller = new AbortController()
    const cancel = () => controller.abort()
    signal?.addEventListener("abort", cancel, {once: true})
    if (signal?.aborted) controller.abort()
    this.microphoneTest = controller
    try {
      return await testMicrophoneInput(deviceId, {signal: controller.signal, diagnostic, onPhase})
    } finally {
      signal?.removeEventListener("abort", cancel)
      if (this.microphoneTest === controller) this.microphoneTest = null
      if (shouldResume && generation === this.generation) await this.start({deviceId: this.preferredDeviceId})
    }
  }

  finalizeSlice(end) {
    if (!this.sliceFrames.length) {
      this.sliceStart = end
      return
    }
    const analysis = analyzeNoiseWindow(this.sliceFrames, {windowMs: Math.max(FRAME_MS, end - this.sliceStart)})
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
    void this.saveSlice(summary)
    this.sliceFrames = []
    this.sliceStart = end
  }

  saveSlice(slice) {
    const generation = this.historyGeneration
    this.historyWrite = this.historyWrite.then(async () => {
      if (generation !== this.historyGeneration) return
      try {
        await this.historyStore.append(slice)
        this.historyError = ""
      } catch (error) {
        this.historyError = String(error?.message || "").startsWith("噪声历史")
          ? `噪声统计未能保存：${error.message}` : "噪声统计未能保存，请检查浏览器存储空间。"
        console.warn("无法保存噪声统计", error)
      }
      this.emit()
    })
    return this.historyWrite
  }

  async getHistory() {
    await this.historyWrite
    return this.historyStore.read()
  }

  async clearHistory() {
    ++this.historyGeneration
    const previousSlice = this.lastCompletedSlice
    // Order the clear after an already-started write, before any subsequent append.
    const clearing = this.historyWrite.then(() => this.historyStore.clear())
    this.historyWrite = clearing.catch(() => {})
    await clearing
    if (this.lastCompletedSlice === previousSlice) this.lastCompletedSlice = null
    this.historyError = ""
    this.emit()
  }

  async stop() {
    // Even a paused service can have a pending permission or device-test result.
    ++this.generation
    this.microphoneTest?.abort()
    this.microphoneTest = null
    if (this.status === "active" && this.sliceFrames.length) this.finalizeSlice(Date.now())
    this.status = "paused"
    this.calibration = null
    const releasing = this.releaseAudioResources()
    this.emit()
    await releasing
  }

  async releaseAudioResources() {
    // Detach synchronously so a slow close never clears a newer session's resources.
    const context = this.audioContext
    window.clearInterval(this.fallbackTimer)
    this.fallbackTimer = null
    if (this.processorNode) this.processorNode.port.onmessage = null
    this.stream?.getTracks().forEach(track => track.stop())
    this.audioContext = null
    this.stream = null
    this.sourceNode = null
    this.processorNode = null
    this.silentGain = null
    this.fallbackAnalyser = null
    this.fallbackBuffer = null
    try {
      await context?.close()
    } catch {
      // AudioContext 可能已经由浏览器关闭。
    }
  }

  handleTrackEnded() {
    if (!["active", "initializing"].includes(this.status)) return
    ++this.generation
    this.status = "error"
    void this.releaseAudioResources()
    this.emit()
  }
}

export const noiseService = new ClassworksNoiseService()
