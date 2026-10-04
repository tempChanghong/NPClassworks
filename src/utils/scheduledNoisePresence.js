export function classifyScheduledNoisePresence({candidate, returning, visible, focused,
  blocked, overlayActive, displayed}) {
  if (candidate?.provider !== 'native') return null;
  if (returning) return 'RETURNING';
  if (!visible || !focused) return 'HIDDEN';
  if (blocked || overlayActive) return 'BLOCKED';
  return displayed ? 'DISPLAY_VISIBLE' : 'HIDDEN';
}
