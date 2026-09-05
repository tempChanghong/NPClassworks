export const SELECTION_KEY = "classworks-v2-student-selection";

export function loadSavedSelection() {
  try {
    return JSON.parse(localStorage.getItem(SELECTION_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveSelection(selection) {
  localStorage.setItem(SELECTION_KEY, JSON.stringify(selection));
}
