export const PUBLICATION_REVISION_CONFLICT = "PUBLICATION_REVISION_CONFLICT";

export function isPublicationRevisionConflict(error) {
  return error?.response?.status === 409
    && error?.response?.data?.code === PUBLICATION_REVISION_CONFLICT;
}

export function publicationConflictState(error, expectedRevision) {
  if (!isPublicationRevisionConflict(error)) return null;
  const latest = error.response?.data?.details || {};
  return {
    expectedRevision: Number(expectedRevision) || null,
    latestRevision: Number(latest.revision) || null,
    latestUpdatedAt: latest.updatedAt || null,
    latestCertified: typeof latest.isCertified === "boolean" ? latest.isCertified : null,
  };
}

export function publicationConflictMessage(conflict) {
  if (conflict?.sourceRevisionUnknown) {
    return "这份本机草稿没有记录来源版本，请先核对服务器内容。本机输入仍然保留，系统没有覆盖任何内容。";
  }
  const versions = conflict?.expectedRevision && conflict?.latestRevision
    ? `你打开的是版本 ${conflict.expectedRevision}，服务器现在是版本 ${conflict.latestRevision}。`
    : "服务器上的内容已经发生变化。";
  return `${versions} 本机输入仍然保留，系统没有覆盖任何内容。`;
}
