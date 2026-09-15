import {isNoHomework} from "./noHomework.js";
import {optionalHomeworkOf, submissionOf} from "./homeworkInstructions.js";
import {preparationOf, validPreparationDate} from "./homeworkPreparation.js";

export const HOMEWORK_REUSE_LIMIT = 20;

export function canReuseHomework(publication, now = Date.now()) {
  return Boolean(publication?.id && publication.type === "ASSIGNMENT" && publication.subjectId
    && ["PUBLISHED", "WITHDRAWN"].includes(publication.status)
    && Number.isFinite(Date.parse(publication.publishAt)) && Date.parse(publication.publishAt) <= now);
}

// Copy only editable content. IDs, certification, authors, revisions and old timing
// must never turn a new publication into an update of its source.
export function homeworkReuseDraft(publication, boardDate, now = Date.now()) {
  if (!canReuseHomework(publication, now)) throw new Error("所选记录已不可复用，请刷新后重新选择。");
  if (!validPreparationDate(boardDate)) throw new Error("请选择有效的新作业板日期。");
  return {
    type: "ASSIGNMENT", subjectId: publication.subjectId, targetWorkspaceIds: [],
    title: publication.title || "", content: publication.content || "",
    noHomework: isNoHomework(publication),
    optionalContent: optionalHomeworkOf(publication), submission: submissionOf(publication),
    materials: preparationOf(publication)?.text || "", materialsDate: "",
    boardDate, dueAt: "", expiresAt: "", correctionReason: "",
    priority: ["NORMAL", "IMPORTANT", "URGENT"].includes(publication.priority) ? publication.priority : "NORMAL",
  };
}
