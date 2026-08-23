export const SETUP_STATUS_TIMEOUT_MS = 3000;

const SETUP_COMPLETED_KEY = "npclassworks:setup-completed";

export function hasCompletedSetup(storage = sessionStorage) {
  try {
    return storage.getItem(SETUP_COMPLETED_KEY) === "true";
  } catch {
    return false;
  }
}

export function rememberCompletedSetup(status, storage = sessionStorage) {
  if (status?.state !== "COMPLETED") return false;
  try {
    storage.setItem(SETUP_COMPLETED_KEY, "true");
  } catch {
    // A blocked sessionStorage must not prevent the application from opening.
  }
  return true;
}

export function clearCompletedSetup(storage = sessionStorage) {
  try {
    storage.removeItem(SETUP_COMPLETED_KEY);
  } catch {
    // Ignore unavailable browser storage.
  }
}
