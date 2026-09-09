import {shallowRef} from "vue";
import {noiseService} from "@/utils/noiseService";
import {createNoiseMonitoringController} from "@/utils/noiseMonitoringController";

export const noiseMonitoring = createNoiseMonitoringController(noiseService);
export const noiseMonitoringState = shallowRef(noiseMonitoring.snapshot());
noiseMonitoring.subscribe(state => { noiseMonitoringState.value = state; });
