import {publicationDisplayState} from "./publicationStatus.js";

export function buildPublicationReceipt(publication = {}, context = {}) {
  const state = publicationDisplayState(publication, {now: context.now});
  const targets = (publication.targets || []).map((target) => ({
    id: target.workspaceId || target.workspace?.id,
    name: target.workspace?.name || target.workspaceId || "未知目标",
    type: target.workspace?.type || "WORKSPACE",
    state: state.key === "scheduled" ? "scheduled" : "accepted",
    label: state.key === "scheduled" ? "已写入，等待定时显示" : "已写入服务器",
  }));
  return {
    publicationId: publication.id,
    type: publication.type,
    status: state,
    targetCount: targets.length,
    targets,
    isAtomic: true,
    canInspectDelivery: publication.type === "NOTICE" && publication.status === "PUBLISHED",
  };
}
