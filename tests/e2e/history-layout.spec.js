import {test, expect} from '@playwright/test';
import {origin, api} from './environment.js';

test('publication history keeps current version, restore controls and close action usable at narrow widths', async ({browser, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: 'previous'}});
  await request.post(`${api}/__test/reset`);
  await request.post(`${api}/api/v2/publications`, {data: {content: '用于核对历史弹窗布局的作业正文'}});
  await request.post(`${api}/__test/history`);
  const values = {
    'classworks-v2-oobe': JSON.stringify({version: 1, completed: true, roleHint: 'teacher'}),
    'classworks-v2-access-token': 'teacher-token',
    'classworks-v2-refresh-token': 'teacher-refresh',
  };
  const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1280, height: 800}, storageState: {
    cookies: [], origins: [{origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))}],
  }});
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole('button').filter({has: page.locator('.mdi-dots-vertical')}).click();
    await page.getByText('版本历史与恢复', {exact: true}).click();
    const dialog = page.getByRole('dialog').filter({hasText: '不可删除的版本历史'});
    await expect(dialog.locator('.history-entry')).toHaveCount(20);
    await expect(dialog.locator('.history-entry').first()).toContainText('当前版本');
    expect(await dialog.locator('.history-entry__card').first().evaluate(card => {
      const panel = card.closest('.history-dialog');
      return card.getBoundingClientRect().width / panel.getBoundingClientRect().width;
    })).toBeGreaterThan(.8);
    await dialog.screenshot({path: 'test-results/history-desktop.png', animations: 'disabled'});
    await page.setViewportSize({width: 390, height: 844});
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(dialog.getByRole('button', {name: '关闭', exact: true})).toBeVisible();
    await dialog.screenshot({path: 'test-results/history-mobile.png', animations: 'disabled'});
    await page.setViewportSize({width: 320, height: 720});
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.screenshot({path: 'test-results/history-compact.png', animations: 'disabled'});
    await dialog.locator('.history-entry').last().scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', {name: '关闭', exact: true})).toBeVisible();
    await dialog.getByRole('button', {name: '关闭', exact: true}).click();
    await expect(dialog).toBeHidden();
    await page.evaluate(() => {
      const settings = JSON.parse(localStorage.getItem('Classworks_settings') || '{}');
      localStorage.setItem('Classworks_settings', JSON.stringify({...settings, 'theme.mode': 'light'}));
    });
    await page.setViewportSize({width: 1280, height: 800});
    await page.reload();
    await page.getByRole('button').filter({has: page.locator('.mdi-dots-vertical')}).click();
    await page.getByText('版本历史与恢复', {exact: true}).click();
    await expect(dialog.locator('.history-entry')).toHaveCount(20);
    await dialog.screenshot({path: 'test-results/history-desktop-light.png', animations: 'disabled'});
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
