export function publicationDuplicateState(error) {
  const response = error?.response?.data;
  if (response?.code !== "DUPLICATE_ASSIGNMENT_SUSPECTED") return null;
  const duplicates = Array.isArray(response.details?.duplicates)
    ? response.details.duplicates.filter((item) => item?.id).slice(0, 5)
    : [];
  return {
    message: response.message || "检测到可能重复的作业",
    duplicates,
  };
}

export function duplicateAssignmentDescription(item) {
  const targetNames = item?.targets?.map((target) => target.name).filter(Boolean).join("、") || "相同班级";
  const content = item?.title || item?.content || "未命名作业";
  const snippet = content.length > 42 ? `${content.slice(0, 42)}…` : content;
  return `${targetNames} · ${item?.sourceName || "未知来源"} · ${snippet}`;
}
