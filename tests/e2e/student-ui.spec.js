import {test, expect} from "@playwright/test";
import {api, origin} from "./environment.js";

const date = "2026-10-03";
const fixed = new Date("2026-10-03T08:00:00+08:00");
const subjects = ["语文", "数学", "英语", "物理", "化学", "生物"]
  .map((name, index) => ({id: `subject-${index}`, name, code: `S${index}`}));
const school = {id: "school", code: "E2E", name: "示例中学", teacherAuthMode: "PERSONAL_PIN"};
const classroom = {
  id: "class-a", code: "C1", name: "高一（1）班", type: "ADMIN_CLASS",
  subjectRules: subjects.map(subject => ({subjectId: subject.id, deliveryMode: "ADMIN_CLASS"})),
};

async function seedBoard(request, {missingSubject = ""} = {}) {
  await request.post(`${api}/__test/reset`);
  for (const subject of subjects) {
    if (subject.name === missingSubject) continue;
    const response = await request.post(`${api}/api/v2/publications`, {data: {
      boardDate: date, subjectId: subject.id, title: `${subject.name}今日练习`,
      content: `完成${subject.name}练习，订正错题并写出步骤。`,
      contentJson: subject.name === "数学"
        ? {preparation: {date: "2026-10-04", text: "直尺、草稿本"}} : null,
      publishAt: "2026-10-01T00:00:00Z",
    }});
    expect(response.ok()).toBe(true);
    const publication = (await response.json()).data;
    const update = await request.patch(`${api}/api/v2/publications/${publication.id}`, {
      headers: {"If-Match": '"1"'}, data: {subject, subjectId: subject.id, isCertified: true},
    });
    expect(update.ok()).toBe(true);
  }
}

async function openBoard(browser, role, width, height, {empty = false, settings = null} = {}) {
  const storage = {
    "classworks-v2-oobe": JSON.stringify({version: 1, completed: true, roleHint: role}),
    ...(role === "student" ? {"classworks-v2-student-selection": JSON.stringify({
      schoolId: school.id, administrativeClassId: classroom.id,
      administrativeClassName: classroom.name, courseGroupIds: {}, declinedSubjectIds: [],
    })} : {
      "classworks-v2-screen-token": "screen-token",
      "classworks-v2-screen-oobe:screen-a": JSON.stringify({version: 1, completed: true}),
    }),
    ...(settings ? {Classworks_settings: JSON.stringify(settings)} : {}),
  };
  const context = await browser.newContext({
    viewport: {width, height}, serviceWorkers: "block", timezoneId: "Asia/Shanghai",
    hasTouch: true, isMobile: role === "student",
    storageState: {cookies: [], origins: [{origin, localStorage: Object.entries(storage)
      .map(([name, value]) => ({name, value}))}]},
  });
  const reply = (route, data) => route.fulfill({json: {data}});
  await context.route(`${api}/api/v2/catalog/schools`, route => reply(route, [school]));
  await context.route(`${api}/api/v2/catalog/subjects?**`, route => reply(route, subjects));
  await context.route(`${api}/api/v2/catalog/workspaces?**`, route => reply(route, [classroom]));
  await context.route(`${api}/api/v2/catalog/administrative-classes/class-a/course-options`, route => reply(route, {
    administrativeClass: classroom,
    subjects: subjects.map(subject => ({
      subject, deliveryMode: "ADMIN_CLASS", courseGroups: [], requiresSelection: false,
    })),
  }));
  await context.route(`${api}/api/v2/classroom-screens/session`, route => reply(route, {
    binding: {id: "screen-a", schoolId: school.id, name: "教室一体机",
      administrativeClassId: classroom.id, administrativeClass: classroom},
    workspaces: [classroom], homeworkSettings: {},
  }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.setFixedTime(fixed);
  await page.goto(origin);
  await page.locator(empty ? ".student-empty-state" : ".publication-card").first().waitFor();
  return {context, page, errors};
}

test("student mobile reaches homework and retains tools and completion", async ({browser, request}) => {
  await seedBoard(request);
  const {context, page, errors} = await openBoard(browser, "student", 390, 844);
  try {
    await expect(page.locator(".publication-card")).toHaveCount(6);
    await expect(page.locator(".selection-summary__description")).toHaveText("全科随行政班");
    await expect(page.locator(".student-mobile-context .preparation-summary")).toContainText("需带物品");
    await expect.poll(() => page.locator(".publication-card").first()
      .evaluate(element => Math.round(element.getBoundingClientRect().top))).toBeLessThan(430);
    await expect(page.getByRole("button", {name: "看作业"})).toBeVisible();

    await page.getByRole("button", {name: "更多"}).click();
    await expect(page.getByText("一周总览", {exact: true})).toBeVisible();
    await expect(page.getByText("打印清单", {exact: true})).toBeVisible();
    await page.getByText("一周总览", {exact: true}).click();
    await expect(page.locator(".homework-week-dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", {name: "更多"}).click();
    await page.getByText("复制文字清单", {exact: true}).click();
    await expect(page.getByRole("dialog").filter({hasText: "作业清单预览"}))
      .toContainText("文字清单预览");
    await page.keyboard.press("Escape");

    await page.locator(".student-filter-disclosure > summary").click();
    await expect(page.locator(".student-filter-disclosure")).toHaveAttribute("open", "");
    await expect(page.locator(".feed-control-select").first()).toBeVisible();
    await page.locator(".student-filter-disclosure > summary").click();

    await page.locator(".publication-card").first().getByRole("button", {name: "标记完成"}).click();
    await expect(page.locator(".student-filter-disclosure > summary")).toContainText("本机已完成 1/6");
    await page.reload();
    await expect(page.locator(".student-filter-disclosure > summary")).toContainText("本机已完成 1/6");

    await page.locator(".subject-status-summary").click();
    await expect(page.locator(".subject-status--compact")).toContainText("6 项有作业");
    await page.setViewportSize({width: 320, height: 720});
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("button", {name: "看作业"})).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("student mobile surfaces an unentered subject before the feed", async ({browser, request}) => {
  await seedBoard(request, {missingSubject: "物理"});
  const {context, page, errors} = await openBoard(browser, "student", 390, 844);
  try {
    await expect(page.locator(".student-mobile-context .subject-status-summary"))
      .toContainText("尚未录入");
    await expect(page.locator(".subject-status-summary")).toHaveCount(1);
    const attention = page.locator(".student-mobile-context .subject-status--compact");
    const firstCard = page.locator(".publication-card").first();
    await expect.poll(async () => {
      const [a, b] = await Promise.all([attention.boundingBox(), firstCard.boundingBox()]);
      return a.y + a.height < b.y;
    }).toBe(true);
    await attention.locator("summary").click();
    await expect(attention).toContainText("物理");
    await expect(attention).toContainText("尚未录入");
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

for (const theme of ["dark", "light"]) {
  test(`student empty board keeps date controls and status readable on narrow phones (${theme})`, async ({browser, request}, testInfo) => {
    await request.post(`${api}/__test/reset`);
    const wallpaper = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844"><rect width="390" height="844" fill="#d8c3bb"/><circle cx="310" cy="520" r="180" fill="#a5bfd4"/></svg>');
    const {context, page, errors} = await openBoard(browser, "student", 390, 844, {empty: true,
      settings: {"theme.mode": theme, "background.enabled": true, "background.imageData": wallpaper,
        "background.blur": 0, "background.opacity": 0}});
    try {
      await page.getByLabel("选择日期").fill("2026-10-01");
      await expect(page.getByLabel("选择日期")).toHaveValue("2026-10-01");
      await expect(page.locator(".subject-status-summary")).toHaveCount(1);
      await expect(page.locator(".student-empty-state")).toBeVisible();

      await expect(page.locator(".app-background-image")).toBeVisible();
      expect(await page.locator(".app-background-image").evaluate(element =>
        window.getComputedStyle(element).backgroundImage)).toContain(wallpaper);

      for (const width of [320, 390, 430, 480]) {
        await page.setViewportSize({width, height: 844});
        await expect(page.locator(".board-date-navigator")).toBeVisible();
        await expect(page.locator(".subject-status--compact")).toBeVisible();
        await expect(page.locator(".student-empty-state")).toBeVisible();
        const layout = await page.evaluate(() => {
          const bounds = selector => document.querySelector(selector).getBoundingClientRect();
          const nav = bounds(".board-date-navigator");
          const stepper = bounds(".board-date-stepper");
          const today = bounds(".board-date-today");
          const field = bounds(".board-date-input");
          const title = document.querySelector(".board-date-title");
          const empty = bounds(".student-empty-state");
          const surfaceAlpha = selector => {
            const color = window.getComputedStyle(document.querySelector(selector)).backgroundColor;
            return color.startsWith("rgba") ? Number(color.match(/,\s*([\d.]+)\)$/)[1]) : 1;
          };
          return {navRight: nav.right, stepperBottom: stepper.bottom, todayRight: today.right,
            fieldLeft: field.left, fieldRight: field.right, fieldTop: field.top,
            titleFits: title.scrollWidth <= title.clientWidth, emptyHeight: empty.height,
            viewportFits: document.documentElement.scrollWidth <= window.innerWidth,
            surfaces: [".selection-summary", ".board-date-navigator", ".subject-status--compact", ".student-empty-state"]
              .map(surfaceAlpha)};
        });
        expect(layout.titleFits, `${width}px date label`).toBe(true);
        expect(layout.fieldTop, `${width}px date row`).toBeGreaterThan(layout.stepperBottom);
        expect(layout.fieldLeft, `${width}px date input`).toBeGreaterThan(layout.todayRight);
        expect(layout.fieldRight, `${width}px date input`).toBeLessThanOrEqual(layout.navRight - 8);
        expect(layout.emptyHeight, `${width}px empty state`).toBeLessThan(220);
        expect(layout.viewportFits, `${width}px horizontal overflow`).toBe(true);
        expect(layout.surfaces.every(alpha => alpha >= 0.9), `${width}px surfaces over wallpaper`).toBe(true);
        await expect(page.locator(".md3-enter-active")).toHaveCount(0);
        await page.screenshot({path: testInfo.outputPath(`student-empty-${width}.png`)});
      }

      await page.getByRole("button", {name: "回到今天"}).click();
      await expect(page.getByLabel("选择日期")).toHaveValue(date);
      await expect(page.locator(".board-date-today")).toHaveCount(0);
      const todayField = await page.locator(".board-date-input").boundingBox();
      const stepper = await page.locator(".board-date-stepper").boundingBox();
      expect(Math.abs(todayField.width - stepper.width)).toBeLessThan(1);
      await page.getByTitle("前一天", {exact: true}).click();
      await expect(page.getByLabel("选择日期")).toHaveValue("2026-10-02");
      await page.getByTitle("后一天", {exact: true}).click();
      await expect(page.getByLabel("选择日期")).toHaveValue(date);
      await expect(page.locator(".subject-status-summary")).toHaveCount(1);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test("large-screen primary action has readable text contrast in both themes", async ({browser, request}) => {
  await seedBoard(request);
  const {context, page, errors} = await openBoard(browser, "screen", 1920, 1080);
  try {
    const button = page.locator(".screen-action-dock").getByRole("button", {name: "录入作业"});
    for (const theme of ["dark", "light"]) {
      if (theme === "light") {
        await page.evaluate(() => localStorage.setItem("Classworks_settings", JSON.stringify({"theme.mode": "light"})));
        await page.reload();
        await page.locator(".publication-card").first().waitFor();
      }
      const contrast = await button.evaluate(element => {
        const style = window.getComputedStyle(element);
        const channels = value => value.match(/[\d.]+/g).slice(0, 3).map(Number)
          .map(channel => channel / 255)
          .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        const luminance = value => {
          const [red, green, blue] = channels(value);
          return red * 0.2126 + green * 0.7152 + blue * 0.0722;
        };
        const foreground = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      });
      expect(contrast, `${theme} theme`).toBeGreaterThanOrEqual(4.5);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("classroom screen keeps homework readable and clears the action dock when scrolled", async ({browser, request}) => {
  await seedBoard(request);
  const {context, page, errors} = await openBoard(browser, "screen", 1280, 720);
  try {
    await expect(page.locator(".classworks-app-bar")).toHaveCount(0);
    const cards = page.locator(".screen-feed .publication-grid-item");
    await expect(cards).toHaveCount(6);
    const geometry = await cards.evaluateAll(items => items.map(item => {
      const rect = item.getBoundingClientRect();
      return {x: rect.x, y: rect.y, width: rect.width};
    }));
    expect(geometry[0].y).toBeLessThan(260);
    expect(Math.abs(geometry[0].y - geometry[1].y)).toBeLessThan(2);
    expect(geometry[0].x).toBeLessThan(geometry[1].x);
    expect(geometry[2].y).toBeGreaterThan(geometry[0].y);
    expect(geometry[2].x).toBeCloseTo(geometry[0].x, 0);
    const bodySize = await page.locator(".screen-feed .publication-content").first()
      .evaluate(element => Number.parseFloat(window.getComputedStyle(element).fontSize));
    expect(bodySize).toBeGreaterThanOrEqual(28);
    await expect(page.locator(".screen-action-dock").getByRole("button", {name: "录入作业"})).toBeVisible();
    const dockHeight = await page.locator(".screen-action-dock").evaluate(
      element => element.getBoundingClientRect().height,
    );
    expect(dockHeight).toBeLessThan(90);
    const blur = await page.locator(".screen-action-dock__surface")
      .evaluate(element => window.getComputedStyle(element).backdropFilter);
    expect(blur).toBe("none");
    const dockBackground = await page.locator(".screen-action-dock__surface")
      .evaluate(element => window.getComputedStyle(element).backgroundColor);
    expect(dockBackground).toMatch(/^rgb\(/);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(async () => {
      const last = await cards.last().boundingBox();
      const dock = await page.locator(".screen-action-dock").boundingBox();
      return last.y + last.height <= dock.y;
    }).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("classroom reading presets persist per screen", async ({browser, request}) => {
  await seedBoard(request);
  const {context, page, errors} = await openBoard(browser, "screen", 1920, 1080);
  try {
    await page.locator(".screen-action-dock").getByRole("button", {name: "显示设置"}).click();
    await page.getByText("显示与布局", {exact: true}).click();
    await page.locator(".screen-reading-presets").waitFor();
    await page.getByRole("button", {name: "后排阅读"}).click();
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem("classworks-v2-screen-display:screen-a")).fontScale)).toBe(200);
    await page.goto(origin);
    await page.locator(".screen-feed .publication-content").first().waitFor();
    await expect.poll(() => page.locator(".screen-feed .publication-content").first()
      .evaluate(element => Number.parseFloat(window.getComputedStyle(element).fontSize))).toBeGreaterThan(35);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
