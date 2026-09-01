export const PUBLICATION_STATUS = Object.freeze({
  DRAFT: Object.freeze({key: "draft", label: "草稿", color: "grey", icon: "mdi-file-edit-outline",
    description: "仅自己可见，尚未向学生和大屏发布"}),
  SCHEDULED: Object.freeze({key: "scheduled", label: "定时发布", color: "purple", icon: "mdi-calendar-clock-outline",
    description: "已经保存，将在设定时间自动显示"}),
  PUBLISHED: Object.freeze({key: "published", label: "教师已确认", color: "success", icon: "mdi-check-decagram-outline",
    description: "当前版本已经教师确认并正常发布"}),
  PENDING_CERTIFICATION: Object.freeze({key: "pending", label: "待教师确认", color: "warning",
    icon: "mdi-alert-circle-outline", description: "由大屏录入或修改，等待教师检查"}),
  CHANGED_AFTER_CERTIFICATION: Object.freeze({key: "changed", label: "确认后被修改", color: "warning",
    icon: "mdi-alert-decagram-outline", description: "教师确认后又发生修改，需要重新检查"}),
  WITHDRAWN: Object.freeze({key: "withdrawn", label: "已撤回", color: "grey", icon: "mdi-undo-variant",
    description: "不再向学生和大屏展示，历史记录仍保留"}),
  OFFLINE_PENDING: Object.freeze({key: "offline", label: "等待同步", color: "warning", icon: "mdi-cloud-upload-outline",
    description: "已保存在本机，联网后自动提交"}),
  SYNC_FAILED: Object.freeze({key: "failed", label: "同步失败", color: "error", icon: "mdi-cloud-alert-outline",
    description: "尚未写入服务器，需要检查后重试"}),
});

export const PUBLICATION_STATUS_TABLE = Object.freeze([
  PUBLICATION_STATUS.DRAFT,
  PUBLICATION_STATUS.SCHEDULED,
  PUBLICATION_STATUS.PUBLISHED,
  PUBLICATION_STATUS.PENDING_CERTIFICATION,
  PUBLICATION_STATUS.CHANGED_AFTER_CERTIFICATION,
  PUBLICATION_STATUS.OFFLINE_PENDING,
  PUBLICATION_STATUS.SYNC_FAILED,
  PUBLICATION_STATUS.WITHDRAWN,
]);

export const PUBLICATION_PRIORITY = Object.freeze({
  NORMAL: Object.freeze({label: "普通", color: "primary", icon: "mdi-information-outline"}),
  IMPORTANT: Object.freeze({label: "重要", color: "warning", icon: "mdi-alert-outline"}),
  URGENT: Object.freeze({label: "紧急", color: "error", icon: "mdi-alert-octagon-outline"}),
});

export function publicationPriorityMeta(priority) {
  return PUBLICATION_PRIORITY[priority] || PUBLICATION_PRIORITY.NORMAL;
}

export function publicationDisplayState(publication = {}, options = {}) {
  if (publication.syncFailed) return PUBLICATION_STATUS.SYNC_FAILED;
  if (publication.offlineQueued) return PUBLICATION_STATUS.OFFLINE_PENDING;
  if (publication.status === "WITHDRAWN") return PUBLICATION_STATUS.WITHDRAWN;
  if (publication.status === "DRAFT") return PUBLICATION_STATUS.DRAFT;
  if (options.reason === "CHANGED_AFTER_CERTIFICATION") return PUBLICATION_STATUS.CHANGED_AFTER_CERTIFICATION;
  if (publication.isCertified === false) return PUBLICATION_STATUS.PENDING_CERTIFICATION;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (publication.publishAt && new Date(publication.publishAt).getTime() > now.getTime() + 30_000) {
    return PUBLICATION_STATUS.SCHEDULED;
  }
  return PUBLICATION_STATUS.PUBLISHED;
}

export function publicationIndicatorVisibility(publication = {}, options = {}) {
  const state = publicationDisplayState(publication, options);
  const screenMode = options.screenMode === true;
  return {
    state,
    showState: !screenMode || state.key !== PUBLICATION_STATUS.PUBLISHED.key,
    showPriority: !screenMode || (publication.priority || "NORMAL") !== "NORMAL",
  };
}
