export function isTransientScreenRequestError(error) {
  const status = Number(error?.response?.status);
  return !error?.response || status === 408 || status === 429 || (status >= 500 && status < 600);
}
