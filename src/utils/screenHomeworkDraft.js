const MAX_DRAFT_AGE = 7 * 24 * 60 * 60 * 1000;

export function screenHomeworkDraftKey(bindingId, publicationId = "new") {
  return `classworks-v2-screen-homework-draft:${bindingId || "unbound"}:${publicationId || "new"}`;
}

export function sanitizeScreenHomeworkDraft(value = {}) {
  return {
    subjectId: typeof value.subjectId === "string" ? value.subjectId : "",
    targetWorkspaceId: typeof value.targetWorkspaceId === "string" ? value.targetWorkspaceId : "",
    title: typeof value.title === "string" ? value.title : "",
    content: typeof value.content === "string" ? value.content : "",
    boardDate: typeof value.boardDate === "string" ? value.boardDate : "",
    dueAt: typeof value.dueAt === "string" ? value.dueAt : "",
    priority: ["NORMAL", "IMPORTANT", "URGENT"].includes(value.priority) ? value.priority : "NORMAL",
    updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0,
  };
}

export function hasMeaningfulScreenHomeworkDraft(value) {
  const draft = sanitizeScreenHomeworkDraft(value);
  return Boolean(draft.subjectId || draft.targetWorkspaceId || draft.title.trim() || draft.content.trim() || draft.dueAt);
}

export function loadScreenHomeworkDraft(bindingId, publicationId, storage = localStorage, now = Date.now()) {
  const key = screenHomeworkDraftKey(bindingId, publicationId);
  try {
    const draft = sanitizeScreenHomeworkDraft(JSON.parse(storage.getItem(key)) || {});
    if (!hasMeaningfulScreenHomeworkDraft(draft) || now - draft.updatedAt > MAX_DRAFT_AGE) {
      storage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function saveScreenHomeworkDraft(bindingId, publicationId, value, storage = localStorage, now = Date.now()) {
  const key = screenHomeworkDraftKey(bindingId, publicationId);
  const draft = sanitizeScreenHomeworkDraft({...value, updatedAt: now});
  try {
    if (!hasMeaningfulScreenHomeworkDraft(draft)) {
      storage.removeItem(key);
      return null;
    }
    storage.setItem(key, JSON.stringify(draft));
    return draft;
  } catch {
    return null;
  }
}

export function clearScreenHomeworkDraft(bindingId, publicationId, storage = localStorage) {
  try {
    storage.removeItem(screenHomeworkDraftKey(bindingId, publicationId));
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}
