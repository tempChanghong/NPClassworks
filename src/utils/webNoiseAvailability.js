// Retired for every school, including deployments without NPEP.
// Keep legacy history/statistics code; no runtime entry may request browser audio.
export const WEB_NOISE_ENABLED = false;
export function requireWebNoise() {
  if (!WEB_NOISE_ENABLED) throw Object.assign(new Error('网页噪音监测已停用，请使用 NPEduTools。'), {code:'WEB_NOISE_RETIRED'});
}
