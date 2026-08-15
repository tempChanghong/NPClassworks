class ClassworksNoiseMeterProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.sampleTarget = Math.max(1, Math.round(sampleRate / 10))
    this.sampleCount = 0
    this.sumSquares = 0
    this.peak = 0
    this.zeroCrossings = 0
    this.clippedSamples = 0
    this.previousSample = 0
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel) return true
    for (const sample of channel) {
      this.sumSquares += sample * sample
      this.peak = Math.max(this.peak, Math.abs(sample))
      if ((sample >= 0) !== (this.previousSample >= 0)) this.zeroCrossings += 1
      if (Math.abs(sample) >= 0.99) this.clippedSamples += 1
      this.previousSample = sample
      this.sampleCount += 1
      if (this.sampleCount >= this.sampleTarget) this.flush()
    }
    return true
  }

  flush() {
    const rms = Math.sqrt(this.sumSquares / this.sampleCount)
    this.port.postMessage({
      rms,
      peak: this.peak,
      zeroRatio: this.zeroCrossings / this.sampleCount,
      clippedRatio: this.clippedSamples / this.sampleCount,
    })
    this.sampleCount = 0
    this.sumSquares = 0
    this.peak = 0
    this.zeroCrossings = 0
    this.clippedSamples = 0
  }
}

registerProcessor('classworks-noise-meter', ClassworksNoiseMeterProcessor)
