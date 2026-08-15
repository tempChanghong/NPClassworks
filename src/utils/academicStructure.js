export function buildSubjectRulePreset(subjects, preset, fixedSubjectIds = []) {
  const fixedIds = new Set(fixedSubjectIds);
  const requiredCount = preset === "single-fixed" ? 1 : preset === "triple-fixed" ? 3 : null;
  if (requiredCount !== null && fixedIds.size !== requiredCount) {
    throw new Error(`${preset === "single-fixed" ? "单科" : "三科"}定班需要选择${requiredCount}门选科`);
  }
  return Object.fromEntries(subjects.map((subject) => {
    if (subject.category === "CORE" || preset === "all-fixed") return [subject.id, "ADMIN_CLASS"];
    if (preset === "triple-fixed") {
      return [subject.id, fixedIds.has(subject.id) ? "ADMIN_CLASS" : "NOT_OFFERED"];
    }
    if (preset === "single-fixed") {
      return [subject.id, fixedIds.has(subject.id) ? "ADMIN_CLASS" : "COURSE_GROUP"];
    }
    return [subject.id, "COURSE_GROUP"];
  }));
}

