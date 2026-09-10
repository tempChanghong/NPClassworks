export const editableRoster = students => students.map(({id, name, studentNumber}) => ({
  ...(id ? {id} : {}), name: name || "", studentNumber: studentNumber || "",
}));

export function validateRoster(students) {
  if (students.length > 120) throw new Error("一个班级最多保存 120 名学生");
  const numbers = new Set(), ids = new Set();
  return students.map(student => {
    const name = student.name.trim(), studentNumber = student.studentNumber?.trim() || "";
    if (!name || name.length > 64 || studentNumber.length > 64) throw new Error("姓名不能为空，姓名和学号最多 64 个字符");
    if (studentNumber && numbers.has(studentNumber)) throw new Error(`学号 ${studentNumber} 重复，请核对`);
    if (student.id && ids.has(student.id)) throw new Error("同一学生出现多次，请核对");
    if (studentNumber) numbers.add(studentNumber);
    if (student.id) ids.add(student.id);
    return {...student, name, studentNumber};
  });
}

export function importRoster(text, existing, mode = "append") {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("请先粘贴学生名单");
  const parsed = lines.map(line => {
    const match = line.match(/^(\S+)\s+(.+)$/);
    const item = match ? {studentNumber: match[1], name: match[2].trim()} : {studentNumber: "", name: line};
    const matches = existing.filter(s => item.studentNumber
      ? s.studentNumber === item.studentNumber : !s.studentNumber && s.name === item.name);
    if (matches.length > 1) throw new Error(`“${item.name}”存在同名记录，请在表格中逐项编辑`);
    return {...item, ...(matches[0]?.id ? {id: matches[0].id} : {})};
  });
  validateRoster(parsed);
  if (mode === "replace") return parsed;
  const result = editableRoster(existing);
  for (const item of parsed) {
    const index = result.findIndex(s => item.studentNumber ? s.studentNumber === item.studentNumber : s.name === item.name && !s.studentNumber);
    if (index < 0) result.push(item);
    else result[index] = {...result[index], ...item};
  }
  return validateRoster(result);
}

export function rosterChanges(before, after) {
  const byId = new Map(before.filter(s => s.id).map((s, index) => [s.id, {...s, index}]));
  const kept = new Set(after.map(s => s.id).filter(Boolean));
  return [
    ...after.flatMap((s, index) => {
      const old = byId.get(s.id);
      if (!old) return [`新增：${s.studentNumber || ""} ${s.name}`];
      if (old.name !== s.name || (old.studentNumber || "") !== (s.studentNumber || "")) {
        return [`修改：${old.studentNumber || ""} ${old.name} → ${s.studentNumber || ""} ${s.name}`];
      }
      return old.index !== index ? [`排序：${s.name}（${old.index + 1} → ${index + 1}）`] : [];
    }),
    ...before.filter(s => !kept.has(s.id)).map(s => `移出：${s.studentNumber || ""} ${s.name}（保留历史记录）`),
  ];
}
