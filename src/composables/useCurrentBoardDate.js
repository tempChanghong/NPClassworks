import {onScopeDispose, readonly, ref} from "vue";
import {todayBoardDate} from "@/utils/boardDate";

const currentDay = ref(todayBoardDate());
let users = 0;
let timer;

function sync() {
  clearTimeout(timer);
  currentDay.value = todayBoardDate();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 50);
  timer = setTimeout(sync, Math.max(50, midnight.getTime() - Date.now()));
}

export function useCurrentBoardDate() {
  if (users++ === 0) {
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    window.addEventListener("focus", sync);
  }
  onScopeDispose(() => {
    if (--users) return;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", sync);
    window.removeEventListener("pageshow", sync);
    window.removeEventListener("focus", sync);
  });
  return readonly(currentDay);
}
