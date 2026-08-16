function localDateKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function roundedAverage(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

export function summarizeNoiseHistoryByDay(history = []) {
  const groups = new Map();
  const slices = (Array.isArray(history) ? history : [])
    .filter(slice => Number.isFinite(slice?.start) && Number.isFinite(slice?.end) && slice.end > slice.start)
    .sort((left, right) => right.start - left.start);

  for (const slice of slices) {
    const dateKey = localDateKey(slice.start);
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey).push(slice);
  }

  return [...groups.entries()].map(([dateKey, daySlices]) => {
    const scores = daySlices.map(slice => slice.score).filter(Number.isFinite);
    const averageValues = daySlices.map(slice => slice.display?.avgDb).filter(Number.isFinite);
    const p95Values = daySlices.map(slice => slice.display?.p95Db).filter(Number.isFinite);
    const durationMs = daySlices.reduce((sum, slice) => sum + (slice.end - slice.start), 0);
    return {
      dateKey,
      slices: daySlices,
      count: daySlices.length,
      durationMinutes: Math.max(1, Math.round(durationMs / 60000)),
      averageScore: roundedAverage(scores),
      averageDb: roundedAverage(averageValues),
      peakP95: p95Values.length ? Math.round(Math.max(...p95Values)) : null,
    };
  });
}
