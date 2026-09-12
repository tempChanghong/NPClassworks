const pattern = /〔([^〔〕\n]{1,32})〕/gu;

export function templateFields(template) {
  const text = `${template.title || ""}\n${template.content || ""}`;
  const fields = [...new Set([...text.matchAll(pattern)].map(match => match[1]))];
  if (/[〔〕]/u.test(text.replace(pattern, "")) || fields.some(field => !field.trim()) || fields.length > 10) {
    throw new Error("填空项请使用〔页码〕格式，名称不超过32字，最多10项。");
  }
  return fields;
}

export function fillHomeworkTemplate(template, values) {
  const fields = templateFields(template);
  if (fields.some(field => typeof values.get(field) !== "string" || !values.get(field).trim())) throw new Error("请填写全部填空项。");
  const fill = text => String(text || "").replace(pattern, (_, field) => values.get(field).trim());
  const result = {title: fill(template.title), content: fill(template.content)};
  if (result.title.length > 191 || result.content.length > 6000) throw new Error("填写后的标题不能超过191字，正文不能超过6000字。");
  if (!result.title.trim() && !result.content.trim()) throw new Error("标题和正文不能同时为空。");
  return result;
}
