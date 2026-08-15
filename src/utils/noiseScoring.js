const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

function quantile(values, ratio) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * ratio
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

function smoothstep(edge0, edge1, value) {
  const normalized = clamp((value - edge0) / Math.max(0.001, edge1 - edge0), 0, 1)
  return normalized * normalized * (3 - 2 * normalized)
}

export function analyzeNoiseWindow(frames, {windowMs = 60_000, frameMs = 100} = {}) {
  const validFrames = frames.filter(frame => Number.isFinite(frame?.dbfs) && frame.dbfs > -100)
  if (!validFrames.length) {
    return {
      score: null,
      confidence: 0,
      coverage: 0,
      baselineDbfs: null,
      activityMean: 0,
      eventCount: 0,
      quality: "no-signal",
      scoreDetail: null,
    }
  }

  const dbfsValues = validFrames.map(frame => frame.dbfs)
  const baselineDbfs = quantile(dbfsValues, 0.2)
  const activities = dbfsValues.map(dbfs => smoothstep(baselineDbfs + 4, baselineDbfs + 20, dbfs))
  const activityMean = activities.reduce((sum, value) => sum + value, 0) / activities.length
  const activityP80 = quantile(activities, 0.8)

  let eventCount = 0
  let eventActive = false
  for (const activity of activities) {
    if (!eventActive && activity >= 0.58) {
      eventActive = true
      eventCount += 1
    } else if (eventActive && activity <= 0.3) {
      eventActive = false
    }
  }

  const expectedFrames = Math.max(1, windowMs / frameMs)
  const coverage = clamp(validFrames.length / expectedFrames, 0, 1)
  const clippedRatio = validFrames.reduce((sum, frame) => sum + (frame.clippedRatio || 0), 0) / validFrames.length
  const silentRatio = validFrames.filter(frame => frame.dbfs < -90).length / validFrames.length
  const eventFactor = clamp(eventCount / 12, 0, 1)
  const sustainedPenalty = 65 * activityMean
  const floorPenalty = 25 * activityP80
  const segmentPenalty = 10 * eventFactor
  const score = Math.round(clamp(100 - sustainedPenalty - floorPenalty - segmentPenalty, 0, 100))

  let quality = "good"
  if (clippedRatio > 0.01) quality = "clipping"
  else if (silentRatio > 0.8) quality = "silent"
  else if (coverage < 0.8) quality = "low-coverage"
  const signalFactor = quality === "good" || quality === "low-coverage" ? 1 : 0.35

  return {
    score,
    confidence: Math.round(clamp(coverage * signalFactor, 0, 1) * 100),
    coverage: Math.round(coverage * 100),
    baselineDbfs,
    activityMean,
    eventCount,
    quality,
    scoreDetail: {
      sustainedPenalty,
      timePenalty: floorPenalty,
      segmentPenalty,
    },
  }
}

export function estimatedDbFromRms(rms, baselineRms, baselineDb) {
  if (!Number.isFinite(rms) || rms <= 0) return 20
  const safeBaselineRms = Number.isFinite(baselineRms) && baselineRms > 0
    ? baselineRms
    : 0.001
  const safeBaselineDb = Number.isFinite(baselineDb) ? baselineDb : 40
  return clamp(safeBaselineDb + 20 * Math.log10(rms / safeBaselineRms), 20, 100)
}
