import {reactive} from "vue";

const defaultState = () => ({
  open: false,
  mode: "confirm",
  title: "请确认",
  message: "",
  details: [],
  confirmText: "确认",
  cancelText: "取消",
  color: "primary",
  label: "",
  value: "",
  secret: false,
  rules: [],
});

export const actionDialogState = reactive(defaultState());

let resolver = null;

function openDialog(options) {
  if (resolver) resolver(null);
  Object.assign(actionDialogState, defaultState(), options, {open: true});
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

export async function confirmAction(options = {}) {
  return (await openDialog({...options, mode: "confirm"})) === true;
}

export async function promptAction(options = {}) {
  return await openDialog({...options, mode: "prompt"});
}

export function settleActionDialog(confirmed) {
  if (!resolver) return;
  const resolve = resolver;
  resolver = null;
  const result = confirmed
    ? actionDialogState.mode === "prompt" ? actionDialogState.value : true
    : null;
  actionDialogState.open = false;
  resolve(result);
}
