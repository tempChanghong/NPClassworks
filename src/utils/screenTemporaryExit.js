import {shallowRef} from "vue";
import {getServerUrl} from "@/utils/socketClient";

export const SCREEN_EXIT_KEY = "classworks-v2-screen-temporary-exit";
const SCREEN_EXIT_EPOCH_KEY = "classworks-v2-screen-exit-epoch";
export const SCREEN_EXIT_CHANGED = "classworks-screen-exit-changed";
export const SCREEN_EXIT_DURATION_MS = 15 * 60 * 1000;
let endedLease = "";

export function readScreenTemporaryExit(now = Date.now()) {
  try {
    const token = localStorage.getItem("classworks-v2-screen-token") || "";
    const server = getServerUrl().replace(/\/$/, "");
    const raw = localStorage.getItem(SCREEN_EXIT_KEY);
    let lease;
    try { lease = JSON.parse(raw); } catch { /* Invalid records remain locked. */ }
    const unlocked = Boolean(token && lease?.id && lease.id !== endedLease
      && lease.token === token && lease.server === server
      && Number.isFinite(lease.startedAt) && lease.startedAt <= now
      && lease.expiresAt === lease.startedAt + SCREEN_EXIT_DURATION_MS && lease.expiresAt > now);
    const epoch = `${localStorage.getItem(SCREEN_EXIT_EPOCH_KEY) || ""}|${lease?.id || ""}|${lease?.id === endedLease ? "ended" : ""}`;
    return {bound: Boolean(token), token, server, unlocked, epoch, id: unlocked ? lease.id : "",
      expiresAt: unlocked ? lease.expiresAt : 0,
      remainingSeconds: unlocked ? Math.ceil((lease.expiresAt - now) / 1000) : 0,
      hasRecord: Boolean(raw)};
  } catch {
    // An unreadable binding/lease must never grant account access on a shared screen.
    return {bound: true, token: "", server: "", unlocked: false, id: "", expiresAt: 0, remainingSeconds: 0, hasRecord: true};
  }
}

export const screenExitState = shallowRef(readScreenTemporaryExit());

export function refreshScreenExitState() {
  const next = readScreenTemporaryExit();
  if (JSON.stringify(next) !== JSON.stringify(screenExitState.value)) screenExitState.value = next;
  return next;
}

export function beginScreenTemporaryExit(expectedToken, expectedServer, expectedEpoch) {
  const state = readScreenTemporaryExit();
  if (!state.bound || state.token !== expectedToken || state.server !== expectedServer || state.epoch !== expectedEpoch) {
    throw new Error("大屏绑定或临时退出状态已变化，请重新验证 PIN");
  }
  const startedAt = Date.now();
  localStorage.setItem(SCREEN_EXIT_KEY, JSON.stringify({id: globalThis.crypto.randomUUID(),
    token: state.token, server: state.server, startedAt, expiresAt: startedAt + SCREEN_EXIT_DURATION_MS}));
  const result = refreshScreenExitState();
  if (!result.unlocked) throw new Error("无法保存临时退出状态，请检查本机存储");
  window.dispatchEvent(new globalThis.Event(SCREEN_EXIT_CHANGED));
}

export function endScreenTemporaryExit() {
  endedLease = readScreenTemporaryExit().id || screenExitState.value.id || endedLease;
  try { localStorage.setItem(SCREEN_EXIT_EPOCH_KEY, globalThis.crypto.randomUUID()); } catch { /* Local endedLease still fails closed. */ }
  try { localStorage.removeItem(SCREEN_EXIT_KEY); } catch { /* This tab stays locked even if storage fails. */ }
  refreshScreenExitState();
  window.dispatchEvent(new globalThis.Event(SCREEN_EXIT_CHANGED));
}

export function screenAccountAccessAllowed() {
  const state = readScreenTemporaryExit();
  return !state.bound || state.unlocked;
}

export function screenAccountContext() {
  const state = readScreenTemporaryExit();
  return `${state.server}|${state.token}|${state.epoch}|${state.unlocked}`;
}
