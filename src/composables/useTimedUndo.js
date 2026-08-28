import {computed, onBeforeUnmount, ref, shallowRef} from "vue";

export function useTimedUndo(durationMs = 10000) {
  const undoOffer = shallowRef(null);
  const undoBusy = ref(false);
  const remainingMs = ref(0);
  let expiresAt = 0;
  let timer = null;

  const remainingSeconds = computed(() => Math.max(0, Math.ceil(remainingMs.value / 1000)));

  function clearUndo() {
    window.clearInterval(timer);
    timer = null;
    undoOffer.value = null;
    remainingMs.value = 0;
    expiresAt = 0;
  }

  function updateRemaining() {
    remainingMs.value = Math.max(0, expiresAt - Date.now());
    if (remainingMs.value === 0 && !undoBusy.value) clearUndo();
  }

  function offerUndo({message, undo}) {
    clearUndo();
    undoOffer.value = {message, undo};
    expiresAt = Date.now() + durationMs;
    updateRemaining();
    timer = window.setInterval(updateRemaining, 250);
  }

  async function executeUndo() {
    const offer = undoOffer.value;
    if (!offer || undoBusy.value) return false;
    undoBusy.value = true;
    try {
      await offer.undo();
      clearUndo();
      return true;
    } finally {
      undoBusy.value = false;
    }
  }

  onBeforeUnmount(clearUndo);

  return {undoOffer, undoBusy, remainingSeconds, offerUndo, executeUndo, clearUndo};
}
