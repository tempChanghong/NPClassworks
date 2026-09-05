import {createServer as createHttpServer} from "node:http";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";
import vue from "@vitejs/plugin-vue";
import {createPinia, setActivePinia} from "pinia";
import {createRenderer, nextTick, reactive, ssrContextKey} from "vue";
// Initialize Axios's Node adapter before installing the minimal browser globals.
import "axios";

export function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

export function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return {promise, resolve};
}

export async function eventually(assertion) {
  const deadline = Date.now() + 3000;
  while (true) {
    try { assertion(); return; } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

export async function createFlowHarness() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const originals = new Map();
  const storage = memoryStorage();
  const browser = Object.assign(new globalThis.EventTarget(), {
    localStorage: storage, CustomEvent: globalThis.CustomEvent, setInterval, clearInterval, setTimeout, clearTimeout,
    location: {origin: "http://127.0.0.1", pathname: "/", hash: ""},
  });
  for (const [key, value] of Object.entries({
    window: browser, localStorage: storage, sessionStorage: memoryStorage(),
    document: {visibilityState: "visible"}, navigator: {onLine: true},
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {configurable: true, writable: true, value});
  }
  const requests = [];
  const routes = new Map();
  const publications = [];
  const backend = createHttpServer(async (req, res) => {
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const url = new URL(req.url, "http://localhost");
      const request = {method: req.method, path: url.pathname, query: url.searchParams,
        headers: req.headers, body: raw ? JSON.parse(raw) : null};
      requests.push(request);
      const reply = (data, status = 200) => {
        res.writeHead(status, {"Content-Type": "application/json"});
        res.end(JSON.stringify(status >= 400 ? data : {data}));
      };
      const handler = routes.get(`${req.method} ${url.pathname}`);
      if (handler) await handler(request, reply);
      else reply({message: `Unexpected request: ${req.method} ${url.pathname}`}, 500);
    } catch (error) {
      res.writeHead(500); res.end(JSON.stringify({message: error.message}));
    }
  });
  await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const serverUrl = `http://127.0.0.1:${backend.address().port}`;
  const vite = await createServer({
    root, configFile: false, envFile: false, logLevel: "error", plugins: [vue()],
    resolve: {alias: [
      {find: "@/utils/socketClient", replacement: fileURLToPath(new URL("./realtimeFixture.js", import.meta.url))},
      {find: "@", replacement: fileURLToPath(new URL("../../src", import.meta.url))},
    ]},
    server: {middlewareMode: true, hmr: false, watch: null}, appType: "custom",
    optimizeDeps: {noDiscovery: true, include: []},
  });
  const api = await vite.ssrLoadModule("/src/utils/classworksV2Client.js");
  const {useClassworksV2Store} = await vite.ssrLoadModule("/src/stores/classworksV2.js");
  const realtime = await vite.ssrLoadModule("/tests/helpers/realtimeFixture.js");
  const {default: composer} = await vite.ssrLoadModule("/src/components/v2/ScreenHomeworkDialog.vue");
  const queue = await vite.ssrLoadModule("/src/utils/screenPublicationQueue.js");
  const drafts = await vite.ssrLoadModule("/src/utils/screenHomeworkDraft.js");
  const dialogs = await vite.ssrLoadModule("/src/utils/actionDialog.js");
  const stores = [];
  let currentPinia;
  const mounted = [];
  const renderer = createRenderer({
    createComment: () => ({}), insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null,
  });
  const workspace = {id: "class-a", name: "高一一班", type: "ADMIN_CLASS",
    term: {school: {id: "school"}}, subjectRules: [{subjectId: "math", deliveryMode: "ADMIN_CLASS"}]};
  function newStore({screen = false} = {}) {
    const pinia = createPinia();
    currentPinia = pinia;
    setActivePinia(pinia);
    const store = useClassworksV2Store(pinia);
    if (screen) {
      api.saveClassroomScreenToken("screen-a-token");
      store.screenSession = {binding: {id: "screen-a"}, workspaces: [workspace]};
      store.feedAudience = "screen";
      store.studentSubjects = [{id: "math", name: "数学"}];
    }
    stores.push(store);
    return store;
  }
  function reset() {
    dialogs.settleActionDialog(false);
    for (const app of mounted.splice(0)) app.unmount();
    for (const store of stores.splice(0)) { store.stopRealtime(); store.stopScreenSync(); store.$dispose(); }
    storage.clear(); sessionStorage.clear();
    requests.length = 0; publications.length = 0; routes.clear();
    realtime.configureRealtime(serverUrl);
    const ok = (path, data) => routes.set(`GET ${path}`, (_req, reply) => reply(data));
    ok("/accounts/oauth/providers", []);
    routes.set("GET /accounts/profile", (req, reply) => reply({id: req.headers.authorization?.slice(7)}));
    ok("/api/v2/me/workspaces", [{role: "TEACHER", workspace}]);
    ok("/api/v2/me/schools", [{role: "TEACHER", school: {id: "school"}}]);
    ok("/accounts/preferences/teacher-targets", {preferences: {favorites: [], recent: []}});
    ok("/api/v2/catalog/subjects", [{id: "math", name: "数学"}]);
    ok("/api/v2/catalog/schools/school/homework-settings", {});
    routes.set("POST /accounts/logout", (_req, reply) => reply({}));
    routes.set("GET /api/v2/publications", (_req, reply) => reply({items: publications}));
    ok("/api/v2/publications/action-required", {items: [], total: 0, summary: {}});
    for (const path of ["/api/v2/classroom-screens/feed", "/api/v2/publications/feed"]) {
      routes.set(`GET ${path}`, (_req, reply) => reply({items: publications, generatedAt: new Date().toISOString()}));
    }
    for (const path of ["/api/v2/publications", "/api/v2/classroom-screens/publications"]) {
      routes.set(`POST ${path}`, (req, reply) => {
        const item = {...req.body, id: `publication-${publications.length + 1}`, revision: 1,
          type: "ASSIGNMENT", status: "PUBLISHED", targets: [{workspaceId: workspace.id}]};
        publications.push(item); reply(item);
      });
    }
  }
  reset();
  return {
    api, queue, drafts, dialogs, storage, routes, requests, publications, realtime, workspace, reset, newStore,
    async openAcademicManager(initialProps = {schoolId: "school", termId: "term"}) {
      const {default: manager} = await vite.ssrLoadModule("/src/components/admin/AcademicStructureManager.vue");
      const props = reactive({...initialProps});
      let state;
      const app = renderer.createApp({setup() {
        state = manager.setup(props, {expose() {}});
        return () => null;
      }});
      app.provide(ssrContextKey, {});
      app.mount({}); mounted.push(app);
      return {state, props, unmount: () => {
        mounted.splice(mounted.indexOf(app), 1);
        app.unmount();
      }};
    },
    async openComposer(publication = null) {
      const props = reactive({modelValue: false, publication});
      const events = [];
      let state;
      // Mount compiled setup/watchers in a real Vue component lifecycle. The template is
      // intentionally not rendered: these are interaction-logic tests, not DOM/E2E tests.
      const app = renderer.createApp({setup() {
        state = composer.setup(props, {expose() {}, emit: (...args) => events.push(args)});
        return () => null;
      }});
      app.use(currentPinia);
      app.provide(ssrContextKey, {});
      app.mount({}); mounted.push(app);
      props.modelValue = true;
      await nextTick(); await nextTick();
      return {state, events, props};
    },
    async close() {
      reset();
      await vite.close();
      backend.closeAllConnections();
      await new Promise((resolve) => backend.close(resolve));
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}
