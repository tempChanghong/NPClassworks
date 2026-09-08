import {getAccountTokens} from "@/utils/classworksV2Client";
import {endScreenTemporaryExit, refreshScreenExitState, SCREEN_EXIT_CHANGED} from "@/utils/screenTemporaryExit";
import {settleActionDialog} from "@/utils/actionDialog";

export function installScreenSessionLifecycle({router, store}) {
  let wasUnlocked = false;
  let checking = false;
  const check = () => {
    if (checking) return;
    checking = true;
    try {
      const state = refreshScreenExitState();
      const ended = (wasUnlocked && !state.unlocked) || (state.bound && !state.unlocked && state.hasRecord);
      wasUnlocked = state.unlocked;
      if (state.bound && !state.unlocked) {
        getAccountTokens(); // Discard shared-device account credentials before any network wait.
        if (store.account || store.teacherLoading || store.memberships.length || store.schoolMemberships.length) {
          store.clearTeacherSessionState();
        }
        if (state.hasRecord) endScreenTemporaryExit();
        if (ended || router.currentRoute.value.path === "/classworks-admin") {
          settleActionDialog(false);
          if (router.currentRoute.value.fullPath !== "/") void router.replace("/");
        }
      }
    } finally { checking = false; }
  };
  const timer = setInterval(check, 1000);
  const events = ["pageshow", "focus", "storage", SCREEN_EXIT_CHANGED];
  for (const event of events) window.addEventListener(event, check);
  document.addEventListener("visibilitychange", check);
  const stopRouter = router.afterEach(check);
  check();
  return () => {
    clearInterval(timer);
    for (const event of events) window.removeEventListener(event, check);
    document.removeEventListener("visibilitychange", check);
    stopRouter();
  };
}
