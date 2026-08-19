const STORAGE_KEY = "classworks-v2-student-homework-completions";
const MAX_RECORDS = 500;
const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

function storageOrNull(storage) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function sanitizeStudentHomeworkCompletions(value, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([id, record]) => (
      id
      && record
      && Number.isInteger(record.revision)
      && record.revision > 0
      && Number.isFinite(record.completedAt)
      && record.completedAt <= now + 60_000
      && now - record.completedAt <= RETENTION_MS
    ))
    .sort(([, left], [, right]) => right.completedAt - left.completedAt)
    .slice(0, MAX_RECORDS));
}

export function loadStudentHomeworkCompletions(storage) {
  const target = storageOrNull(storage);
  if (!target) return {};
  try {
    return sanitizeStudentHomeworkCompletions(JSON.parse(target.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return {};
  }
}

export function isStudentHomeworkCompleted(publication, records) {
  if (!publication?.id || publication.type !== "ASSIGNMENT") return false;
  return records?.[publication.id]?.revision === publication.revision;
}

export function isStudentHomeworkUpdatedAfterCompletion(publication, records) {
  if (!publication?.id || publication.type !== "ASSIGNMENT") return false;
  const completedRevision = records?.[publication.id]?.revision;
  return Number.isInteger(completedRevision)
    && completedRevision > 0
    && completedRevision < publication.revision;
}

export function setStudentHomeworkCompleted(publication, completed, storage, now = Date.now()) {
  const target = storageOrNull(storage);
  const records = loadStudentHomeworkCompletions(target);
  if (!publication?.id || publication.type !== "ASSIGNMENT") return records;
  if (completed) {
    records[publication.id] = {revision: publication.revision, completedAt: now};
  } else {
    delete records[publication.id];
  }
  const sanitized = sanitizeStudentHomeworkCompletions(records, now);
  try {
    target?.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // 本地存储不可用时仍更新当前页面，不影响查看作业。
  }
  return sanitized;
}

export function studentHomeworkCompletionStats(publications, records) {
  const assignments = (publications || []).filter((item) => item.type === "ASSIGNMENT");
  return {
    total: assignments.length,
    completed: assignments.filter((item) => isStudentHomeworkCompleted(item, records)).length,
    updated: assignments.filter((item) => isStudentHomeworkUpdatedAfterCompletion(item, records)).length,
  };
}
