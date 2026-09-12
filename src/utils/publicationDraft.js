import {withPreparation, validPreparationDate} from "./homeworkPreparation.js";
import {withSubmission} from "./homeworkInstructions.js";
import {NO_HOMEWORK_META} from "./noHomework.js";

// Preview and submit serialize the same form, without any API/storage effects.
export function publicationDraftInput(form, metadata, status, correctionEligible = false) {
  const assignment = form.type === "ASSIGNMENT";
  if (assignment && !form.subjectId) throw new Error("作业必须选择科目");
  if (!form.targetWorkspaceIds.length) throw new Error("请至少选择一个发布目标");
  if (status === "PUBLISHED" && !form.title.trim() && !form.content.trim()) throw new Error("标题和正文不能同时为空");
  if (assignment && !validPreparationDate(form.boardDate)) throw new Error("请填写有效的作业板日期");
  const date = (value, name, required = false) => {
    if (!value && !required) return null;
    if (!value || !Number.isFinite(Date.parse(value))) throw new Error(`请填写有效的${name}`);
    return new Date(value).toISOString();
  };
  const publishAt = date(form.publishAt, "发布时间", true);
  const dueAt = assignment && !form.noHomework ? date(form.dueAt, "截止时间") : null;
  const expiresAt = !assignment ? date(form.expiresAt, "自动失效时间") : null;
  if (dueAt && dueAt < publishAt) throw new Error("作业截止时间不能早于发布时间");
  if (expiresAt && expiresAt < publishAt) throw new Error("失效时间不能早于发布时间");
  if (correctionEligible && (typeof form.correctionReason !== "string" || form.correctionReason.length > 300)) throw new Error("更正原因不能超过300字");
  return {
    type: form.type, subjectId: assignment ? form.subjectId : null,
    targetWorkspaceIds: [...form.targetWorkspaceIds], title: form.title, content: form.content,
    contentJson: assignment
      ? withSubmission(withPreparation(form.noHomework ? {...NO_HOMEWORK_META} : metadata, form.materials, form.materialsDate), form.noHomework ? "" : form.submission || "")
      : {...metadata, popupEnabled: form.priority !== "MINOR" || form.popupEnabled},
    boardDate: assignment ? form.boardDate : null,
    publishAt, dueAt, expiresAt, priority: form.priority, status,
    ...(correctionEligible ? {correctionReason: form.correctionReason.trim()} : {}),
  };
}
