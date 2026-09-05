export function isTransientScreenRequestError(error) {
  return !error?.response || [502, 503, 504].includes(error.response.status);
}
