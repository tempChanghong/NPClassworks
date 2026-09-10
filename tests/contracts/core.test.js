import assert from "node:assert/strict";
import {before, after, test} from "node:test";
import {createServer as httpServer} from "node:http";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {execFileSync} from "node:child_process";
import {createServer} from "vite";
import vue from "@vitejs/plugin-vue";
import {createPinia, setActivePinia} from "pinia";
import {createRenderer, ssrContextKey} from "vue";
import "axios";

// Real producer routes/services and consumer modules. Only database records are fixtures.
const peer = resolve(process.env.CLASSWORKS_BACKEND_ROOT || "../NPClassworksKV");
const requirePeer = createRequire(resolve(peer, "package.json"));
const peerImport = file => import(pathToFileURL(resolve(peer, file)).href);
let vite, server, io, socket, client, store, realtime, broadcast, origin, pinia;
const restores = [];
const values = new Map();
const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key)};
const subjects = [{id: "math", schoolId: "school", name: "数学"}];
const workspace = {id: "class-a", name: "一班", type: "ADMIN_CLASS", isActive: true,
  term: {id: "term", schoolId: "school", status: "ACTIVE"}, subjectRules: [{subjectId: "math", deliveryMode: "ADMIN_CLASS"}]};
const binding = {id: "screen", schoolId: "school", isActive: true, tokenHash: createHash("sha256").update("test-screen-token").digest("hex"),
  lastUsedAt: new Date(), administrativeClass: workspace};
function stub(object, key, fn) { const old = object[key]; object[key] = fn; restores.push(() => { object[key] = old; }); }
async function until(check) {
  const end = Date.now() + 5000;
  while (!check()) { if (Date.now() > end) throw new Error("Contract event timed out"); await new Promise(resolve => setTimeout(resolve, 10)); }
}
before(async () => {
  console.log(`Contract pair frontend=${execFileSync("git", ["rev-parse", "HEAD"], {encoding: "utf8"}).trim()} backend=${execFileSync("git", ["-C", peer, "rev-parse", "HEAD"], {encoding: "utf8"}).trim()}`);
  // Prevent accidental access to any real database if an unstubbed query is introduced.
  process.env.DATABASE_URL = "postgresql://contract:contract@127.0.0.1:1/contract";
  const {prisma} = await peerImport("utils/prisma.js");
  stub(prisma.classroomScreenBinding, "findUnique", async ({where}) => where.tokenHash === binding.tokenHash ? binding : null);
  stub(prisma.subject, "findMany", async ({where}) => where.schoolId === "school" ? subjects : []);
  stub(prisma.workspace, "findMany", async ({where}) => (where.id?.in || []).filter(id => id !== "inactive").map(id => ({id})));
  const express = requirePeer("express");
  const app = express(); app.use(express.json());
  app.use("/api/v2/classroom-screens", (await peerImport("routes/v2/classroom-screens.js")).default);
  app.use("/api/v2/catalog", (await peerImport("routes/v2/academic-catalog.js")).default);
  app.use((error, _req, res, next) => { void next; res.status(error.statusCode || 500).json({code: error.code, message: error.message}); });
  server = httpServer(app);
  const backendSocket = await peerImport("utils/socket.js");
  backendSocket.initSocket(server); io = backendSocket.getIO(); broadcast = backendSocket.broadcastWorkspaceEvent;
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  globalThis.window = Object.assign(new globalThis.EventTarget(), {localStorage: storage, location: {origin}, setTimeout, clearTimeout, setInterval, clearInterval});
  globalThis.localStorage = storage; globalThis.sessionStorage = storage;
  globalThis.document = {visibilityState: "visible"};
  vite = await createServer({configFile: false, envFile: false, logLevel: "error", plugins: [vue()], resolve: {alias: {"@": resolve("src")}},
    server: {middlewareMode: true, hmr: false, watch: null}, appType: "custom", optimizeDeps: {noDiscovery: true, include: []}});
  client = await vite.ssrLoadModule("/src/utils/classworksV2Client.js");
  realtime = await vite.ssrLoadModule("/src/utils/socketClient.js");
  pinia = createPinia(); setActivePinia(pinia);
  const {useClassworksV2Store} = await vite.ssrLoadModule("/src/stores/classworksV2.js");
  store = useClassworksV2Store();
  client.saveClassroomScreenToken("test-screen-token");
});
after(async () => {
  store?.stopRealtime(); store?.stopScreenSync(); store?.$dispose();
  socket?.disconnect(); if (io) await new Promise(resolve => io.close(resolve));
  server?.closeAllConnections(); if (server?.listening) await new Promise(resolve => server.close(resolve));
  await vite?.close(); restores.reverse().forEach(fn => fn());
});

test("the actual screen-session and subject-catalog routes satisfy the frontend store and daily-status consumer", async () => {
  const raw = await client.classworksV2Api.classroomScreenSession();
  assert.equal(raw.binding.id, "screen"); assert.equal(raw.workspaces[0].id, "class-a");
  // Deliberately do not require optional producer fields such as session.subjects.
  await store.bootstrapClassroomScreen();
  assert.equal(store.screenSession.subjects[0].name, "数学");
  const {dailyHomeworkStatuses} = await vite.ssrLoadModule("/src/utils/noHomework.js");
  const rows = dailyHomeworkStatuses([], store.screenWorkspaces, store.screenSession.subjects, "2026-09-07");
  assert.equal(rows[0].subject, "数学"); assert.equal(rows[0].state, "unknown");
  client.saveClassroomScreenToken("invalid");
  await assert.rejects(client.classworksV2Api.classroomScreenSession(), error => error.response?.status === 401 && error.response.data.code === "SCREEN_TOKEN_INVALID");
  client.saveClassroomScreenToken("test-screen-token");
});

test("the actual course-options producer supplies every selected streamed subject to the status component", async t => {
  const {buildAdministrativeClassCourseOptions} = await peerImport("domain/academicCatalog.js");
  const catalog = buildAdministrativeClassCourseOptions({administrativeClass: workspace,
    subjectRules: [
      {subjectId: "chinese", deliveryMode: "ADMIN_CLASS", subject: {id: "chinese", name: "语文"}},
      {subjectId: "math", deliveryMode: "COURSE_GROUP", subject: subjects[0]},
    ], sourcedCourseGroups: [
      {id: "math-a", name: "数学A班", code: "MA", type: "COURSE_GROUP", subjectId: "math"},
      {id: "math-b", name: "数学B班", code: "MB", type: "COURSE_GROUP", subjectId: "math"},
    ]});
  store.feedAudience = "student";
  store.selection = {schoolId: "school", administrativeClassId: "class-a", courseGroupIds: {math: "math-a"}};
  store.administrativeClasses = [workspace];
  store.courseOptions = catalog;
  store.studentSubjects = [subjects[0], {id: "chinese", name: "语文"}];
  store.boardDate = "2026-09-10";
  const {default: component} = await vite.ssrLoadModule("/src/components/v2/HomeworkSubjectStatus.vue");
  let state;
  const renderer = createRenderer({createComment: () => ({}), insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null});
  const app = renderer.createApp({setup() { state = component.setup({}, {expose() {}}); return () => null; }});
  app.use(pinia); app.provide(ssrContextKey, {}); app.mount({});
  t.after(() => app.unmount());
  const {NO_HOMEWORK_TITLE, NO_HOMEWORK_CONTENT, NO_HOMEWORK_META} = await vite.ssrLoadModule("/src/utils/noHomework.js");
  const work = {id: "work", type: "ASSIGNMENT", status: "PUBLISHED", subjectId: "math", boardDate: store.boardDate,
    content: "练习", targets: [{workspaceId: "math-a"}]};
  const marker = {...work, id: "none", title: NO_HOMEWORK_TITLE, content: NO_HOMEWORK_CONTENT, contentJson: NO_HOMEWORK_META, isCertified: true};
  for (const [items, expected] of [[[], "unknown"], [[work], "assigned"], [[marker], "none"], [[work, marker], "conflict"]]) {
    store.feed = items;
    assert.deepEqual(state.rows.value.map(row => [row.subject, row.workspace, row.state]), [
      ["语文", "一班", "unknown"], ["数学", "数学A班", expected],
    ]);
    if (expected === "none") assert.equal(state.rows.value[1].confirmed, true);
  }
  store.selection = {...store.selection, courseGroupIds: {}};
  assert.deepEqual(state.rows.value.map(row => row.subject), ["语文"], "unselected course groups must remain absent");
  store.courseOptions = {...catalog, subjects: catalog.subjects.filter(item => item.subject.id === "math")};
  store.selection = {...store.selection, courseGroupIds: {math: "math-a"}};
  assert.equal(state.rows.value.length, 1, "a class with only streamed subjects still has status rows");
  store.feed = []; store.feedAudience = "screen";
});

test("the real Socket server accepts batched 21+ subscriptions and delivers events from the final batch after reconnect", async () => {
  socket = realtime.getSocket();
  await until(() => socket.connected);
  const joined = new Set(), errors = [], batches = [];
  socket.on("workspaces-joined", result => { batches.push(result.workspaceIds.length); result.workspaceIds.forEach(id => joined.add(id)); });
  socket.on("workspaces-join-error", error => errors.push(error));
  // Pin the producer's rejection behavior as well as the consumer's batching.
  socket.emit("join-workspaces", {workspaceIds: Array.from({length: 21}, (_, i) => `raw-${i}`)});
  await until(() => errors.length === 1);
  assert.equal(errors[0].reason, "invalid_workspace_count"); errors.length = 0;
  const ids = Array.from({length: 45}, (_, i) => `class-${i}`);
  const unsubscribe = realtime.onConnect(() => realtime.joinWorkspaces(ids));
  try {
    realtime.joinWorkspaces([...ids, " class-0 ", "", null]);
    await until(() => joined.size === 45);
    assert.deepEqual(batches.sort((a, b) => a - b), [5, 20, 20]); assert.deepEqual(errors, []);
    let received = 0; const off = realtime.on("publication.updated", () => received++);
    broadcast(["class-44"], "publication.updated", {publicationId: "work"});
    await until(() => received === 1);
    joined.clear(); batches.length = 0;
    socket.disconnect(); socket.connect();
    await until(() => joined.size === 45);
    broadcast(["class-44"], "publication.updated", {publicationId: "work"});
    await until(() => received === 2); off();
    realtime.leaveWorkspaces(ids);
    await until(() => [...io.of("/").sockets.values()].every(s => s.data.workspaceIds.size === 0));
    assert.deepEqual(errors, []);
    let rejected;
    socket.once("workspaces-joined", result => { rejected = result.rejectedWorkspaceIds; });
    realtime.joinWorkspaces(["class-0", "inactive"]);
    await until(() => Boolean(rejected));
    assert.deepEqual(rejected, ["inactive"]);
    const {getLocalDiagnostics} = await vite.ssrLoadModule("/src/utils/localDiagnostics.js");
    assert(getLocalDiagnostics().events.some(event => event.code === "WORKSPACE_JOIN_REJECTED"));
  } finally { unsubscribe(); }
});
