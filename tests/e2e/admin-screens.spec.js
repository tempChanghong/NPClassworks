import {test, expect} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {origin, api} from "./environment.js";

// Production Vue page and real buttons, with explicit admin API fixtures.
// Backend authorization remains covered by the separate backend integration tests.
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
    await expect(page.getByRole("dialog")).toContainText("放弃未保存的修改？");
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
      await page.getByLabel("设备名称", {exact: true}).fill("新设备");
      await page.getByRole("button", {name: "返回教师工作台"}).click();
      const guard = page.getByRole("dialog");
      await expect(guard).toContainText("放弃未保存的修改？");
      await guard.getByRole("button", {name: "取消", exact: true}).click();
      await expect(page.getByLabel("设备名称", {exact: true})).toHaveValue("新设备");
      await page.getByLabel("大屏短账号", {exact: true}).fill("new-screen");
      await page.getByLabel("大屏 PIN", {exact: true}).fill("1234");
      await page.locator(".v-select").filter({hasText: "绑定行政班"}).getByRole("combobox").first().click();
      await page.getByRole("option", {name: "一班 · C1"}).click();
      await page.getByRole("button", {name: "创建账号", exact: true}).click();
      await expect(page.getByLabel("设备名称", {exact: true})).toHaveValue("");
      await expect(page.locator('.admin-entity-list')).toContainText("新设备");
      expect(writes.at(-1).body).toEqual({name: "新设备", loginCode: "new-screen", pin: "1234", administrativeClassId: "class-a"});
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
    await expect(page.getByRole("button", {name: "创建账号", exact: true})).toHaveCount(0);
    await expect(page.getByLabel("搜索设备、账号或班级", {exact: true})).toHaveCount(0);
    expect(writes).toEqual([]);
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
        await page.getByRole("option", {name: `日常管理 · ${title}`}).click();
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
