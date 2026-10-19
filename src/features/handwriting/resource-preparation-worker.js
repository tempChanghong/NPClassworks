// Resource preparation has its own short-lived owner. It exits before the
// inference worker starts, taking native Response/cache buffers with it.
import {ensureResources} from "./resource-manager.js";
const reply = globalThis.postMessage.bind(globalThis);
let queue = Promise.resolve();
async function handle(event) {
  const {data} = event;
  try {
    if (data.protocol !== 2) throw Error("识别组件版本不一致，请保留笔迹后刷新页面。");
    if (data.type === "prepare-resources") {
      const resources = await ensureResources(message => reply({id: data.id, type: "progress", message}), new AbortController().signal, {verifyCached: data.verifyCached === true});
      reply({id: data.id, type: "prepared", resources});
      return;
    }
    throw Error("未知的资源准备请求。");
  } catch (error) { reply({id: data.id, type: "error", message: error.message || String(error)}); }
}
function enqueue(event) { queue = queue.then(() => handle(event)); }
self.onmessage = enqueue;
