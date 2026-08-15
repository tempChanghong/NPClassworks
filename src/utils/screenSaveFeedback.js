export function screenHomeworkSaveMessage(publication = {}, context = {}) {
  const destination = [context.subjectName, context.targetName].filter(Boolean).join(" · ") || "作业";
  return publication.isCertified
    ? `${destination}：已恢复教师确认版本`
    : `${destination}：保存成功，当前为待教师确认；历史版本已保留`;
}
