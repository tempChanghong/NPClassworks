const PRIORITY_LABELS = Object.freeze({NORMAL: "普通", IMPORTANT: "重要", URGENT: "紧急"});

function publicationKind(publication) {
  return publication.type === "NOTICE" ? "通知" : "作业";
}

function priorityLabel(publication) {
  return PRIORITY_LABELS[publication.priority] || "普通";
}

function targetLabel(publication, context) {
  const explicit = [context.subjectName, context.targetName].filter(Boolean).join(" · ");
  if (explicit) return explicit;
  return publication.targets?.map((target) => target.workspace?.name).filter(Boolean).join("、") || "发布目标";
}

function isScheduled(publication, now = new Date()) {
  return publication.publishAt && new Date(publication.publishAt).getTime() > now.getTime() + 30_000;
}

function formattedDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function screenHomeworkSaveFeedback(publication = {}, context = {}) {
  const operation = context.operation === "updated" ? "修改已保存" : "已新增";
  const target = targetLabel(publication, context);
  if (publication.isCertified) {
    return {
      title: `${priorityLabel(publication)}作业已恢复`,
      detail: `当前状态：教师已确认 · 版本 ${publication.revision || "—"} · ${target}`,
      color: "success",
      icon: "mdi-check-decagram-outline",
    };
  }
  return {
    title: `${priorityLabel(publication)}作业${operation}`,
    detail: `当前状态：待教师确认 · 版本 ${publication.revision || "—"} · ${target} · 历史版本已保留`,
    color: "warning",
    icon: "mdi-clock-alert-outline",
  };
}

export function teacherPublicationSaveFeedback(publication = {}, context = {}) {
  const kind = publicationKind(publication);
  const priority = priorityLabel(publication);
  const target = targetLabel(publication, context);
  if (publication.status === "DRAFT") {
    return {
      title: `${priority}${kind}草稿已保存`,
      detail: `当前状态：尚未发布 · 版本 ${publication.revision || "—"} · ${target}`,
      color: "info",
      icon: "mdi-file-edit-outline",
    };
  }
  if (isScheduled(publication, context.now)) {
    return {
      title: `${priority}${kind}已安排发布`,
      detail: `当前状态：教师已确认 · 将于 ${formattedDateTime(publication.publishAt)} 自动显示 · 版本 ${publication.revision || "—"}`,
      color: "success",
      icon: "mdi-calendar-clock-outline",
    };
  }
  return {
    title: context.operation === "updated" ? `${priority}${kind}修改已保存` : `${priority}${kind}已发布`,
    detail: `当前状态：教师已确认 · 版本 ${publication.revision || "—"} · 已同步至 ${target}`,
    color: "success",
    icon: kind === "通知" ? "mdi-bullhorn-check-outline" : "mdi-check-decagram-outline",
  };
}

export function screenHomeworkSaveMessage(publication = {}, context = {}) {
  const feedback = screenHomeworkSaveFeedback(publication, context);
  return `${feedback.title}；${feedback.detail}`;
}
