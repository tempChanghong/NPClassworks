import {computed, onUnmounted, ref, watch} from "vue";
import {classworksV2Api, npepAdminApi} from "@/utils/classworksV2Client";
import {npepErrorMessage} from "@/utils/npepPresentation";

export function useNpepManager(schoolId) {
  const devices = ref([]), bindings = ref([]), candidate = ref(null), approved = ref(null);
  const code = ref(""), bindingId = ref(""), busy = ref(false), error = ref(""), message = ref("");
  const loaded = ref(false), stale = ref(false), nextCursor = ref(null), now = ref(Date.now());
  let generation = 0, controller, disposed = false, approvalRequest, serverAt = Date.now(), receivedAt = globalThis.performance.now(), wallAt = Date.now();
  const tick = () => { now.value = serverAt + Math.max(0, globalThis.performance.now() - receivedAt, Date.now() - wallAt); };
  const timer = setInterval(tick, 1000);
  function clock(value) { serverAt = Date.parse(value.serverTime); receivedAt = globalThis.performance.now(); wallAt = Date.now(); tick(); }
  const expired = computed(() => candidate.value && Date.parse(candidate.value.expiresAt) <= now.value);
  const bindingOptions = computed(() => bindings.value.filter(b => b.isActive && b.administrativeClass?.isActive !== false
    && (!b.administrativeClass?.term?.status || b.administrativeClass.term.status === "ACTIVE"))
    .map(b => ({title: `${b.name} · ${b.administrativeClass?.name || "班级信息待核对"}`, value: b.id})));
  function clear() {
    generation++; controller?.abort(); busy.value = false;
    devices.value = []; bindings.value = []; candidate.value = null; approved.value = null;
    code.value = ""; bindingId.value = ""; error.value = ""; message.value = "";
    loaded.value = false; stale.value = false; nextCursor.value = null; approvalRequest = null;
  }
  async function run(operation) {
    if (disposed || busy.value || !schoolId.value) return;
    busy.value = true; error.value = "";
    const token = generation, school = schoolId.value;
    controller = new AbortController();
    const options = {signal: controller.signal};
    const current = () => !disposed && token === generation && school === schoolId.value;
    try { await operation(school, options, current); }
    catch (failure) {
      if (!current()) return;
      if (failure.code === "ERR_CANCELED") {
        devices.value = []; bindings.value = []; candidate.value = null; approved.value = null; loaded.value = false;
        error.value = "登录上下文已变化，请重新打开互联面板。";
        return;
      }
      error.value = npepErrorMessage(failure); stale.value = loaded.value;
      if ([401, 403].includes(failure.response?.status)) {
        devices.value = []; candidate.value = null; approved.value = null; bindings.value = []; loaded.value = false;
      }
    } finally { if (current()) busy.value = false; }
  }
  async function fetchList(school, options, current, more = false) {
    const result = await npepAdminApi.devices(school, {...options, params: {limit: 20, ...(more ? {cursor: nextCursor.value} : {})}});
    if (!current()) return;
    if (!Array.isArray(result.data.items)) throw new Error("Invalid device list");
    const combined = more ? [...devices.value, ...result.data.items] : result.data.items;
    devices.value = [...new Map(combined.map(device => [device.deviceId, device])).values()];
    nextCursor.value = result.data.nextCursor; loaded.value = true; stale.value = false; clock(result);
  }
  const refresh = () => run(async (school, options, current) => {
    const [screens] = await Promise.all([classworksV2Api.classroomScreens(school, options), npepAdminApi.info(options)]);
    if (!current()) return;
    bindings.value = screens;
    await fetchList(school, options, current);
  });
  const more = () => nextCursor.value && run((school, options, current) => fetchList(school, options, current, true));
  const resolve = () => {
    const normalized = code.value.replaceAll("-", "").replaceAll(" ", "").toUpperCase();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(normalized)) { error.value = "请输入设备上显示的 8 位配对短码。"; return; }
    return run(async (school, options, current) => {
      candidate.value = null; approved.value = null; bindingId.value = ""; approvalRequest = null; message.value = "";
      const result = await npepAdminApi.resolve(school, normalized, options);
      if (current()) { candidate.value = result.data; clock(result); }
    });
  };
  const approve = () => {
    if (!candidate.value || expired.value || !bindingOptions.value.some(b => b.value === bindingId.value)) return;
    const pairingId = candidate.value.pairingId, selected = bindingId.value;
    if (!approvalRequest || approvalRequest.pairingId !== pairingId || approvalRequest.selected !== selected) {
      approvalRequest = {pairingId, selected, requestId: globalThis.crypto.randomUUID()};
    }
    return run(async (school, options, current) => {
      const result = await npepAdminApi.approve(school, pairingId, selected, {...options, requestId: approvalRequest.requestId});
      if (current()) { approved.value = result.data; clock(result); code.value = ""; message.value = "批准已保存。请在 NPEduTools 现场核对学校、班级与大屏并确认；如已完成，请刷新右侧列表查看登记结果。批准本身不代表设备已连接。"; }
    });
  };
  const cancel = () => approved.value && run(async (school, options, current) => {
    await npepAdminApi.cancel(school, approved.value.pairingId, options);
    if (current()) { candidate.value = null; approved.value = null; message.value = "此次配对已取消。"; }
  });
  const revoke = device => run(async (school, options, current) => {
    await npepAdminApi.revoke(school, device, options);
    if (!current()) return;
    devices.value = devices.value.map(row => row.deviceId === device.deviceId ? {...row, state: "REVOKED", connectivity: "OFFLINE"} : row);
    message.value = "已撤销互联设备授权。原本机凭据不能继续上报；网页大屏账号不受此次操作影响。";
    await fetchList(school, options, current);
  });
  watch(schoolId, () => { clear(); void refresh(); }, {immediate: true, flush: "sync"});
  onUnmounted(() => { disposed = true; clear(); clearInterval(timer); });
  return {devices, bindings, candidate, approved, code, bindingId, busy, error, message, loaded, stale, nextCursor, now,
    expired, bindingOptions, refresh, more, resolve, approve, cancel, revoke};
}
