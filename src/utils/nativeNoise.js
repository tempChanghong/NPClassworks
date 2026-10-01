import {shallowRef} from 'vue';
import {npepNoiseApi, npepNoiseScheduleApi} from '@/utils/classworksV2Client';
import {createNativeNoiseController} from '@/utils/nativeNoiseController';
export const nativeNoiseState = shallowRef({provider: 'checking', online: false, status: null, reports: [], commands: []});
const key = scope => `npep.noise.provider:${scope}`;
export const nativeNoise = createNativeNoiseController(npepNoiseApi, s => { nativeNoiseState.value = s; }, {
  get(scope) { try { return localStorage.getItem(key(scope)); } catch { return null; } },
  set(scope, provider) { try { localStorage.setItem(key(scope), provider); } catch { /* State remains in memory. */ } },
}, npepNoiseScheduleApi);
