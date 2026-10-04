import {test, expect} from '@playwright/test';
import {origin, api} from './environment.js';

test('classroom attendance and roster editor keep actions usable on narrow screens', async ({browser, request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: 'previous'}});
  await request.post(`${api}/__test/reset`);
  const storage = {
    'classworks-v2-oobe': JSON.stringify({version: 1, completed: true, roleHint: 'screen'}),
    'classworks-v2-screen-oobe:screen-a': JSON.stringify({version: 1, completed: true}),
    'classworks-v2-screen-token': 'screen-token',
  };
  const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1280, height: 800}, storageState: {
    cookies: [], origins: [{origin, localStorage: Object.entries(storage).map(([name, value]) => ({name, value}))}],
  }});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const students = Array.from({length: 8}, (_, index) => ({id: `s${index + 1}`, name: `测试学生${index + 1}`, sortOrder: index,
    studentNumber: String(index + 1).padStart(2, '0')}));
  let attendance = {absent: ['s2'], late: ['s3'], excluded: ['s4']};
  const writes = [];
  try {
    await page.route(`${api}/api/v2/classroom-screens/students`, route => route.fulfill({json: {data: students, rosterRevision: 'v1'}}));
    await page.route(`${api}/api/v2/classroom-screens/attendance/*`, route => {
      if(route.request().method() === 'PUT') {attendance = route.request().postDataJSON(); writes.push(attendance);}
      return route.fulfill({json: {data: attendance}});
    });
    await page.goto(origin);
    await page.getByRole('button', {name: '录入考勤', exact: true}).click();
    await expect(page.locator('.student-row')).toHaveCount(8);
    await expect(page.locator('.attendance-metrics')).toContainText('到校 5');
    await expect(page.locator('.attendance-metrics')).toContainText('缺勤 1');
    await expect.poll(() => page.locator('.attendance-list').evaluate(list => {
      const first = list.children[0].getBoundingClientRect();
      const second = list.children[1].getBoundingClientRect();
      return Math.abs(first.y - second.y) < 4 && second.x > first.x + 100;
    })).toBe(true);
    await page.screenshot({path: 'test-results/attendance-desktop.png', fullPage: true, animations: 'disabled'});

    await page.getByRole('button', {name: '编辑学生名单', exact: true}).click();
    const roster = page.getByRole('dialog').filter({hasText: '编辑行政班学生名单'}).last();
    await expect(roster.getByLabel('姓名 1', {exact: true})).toHaveValue('测试学生1');
    await expect(roster.getByRole('button', {name: '保存名单', exact: true})).toBeVisible();
    await page.screenshot({path: 'test-results/roster-editor-desktop.png', fullPage: true, animations: 'disabled'});
    await page.setViewportSize({width: 390, height: 844});
    await expect.poll(() => roster.locator('.roster-editor-actions').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
    })).toBe(true);
    expect(await roster.locator('.roster-editor').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({path: 'test-results/roster-editor-mobile.png', fullPage: true, animations: 'disabled'});
    await page.setViewportSize({width: 320, height: 720});
    expect(await roster.locator('.roster-editor').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect.poll(() => roster.locator('.roster-editor-actions').evaluate(element => element.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
    await page.setViewportSize({width: 390, height: 844});
    await roster.getByLabel('姓名 8', {exact: true}).scrollIntoViewIfNeeded();
    await expect.poll(() => roster.locator('.roster-editor-actions').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
    })).toBe(true);
    await page.screenshot({path: 'test-results/roster-editor-mobile-bottom.png', fullPage: true, animations: 'disabled'});
    await roster.getByRole('button', {name: '添加学生', exact: true}).click();
    await expect(roster.getByLabel('姓名 9', {exact: true})).toBeFocused();
    await roster.getByRole('button', {name: '移出第 9 人', exact: true}).click();
    await expect(roster.getByLabel('姓名 9', {exact: true})).toHaveCount(0);
    await roster.getByRole('button', {name: '取消', exact: true}).click();
    await page.setViewportSize({width: 1280, height: 800});

    await page.locator('.student-row').filter({hasText: '测试学生1'}).getByRole('button', {name: '缺勤', exact: true}).click();
    await expect(page.getByText('有未保存修改', {exact: true})).toBeVisible();
    await expect(page.locator('.attendance-metrics')).toContainText('缺勤 2');
    await page.setViewportSize({width: 390, height: 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('.student-row').first().getByRole('button', {name: '不参与', exact: true})).toBeVisible();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(350);
    await page.screenshot({path: 'test-results/attendance-mobile.png', fullPage: true, animations: 'disabled'});
    await page.locator('.student-row').nth(5).scrollIntoViewIfNeeded();
    await page.screenshot({path: 'test-results/attendance-mobile-list.png', fullPage: true, animations: 'disabled'});
    await page.setViewportSize({width: 320, height: 720});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const buttonWidths = await page.locator('.student-row').first().locator('.student-status .v-btn').evaluateAll(buttons =>
      buttons.map(button => button.getBoundingClientRect().width));
    expect(Math.min(...buttonWidths)).toBeGreaterThanOrEqual(44);
    await page.setViewportSize({width: 390, height: 844});
    await page.getByRole('button', {name: '保存今日考勤', exact: true}).click();
    await expect(page.getByText('当前记录已加载', {exact: true})).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0].absent).toEqual(['s2', 's1']);
    await page.evaluate(() => {
      const settings = JSON.parse(localStorage.getItem('Classworks_settings') || '{}');
      localStorage.setItem('Classworks_settings', JSON.stringify({...settings, 'theme.mode': 'light'}));
    });
    await page.setViewportSize({width: 1280, height: 800});
    await page.reload();
    await page.getByRole('button', {name: '录入考勤', exact: true}).click();
    await expect(page.locator('.v-application')).toHaveClass(/v-theme--light/);
    await expect(page.locator('.student-row')).toHaveCount(8);
    await page.screenshot({path: 'test-results/attendance-desktop-light.png', fullPage: true, animations: 'disabled'});
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
