import manifest from './pinned-resources.json' with {type: 'json'};

// Production page and resource Worker chunks live in assets/, independently
// of the current SPA route. Never resolve against document.location.pathname.
// Keep this separate from new URL's static asset transform in Vite.
export function resolveResourcePins(pins, moduleUrl, development = false, base = '/') {
  const root = development ? new URL(base, new URL('/', moduleUrl)) : new URL('../', moduleUrl);
  return {...pins, files: pins.files.map(file => ({...file, path: new URL(`handwriting/${file.path}`, root).href}))};
}

const moduleUrl = import.meta.url;
export default resolveResourcePins(manifest, moduleUrl, import.meta.env?.DEV, import.meta.env?.BASE_URL);
