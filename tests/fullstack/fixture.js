import {createHash, randomUUID} from "node:crypto";
import {test as base, expect} from "@playwright/test";
import {origin} from "../e2e/environment.js";
import {backendModule, configureRuntime} from "./environment.js";

// Lazy imports let `playwright --list` work without a running database.
export const test = base.extend({
  classroom: async ({browser}, use) => {
    configureRuntime();
    const [{prisma}, {generateTokenPair}] = await Promise.all([
      backendModule("utils/prisma.js"), backendModule("utils/tokenManager.js"),
    ]);
    const contexts = [];
    try {
      const suffix = randomUUID();
      const school = await prisma.school.create({data: {code: `FULLSTACK-${suffix}`, name: "全链路测试学校"}});
      const account = await prisma.account.create({data: {provider: "school-local", providerId: suffix, name: "测试教师"}});
      await prisma.schoolMember.create({data: {schoolId: school.id, accountId: account.id, role: "VIEWER"}});
      const term = await prisma.academicTerm.create({data: {schoolId: school.id, name: "测试学期", academicYear: 2099, semester: 1, status: "ACTIVE"}});
      const grade = await prisma.grade.create({data: {termId: term.id, code: "G1", name: "高一"}});
      const subject = await prisma.subject.create({data: {schoolId: school.id, code: "MATH", name: "数学"}});
      const workspace = await prisma.workspace.create({data: {termId: term.id, gradeId: grade.id, code: "C1", name: "高一一班", type: "ADMIN_CLASS",
        subjectRules: {create: {subjectId: subject.id, deliveryMode: "ADMIN_CLASS"}},
        members: {create: {accountId: account.id, role: "TEACHER"}},
        teachingAssignments: {create: {accountId: account.id, subjectId: subject.id}},
      }});
      const screenToken = randomUUID();
      const binding = await prisma.classroomScreenBinding.create({data: {schoolId: school.id, administrativeClassId: workspace.id,
        name: "测试大屏", createdByAccountId: account.id, deviceFingerprint: suffix, activatedAt: new Date(),
        tokenHash: createHash("sha256").update(screenToken).digest("hex"),
      }});
      const credentials = await generateTokenPair(account);
      async function open(role) {
        const values = {
          "classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: role}),
          [`classworks-v2-screen-oobe:${binding.id}`]: JSON.stringify({version: 1, completed: true}),
          "classworks-v2-student-selection": JSON.stringify({schoolId: school.id,
            administrativeClassId: workspace.id, administrativeClassName: workspace.name,
            courseGroupIds: {}, declinedSubjectIds: []}),
          ...(role === "teacher" ? {"classworks-v2-access-token": credentials.accessToken, "classworks-v2-refresh-token": credentials.refreshToken}
            : {"classworks-v2-screen-token": screenToken}),
        };
        const context = await browser.newContext({viewport: {width: 1440, height: 1000}, serviceWorkers: "allow", timezoneId: "Asia/Shanghai",
          storageState: {cookies: [], origins: [{origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))}]}});
        contexts.push(context);
        const page = await context.newPage();
        const errors = [], frames = [];
        page.on("pageerror", error => errors.push(error.message));
        // Observe both real Engine.IO transports; the initial join can arrive before WebSocket upgrade.
        page.on("websocket", socket => socket.on("framereceived", frame => frames.push(String(frame.payload))));
        page.on("response", async response => {
          const url = new URL(response.url());
          if (url.pathname === "/socket.io/" && url.searchParams.get("transport") === "polling" && response.request().method() === "GET") {
            try { frames.push(await response.text()); } catch { /* Context may have closed during polling. */ }
          }
        });
        await page.goto(origin);
        await expect(page.getByRole("button", {name: role === "screen" ? "录入作业" : "退出", exact: true}).first()).toBeVisible();
        if (role === "teacher") await expect(page.getByText("已授权 1 个教学空间", {exact: true})).toBeVisible();
        return {page, context, errors, frames};
      }
      await use({prisma, school, account, workspace, subject, binding, screenToken, credentials, open,
        rows: () => prisma.publication.findMany({where: {subjectId: subject.id}, include: {revisions: {orderBy: {revision: "asc"}}}}),
      });
    } finally {
      await Promise.all(contexts.map(context => context.close()));
      await prisma.$disconnect();
      // Data stays in the disposable database for failure diagnosis; runner/CI destroys it.
    }
  },
});
export {expect};

export async function enterHomework(page, content) {
  await page.getByRole("button", {name: "录入作业", exact: true}).first().click();
  await page.getByRole("button", {name: "数学", exact: true}).click();
  await page.getByRole("textbox", {name: "作业内容 作业内容", exact: true}).fill(content);
  await page.getByRole("button", {name: "保存作业", exact: true}).click();
  await expect(page.locator(".screen-composer")).not.toBeVisible();
}
