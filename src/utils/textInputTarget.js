// A text-only adapter. Async input owns a field, editor scope and text revision.
// It never stores strokes or knows about the recognition implementation.
export function createTextInputTarget({read, write, context, textarea, disabled, label, limit = Infinity}) {
  let applied = new WeakSet();
  return {
    get scope() { return JSON.stringify(context()); },
    get value() { return read(); },
    get label() { return label?.() || ""; },
    get disabled() { return Boolean(disabled()); },
    capture() {
      if (disabled()) throw Error("当前编辑器不可录入，请完成当前操作后重试。");
      const value = read(), element = textarea();
      const start = Math.max(0, Math.min(value.length, element?.selectionStart ?? value.length));
      const end = Math.max(start, Math.min(value.length, element?.selectionEnd ?? start));
      return {value, scope: JSON.stringify(context()), start, end};
    },
    apply(snapshot, text) {
      if (!snapshot || applied.has(snapshot)) throw Error("这段文字已处理，请重新打开手写输入。");
      if (disabled() || snapshot.scope !== JSON.stringify(context()) || read() !== snapshot.value) {
        throw Error("班级、作业或正文已变化，未插入旧结果。请核对后重新打开手写输入。");
      }
      // Whitespace can separate question numbers or English words inside an
      // existing field. Validate emptiness without changing confirmed text.
      const input = String(text).replace(/\r\n?/g, "\n");
      if (!input.trim()) throw Error("请先识别或填写需要插入的文字。");
      const value = snapshot.value.slice(0, snapshot.start) + input + snapshot.value.slice(snapshot.end);
      if (value.length > limit) throw Error(`插入后超过 ${limit} 字，请缩短后重试；原文保留。`);
      write(value); applied.add(snapshot);
      return {before: snapshot.value, after: value, scope: snapshot.scope, cursor: snapshot.start + input.length};
    },
    restoreSelection(edit) {
      if (!edit || disabled() || edit.scope !== JSON.stringify(context()) || read() !== edit.after) return false;
      textarea()?.setSelectionRange?.(edit.cursor, edit.cursor);
      return true;
    },
    undo(edit) {
      if (!edit || disabled() || edit.scope !== JSON.stringify(context()) || read() !== edit.after) {
        throw Error("正文或编辑范围已变化，未撤销后续输入。");
      }
      write(edit.before);
    },
  };
}
