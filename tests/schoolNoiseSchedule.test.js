import * as api from '../src/utils/schoolNoiseSchedule.js';
import {registerScheduleCases} from './helpers/noiseScheduleCases.js';
registerScheduleCases(api, new URL('./fixtures/noise-schedule-cases.json', import.meta.url));
