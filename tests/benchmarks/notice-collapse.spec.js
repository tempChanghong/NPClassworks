import {test, expect} from "@playwright/test";
import {api, origin} from "../e2e/environment.js";

for (const count of [10, 100]) {
  test(`notice collapse workload with ${count} notices`, async ({browser, request}, testInfo) => {
    await request.post(`${origin}/__test/release`, {data: {release: "previous"}});
    await request.post(`${api}/__test/reset`);
    for (let index = 0; index < count; index++) await request.post(`${api}/api/v2/publications`, {data: {
      type: "NOTICE", priority: "MINOR", content: `通知${index}：${"完整通知正文。".repeat(40)}`, contentJson: {popupEnabled: false},
    }});
    const context = await browser.newContext({serviceWorkers: "block", viewport: {width: 1440, height: 1000},
      storageState: {cookies: [], origins: [{origin, localStorage: [
        {name: "classworks-v2-oobe", value: JSON.stringify({version: 1, completed: true, roleHint: "screen"})},
        {name: "classworks-v2-screen-oobe:screen-a", value: JSON.stringify({version: 1, completed: true})},
        {name: "classworks-v2-screen-token", value: "screen-token"},
      ]}]}});
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.noticeMeasurements = 0;
        const measure = window.Element.prototype.getBoundingClientRect;
        window.Element.prototype.getBoundingClientRect = function(...args) {
          if (this.classList.contains("publication-card") && this.closest(".feed-notices")) window.noticeMeasurements++;
          return measure.apply(this, args);
        };
      });
      await page.goto(origin);
      const bar = page.locator(".feed-notices");
      await expect(bar.locator(".publication-card")).toHaveCount(count);
      const settle = () => page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
      const sample = () => page.evaluate(() => ({nodes: document.querySelectorAll(".feed-notices *").length, measurements: window.noticeMeasurements}));
      await settle();
      const expanded = await sample();
      await bar.getByRole("button", {name: "折叠通知栏", exact: true}).click();
      await settle();
      const collapsed = await sample();
      // Repeated resizes exercise ResizeObserver without changing notice versions.
      for (const width of [1280, 1440, 1280, 1440]) {
        await page.setViewportSize({width, height: 1000});
        await settle();
      }
      const resized = await sample();
      await bar.getByRole("button", {name: "展开通知栏", exact: true}).click();
      await settle();
      await expect(bar.locator(".publication-card").first()).toBeVisible();
      const result = {count, expanded, collapsed, hiddenResizeMeasurements: resized.measurements - collapsed.measurements,
        reopen: await sample()};
      console.log(JSON.stringify(result));
      await testInfo.attach("notice-collapse-measurements", {body: JSON.stringify(result, null, 2), contentType: "application/json"});
    } finally { await context.close(); }
  });
}
