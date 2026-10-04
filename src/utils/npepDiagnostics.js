import {readDeviceOverview} from './npepDeviceOverview.js';

const choice = (value, choices) => choices.split(' ').includes(value) ? value : 'UNKNOWN';
const id = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) &&
  value !== '00000000-0000-0000-0000-000000000000' ? value.toLowerCase() : null;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const number = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const version = value => typeof value === 'string' && /^(?:InDev \d{8}|\d+\.\d+\.\d+(?:[-.][a-zA-Z0-9.]+)?)(?:\+[a-fA-F0-9]{7,64})?$/.test(value) && value.length <= 160 ? value : null;
function origin(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}
function bridge(value) {
  return {connection: choice(value?.connection, 'READY DISCONNECTED UNKNOWN'), bridgeVersion: version(value?.bridgeVersion)};
}

// Purpose-specific allow-list, not a dump of reactive state or the HTTP response.
// Business UUIDs allow comparison with the desktop; names, codes and arbitrary text do not leave the page.
export function createNpepOverviewDiagnostics({overview, devices, schoolId, filter, stale, now, backendUrl, appVersion, hasMore}) {
  readDeviceOverview(overview);
  if (!Array.isArray(devices) || !Number.isFinite(now)) throw new Error('Invalid diagnostic snapshot');
  const summary = Object.fromEntries(['total', 'active', 'online', 'offline', 'unreported', 'attention', 'inactive'].map(key => [key, overview.summary[key]]));
  const items = devices.slice(0, 200).map(device => ({
    deviceId: id(device?.deviceId), schoolId: id(device?.schoolId),
    administrativeClassId: id(device?.administrativeClassId), screenBindingId: id(device?.screenBindingId),
    bindingRevision: number(device?.bindingRevision), bindingChanged: typeof device?.bindingChanged === 'boolean' ? device.bindingChanged : null,
    state: choice(device?.state, 'ACTIVE REVOKED EXPIRED INVALIDATED'),
    connectivity: choice(device?.connectivity, 'ONLINE OFFLINE UNKNOWN'), lastSeenAt: date(device?.lastSeenAt),
    issues: [...new Set((Array.isArray(device?.issues) ? device.issues : []).map(code => choice(code,
      'UNREPORTED OFFLINE MODE_NOT_READY MODE_INCOMPLETE RECORDING_UNKNOWN CLASSISLAND_NOT_CONNECTED EXAMAWARE_NOT_CONNECTED')))],
    status: device?.status ? {
      appVersion: version(device.status.appVersion), mode: choice(device.status.mode, 'DAILY EXAM UNCONFIGURED UNKNOWN'),
      modePhase: choice(device.status.modePhase, 'IDLE CHECKING SWITCHING RUNNING INCOMPLETE UNAVAILABLE UNKNOWN'),
      modeRevision: number(device.status.modeRevision), automaticRecording: choice(device.status.automaticRecording, 'ENABLED DISABLED UNKNOWN'),
      recording: choice(device.status.recording, 'IDLE RECORDING PAUSED FINALIZING UNKNOWN'),
      classIsland: bridge(device.status.classIsland), examAware: bridge(device.status.examAware),
    } : null,
  }));
  return {
    schemaVersion: 1, kind: 'npep-school-overview-diagnostics', generatedAt: new Date(now).toISOString(),
    appVersion: version(appVersion), backendOrigin: origin(backendUrl), schoolId: id(schoolId),
    privacy: 'Includes service origin and business identifiers. No credentials, pairing codes, names, search text, paths, logs or audio. Review before sharing.',
    observation: 'Only loaded devices, at most 200. Pages may have different observation times; this is not a live probe or an execution receipt.',
    asOf: date(overview.asOf), stale: Boolean(stale) || now - Date.parse(overview.asOf) > 60000,
    filter: choice(filter, 'ALL ATTENTION ONLINE INACTIVE'), summary, matchedTotal: overview.matchedTotal,
    loadedCount: devices.length, exportedCount: items.length, omittedLoadedCount: devices.length - items.length,
    hasMore: Boolean(hasMore), items,
  };
}
