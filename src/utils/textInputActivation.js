// Lazy editors share a download, but only the latest requested field may open.
// Keep no editor, target, text or callback in this page-wide ownership slot.
let active;
export function beginTextInputActivation() {
  const token = {};
  active = token;
  return {
    current: () => active === token,
    release: () => { if (active === token) active = null; },
  };
}
