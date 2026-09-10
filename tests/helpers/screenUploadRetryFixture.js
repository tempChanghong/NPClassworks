import {createScreenUploadRetry as createRetry} from "../../src/utils/screenUploadRetry.js";

let clock = {};
export function configureScreenUploadRetry(options = {}) { clock = options; }
// Only the business retry scheduler is replaced; HTTP and heartbeat timers stay real.
export function createScreenUploadRetry(options) { return createRetry({...options, ...clock}); }
