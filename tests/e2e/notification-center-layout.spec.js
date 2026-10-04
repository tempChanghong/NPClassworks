import {test, expect} from '@playwright/test';
import {origin, api} from './environment.js';

test('screen notification center keeps priority, status and actions readable across widths', async ({browser, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: 'previous'}});
  await request.post(`${api}/__test/reset`);
  const createNotice = async (data) => {
    const response = await request.post(`${api}/api/v2/publications`, {data: {
      type: 'NOTICE', contentJson: {popupEnabled: false}, ...data,
    }});
    expect(response.ok()).toBe(true);
    return (await response.json()).data;
  };
  const urgent = await createNotice({priority: 'URGENT', title: '演练结束后的紧急通知', content: '这条通知已经确认，仍需清楚显示原有级别与正文。'});
  await createNotice({priority: 'MINOR', title: '明日值日安排与教室设备检查',
    content: '请值日同学放学前检查教室门窗、投影和讲台电源。通知内容需要在窄屏完整换行。'});
  await createNotice({priority: 'MINOR', content: '另一条待确认的通知'});
  const storage = {
    'classworks-v2-oobe': JSON.stringify({version: 1, completed: true, roleHint: 'screen'}),
    'classworks-v2-screen-oobe:screen-a': JSON.stringify({version: 1, completed: true}),
    'classworks-v2-screen-token': 'screen-token',
    'classworks-v2-notification-acknowledged:screen-a': JSON.stringify([`${urgent.id}:${urgent.revision}`]),
  };
  const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1280, height: 800}, storageState: {
    cookies: [], origins: [{origin, localStorage: Object.entries(storage).map(([name, value]) => ({name, value}))}],
  }});
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByTitle('通知中心', {exact: true}).click();
    const center = page.locator('.notification-center');
    await expect(center).toContainText('当前 3 条');
    await expect(center).toContainText('待确认 2 条');
    await expect(center).toContainText('紧急 1 条');
    const urgentCard = center.locator('.notification-center__item').filter({hasText: urgent.title});
    await expect(urgentCard).toContainText('紧急通知');
    await expect(urgentCard).toContainText('已确认');
    await expect(urgentCard.getByRole('button', {name: '知道了'})).toHaveCount(0);
    const pendingCard = center.locator('.notification-center__item').filter({hasText: '明日值日安排与教室设备检查'});
    await expect(pendingCard).toContainText('次要通知');
    await expect(pendingCard).toContainText('待确认');
    await center.screenshot({path: 'test-results/notification-center-desktop.png', animations: 'disabled'});

    await page.setViewportSize({width: 390, height: 844});
    await expect(center.getByRole('button', {name: '全部确认', exact: true})).toBeVisible();
    expect(await center.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await center.screenshot({path: 'test-results/notification-center-mobile.png', animations: 'disabled'});
    await page.setViewportSize({width: 320, height: 720});
    expect(await center.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(center.getByRole('button', {name: '全部确认', exact: true})).toBeVisible();
    await center.screenshot({path: 'test-results/notification-center-compact.png', animations: 'disabled'});
    await center.getByRole('button', {name: '全部确认', exact: true}).click();
    await expect(center).toContainText('待确认 0 条');
    await expect(center.locator('.notification-center__item')).toHaveCount(3);
    await expect(urgentCard).toContainText('紧急通知');
    await page.evaluate(() => {
      const settings = JSON.parse(localStorage.getItem('Classworks_settings') || '{}');
      localStorage.setItem('Classworks_settings', JSON.stringify({...settings, 'theme.mode': 'light'}));
    });
    await page.setViewportSize({width: 1280, height: 800});
    await page.reload();
    await page.getByTitle('通知中心', {exact: true}).click();
    await expect(center).toContainText('待确认 0 条');
    await expect(center.locator('.notification-center__item')).toHaveCount(3);
    await center.screenshot({path: 'test-results/notification-center-desktop-light.png', animations: 'disabled'});
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
