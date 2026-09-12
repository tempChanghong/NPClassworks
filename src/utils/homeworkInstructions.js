export function submissionOf(publication) {
  return publication?.type === "ASSIGNMENT" && typeof publication.contentJson?.submission === "string"
    ? publication.contentJson.submission.trim() : "";
}

export function correctionOf(publication) {
  return publication?.type === "ASSIGNMENT" && typeof publication.contentJson?.correctionReason === "string"
    ? publication.contentJson.correctionReason.trim() : "";
}

export function withSubmission(metadata, text) {
  if (typeof text !== "string" || text.length > 500) throw new Error("提交说明不能超过500字。");
  const result = {...metadata};
  delete result.submission;
  delete result.correctionReason;
  if (text.trim()) result.submission = text.trim();
  return Object.keys(result).length ? result : null;
}
