import {test, expect} from "./fixture.js";
import {origin, api} from "../e2e/environment.js";

test("admin roster commits, refreshes a screen, rejects its stale draft and preserves attendance", async ({classroom}) => {
  const {prisma, school, workspace, account} = classroom;
  await prisma.schoolMember.update({where: {schoolId_accountId: {schoolId: school.id, accountId: account.id}}, data: {role: "ADMIN"}});
  const initial = [];
  for (const [name, number] of [["张三", "01"], ["李四", "02"]]) {
    initial.push(await prisma.administrativeClassStudent.create({data: {administrativeClassId: workspace.id, name, studentNumber: number, sortOrder: initial.length}}));
  }
  const historical = await prisma.classAttendanceDay.create({data: {administrativeClassId: workspace.id,
    attendanceDate: new Date("2025-01-01T00:00:00Z"), attendance: {absent: [initial[1].id], late: [], excluded: []}}});
  const admin = await classroom.open("teacher");
  await admin.page.goto(`${origin}/classworks-admin?section=students&school=${school.id}&term=${workspace.termId}`);
  const manager = admin.page.locator(".class-roster-manager");
  await expect(manager.getByLabel("姓名 1", {exact: true})).toHaveValue("张三");
  const screen = await classroom.open("screen");
  await screen.page.getByRole("button", {name: "课堂工具", exact: true}).first().click();
  await screen.page.locator(".tool-entry").filter({hasText: "考勤"}).click();
  await screen.page.getByRole("button", {name: "编辑学生名单", exact: true}).click();
  const editor = screen.page.getByRole("dialog").filter({has: screen.page.getByRole("textbox", {name: "批量追加名单"})}).last();
  await expect(editor.getByLabel("姓名 1", {exact: true})).toHaveValue("张三");
  await editor.getByLabel("姓名 1", {exact: true}).fill("大屏未保存输入");

  await manager.getByLabel("姓名 1", {exact: true}).fill("张小三");
  await manager.getByRole("button", {name: "移出第 2 人", exact: true}).click();
  await manager.getByRole("button", {name: "批量粘贴", exact: true}).click();
  await manager.getByLabel("粘贴名单", {exact: true}).fill("03\t王五");
  await manager.getByRole("button", {name: "预览导入", exact: true}).click();
  await admin.page.getByRole("button", {name: "确认保存名单", exact: true}).click();
  await expect(manager).toContainText("名单已保存");
  await expect.poll(() => screen.frames.some(frame => frame.includes("classroom.roster.updated") && frame.includes(workspace.id))).toBe(true);
  await expect(editor.getByLabel("姓名 1", {exact: true})).toHaveValue("大屏未保存输入");
  const saved = await prisma.administrativeClassStudent.findMany({where: {administrativeClassId: workspace.id}, orderBy: {sortOrder: "asc"}});
  expect(saved.find(s => s.id === initial[0].id).name).toBe("张小三");
  expect(saved.find(s => s.id === initial[1].id).isActive).toBe(false);
  expect(saved.filter(s => s.isActive).map(s => s.name)).toEqual(["张小三", "王五"]);

  // The screen loaded before the admin save; its real PUT must fail atomically.
  await editor.getByRole("button", {name: "保存名单", exact: true}).click();
  const rejected = screen.page.waitForResponse(response => response.url() === `${api}/api/v2/classroom-screens/students` && response.request().method() === "PUT");
  await screen.page.getByRole("button", {name: "确认保存名单", exact: true}).click();
  expect((await rejected).status()).toBe(409);
  await expect(editor.getByLabel("姓名 1", {exact: true})).toHaveValue("大屏未保存输入");
  expect(await prisma.administrativeClassStudent.findMany({where: {administrativeClassId: workspace.id}, orderBy: {sortOrder: "asc"}})).toEqual(saved);
  expect(await prisma.classAttendanceDay.findUnique({where: {administrativeClassId_attendanceDate: {administrativeClassId: workspace.id, attendanceDate: historical.attendanceDate}}})).toEqual(historical);
  const audits = await prisma.auditLog.findMany({where: {entityId: workspace.id, action: "CLASS_ROSTER_SAVED"}});
  expect(audits).toHaveLength(1);
  expect(audits[0].metadata.before.map(s => s.id)).toEqual(initial.map(s => s.id));
  expect(audits[0].metadata.after.map(s => s.name)).toEqual(["张小三", "王五"]);

  await editor.getByRole("button", {name: "重新载入名单与考勤", exact: true}).click();
  await screen.page.getByRole("button", {name: "重新载入", exact: true}).click();
  await screen.page.getByRole("button", {name: "编辑学生名单", exact: true}).click();
  await expect(editor.getByLabel("姓名 1", {exact: true})).toHaveValue("张小三");
  await expect(editor.getByLabel("姓名 2", {exact: true})).toHaveValue("王五");
  expect(admin.errors).toEqual([]);
  expect(screen.errors).toEqual([]);
});
