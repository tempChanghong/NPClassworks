import {test, expect} from '@playwright/test';
import {origin, api} from './environment.js';
import {todayBoardDate} from '../../src/utils/boardDate.js';

async function openScreen(browser, request, content) {
  await request.post(`${api}/__test/reset`);
  if (content) await request.post(`${api}/api/v2/publications`, {data: {subjectId: 'math', targetWorkspaceIds: ['class-a'],
    type: 'ASSIGNMENT', boardDate: todayBoardDate(), content}});
  const values = {'classworks-v2-oobe': JSON.stringify({version: 1, completed: true, roleHint: 'screen'}),
    'classworks-v2-screen-oobe:screen-a': JSON.stringify({version: 1, completed: true}), 'classworks-v2-screen-token': 'screen-token'};
  const context = await browser.newContext({serviceWorkers: 'block', storageState: {cookies: [], origins: [
    {origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))},
  ]}});
  const page = await context.newPage();
  await page.goto(origin);
  await expect(page.getByRole('button', {name: '录入作业', exact: true}).first()).toBeVisible();
  await expect(page.locator('.v-skeleton-loader')).toHaveCount(0);
  await expect(page.locator('[title="刷新"]')).not.toHaveClass(/v-btn--loading/);
  await page.evaluate(() => document.fonts.ready);
  return {page, context};
}

test('background refresh keeps existing homework in place and saves show updated content', async ({browser, request}) => {
  const {page, context} = await openScreen(browser, request, '刷新前的作业');
  let release;
  try {
    const feed = page.locator('.screen-feed-region');
    await expect(feed).toContainText('刷新前的作业');
    const gap = () => page.evaluate(() => document.querySelector('.screen-feed-region').getBoundingClientRect().top
      - document.querySelector('.screen-toolbar').getBoundingClientRect().bottom);
    const before = await gap();
    const held = new Promise(resolve => { release = resolve; });
    let received = false;
    await page.route('**/api/v2/classroom-screens/feed**', async route => {
      received = true; await held; await route.continue();
    });
    await page.locator('[title="刷新"]').click();
    await expect.poll(() => received).toBe(true);
    await expect(page.locator('[title="刷新"]')).toHaveClass(/v-btn--loading/);
    await expect(feed).toContainText('刷新前的作业');
    expect(await gap()).toBeCloseTo(before, 0);
    release();
    await expect(page.locator('[title="刷新"]')).not.toHaveClass(/v-btn--loading/);
    await page.unroute('**/api/v2/classroom-screens/feed**');
    await page.getByRole('button', {name: '修改', exact: true}).click();
    const dialog = page.locator('.screen-composer');
    const content = dialog.getByRole('textbox', {name: '作业内容 作业内容', exact: true});
    await expect(content).toHaveValue('刷新前的作业');
    await content.fill('修改后立即显示');
    await dialog.getByRole('button', {name: '保存作业', exact: true}).click();
    await expect(dialog).not.toBeVisible();
    await expect(feed).toContainText('修改后立即显示');
    await expect(feed).not.toContainText('刷新前的作业');
  } finally { release?.(); await context.close(); }
});

test('a previously synchronized empty board stays readable during refresh', async ({browser, request}) => {
  const {page, context} = await openScreen(browser, request);
  let release;
  try {
    await expect(page.getByText('今天尚未录入作业', {exact: true})).toBeVisible();
    const held = new Promise(resolve => { release = resolve; });
    let received = false;
    await page.route('**/api/v2/classroom-screens/feed**', async route => { received = true; await held; await route.continue(); });
    await page.locator('[title="刷新"]').click();
    await expect.poll(() => received).toBe(true);
    await expect(page.locator('[title="刷新"]')).toHaveClass(/v-btn--loading/);
    await expect(page.locator('.v-skeleton-loader')).toHaveCount(0);
    await expect(page.getByText('今天尚未录入作业', {exact: true})).toBeVisible();
  } finally { release?.(); await context.close(); }
});
