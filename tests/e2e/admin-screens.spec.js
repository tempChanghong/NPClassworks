import {Buffer} from 'node:buffer';
import {test, expect} from "@playwright/test";
import {readFile, writeFile} from "node:fs/promises";
import {origin, api} from "./environment.js";
import {randomUUID} from "node:crypto";
import {defaultStudySettings} from '../../src/utils/npepStudySettings.js';

for (const width of [1440,390]) {
  test(`NPEP study photos explicit preview download and delete at ${width}px`,async({browser})=>{
    let jpeg, deleted=false, reads=0;const id=randomUUID();
    const photo={eventId:id,classId:'class-a',capturedAt:'2026-10-11T12:00:00.000Z',expiresAt:'2026-11-10T12:00:00.000Z',reason:'Noise',unit:'Dbfs',level:-20,high:-30};
    const {page,context,errors}=await openAdmin(browser,width,'OWNER',{},'npep',async context=>{
      await context.route(`${api}/api/v2/npep/**`,async route=>{
        const req=route.request(),path=new URL(req.url()).pathname;
        const body=req.method()==='POST'?req.postDataJSON():null;
        const reply=data=>route.fulfill({json:{protocolVersion:req.headers()['x-npep-version'],requestId:body?.requestId||req.headers()['x-request-id'],serverTime:new Date().toISOString(),data}});
        if(path.endsWith('/info'))return reply({supportedCapabilities:['device.status']});
        if(path.endsWith('/devices'))return reply({items:[],nextCursor:null});
        if(path.endsWith('/study-settings'))return reply({termId:'term',terms:[{id:'term',name:'当前学期'}],grades:[],classes:[],settings:[]});
        if(path.endsWith('/seating/catalog'))return reply({termId:'term',classes:[{id:'class-a',name:'一班'}]});
        if(path.endsWith('/study-photos'))return reply({items:deleted?[]:[photo],cursor:null});
        if(path.endsWith('/image')) {reads++;return route.fulfill({contentType:'image/jpeg',body:jpeg,headers:{'Cache-Control':'private, no-store'}});}
        if(path.endsWith('/delete')) {deleted=true;return reply({eventId:id,state:'Deleted'});}
        return route.fulfill({status:404,json:{error:{code:'NOT_FOUND'}}});
      });
    });
    try {
      jpeg=Buffer.from(await page.evaluate(()=>{
        const c=document.createElement('canvas');c.width=640;c.height=360;
        const g=c.getContext('2d');g.fillStyle='#e4e7eb';g.fillRect(0,0,640,360);g.fillStyle='#263449';g.font='28px sans-serif';g.fillText('合成自习照片 / TEST ONLY',50,100);
        return c.toDataURL('image/jpeg',.6).split(',')[1];
      }),'base64');
      await navigateAdmin(page,'噪音监测');const panel=page.locator('.study-photos');
      await panel.locator('.v-select').click();await page.getByRole('option',{name:'一班',exact:true}).click();
      expect(reads).toBe(0);await panel.getByRole('button',{name:'查询照片',exact:true}).click();await expect(panel).toContainText('连续超限');
      expect(reads).toBe(0);await panel.getByRole('button',{name:'查看',exact:true}).click();
      const preview=page.getByRole('dialog').filter({hasText:'自习照片 ·'});await expect(preview.locator('img')).toBeVisible();
      await expect.poll(()=>preview.locator('img').evaluate(img=>img.naturalWidth)).toBe(640);
      const download=page.waitForEvent('download');await preview.getByRole('button',{name:'下载',exact:true}).click();
      expect((await download).suggestedFilename()).toBe('study-'+id+'.jpg');
      await page.screenshot({path:`test-results/study-photos-${width}.png`,fullPage:true,animations:'disabled'});
      await preview.getByRole('button',{name:'关闭',exact:true}).click();await panel.getByRole('button',{name:'删除',exact:true}).click();
      const confirmation=page.getByRole('dialog').filter({hasText:'删除这张自习照片？'});
      await confirmation.getByRole('button',{name:'删除',exact:true}).click();await expect(panel).toContainText('当前班级没有可查看的照片');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

// Production Vue page and real buttons, with explicit admin API fixtures.
// Backend authorization remains covered by the separate backend integration tests.
async function navigateAdmin(page, title) {
  if (title === "NPEP") title = "大屏互联";
  const report = title === "噪音监测";
  if (report || title === "自习设置") title = "自习监测";
  if (page.viewportSize().width >= 960) {
    await page.locator('.admin-navigation').getByText(title, {exact: true}).click();
  } else {
    await page.locator('.admin-mobile-page-switcher .v-select').click();
    await page.getByRole('option', {name: `${["大屏互联", "自习监测", "自习座位表"].includes(title) ? "NPEP" : "日常管理"} · ${title}`, exact: true}).click();
  }
  if (title === '自习监测') await page.locator('.npep-study-navigation').getByRole('button', {name: report ? '报告与照片' : '自习设置', exact: true}).click();
}

async function openAdmin(browser, width, role = "ADMIN", settings = {}, section = "screens", prepare = async () => {}) {
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

test("student roster preserves IDs, previews imports, retains conflict drafts and guards navigation", async ({browser}) => {
  let revision = "v1", students = [{id: "s1", name: "张三", studentNumber: "01"}, {id: "s2", name: "李四", studentNumber: "02"}];
  const writes = [];
  const {context, page, errors} = await openAdmin(browser, 1440, "ADMIN", {}, "students", async context => {
    await context.route(`${api}/api/v2/admin/schools/school/academic-structure*`, route => route.fulfill({json: {data: {
      grades: [{id: "grade", name: "高一"}], administrativeClasses: [{id: "class-a", name: "一班", gradeId: "grade", isActive: true}],
    }}}));
    await context.route(`${api}/api/v2/admin/schools/school/administrative-classes/class-a/students`, async route => {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON(); writes.push(body);
        if (body.expectedRevision !== revision) return route.fulfill({status: 409, json: {message: "名单已被其他管理员修改，输入已保留"}});
        students = body.students.map((s, index) => ({...s, id: s.id || `new-${index}`})); revision = "v2";
      }
      return route.fulfill({json: {data: {students, revision}}});
    });
  });
  try {
    const manager = page.locator(".class-roster-manager");
    await expect(manager.getByLabel("姓名 1", {exact: true})).toHaveValue("张三");
    await manager.getByLabel("姓名 1", {exact: true}).fill("张小三");
    await manager.getByRole("button", {name: "批量粘贴", exact: true}).click();
    await manager.getByLabel("粘贴名单", {exact: true}).fill("03\t王五");
    await manager.getByRole("button", {name: "预览导入", exact: true}).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("张三 → 01 张小三");
    await expect(dialog).toContainText("新增：03 王五");
    await dialog.getByRole("button", {name: "确认保存名单", exact: true}).click();
    await expect(manager).toContainText("名单已保存");
    expect(writes[0].students.map(s => s.id)).toEqual(["s1", "s2", undefined]);
    await manager.getByLabel("姓名 1", {exact: true}).fill("未提交修改");
    revision = "remote-v3";
    await manager.getByRole("button", {name: "预览并保存", exact: true}).click();
    await dialog.getByRole("button", {name: "确认保存名单", exact: true}).click();
    await expect(manager).toContainText("名单已被其他管理员修改");
    await expect(manager.getByLabel("姓名 1", {exact: true})).toHaveValue("未提交修改");
    expect(students[0].name).toBe("张小三");
    await page.getByRole("button", {name: "返回教师工作台"}).click();
    // The roster preview may still be leaving while the navigation guard opens.
    await expect(page.getByRole("dialog").filter({hasText: "放弃未保存的修改？"})).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

for (const mode of ["append", "replace"]) {
  test(`student roster ${mode} import preserves spreadsheet cells and rejects ambiguous names before saving`, async ({browser}) => {
    let students = [{id: "s1", name: "欧阳 小明", studentNumber: ""}];
    const writes = [];
    const {context, page, errors} = await openAdmin(browser, 1440, "ADMIN", {}, "students", async context => {
      await context.route(`${api}/api/v2/admin/schools/school/academic-structure*`, route => route.fulfill({json: {data: {
        grades: [{id: "grade", name: "高一"}], administrativeClasses: [{id: "class-a", name: "一班", gradeId: "grade", isActive: true}],
      }}}));
      await context.route(`${api}/api/v2/admin/schools/school/administrative-classes/class-a/students`, route => {
        if (route.request().method() === "PUT") {
          const body = route.request().postDataJSON(); writes.push(body);
          students = body.students.map((student, index) => ({...student, id: student.id || `new-${index}`}));
        }
        return route.fulfill({json: {data: {students, revision: "v1"}}});
      });
    });
    try {
      const manager = page.locator(".class-roster-manager");
      await expect(manager.getByLabel("姓名 1", {exact: true})).toHaveValue("欧阳 小明");
      await manager.getByRole("button", {name: "批量粘贴", exact: true}).click();
      if (mode === "replace") {
        await manager.locator(".v-select").filter({hasText: "导入方式"}).click();
        await page.getByRole("option", {name: "整班替换（未列出的学生将移出）", exact: true}).click();
      }
      const paste = manager.getByLabel("粘贴名单", {exact: true});
      for (const [text, message] of [["01\t张三\n03\t", "第 2 行：姓名不能为空"], ["\t张三\n\t张三", "同名且未填写学号"]]) {
        await paste.fill(text);
        await manager.getByRole("button", {name: "预览导入", exact: true}).click();
        await expect(manager.locator(".v-alert").filter({hasText: message})).toBeVisible();
        await expect(paste).toHaveValue(text);
        await expect(manager.locator(".roster-row")).toHaveCount(1);
        await expect(manager.getByLabel("姓名 1", {exact: true})).toHaveValue("欧阳 小明");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(writes).toHaveLength(0);
      }
      await paste.fill("\t欧阳 小明\n01\t张三\n02\t张三");
      await manager.getByRole("button", {name: "预览导入", exact: true}).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("新增：01 张三");
      await expect(dialog).toContainText("新增：02 张三");
      await dialog.getByRole("button", {name: "确认保存名单", exact: true}).click();
      await expect(manager).toContainText("名单已保存");
      expect(writes).toHaveLength(1);
      expect(writes[0].students).toEqual([{id: "s1", name: "欧阳 小明", studentNumber: ""}, {name: "张三", studentNumber: "01"}, {name: "张三", studentNumber: "02"}]);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

test("NPEP approval retries retain identity; device pagination, stale observations and revocation use real controls", async ({browser}) => {
  const pairingId = randomUUID(), deviceId = randomUUID(), requests = [], approvalIds = [];
  let approved = false, failList = false, failApproval = true, revoked = false;
  const expiresAt = new Date(Date.now() + 600000).toISOString();
  const setup = await openAdmin(browser, 1100, "ADMIN", {}, "screens", async context => {
    await context.route(`${api}/api/v2/npep/**`, async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      const body = request.method() === "POST" ? request.postDataJSON() : null;
      requests.push(path);
      expect(request.headers().authorization).toBe("Bearer admin-token");
      // The manager also loads N4 school schedules; keep their protocol distinct
      // from the N1 pairing requests whose retries this case exercises.
      if (path === "/api/v2/npep/schools/school/noise-schedules") {
        expect(request.method()).toBe("GET");
        expect(request.headers()["x-npep-version"]).toBe("0.7");
        return route.fulfill({json: {protocolVersion: "0.7", requestId: request.headers()["x-request-id"], serverTime: new Date().toISOString(),
          data: {termId: "term", terms: [{id: "term", name: "当前学期"}], grades: [], classes: [], policies: [], executionEnabled: true}}});
      }
      if(path.includes('/class-management/')) {
        expect(request.headers()['x-npep-version']).toBe('0.16');
        return route.fulfill({json:{protocolVersion:'0.16',requestId:request.headers()['x-request-id'],serverTime:new Date().toISOString(),
          data:{revision:1,configured:true,enabled:true}}});
      }
      if(path.endsWith('/equipment')) {
        expect(request.headers()['x-npep-version']).toBe('0.16');
        return route.fulfill({json:{protocolVersion:'0.16',requestId:request.headers()['x-request-id'],data:{
          policy:{revision:0,locked:false,microphoneId:null,cameraId:null},inventory:null}}});
      }
      expect(request.headers()["x-npep-version"]).toBe("0.1");
      const reply = data => route.fulfill({json: {protocolVersion: "0.1", requestId: body?.requestId || request.headers()["x-request-id"], serverTime: new Date().toISOString(), data}});
      if (path.endsWith("/info")) return reply({supportedCapabilities: ["device.status"]});
      if (path.endsWith("/resolve")) {
        expect(body.userCode).toBe("ABCD2345");
        return reply({pairingId, deviceName: "教室本地工具", appVersion: "1.0", expiresAt, requestedCapabilities: ["device.status"]});
      }
      if (path.endsWith("/approve")) {
        approvalIds.push(body.requestId); expect(body.capabilities).toEqual(["device.status"]); expect(body.screenBindingId).toBe("screen-a");
        if (failApproval) { failApproval = false; return route.fulfill({status: 503, json: {error: {code: "TEMPORARILY_UNAVAILABLE"}}}); }
        approved = true;
        return reply({pairingId, schoolName: "测试学校", administrativeClassName: "一班", screenBindingName: "一班大屏", expiresAt});
      }
      if (path.endsWith("/revoke")) { expect(body.expectedBindingRevision).toBe(2); revoked = true; return reply({deviceId, state: "REVOKED"}); }
      if (path.endsWith("/devices")) {
        if (failList) return route.fulfill({status: 503, json: {error: {code: "TEMPORARILY_UNAVAILABLE"}}});
        const item = {deviceId, deviceName: "教室本地工具", screenBindingId: "screen-a", bindingRevision: 2, state: revoked ? "REVOKED" : "ACTIVE",
          lastSeenAt: new Date(Date.now() - 90000).toISOString(), credentialExpiresAt: new Date(Date.now() + 86400000).toISOString(), connectivity: "OFFLINE",
          status: {appVersion: "1.0", mode: "EXAM", recording: "IDLE", automaticRecording: "ENABLED"}};
        return reply({items: approved ? [url.searchParams.has("cursor") ? {...item, deviceId: "older", deviceName: "另一台工具"} : item] : [], nextCursor: approved && !url.searchParams.has("cursor") ? "next-page" : null});
      }
      return route.fulfill({status: 404, json: {error: {code: "NOT_FOUND"}}});
    });
  });
  const {page, context, errors} = setup;
  try {
    await expect(page.locator(".admin-navigation").getByText("NPEP", {exact: true})).toBeVisible();
    expect(requests).toEqual([]);
    await navigateAdmin(page, "NPEP");
    const panel = page.locator(".npep-device-manager");
    await expect(panel).toContainText("当前没有已登记");
    const overviewY = (await panel.locator(".npep-overview").boundingBox()).y;
    const configurationY = (await panel.locator(".npep-configuration").boundingBox()).y;
    expect(overviewY).toBeLessThan(configurationY);
    await expect(panel.getByLabel("8 位配对短码")).toBeHidden();
    const screenPairingToggle = panel.locator(".npep-configuration").getByRole("button", {name: /班级大屏网页配对/});
    await panel.getByRole("button", {name: "前往班级大屏网页配对"}).click();
    await expect(panel.getByText("班级大屏预授权")).toBeVisible();
    await screenPairingToggle.click();
    const legacyToggle = panel.getByRole("button", {name: /旧版桌面短码配对/});
    await legacyToggle.click();
    await panel.getByLabel("8 位配对短码").fill("abcd-2345");
    await legacyToggle.click();
    await expect(panel.getByLabel("8 位配对短码")).toBeHidden();
    await legacyToggle.click();
    await expect(panel.getByLabel("8 位配对短码")).toHaveValue("abcd-2345");
    await panel.getByRole("button", {name: "核对配对申请", exact: true}).click();
    await expect(panel.locator(".npep-candidate")).toContainText("教室本地工具");
    await panel.locator(".v-select").filter({hasText: "关联的大屏与班级"}).click();
    await page.getByRole("option", {name: "一班大屏 · 一班", exact: true}).click();
    const approve = panel.getByRole("button", {name: "批准并等待现场确认", exact: true});
    await expect(approve).toBeDisabled();
    await panel.getByLabel("已核对设备、学校和班级，同意配对并授权学校互联功能").check();
    await approve.click();
    await expect(panel).toContainText("互联服务未启用或暂时不可用");
    await approve.click();
    await expect(panel).toContainText("批准已保存");
    expect(approvalIds).toHaveLength(2); expect(approvalIds[0]).toBe(approvalIds[1]);
    await legacyToggle.click();
    await panel.getByRole("button", {name: "刷新互联设备", exact: true}).click();
    await expect(panel.locator(".npep-device")).toHaveCount(1);
    await expect(panel.getByRole("button", {name: "刷新互联设备", exact: true})).toBeEnabled();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await panel.screenshot({path: "test-results/npep-manager-after.png", animations: "disabled"});
    await page.setViewportSize({width: 390, height: 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await panel.screenshot({path: "test-results/npep-manager-mobile.png", animations: "disabled"});
    await page.setViewportSize({width: 1100, height: 900});
    await expect(panel.locator(".npep-device")).toContainText("已失联");
    await expect(panel.locator(".npep-device")).toContainText("上次观测模式：考试模式");
    await expect(panel.locator(".npep-device")).toContainText("录制状态：未录制");
    await panel.getByRole("button", {name: "加载更多互联设备"}).click();
    await expect(panel.locator(".npep-device")).toHaveCount(2);
    await expect(panel.locator(".npep-device-details")).toHaveCount(0);
    await panel.getByRole("button", {name: "查看设备详情", exact: true}).first().click();
    await expect(panel.locator(".npep-device-details")).toHaveCount(1);
    failList = true;
    await panel.getByRole("button", {name: "刷新互联设备", exact: true}).click();
    await expect(panel).toContainText("刷新未完成");
    await expect(panel.locator(".npep-device")).toHaveCount(2);
    await expect(panel.getByRole("button", {name: "撤销互联授权", exact: true}).first()).toBeDisabled();
    failList = false;
    await panel.getByRole("button", {name: "刷新互联设备", exact: true}).click();
    await panel.getByRole("button", {name: "撤销互联授权", exact: true}).first().click();
    expect(revoked).toBe(false);
    await page.getByRole("button", {name: "确认撤销互联授权", exact: true}).click();
    await expect(panel.locator(".npep-device")).toContainText("已撤销");
    expect(revoked).toBe(true); expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('NPEP school overview counts all pages, filters on server and keeps stale observations explicit', async ({browser}) => {
  let fail = false, forbidden = false;
  const requests = [];
  const all = Array.from({length: 42}, (_, index) => ({
    deviceId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    deviceName: index === 3 ? '三号工具' : `教室工具 ${index}`, screenBindingId: 'screen-a', bindingRevision: 1,
    administrativeClassId: 'class-a', screenBindingName: '一班大屏', administrativeClassName: '一班', bindingChanged: false,
    state: index === 41 ? 'REVOKED' : 'ACTIVE', connectivity: index < 35 ? 'ONLINE' : index < 40 ? 'OFFLINE' : 'UNKNOWN',
    lastSeenAt: index === 40 ? null : new Date(Date.now() - (index < 35 ? 1000 : 120000)).toISOString(),
    credentialExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    issues: index >= 35 && index < 41 ? [index === 40 ? 'UNREPORTED' : 'OFFLINE'] : [],
    status: {appVersion: 'preview', mode: 'DAILY', recording: 'IDLE', automaticRecording: 'ENABLED',
      classIsland: {connection: 'READY'}, examAware: {connection: 'DISCONNECTED'}},
  }));
  const {page, context, errors} = await openAdmin(browser, 1100, 'ADMIN', {}, 'screens', async context => {
    await context.route(`${api}/api/v2/npep/**`, async route => {
      const req = route.request(), url = new URL(req.url()); requests.push(url);
      const reply = data => route.fulfill({json: {protocolVersion: '0.1', requestId: req.headers()['x-request-id'], serverTime: new Date().toISOString(), data}});
      if (url.pathname.endsWith('/info')) return reply({});
      if (!url.pathname.endsWith('/device-overview')) return route.fulfill({status: 404, json: {error: {code: 'NOT_FOUND'}}});
      if (forbidden) return route.fulfill({status: 403, json: {error: {code: 'SCHOOL_ADMIN_REQUIRED'}}});
      if (fail) return route.fulfill({status: 503, json: {error: {code: 'TEMPORARILY_UNAVAILABLE'}}});
      const filter = url.searchParams.get('filter'), search = url.searchParams.get('search');
      const selected = all.filter(item => (filter === 'ALL' || filter === 'ATTENTION' && item.issues.length || filter === 'ONLINE' && item.connectivity === 'ONLINE' || filter === 'INACTIVE' && item.state !== 'ACTIVE') &&
        [item.deviceName, item.screenBindingName, item.administrativeClassName].some(text => text.includes(search || '')));
      const remaining = selected.filter(item => !url.searchParams.has('cursor') || item.deviceId > url.searchParams.get('cursor'));
      const items = remaining.slice(0, 20);
      return reply({asOf: new Date().toISOString(), summary: {total: 42, active: 41, online: 35, offline: 5, unreported: 1, attention: 6, inactive: 1},
        matchedTotal: selected.length, items, nextCursor: remaining.length > 20 ? items.at(-1).deviceId : null});
    });
  });
  try {
    await navigateAdmin(page, "NPEP");
    const panel = page.locator('.npep-device-manager'), overview = panel.locator('.device-operations');
    await expect(panel.locator('.npep-device')).toHaveCount(20);
    await expect(overview).toContainText('共 42 台匹配，已加载 20 台');
    const downloaded = page.waitForEvent('download');
    await overview.getByRole('button', {name: '导出诊断摘要'}).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(/^NPClassworks-NPEP-diagnostics-.*\.json$/);
    const diagnostic = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(diagnostic.kind).toBe('npep-school-overview-diagnostics');
    expect(diagnostic.summary.total).toBe(42);
    expect(diagnostic.exportedCount).toBe(20);
    expect(diagnostic.hasMore).toBe(true);
    expect(diagnostic.stale).toBe(false);
    expect(JSON.stringify(diagnostic)).not.toContain('教室工具');
    expect(JSON.stringify(diagnostic)).not.toContain('credentialExpiresAt');
    await expect(overview.getByRole('button', {name: /全部登记/})).toContainText('42');
    await panel.getByRole('button', {name: '加载更多互联设备'}).click();
    await expect(panel.locator('.npep-device')).toHaveCount(40);
    await expect(overview.getByRole('button', {name: /全部登记/})).toContainText('42');
    await overview.getByRole('button', {name: /待检查/}).click();
    await expect(panel.locator('.npep-device')).toHaveCount(6);
    await expect(overview).toContainText('共 6 台匹配');
    expect(requests.at(-1).searchParams.get('filter')).toBe('ATTENTION');
    expect(requests.at(-1).searchParams.has('cursor')).toBe(false);
    await overview.getByRole('button', {name: /全部登记/}).click();
    await overview.getByRole('textbox', {name: /搜索设备、班级或大屏名称/}).fill('三号');
    await overview.getByRole('button', {name: '搜索', exact: true}).click();
    await expect(panel.locator('.npep-device')).toHaveCount(1);
    await expect(panel.locator('.npep-device')).toContainText('三号工具');
    await expect(overview.getByRole('button', {name: /全部登记/})).toContainText('42');
    await overview.getByRole('textbox', {name: /搜索设备、班级或大屏名称/}).fill('找不到');
    await overview.getByRole('button', {name: '搜索', exact: true}).click();
    await expect(panel).toContainText('没有匹配当前筛选');
    await expect(panel.getByRole('button', {name: '前往班级大屏网页配对'})).toHaveCount(0);
    await overview.getByRole('textbox', {name: /搜索设备、班级或大屏名称/}).fill('');
    await overview.getByRole('button', {name: /待检查/}).click();
    await expect(panel.locator('.npep-device')).toHaveCount(6);
    await expect(panel.getByRole('button', {name: '刷新互联设备', exact: true})).toBeEnabled();
    await page.mouse.move(0, 0);
    await page.screenshot({path: 'test-results/device-overview-desktop.png', fullPage: true, animations: 'disabled'});
    await page.setViewportSize({width: 390, height: 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await overview.screenshot({path: 'test-results/device-overview-mobile.png', animations: 'disabled'});
    await page.evaluate(() => localStorage.setItem('Classworks_settings', JSON.stringify({'theme.mode': 'light'})));
    await page.reload();
    await expect(page.locator('.v-application')).toHaveClass(/v-theme--light/);
    await navigateAdmin(page, "NPEP");
    await overview.getByRole('button', {name: /待检查/}).click();
    await expect(panel.locator('.npep-device')).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await overview.screenshot({path: 'test-results/device-overview-mobile-light.png', animations: 'disabled'});
    fail = true; await panel.getByRole('button', {name: '刷新互联设备', exact: true}).click();
    await expect(panel).toContainText('刷新未完成'); await expect(overview).toContainText('观测已过时');
    const staleDownload = page.waitForEvent('download');
    await overview.getByRole('button', {name: '导出诊断摘要'}).click();
    const staleBundle = JSON.parse(await readFile(await (await staleDownload).path(), 'utf8'));
    expect(staleBundle.stale).toBe(true);
    expect(staleBundle.exportedCount).toBe(6);
    await expect(panel.locator('.npep-device')).toHaveCount(6);
    await expect(panel.getByRole('button', {name: '考试模式', exact: true}).first()).toBeDisabled();
    forbidden = true; await panel.getByRole('button', {name: '刷新互联设备', exact: true}).click();
    await expect(panel).toContainText('没有这所学校的管理权限');
    await expect(overview).toHaveCount(0); await expect(panel.locator('.npep-device')).toHaveCount(0);
    await expect(panel.getByRole('button', {name: '导出诊断摘要'})).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("NPEP ignores a late short-code response after the panel closes", async ({browser}) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let entered = false;
  const {page, context, errors} = await openAdmin(browser, 390, "ADMIN", {}, "screens", async context => {
    await context.route(`${api}/api/v2/npep/**`, async route => {
      const request = route.request(), body = request.method() === "POST" ? request.postDataJSON() : null;
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/device-overview')) return route.fulfill({status: 404, json: {error: {code: 'NOT_FOUND'}}});
      if (path.endsWith("/resolve")) { entered = true; await held; }
      await route.fulfill({json: {protocolVersion: "0.1", requestId: body?.requestId || request.headers()["x-request-id"], serverTime: new Date().toISOString(),
        data: path.endsWith("/devices") ? {items: [], nextCursor: null} : path.endsWith("/resolve") ? {pairingId: randomUUID(), deviceName: "迟到的旧设备", expiresAt: new Date(Date.now() + 600000).toISOString()} : {supportedCapabilities: ["device.status"]}}}).catch(() => {});
    });
  });
  try {
    await navigateAdmin(page, "NPEP");
    await expect(page.locator(".npep-device-manager")).toContainText("当前没有已登记");
    await page.locator(".npep-device-manager").getByRole("button", {name: /旧版桌面短码配对/}).click();
    await page.getByLabel("8 位配对短码").fill("ABCD2345");
    await page.getByRole("button", {name: "核对配对申请", exact: true}).click();
    await expect.poll(() => entered).toBe(true);
    await navigateAdmin(page, "大屏设备");
    release();
    await navigateAdmin(page, "NPEP");
    await expect(page.locator(".npep-device-manager")).toContainText("当前没有已登记");
    await expect(page.locator(".npep-candidate")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { release(); await context.close(); }
});

for (const width of [1440, 390]) {
  test(`NPEP has one study entry, preserves unified drafts and never edits legacy schedules at ${width}px`, async ({browser}) => {
    const requests = [], saved = [];
    const settings = defaultStudySettings(); settings.schedule.effectiveFrom = '2026-10-12';
    settings.schedule.rules[0].days = [1, 2, 3, 4, 5];
    const policy = {mode: 'Override', settings};
    let currentPolicy = JSON.parse(JSON.stringify(policy)), revision = 1;
    const {page, context, errors} = await openAdmin(browser, width, 'OWNER', {}, 'screens', async context => {
      await context.route(`${api}/api/v2/npep/**`, async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        const body = request.method() === 'POST' ? request.postDataJSON() : null;
        requests.push({path, method: request.method()});
        const reply = data => route.fulfill({json: {protocolVersion: request.headers()['x-npep-version'],
          requestId: body?.requestId || request.headers()['x-request-id'], serverTime: new Date().toISOString(), data}});
        if (path.endsWith('/info')) return reply({supportedCapabilities: ['device.status']});
        if (path.endsWith('/device-overview')) return route.fulfill({status: 404, json: {error: {code: 'NOT_FOUND'}}});
        if (path.endsWith('/devices')) return reply({items: [{deviceId: 'native-a', deviceName: '一班原生设备', state: 'ACTIVE',
          screenBindingId: 'screen-a', connectivity: 'ONLINE', credentialExpiresAt: new Date(Date.now() + 86400000).toISOString(),
          lastSeenAt: new Date().toISOString()}], nextCursor: null});
        if (path.endsWith('/noise-display-settings')) return reply({settings: [], classes: [{id: 'class-a', gradeId: 'grade'}]});
        if (path.endsWith('/study-settings/preview')) return reply({baseRevision: revision, previewFingerprint: 'fixture-preview',
          totalClasses: 1, changedClasses: 1, pairedDevices: 1, items: []});
        if (path.endsWith('/study-settings')) {
          if (body) { saved.push(body); currentPolicy = body.policy; revision++; return reply({revision, previewFingerprint: 'fixture-preview',
            totalClasses: 1, changedClasses: 1, pairedDevices: 1, items: []}); }
          return reply({termId: 'term', terms: [{id: 'term', name: '当前学期'}],
            grades: [{id: 'grade', name: '高二'}], classes: [{id: 'class-a', name: '一班', gradeId: 'grade'}],
            settings: [{targetType: 'GRADE', targetId: 'grade', policy: currentPolicy, revision}]});
        }
        if (path.endsWith('/seating/catalog')) return reply({termId: 'term', classes: [{id: 'class-a', name: '一班'}]});
        if (path.endsWith('/noise-schedules/preview')) return reply({baseRevision: revision, totalClasses: 1,
          changedClasses: 1, pairedDevices: 1, items: []});
        if (path.endsWith('/noise-schedules')) {
          expect(request.headers()['x-npep-version']).toBe('0.7');
          if (body) {
            saved.push(body); currentPolicy = body.policy; revision++;
            return reply({revision, baseRevision: revision - 1, executionEnabled: true, items: [],
              totalClasses: 1, changedClasses: 1, pairedDevices: 1});
          }
          return reply({termId: 'term', terms: [{id: 'term', name: '当前学期'}],
            grades: [{id: 'grade', name: '高二'}], classes: [{id: 'class-a', name: '一班', gradeId: 'grade'}],
            policies: [{targetType: 'GRADE', targetId: 'grade', policy: currentPolicy, revision}], executionEnabled: true});
        }
        if (path.endsWith('/noise-schedule')) return reply({supported: true, online: false, applied: true,
          policy: {source: 'Grade', version: 'v1'}, status: {reason: 'Scheduled', owner: 'Scheduled'}, sessions: []});
        if (path.endsWith('/noise')) return reply({reports: []});
        return route.fulfill({status: 404, json: {error: {code: 'NOT_FOUND'}}});
      });
    });
    try {
      await expect(page.getByRole('button', {name: '刷新大屏列表', exact: true})).toBeVisible();
      expect(requests).toEqual([]);
      await expect(page.getByRole('button', {name: '打开 NPEP 设备互联'})).toHaveCount(0);
      await navigateAdmin(page, 'NPEP');
      const panel = page.locator('.npep-device-manager');
      await expect(panel.locator('.npep-device')).toHaveCount(1);
      await expect(page).toHaveURL(/section=npep/);
      expect(requests.some(item => item.path.endsWith('/noise-schedules'))).toBe(false);
      await page.screenshot({path: `test-results/npep-navigation-${width}.png`, fullPage: true, animations: 'disabled'});
      await navigateAdmin(page, '噪音监测');
      await expect(panel.locator('.study-reports')).toBeVisible();
      await expect(panel.locator('.study-photos')).toBeVisible();
      await expect(panel.locator('.noise-schedule-editor')).toHaveCount(0);
      expect(requests.some(item => item.path.endsWith('/noise-schedules'))).toBe(false);
      await navigateAdmin(page, '自习设置');
      await expect(panel.locator('.study-reports')).toHaveCount(0);
      await expect(panel.locator('.study-photos')).toHaveCount(0);
      await expect(panel.locator('.noise-schedule-editor')).toHaveCount(0);
      await expect(panel.getByRole('button', {name: '旧版噪音排程兼容', exact: true})).toHaveCount(0);
      const editor = panel.locator('.study-settings');
      await expect(editor.getByLabel('自习结束 1', {exact: true})).toHaveValue('21:30');
      const starts = editor.getByLabel('自习开始 1', {exact: true});
      await starts.fill('19:05');
      await navigateAdmin(page, '噪音监测');
      await expect(editor).toBeHidden();
      await navigateAdmin(page, '自习设置');
      await expect(starts).toHaveValue('19:05');
      expect(requests.filter(item => item.path.endsWith('/noise-schedules'))).toHaveLength(0);
      await navigateAdmin(page, '大屏设备');
      const discard = page.getByRole('dialog').filter({hasText: '放弃未保存的修改？'});
      await expect(discard).toBeVisible();
      await discard.getByRole('button', {name: '取消', exact: true}).click();
      await expect(page).toHaveURL(/section=npep/);
      await expect(starts).toHaveValue('19:05');
      await editor.getByRole('button', {name: '预览自习影响', exact: true}).click();
      await editor.getByRole('button', {name: '保存自习设置', exact: true}).click();
      await expect(editor).toContainText('自习设置已保存');
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({termId: 'term', targetType: 'GRADE', targetId: 'grade', expectedRevision: 1,
        policy: {mode: 'Override', settings: {schedule: {rules: [{days: [1, 2, 3, 4, 5], start: '19:05', end: '21:30'}]}}}});
      await navigateAdmin(page, '噪音监测');
      await panel.locator('.npep-noise-reports .v-select').click();
      await page.getByRole('option', {name: /一班原生设备/}).click();
      await panel.getByRole('button', {name: '查看噪音报告', exact: true}).click();
      const report = page.getByRole('dialog');
      await expect(report).toContainText('原生噪音报告');
      await expect(report).toContainText('离线／状态陈旧');
      await expect(report).toContainText('不代表当前执行状态');
      await expect(report).toContainText('尚无已上传的结束报告');
      await report.getByRole('button', {name: '关闭', exact: true}).click();
      await page.screenshot({path: `test-results/npep-noise-${width}.png`, fullPage: true, animations: 'disabled'});
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await navigateAdmin(page, '自习设置');
      await starts.fill('19:06');
      await navigateAdmin(page, '大屏设备');
      await expect(discard).toBeVisible();
      await discard.getByRole('button', {name: '放弃并离开', exact: true}).click();
      await expect(panel).toHaveCount(0);
      await navigateAdmin(page, 'NPEP');
      await expect(panel.locator('.npep-device')).toHaveCount(1);
      await page.reload();
      await expect(panel.getByRole('heading', {name: '大屏互联', exact: true})).toBeVisible();
      await expect(page).toHaveURL(/section=npep/);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

for (const width of [1440, 390]) {
  test(`NPEP study settings preserve customs, preview homework sources and enforce photo limits at ${width}px`, async ({browser}) => {
    const saved=[], requests=[];
    const custom=defaultStudySettings();custom.schedule.effectiveFrom='2026-10-12';custom.schedule.rules[0]={days:[1],start:'19:10',end:'21:20'};custom.homework.rotationSeconds=75;
    custom.noise.estimated={highDbA:72,mediumDbA:54};
    let policies=[{targetType:'GRADE',targetId:'grade',revision:1,policy:{mode:'Override',settings:custom}}];
    const catalog=()=>({termId:'term',terms:[{id:'term',name:'当前学期'}],grades:[{id:'grade',name:'高二'}],
      classes:[{id:'class-a',name:'一班',gradeId:'grade',pairedDevices:1},{id:'class-b',name:'二班',gradeId:'grade',pairedDevices:0}],settings:policies});
    const preview=body=>({previewFingerprint:'b'.repeat(64),baseRevision:body.expectedRevision,totalClasses:1,changedClasses:1,pairedDevices:1,previewDate:body.previewDate || null,
      items:[{classId:'class-a',name:'一班',effective:{source:'Class',settings:body.policy.settings},
        homeworkSources:[{id:'class-b',name:'二班'},{id:'walk-a',name:'物理走班 A',subjectName:'物理'},{id:'walk-b',name:'物理走班 B',subjectName:'物理'}],
        windows:[{start:'2026-10-12T19:00:00',end:'2026-10-12T21:30:00'}]}]});
    const {page,context,errors}=await openAdmin(browser,width,'OWNER',{},'npep',async context=>{
      await context.route(`${api}/api/v2/npep/**`,async route=>{
        const req=route.request(),path=new URL(req.url()).pathname,body=req.method()==='POST'?req.postDataJSON():null;
        requests.push(path);
        const reply=data=>route.fulfill({json:{protocolVersion:req.headers()['x-npep-version'],requestId:body?.requestId || req.headers()['x-request-id'],serverTime:new Date().toISOString(),data}});
        if(path.endsWith('/info')) return reply({supportedCapabilities:['device.status']});
        if(path.endsWith('/devices')) return reply({items:[],nextCursor:null});
        if(path.endsWith('/study-settings/preview')) return reply(preview(body));
        if(path.endsWith('/study-settings')) {
          expect(req.headers()['x-npep-version']).toBe('0.10');
          if(!body) return reply(catalog());
          saved.push(body);policies.push({targetType:body.targetType,targetId:body.targetId,revision:1,policy:body.policy});
          return reply({...preview(body),revision:1});
        }
        return route.fulfill({status:404,json:{error:{code:'NOT_FOUND'}}});
      });
    });
    try {
      const panel=page.locator('.npep-device-manager'); await expect(panel).toContainText('当前没有已登记');
      expect(requests.some(path=>path.endsWith('/study-settings'))).toBe(false);
      await navigateAdmin(page, '自习设置');
      const editor=panel.locator('.study-settings');
      await expect(editor.getByLabel('自习开始 1',{exact:true})).toHaveValue('19:10');
      await expect(editor.getByLabel('作业每页轮换间隔',{exact:true})).toHaveValue('75');
      await expect(editor.getByLabel('第一阈值线 · 高电平')).toHaveValue('72');
      await expect(editor.getByLabel('第二阈值线 · 中电平')).toHaveValue('54');
      const select=async(label,name)=>{await editor.locator('.v-select').filter({hasText:label}).click();await page.getByRole('option',{name,exact:true}).click();};
      await select('自习配置范围','行政班');await expect(editor.getByLabel('自习启用规则')).toHaveValue('继承年级设置');
      await select('自习启用规则','单独设置本班自习');
      await expect(editor.getByLabel('自习开始 1')).toHaveValue('19:00');
      await expect(editor.getByLabel('自习结束 1')).toHaveValue('21:30');
      await expect(editor.getByLabel('自习生效日期')).toHaveValue('');
      await expect(editor.getByLabel('作业每页轮换间隔')).toHaveValue('60');
      await expect(editor.getByLabel('启用阈值拍照')).not.toBeChecked();
      await expect(editor.getByLabel('高线连续超限时间')).toHaveValue('3');
      await expect(editor.getByLabel('第一阈值线 · 高电平')).toHaveValue('65');
      await expect(editor.getByLabel('第二阈值线 · 中电平')).toHaveValue('50');
      await select('双阈值使用的单位','dBFS 数字输入电平');
      await expect(editor.getByLabel('第一阈值线 · 高电平')).toHaveValue('');
      await select('双阈值使用的单位','估算 dB(A) · 需要本机外部参考');
      await expect(editor.getByLabel('第一阈值线 · 高电平')).toHaveValue('65');
      await expect(editor.getByLabel('第二阈值线 · 中电平')).toHaveValue('50');
      await select('双阈值使用的单位','dBFS 数字输入电平');
      await editor.getByLabel('高线连续超限时间').fill('4');
      await expect(editor.getByRole('button',{name:'保存自习设置',exact:true})).toBeDisabled();
      await editor.getByLabel('自习生效日期').fill('2026-10-12');
      await select('自习时段 1 · 星期','周一');await page.keyboard.press('Escape');
      await select('作业来源方式','指定来源行政班（自动包含其相关走班）');
      await select('展示作业的来源行政班','二班');await page.keyboard.press('Escape');
      await expect(editor.getByLabel('学生页噪音展示')).toHaveValue('状态＋小型实时趋势');
      await editor.getByLabel('启用阈值拍照').check();
      await expect(editor).toContainText('明确填写红线阈值');
      await editor.getByLabel('第一阈值线 · 高电平').fill('-35');
      await expect(editor.getByLabel('第二阈值线 · 中电平')).toHaveValue('');
      await expect(editor.getByLabel('注意纪律最短间隔')).toHaveValue('600');
      await editor.getByLabel('第二阈值线 · 中电平').fill('-30');
      await expect(editor.getByRole('button',{name:'预览自习影响',exact:true})).toBeDisabled();
      await editor.getByLabel('第二阈值线 · 中电平').fill('-45');
      await editor.getByLabel('注意纪律最短间隔').fill('720');
      await expect(editor.getByLabel('高线连续超限时间')).toHaveValue('4');
      await expect(editor.getByLabel('拍照最短间隔')).toHaveValue('30');
      await expect(editor.getByLabel('照片保留时间',{exact:true})).toHaveValue('30');
      await editor.getByLabel('照片保留时间',{exact:true}).fill('181');
      await expect(editor.getByRole('button',{name:'预览自习影响',exact:true})).toBeDisabled();
      await editor.getByLabel('照片保留时间',{exact:true}).fill('180');await expect(editor).toContainText('需要确认延长保留的风险');
      await editor.getByLabel('已了解延长照片保留时间的隐私与备份风险').check();
      await editor.getByLabel('自习预览日期（可留空）').fill('2026-10-12');
      await navigateAdmin(page, '大屏互联');await navigateAdmin(page, '自习设置');
      await expect(editor.getByLabel('照片保留时间',{exact:true})).toHaveValue('180');
      await editor.getByRole('button',{name:'预览自习影响',exact:true}).click();
      await expect(editor.locator('.study-preview')).toContainText('物理走班 A');await expect(editor.locator('.study-preview')).toContainText('物理走班 B');
      await expect(editor.locator('.study-preview')).toContainText('2026-10-12 19:00:00');
      await editor.getByRole('button',{name:'保存自习设置',exact:true}).click();
      expect(saved[0].policy.settings.noise).toEqual({enabled:true,redLineDbfs:-35,mediumLineDbfs:-45,disciplineCooldownSeconds:720,highContinuousSeconds:4,estimated:null});
      expect(saved[0].policy.settings.photos.cooldownSeconds).toBe(30);expect(saved[0].policy.settings.photos.continuousSeconds).toBe(4);
      await expect(editor).toContainText('自习设置已保存');await expect(editor).toContainText('保存不代表设备已应用、展示页已显示或正在采集');
      expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({termId:'term',targetType:'CLASS',targetId:'class-a',expectedRevision:0,
        expectedPreviewFingerprint:'b'.repeat(64),policy:{settings:{homework:{sourceClassIds:['class-b'],rotationSeconds:60},photos:{retentionDays:180,extendedRetentionAcknowledged:true}}}});
      await editor.getByLabel('作业每页轮换间隔').fill('90');
      await select('自习配置对象','二班');
      const discard=page.getByRole('dialog').filter({hasText:'放弃未保存的自习设置？'});await expect(discard).toBeVisible();
      await discard.getByRole('button',{name:'取消',exact:true}).click();await expect(editor.getByLabel('作业每页轮换间隔')).toHaveValue('90');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      await page.screenshot({path:`test-results/study-settings-${width}.png`,fullPage:true,animations:'disabled'});
      await editor.getByRole('region',{name:'自习展示与当天作业',exact:true}).screenshot({path:`test-results/study-presentation-${width}.png`,animations:'disabled'});
      await editor.getByRole('region',{name:'噪音与阈值拍照',exact:true}).screenshot({path:`test-results/study-photos-${width}.png`,animations:'disabled'});
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:`test-results/study-overview-${width}.png`,animations:'disabled'});
      expect(errors).toEqual([]);
    } finally {await context.close();}
  });
}

for (const width of [1440, 390]) {
  test(`NPEP study receipts distinguish applied configuration from capture and expire at ${width}px`, async ({browser}) => {
    const deviceId=randomUUID();let statusMode='fresh',requests=0,resumeRecord=null;const resumes=[];
    const window={start:'2026-10-12T19:00:00.000',end:'2026-10-12T21:30:00.000'};
    const {page,context,errors}=await openAdmin(browser,width,'OWNER',{},'npep',async context=>{
      await context.route(`${api}/api/v2/npep/**`,async route=>{
        const req=route.request(),path=new URL(req.url()).pathname;
        const reply=data=>route.fulfill({json:{protocolVersion:req.headers()['x-npep-version'],requestId:req.method()==='POST'?req.postDataJSON().requestId:req.headers()['x-request-id'],serverTime:new Date().toISOString(),data}});
        if(path.endsWith('/info'))return reply({supportedCapabilities:['device.status']});
        if(path.endsWith('/devices'))return reply({items:[{deviceId,deviceName:'自习联调大屏',screenBindingId:'screen-a',administrativeClassName:'一班',bindingRevision:1,
          state:'ACTIVE',lastSeenAt:new Date().toISOString(),credentialExpiresAt:new Date(Date.now()+86400000).toISOString(),status:null}],nextCursor:null});
        if(path.endsWith(`/devices/${deviceId}/study-settings/resume`)){
          expect(req.headers()['x-npep-version']).toBe('0.11');expect(req.method()).toBe('POST');
          const body=req.postDataJSON();resumes.push(body);expect(body.version).toBe('a'.repeat(64));expect(body.window).toEqual(window);
          resumeRecord={requestId:body.requestId,command:{commandId:randomUUID(),version:body.version,window},receipt:null,remainingMs:30000,expiresAt:new Date(Date.now()+30000).toISOString()};
          statusMode='resume-pending';return reply(resumeRecord);
        }
        if(path.endsWith(`/devices/${deviceId}/study-settings`)){
          requests++;expect(req.headers()['x-npep-version']).toBe('0.10');expect(req.method()).toBe('GET');
          if(statusMode==='unsupported')return route.fulfill({status:426,json:{error:{code:'PROTOCOL_UNSUPPORTED'}}});
          if(statusMode==='presentation-delayed')await new Promise(resolve=>setTimeout(resolve,800));
          return reply({current:{version:(statusMode==='old-version'?'b':'a').repeat(64),effective:{source:'Grade'}},observation:{version:'a'.repeat(64),phase:'Active',clockReady:true,
            presentationState:'NOT_INTEGRATED',captureState:'NOT_INTEGRATED'},receivedAt:new Date().toISOString(),observationAgeMs:statusMode==='aging'?14500:0,
            fresh:true,configurationApplied:statusMode!=='old-version',presentationVerified:statusMode.startsWith('presentation') && statusMode!=='presentation-hidden',
            presentation:statusMode.startsWith('presentation')?{state:statusMode==='presentation-hidden'?'Hidden':'Visible',reason:statusMode==='presentation-hidden'?'TEMPORARY_HIDE':'FRAME_CURRENT'}:null,
            presentationVersion:(statusMode==='presentation-old-version'?'b':'a').repeat(64),presentationFresh:true,presentationAgeMs:0,
            presentationRemainingMs:['presentation-aging','presentation-delayed'].includes(statusMode)?500:statusMode==='presentation-expired'?0:5000,
            captureVerified:['capture','capture-aging','capture-old-version'].includes(statusMode),
            execution:statusMode.startsWith('resume')?{owner:'None',state:'Stopped',signalFresh:false,reason:'WINDOW_SKIPPED',clockReady:true,window}
              :statusMode.startsWith('capture')?{owner:'Schedule',state:statusMode==='capture-starting'?'Starting':'Active',signalFresh:statusMode!=='capture-starting',
                reason:statusMode==='capture-starting'?'CAPTURE_STARTING':'WINDOW_ACTIVE'}:null,
            executionVersion:(statusMode==='capture-old-version'?'b':'a').repeat(64),executionFresh:statusMode.startsWith('capture') || statusMode.startsWith('resume'),
            executionAgeMs:statusMode==='capture-aging'?14500:0,resumeSupported:statusMode.startsWith('resume') && statusMode!=='resume-old-device',resumeAgeMs:0,
            resumeCommands:resumeRecord?[{...resumeRecord,receipt:statusMode==='resume-accepted'?{commandId:resumeRecord.command.commandId,outcome:'ACCEPTED'}:null}]:[]});
        }
        return route.fulfill({status:404,json:{error:{code:'NOT_FOUND'}}});
      });
    });
    try{
      const panel=page.locator('.npep-device-manager');await expect(panel).toContainText('自习联调大屏');expect(requests).toBe(0);
      await panel.getByRole('button',{name:'查看设备详情',exact:true}).click();
      const status=panel.locator('.study-device-status');await expect(status).toContainText('尚未读取');expect(requests).toBe(0);
      await status.getByRole('button',{name:'刷新自习应用回执'}).click();
      await expect(status).toContainText('自习配置已应用');await expect(status).toContainText('自习时段内');
      await expect(status).toContainText('尚无展示执行回执');await expect(status).toContainText('尚无采集执行回执');await expect(status.getByText('正在监测',{exact:true})).toHaveCount(0);
      await page.screenshot({path:`test-results/study-receipt-${width}.png`,fullPage:true,animations:'disabled'});
      statusMode='capture';await status.getByRole('button',{name:'刷新自习应用回执'}).click();
      await expect(status.locator('.study-capture-status')).toHaveText('设备回报正在采集');
      await page.screenshot({path:`test-results/study-execution-${width}.png`,fullPage:true,animations:'disabled'});
      statusMode='presentation-visible';await status.getByRole('button',{name:'刷新自习应用回执'}).click();
      const display=status.locator('.study-presentation-status');await expect(display).toHaveText('设备回报展示页可见');
      await page.evaluate(()=>{globalThis.__studyWallNow=Date.now;Date.now=()=>globalThis.__studyWallNow()+3600000;});
      await expect(display).toHaveText('设备回报展示页可见');
      await page.screenshot({path:`test-results/study-display-presence-${width}.png`,fullPage:true,animations:'disabled'});
      await page.evaluate(()=>{Date.now=globalThis.__studyWallNow;delete globalThis.__studyWallNow;});
      statusMode='presentation-hidden';await status.getByRole('button',{name:'刷新自习应用回执'}).click();await expect(display).toHaveText('设备回报展示页已收起');
      await expect(status).toContainText('临时使用电脑，按期限返回');
      statusMode='presentation-old-version';await status.getByRole('button',{name:'刷新自习应用回执'}).click();await expect(display).toHaveText('展示执行回执待确认');
      statusMode='presentation-expired';await status.getByRole('button',{name:'刷新自习应用回执'}).click();await expect(display).toHaveText('展示执行回执待确认');
      statusMode='presentation-aging';await status.getByRole('button',{name:'刷新自习应用回执'}).click();await expect(display).toHaveText('展示执行回执待确认');
      statusMode='presentation-delayed';await status.getByRole('button',{name:'刷新自习应用回执'}).click();await expect(display).toHaveText('展示执行回执待确认');
      statusMode='capture-starting';await status.getByRole('button',{name:'刷新自习应用回执'}).click();
      await expect(status.locator('.study-capture-status')).toHaveText('采集正在启动');
      statusMode='resume-old-device';await status.getByRole('button',{name:'刷新自习应用回执'}).click();
      const restore=status.getByRole('button',{name:'恢复本时段监测',exact:true});await expect(restore).toBeDisabled();
      statusMode='resume-skipped';await status.getByRole('button',{name:'刷新自习应用回执'}).click();await expect(restore).toBeEnabled();
      await page.evaluate(() => {globalThis.__studyOriginalNow=Date.now;Date.now=()=>globalThis.__studyOriginalNow()+3600000;});
      await restore.click();await expect(status).toContainText('恢复请求已受理，等待设备回执');expect(resumes).toHaveLength(1);
      await expect(status.locator('.study-capture-status')).toHaveText('采集执行回执待确认');
      await status.getByRole('button',{name:'刷新自习应用回执'}).click();await expect(restore).toBeDisabled();
      await page.evaluate(() => {Date.now=globalThis.__studyOriginalNow;delete globalThis.__studyOriginalNow;});
      statusMode='resume-accepted';await status.getByRole('button',{name:'刷新自习应用回执'}).click();
      await expect(status).toContainText('设备已处理恢复指令');await expect(status.locator('.study-capture-status')).toHaveText('设备回报未在定时采集');
      await page.screenshot({path:`test-results/study-resume-${width}.png`,fullPage:true,animations:'disabled'});
      statusMode='capture-old-version';await status.getByRole('button',{name:'刷新自习应用回执'}).click();
      await expect(status.locator('.study-capture-status')).toHaveText('采集执行回执待确认');
      statusMode='capture-aging';await status.getByRole('button',{name:'刷新自习应用回执'}).click();
      await expect(status.locator('.study-capture-status')).toHaveText('采集执行回执待确认');
      statusMode='old-version';await status.getByRole('button',{name:'刷新自习应用回执'}).click();
      await expect(status).toContainText('该回执对应旧配置');await expect(status).toContainText('上次计算阶段');await expect(status).not.toContainText('自习配置已应用');
      statusMode='aging';await status.getByRole('button',{name:'刷新自习应用回执'}).click();
      await expect(status).toContainText('回执待重新确认');await expect(status).toContainText('历史回执');
      statusMode='unsupported';await status.getByRole('button',{name:'刷新自习应用回执'}).click();
      await expect(status).toContainText('当前服务尚未支持自习应用回执');await expect(status).not.toContainText('自习配置已应用');
      expect(errors).toEqual([]);
    }finally{await context.close();}
  });
}

test('NPEP direct navigation requires an OWNER or ADMIN school membership', async ({browser}) => {
  const requests = [];
  const {page, context, errors} = await openAdmin(browser, 1440, 'TEACHER', {}, 'npep', async context => {
    await context.route(`${api}/api/v2/npep/**`, route => { requests.push(route.request().url()); return route.fulfill({status: 403, json: {}}); });
  });
  try {
    await expect(page.getByText('请选择具有 OWNER/ADMIN 权限的学校后管理 NPEP。')).toBeVisible();
    await expect(page.locator('.npep-device-manager')).toHaveCount(0);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("screen list preserves its snapshot after HTTP failure and shows fresh status on retry", async ({browser}) => {
  const m = await openAdmin(browser, 1440);
  try {
    const panel = m.page.locator(".v-card").filter({has: m.page.getByRole("button", {name: "刷新大屏列表", exact: true})});
    await expect(panel).toContainText("一班大屏");
    await expect(panel.locator(".screen-list-status")).toContainText("上次成功刷新");
    await m.page.route(`${api}/api/v2/admin/schools/school/classroom-screens`, route => route.fulfill({status: 503, json: {message: "测试列表服务不可用"}}));
    await panel.getByRole("button", {name: "刷新大屏列表", exact: true}).click();
    await expect(panel).toContainText("保留上次成功的列表");
    await expect(panel).toContainText("一班大屏");
    await expect(panel).not.toContainText("当前学校还没有大屏账号");
    await m.page.unroute(`${api}/api/v2/admin/schools/school/classroom-screens`);
    await panel.getByRole("button", {name: "刷新大屏列表", exact: true}).click();
    await expect(panel.locator(".screen-list-status .v-alert")).toHaveCount(0);
    expect(m.errors).toEqual([]);
  } finally { await m.context.close(); }
});

test("quick settings retain edits typed after saving and still warn before leaving", async ({browser}) => {
  const {context, page} = await openAdmin(browser, 1440, "ADMIN", {
    quickDeadlines: [{label: "明早", dayOffset: 1, time: "07:30"}], quickInputs: [],
  });
  let release = () => {}, sent = null;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    const card = page.locator(".v-card").filter({has: page.locator(".v-card-title", {hasText: "作业快捷截止时间"})});
    await expect(card.locator(".quick-deadline-row")).toHaveCount(1);
    await expect(card.getByLabel("按钮名称", {exact: true})).toHaveValue("明早");
    await page.route(`${api}/api/v2/admin/schools/school/homework-settings`, async route => {
      if (route.request().method() !== "PUT") return route.fallback();
      sent = route.request().postDataJSON();
      await gate;
      await route.fulfill({json: {data: sent}});
    });
    await card.getByLabel("按钮名称", {exact: true}).fill("本次提交");
    await card.getByRole("button", {name: "保存全校配置", exact: true}).click();
    await expect.poll(() => sent?.quickDeadlines[0].label).toBe("本次提交");
    await card.getByLabel("按钮名称", {exact: true}).fill("后续未保存");
    release();
    await expect(page.getByText("本次提交已保存；之后输入的修改仍未保存，请再次保存。", {exact: true})).toBeVisible();
    await expect(card.getByLabel("按钮名称", {exact: true})).toHaveValue("后续未保存");
    await page.getByRole("button", {name: "返回教师工作台"}).click();
    await expect(page.getByRole("dialog")).toContainText("放弃未保存的修改？");
  } finally { release(); await context.close(); }
});

for (const [width, role] of [[1440, "OWNER"], [540, "ADMIN"]]) {
  test(`account management preserves role options, credentials and undo at ${width}px`, async ({browser}) => {
    const {context, page, writes, errors} = await openAdmin(browser, width, role, {}, "accounts");
    try {
      const row = username => page.locator(".admin-entity-list .v-list-item").filter({hasText: `@${username}`});
      await expect(row("self")).toBeVisible();
      await expect(row("self").getByRole("button")).toHaveCount(0);
      await page.locator(".v-select").filter({hasText: "学校角色"}).getByRole("combobox").first().click();
      if (role === "OWNER") await page.getByRole("option", {name: "学校所有者", exact: true}).click();
      else {
        await expect(page.getByRole("option", {name: "学校所有者", exact: true})).toHaveCount(0);
        await page.getByRole("option", {name: "管理员", exact: true}).click();
      }
      await page.getByLabel("管理员短账号", {exact: true}).fill("new-admin");
      await page.getByLabel("管理员姓名", {exact: true}).fill("新管理员");
      await page.getByLabel("初始 PIN", {exact: true}).fill("1234");
      await page.getByRole("button", {name: "返回教师工作台"}).click();
      await expect(page.getByRole("dialog")).toContainText("放弃未保存的修改？");
      await page.getByRole("dialog").getByRole("button", {name: "取消", exact: true}).click();
      await page.getByRole("button", {name: "创建管理员", exact: true}).click();
      await expect(row("new-admin")).toBeVisible();
      expect(writes[0].body).toEqual({username: "new-admin", name: "新管理员", pin: "1234", role});
      await expect(page.getByLabel("初始 PIN", {exact: true})).toHaveValue("");
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", {name: "下载本次初始凭据", exact: true}).click();
      const download = await downloaded;
      const csv = await readFile(await download.path(), "utf8");
      expect(csv).toContain("new-admin"); expect(csv).toContain("1234");
      const action = async (desktop, mobile) => {
        if (width > 959) await row("teacher-a").getByRole("button", {name: desktop, exact: true}).click();
        else {
          await row("teacher-a").getByRole("button", {name: "账号操作"}).click();
          await page.locator(".v-menu.v-overlay--active").getByText(mobile, {exact: true}).click();
        }
      };
      await action("重置 PIN", "重置 PIN");
      await expect(page.getByRole("dialog")).toContainText("重置账号 PIN");
      await page.getByRole("dialog").getByRole("button", {name: "取消", exact: true}).click();
      expect(writes).toHaveLength(1);
      await action("停用", "停用账号");
      await page.getByRole("dialog").getByRole("button", {name: "停用", exact: true}).click();
      await expect(row("teacher-a")).toContainText("已停用");
      await page.getByRole("button", {name: "撤销", exact: true}).click();
      await expect(row("teacher-a")).toContainText("可登录");
      expect(writes.slice(1).map(req => req.body)).toEqual([{disabled: true}, {disabled: false}]);
      await page.getByLabel("搜索姓名或账号", {exact: true}).fill("new-admin");
      await expect(page.locator(".admin-entity-list .v-list-item")).toHaveCount(1);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

test("account management retains the non-manager UI boundary", async ({browser}) => {
  const {context, page, writes, errors} = await openAdmin(browser, 1440, "TEACHER", {}, "accounts");
  try {
    await expect(page.getByText("请先完成学校初始化或取得 OWNER/ADMIN 权限。", {exact: true})).toBeVisible();
    await expect(page.getByRole("button", {name: "创建管理员", exact: true})).toHaveCount(0);
    expect(writes).toEqual([]); expect(errors).toEqual([]);
  } finally { await context.close(); }
});

for (const width of [1440, 540]) {
  test(`screen admin preserves create, edit, guard and responsive actions at ${width}px`, async ({browser}) => {
    const {context, page, writes, errors} = await openAdmin(browser, width);
    try {
      const row = page.locator('.admin-entity-list .v-list-item').filter({has: page.locator('.v-list-item-title', {hasText: '一班大屏'})});
      await expect(row).toBeVisible();
      if (width > 959) await expect(page.locator(".admin-screen-scope")).toContainText("测试学校 · 当前学期");
      const listTop = await page.locator(".admin-entity-list").boundingBox();
      const deadlineTop = await page.getByText("作业快捷截止时间", {exact: true}).boundingBox();
      expect(listTop.y).toBeLessThan(deadlineTop.y);
      if (width > 959) {
        await expect(row.locator('.admin-row-actions--desktop')).toBeVisible();
        await expect(row.locator('.admin-row-actions--mobile')).toBeHidden();
        await row.getByRole("button", {name: "编辑", exact: true}).click();
      } else {
        await expect(row.locator('.admin-row-actions--desktop')).toBeHidden();
        await row.getByRole("button", {name: "大屏操作"}).click();
        await page.getByText("编辑账号", {exact: true}).click();
      }
      const edit = page.getByRole("dialog");
      await expect(edit).toBeVisible();
      await edit.getByLabel("设备名称", {exact: true}).fill("一班新大屏");
      await edit.getByRole("button", {name: "保存", exact: true}).click();
      await expect(edit).toBeHidden();
      expect(writes[0].body).toEqual({name: "一班新大屏", loginCode: "class-a", administrativeClassId: "class-a"});
      await expect(page.locator('.admin-entity-list')).toContainText("一班新大屏");
      await page.getByRole("button", {name: "创建大屏账号", exact: true}).click();
      const create = page.getByRole("dialog").filter({hasText: "创建大屏账号"});
      await create.getByLabel("设备名称", {exact: true}).fill("新设备");
      await create.getByRole("button", {name: "取消", exact: true}).click();
      const guard = page.getByRole("dialog").filter({hasText: "放弃新建大屏账号？"});
      await expect(guard).toBeVisible();
      await guard.getByRole("button", {name: "取消", exact: true}).click();
      await expect(create.getByLabel("设备名称", {exact: true})).toHaveValue("新设备");
      await create.getByLabel("大屏短账号", {exact: true}).fill("new-screen");
      await create.getByLabel("大屏 PIN", {exact: true}).fill("1234");
      await create.locator(".v-select").filter({hasText: "绑定行政班"}).getByRole("combobox").first().click();
      await page.getByRole("option", {name: "一班 · C1"}).click();
      await create.getByRole("button", {name: "创建账号", exact: true}).click();
      await expect(create).toBeHidden();
      await expect(page.locator('.admin-entity-list')).toContainText("新设备");
      expect(writes.at(-1).body).toEqual({name: "新设备", loginCode: "new-screen", pin: "1234", administrativeClassId: "class-a"});
      if (width <= 959) await page.getByRole("button", {name: "搜索与筛选"}).click();
      await page.getByLabel("搜索设备、账号或班级", {exact: true}).fill("new-screen");
      await expect(page.locator('.admin-entity-list .v-list-item')).toHaveCount(1);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

test("screen admin retains the manager-only UI boundary", async ({browser}) => {
  const {context, page, writes, errors} = await openAdmin(browser, 1440, "TEACHER");
  try {
    await expect(page.getByText("请先完成学校初始化或取得 OWNER/ADMIN 权限。", {exact: true})).toBeVisible();
    await expect(page.getByRole("button", {name: "创建大屏账号", exact: true})).toHaveCount(0);
    await expect(page.getByLabel("搜索设备、账号或班级", {exact: true})).toHaveCount(0);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("screen account dialog keeps input after a failed create and returns focus on Escape", async ({browser}) => {
  const {context, page, errors} = await openAdmin(browser, 1440);
  try {
    const opener = page.getByRole("button", {name: "创建大屏账号", exact: true});
    await opener.click();
    const create = page.getByRole("dialog").filter({hasText: "创建大屏账号"});
    await expect(create).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(create).toBeHidden();
    await expect(opener).toBeFocused();

    await opener.click();
    await create.getByLabel("设备名称", {exact: true}).fill("新大屏");
    await create.getByLabel("大屏短账号", {exact: true}).fill("new-screen");
    await create.getByLabel("大屏 PIN", {exact: true}).fill("1234");
    await create.locator(".v-select").filter({hasText: "绑定行政班"}).getByRole("combobox").first().click();
    await page.getByRole("option", {name: "一班 · C1"}).click();
    const endpoint = `${api}/api/v2/admin/schools/school/classroom-screen-accounts`;
    await page.route(endpoint, route => route.fulfill({status: 503, json: {message: "暂时无法创建"}}));
    await create.getByRole("button", {name: "创建账号", exact: true}).click();
    await expect(create).toBeVisible();
    await expect(create.getByLabel("设备名称", {exact: true})).toHaveValue("新大屏");
    await expect(create.getByLabel("大屏短账号", {exact: true})).toHaveValue("new-screen");
    await page.unroute(endpoint);
    await create.getByRole("button", {name: "创建账号", exact: true}).click();
    await expect(create).toBeHidden();
    await expect(page.locator(".admin-entity-list")).toContainText("新大屏");
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

for (const width of [1440, 540]) {
  test(`school homework settings keep both panels connected at ${width}px`, async ({browser}) => {
    const settings = {
      quickDeadlines: [{label: "明早", dayOffset: 1, time: "07:30"}],
      quickInputs: [{label: "练习", text: "完成练习", group: "常用", subjectIds: ["math"], insertMode: "INLINE"}],
    };
    const {context, page, writes, errors} = await openAdmin(browser, width, "ADMIN", settings);
    const switchTab = async title => {
      if (width > 959) await page.locator(".admin-navigation").getByText(title, {exact: true}).click();
      else {
        await page.locator(".admin-mobile-page-switcher .v-select").getByRole("combobox").first().click();
        await page.getByRole("option", {name: `${["大屏互联", "自习监测", "自习座位表"].includes(title) ? "NPEP" : "日常管理"} · ${title}`}).click();
      }
    };
    try {
      const deadlineCard = page.locator(".v-card").filter({has: page.locator(".v-card-title", {hasText: "作业快捷截止时间"})});
      await expect(deadlineCard.locator(".quick-deadline-row")).toHaveCount(1);
      await expect(deadlineCard.getByLabel("按钮名称", {exact: true})).toHaveValue("明早");
      await expect(deadlineCard.getByRole("button", {name: "删除此快捷时间"})).toBeDisabled();
      expect(await deadlineCard.locator(".quick-deadline-row").evaluate(el => window.getComputedStyle(el).gridTemplateColumns.split(" ").length))
        .toBe(width <= 600 ? 2 : 4);
      await deadlineCard.locator(".v-select").getByRole("combobox").first().click();
      await page.getByRole("option", {name: "下周一", exact: true}).click();
      await deadlineCard.getByRole("button", {name: "保存全校配置", exact: true}).click();
      await expect.poll(() => writes.length).toBe(1);
      expect(writes[0].body.quickDeadlines).toEqual([{label: "明早", time: "07:30", dateRule: "next-weekday", weekday: 1}]);
      expect(writes[0].body.quickInputs).toEqual(settings.quickInputs);
      await expect(page.getByText("全校作业快捷时间和快捷词已保存；教师端和大屏刷新后生效。", {exact: true})).toBeVisible();
      await switchTab("教师分配");
      const inputCard = page.locator(".v-card").filter({has: page.locator(".v-card-title", {hasText: "作业快捷输入"})});
      await expect(inputCard.getByLabel("按钮名称", {exact: true})).toHaveValue("练习");
      await inputCard.getByRole("button", {name: "删除此快捷词"}).click();
      await expect(inputCard).toContainText("当前已关闭快捷输入");
      await page.getByRole("button", {name: "返回教师工作台"}).click();
      const guard = page.getByRole("dialog");
      await expect(guard).toContainText("放弃未保存的修改？");
      await guard.getByRole("button", {name: "取消", exact: true}).click();
      await inputCard.getByRole("button", {name: "保存全校配置", exact: true}).click();
      await expect.poll(() => writes.length).toBe(2);
      expect(writes[1].body).toEqual({quickDeadlines: writes[0].body.quickDeadlines, quickInputs: []});
      await expect(inputCard.getByRole("button", {name: "保存全校配置", exact: true})).not.toHaveClass(/v-btn--loading/);
      await switchTab("大屏设备");
      await expect(deadlineCard.locator(".v-select")).toContainText("下周一");
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

for (const failB of [false, true]) {
  test(`school settings ignore late A responses and ${failB ? "require retry after B fails" : "save only B's loaded form"}`, async ({browser}) => {
    let release = () => {}, unavailable = failB;
    const gate = new Promise(resolve => { release = resolve; });
    const settings = label => ({quickDeadlines: [{label, dayOffset: 1, time: "07:30"}], quickInputs: []});
    const writes = [];
    const {context, page, errors} = await openAdmin(browser, 1440, "ADMIN", {}, "screens", async context => {
      await context.route(url => url.origin === api && url.pathname === "/api/v2/me/schools", r => r.fulfill({json: {data: ["school", "school-b"].map(id => ({role: "ADMIN", school:
        {id, name: id === "school" ? "A学校" : "B学校", terms: [{id: `term-${id}`, name: "当前学期", status: "ACTIVE"}]},
      }))}}));
      await context.route(`${api}/api/v2/admin/schools/*/homework-settings`, async r => {
        const id = new URL(r.request().url()).pathname.split("/")[5];
        if (r.request().method() === "PUT") {
          writes.push({id, data: r.request().postDataJSON()});
          return r.fulfill({json: {data: r.request().postDataJSON()}});
        }
        if (id === "school") await gate;
        if (id === "school-b" && unavailable) return r.fulfill({status: 503, json: {message: "B学校配置读取失败"}});
        return r.fulfill({json: {data: settings(id === "school" ? "A配置" : "B配置")}});
      });
    });
    try {
      const card = page.locator(".v-card").filter({has: page.locator(".v-card-title", {hasText: "作业快捷截止时间"})});
      await page.locator(".v-select").filter({hasText: /^学校/}).first().click();
      await page.getByRole("option", {name: /B学校/}).click();
      if (failB) {
        await expect(card.getByRole("button", {name: "重新读取配置"})).toBeVisible();
        await expect(card.getByRole("button", {name: "保存全校配置"})).toHaveCount(0);
        unavailable = false;
        await card.getByRole("button", {name: "重新读取配置"}).click();
      }
      await expect(card.getByLabel("按钮名称", {exact: true})).toHaveValue("B配置");
      const lateResponse = page.waitForResponse(response => response.url() === `${api}/api/v2/admin/schools/school/homework-settings`
        && response.request().method() === "GET");
      release();
      await lateResponse;
      await expect(card.getByLabel("按钮名称", {exact: true})).toHaveValue("B配置");
      await card.getByLabel("按钮名称", {exact: true}).fill("B新配置");
      await card.getByRole("button", {name: "保存全校配置", exact: true}).click();
      await expect.poll(() => writes.length).toBe(1);
      expect(writes[0].id).toBe("school-b");
      expect(writes[0].data.quickDeadlines[0].label).toBe("B新配置");
      expect(errors).toEqual([]);
    } finally { release(); await context.close(); }
  });
}

test('NPEP group seat publication uses real file controls, retains drafts and separates download from viewing', async ({browser}) => {
  for (const width of [1440, 720]) {
    let current = {revision: 0, hash: null}, image = null, failFirst = true;
    const versions = [], ids = [];
    const {page, context, errors} = await openAdmin(browser, width, 'OWNER', {}, 'npep-seating', async context => {
      await context.route(`${api}/api/v2/npep/**`, async route => {
        const req = route.request(), url = new URL(req.url()), path = url.pathname;
        const body = req.method() === 'POST' ? req.postDataJSON() : null;
        const reply = data => route.fulfill({json: {protocolVersion: req.headers()['x-npep-version'], requestId: body?.requestId || req.headers()['x-request-id'], serverTime: new Date().toISOString(), data}});
        if (path.endsWith('/info')) return reply({supportedCapabilities: ['device.status']});
        if (path.endsWith('/devices')) return reply({items: [], nextCursor: null});
        if (path.endsWith('/seating/catalog')) return reply({termId: 'term', classes: [{id: 'class-a', name: '一班'}, {id: 'class-b', name: '二班'}]});
        if (path.endsWith('/seating/image')) { expect(url.searchParams.get('classId')).toBe('class-a'); return reply({image, ...current}); }
        if (path.endsWith('/seating')) {
          expect(req.headers()['x-npep-version']).toBe('0.14');
          if (!body) return reply({current, versions: [...versions].reverse(), receipts: []});
          expect(req.headers()['x-request-id']).toBe(body.requestId); expect(body.classId).toBe('class-a'); expect(body.termId).toBe('term');
          ids.push(body.requestId);
          if (failFirst) { failFirst = false; return route.fulfill({status: 503, json: {error: {code: 'TEMPORARILY_UNAVAILABLE'}}}); }
          expect(body.expectedRevision).toBe(current.revision);
          if (body.action === 'image') { image = body.image; const bytes = Buffer.from(image, 'base64'); expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); expect(bytes.length).toBeLessThanOrEqual(2097152); await writeFile(`test-results/seating-upload-${width}.png`, bytes); }
          current = {revision: current.revision + 1, hash: body.action === 'withdraw' ? null : 'a'.repeat(64), width: 1000, height: 600, createdAt: new Date().toISOString(), restorable: body.action !== 'withdraw'};
          versions.push(current); return reply(current);
        }
        return route.fulfill({status: 404, json: {error: {code: 'NOT_FOUND'}}});
      });
    });
    try {
      const panel = page.locator('.seating-settings'); await expect(panel).toBeVisible();
      if (width >= 960) {
        const heading = page.locator('.admin-navigation').getByText('NPEP', {exact: true}); await expect(heading).toBeVisible();
        await expect(page.locator('.admin-navigation').getByText('权限管理', {exact: true})).toHaveCount(0);
      }
      await panel.locator('.v-select').filter({hasText: '自习所在班级'}).click(); await page.getByRole('option', {name: '一班', exact: true}).click();
      const source = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600;
        const c = canvas.getContext('2d'); c.fillStyle = 'white'; c.fillRect(0, 0, 1000, 600); c.fillStyle = 'black'; c.font = '40px sans-serif'; c.fillText('自习座位表测试样张 A01–A40', 50, 80); return canvas.toDataURL('image/png').split(',')[1]; });
      await panel.locator('input[type=file]').setInputFiles({name: '自习座位表.png', mimeType: 'image/png', buffer: Buffer.from(source, 'base64')});
      await expect(panel).toContainText('待发布');
      await navigateAdmin(page, '大屏互联'); await navigateAdmin(page, '自习座位表'); await expect(panel).toContainText('待发布');
      await panel.getByRole('button', {name: '发布给此班级', exact: true}).click(); await expect(panel.locator('.v-alert')).toContainText(/未确认|请求失败|暂不可用|重试/);
      await panel.getByRole('button', {name: '发布给此班级', exact: true}).click(); await expect(panel).toContainText('发布已保存');
      expect(ids[0]).toBe(ids[1]); await expect(panel).toContainText('当前版本 1'); await expect(panel).toContainText('尚无设备回执');
      await page.evaluate(() => window.scrollTo(0, 0)); await page.mouse.move(10, 10);
      if (width >= 960) await expect(page.locator('.admin-navigation .v-list-item--active')).toHaveCount(1);
      await page.screenshot({path: `test-results/seating-admin-${width}.png`, fullPage: true, animations: 'disabled'});
      await panel.getByRole('button', {name: '撤回当前自习座位表', exact: true}).click();
      const dialog = page.getByRole('dialog').filter({hasText: '撤回此自习座位表？'});
      await dialog.getByRole('button', {name: '撤回', exact: true}).click(); await expect(panel).toContainText('尚未发布自习座位表 / 已撤回');
      expect(current.revision).toBe(2); expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
});
