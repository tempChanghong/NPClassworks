import {origin, api} from "./environment.js";

// Production Vue page and real buttons, with explicit admin API fixtures.
// Backend authorization remains covered by the separate backend integration tests.
export async function openAdmin(browser, width, role = "ADMIN", settings = {}, section = "screens", prepare = async () => {}) {
  const context = await browser.newContext({viewport: {width, height: 1000}, serviceWorkers: "block",
    storageState: {cookies: [], origins: [{origin, localStorage: [
      {name: "classworks-v2-access-token", value: "admin-token"},
      {name: "classworks-v2-refresh-token", value: "admin-refresh"},
      {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "teacher"})},
    ]}]}});
  const writes = [], errors = [];
  const school = {id: "school", name: "测试学校", code: "E2E", terms: [{id: "term", name: "当前学期", status: "ACTIVE"}]};
  const classroom = {id: "class-a", name: "一班", code: "C1", type: "ADMIN_CLASS", members: [], pendingInvitations: []};
  let devices = [{id: "screen-a", name: "一班大屏", loginCode: "class-a", administrativeClassId: "class-a",
    administrativeClass: classroom, isActive: true, dutyState: "ONLINE"}];
  const accounts = section === "accounts" ? [
    {id: "teacher", name: "本人", username: "self", schoolRole: role, disabled: false, workspaces: []},
    {id: "other", name: "教师甲", username: "teacher-a", disabled: false, workspaces: []},
  ] : [];
  const reply = (route, data) => route.fulfill({json: {data}});
  await context.route(`${api}/accounts/local/status`, r => reply(r, {bootstrapRequired: false}));
  await context.route(url => url.origin === api && url.pathname === "/api/v2/me/schools", r => reply(r, [{role, school}]));
  await context.route(`${api}/api/v2/admin/**`, async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() !== "GET") {
      const body = req.postDataJSON(); writes.push({path, method: req.method(), body});
      if (path.endsWith("/homework-settings")) { settings = body; return reply(route, settings); }
      if (path.endsWith("/local-admins")) {
        accounts.push({id: "new-admin", ...body, schoolRole: body.role, disabled: false, workspaces: []});
        return reply(route, accounts.at(-1));
      }
      if (path.includes("/local-accounts/") && req.method() === "PATCH") {
        Object.assign(accounts.find(account => path.endsWith(`/${account.id}`)), body);
        return reply(route, {});
      }
      if (path.endsWith("classroom-screen-accounts")) {
        devices.push({id: "new-screen", ...body, administrativeClass: classroom, isActive: true, dutyState: "NOT_ACTIVATED"});
        return reply(route, devices.at(-1));
      }
      if (req.method() === "PATCH") devices = devices.map(d => path.endsWith(d.id) ? {...d, ...body} : d);
      return reply(route, {});
    }
    if (path.endsWith("/classroom-screens")) return reply(route, devices);
    if (path.endsWith("/workspace-memberships")) return reply(route, {workspaces: [classroom]});
    if (path.endsWith("/local-accounts")) return reply(route, accounts);
    if (path.endsWith("/homework-settings")) return reply(route, settings);
    if (path.endsWith("/staff-responsibilities")) return reply(route, {policy: {}, people: [], grades: [], administrativeClasses: []});
    return route.fulfill({status: 404, json: {message: `Unconfigured admin fixture: ${path}`}});
  });
  await prepare(context);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/classworks-admin?section=${section}&school=school&term=term`);
  return {context, page, writes, errors};
}
