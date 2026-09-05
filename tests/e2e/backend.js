import {createServer} from "node:http";
import {Server} from "socket.io";
import {apiPort, origin} from "./environment.js";

export function startTestBackend(port = apiPort) {
  const school = {id: "school", code: "E2E", name: "浏览器测试学校", teacherAuthMode: "PERSONAL_PIN"};
  const term = {id: "term", schoolId: school.id, school, status: "ACTIVE"};
  const subject = {id: "math", name: "数学", code: "MATH"};
  const workspace = {id: "class-a", code: "C1", name: "高一一班", type: "ADMIN_CLASS", termId: term.id, term,
    gradeId: "grade", subjectRules: [{subjectId: subject.id, deliveryMode: "ADMIN_CLASS"}]};
  const account = {id: "teacher", name: "测试教师"};
  let items = [];
  let versionChecks = [];
  let roomJoins = 0;
  let socketEvents = 0;
  let uploadsAvailable = true;
  let uploadRequests = [];
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Classworks-Screen-Token,If-Match");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    const path = new URL(req.url, "http://localhost").pathname;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const reply = (data, status = 200) => {
      res.writeHead(status, {"Content-Type": "application/json", "Cache-Control": "no-store"});
      res.end(JSON.stringify(status >= 400 ? data : {data}));
    };
    if (path === "/__test/reset") {
      items = []; versionChecks = []; roomJoins = 0; socketEvents = 0;
      uploadsAvailable = true; uploadRequests = [];
      return reply({});
    }
    if (path === "/__test/state") return reply({items, versionChecks, roomJoins, socketEvents, uploadRequests});
    if (path === "/__test/upload-availability" && req.method === "POST") {
      uploadsAvailable = body.available === true;
      return reply({uploadsAvailable});
    }
    if (path === "/__test/concurrent-edit") {
      const item = items.find((candidate) => candidate.id === body.id);
      Object.assign(item, {content: body.content, revision: item.revision + 1, updatedAt: new Date().toISOString()});
      return reply(item);
    }
    if (path.startsWith("/api/v2/classroom-screens/") && req.headers["x-classworks-screen-token"] !== "screen-token") {
      return reply({message: "screen unauthorized"}, 401);
    }
    if (path === "/api/v2/setup/status") return reply({state: "COMPLETED"});
    if (path === "/accounts/oauth/providers") return reply([]);
    if (path === "/accounts/profile") return reply(account);
    if (path === "/accounts/logout") return reply({});
    if (path === "/accounts/preferences/teacher-targets") return reply({preferences: body.preferences || {favorites: [], recent: []}});
    if (path === "/api/v2/catalog/schools") return reply([school]);
    if (path === "/api/v2/catalog/terms/current") return reply(term);
    if (path === "/api/v2/catalog/grades") return reply([{id: "grade", name: "高一"}]);
    if (path === "/api/v2/catalog/workspaces") return reply([workspace]);
    if (path === "/api/v2/catalog/subjects") return reply([subject]);
    if (path.endsWith("/homework-settings")) return reply({});
    if (path === "/api/v2/me/workspaces") return reply([{role: "TEACHER", workspace}]);
    if (path === "/api/v2/me/schools") return reply([{role: "TEACHER", school}]);
    if (path === "/api/v2/classroom-screens/session") return reply({
      binding: {id: "screen-a", name: "测试大屏", administrativeClass: workspace}, workspaces: [workspace], subjects: [subject], homeworkSettings: {},
    });
    if (path === "/api/v2/classroom-screens/heartbeat") return reply({receivedAt: new Date().toISOString(), commands: []});
    if (path.endsWith("/notification-deliveries")) return reply([]);
    if (path === "/api/v2/publications/action-required") return reply({items: [], total: 0, summary: {}});
    if (path.endsWith("/feed")) return reply({items, generatedAt: new Date().toISOString()});
    if (["/api/v2/publications", "/api/v2/classroom-screens/publications"].includes(path)) {
      if (req.method === "GET") return reply({items});
      uploadRequests.push({clientRequestId: body.clientRequestId, available: uploadsAvailable});
      if (!uploadsAvailable) return reply({message: "Upload service temporarily unavailable"}, 503);
      const existing = body.clientRequestId && items.find((item) => item.clientRequestId === body.clientRequestId);
      if (existing) return reply(existing);
      const now = new Date().toISOString();
      const publication = {...body, id: `pub-${items.length + 1}`, type: "ASSIGNMENT", status: "PUBLISHED", revision: 1,
        isCertified: path === "/api/v2/publications", author: account, subject, priority: "NORMAL",
        publishAt: body.publishAt || now, updatedAt: now, createdAt: now,
        targets: [{workspaceId: workspace.id, workspace}]};
      items.push(publication);
      socketEvents++;
      io.to(workspace.id).emit("publication.created", {content: {publicationId: publication.id}});
      return reply(publication, 201);
    }
    const match = path.match(/^\/api\/v2\/(?:classroom-screens\/)?publications\/([^/]+)$/);
    if (match) {
      const item = items.find((candidate) => candidate.id === match[1]);
      if (!item) return reply({message: "not found"}, 404);
      if (req.method === "GET") return reply(item);
      versionChecks.push(req.headers["if-match"]);
      if (req.headers["if-match"] !== `"${item.revision}"`) return reply({
        code: "PUBLICATION_REVISION_CONFLICT", message: "版本冲突", details: {revision: item.revision, isCertified: item.isCertified},
      }, 409);
      Object.assign(item, body, {revision: item.revision + 1, updatedAt: new Date().toISOString()});
      socketEvents++;
      io.to(workspace.id).emit("publication.updated", {content: {publicationId: item.id}});
      return reply(item);
    }
    return reply({message: `Unimplemented fixture: ${req.method} ${path}`}, 404);
  });
  const io = new Server(server, {cors: {origin}});
  io.on("connection", (socket) => {
    socket.on("join-workspaces", ({workspaceIds}) => { socket.join(workspaceIds); roomJoins++; });
    socket.on("leave-workspaces", ({workspaceIds} = {}) => {
      for (const room of workspaceIds || [...socket.rooms]) if (room !== socket.id) socket.leave(room);
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({server, io})));
}
