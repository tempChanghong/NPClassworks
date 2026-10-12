import {test, expect} from '@playwright/test';
import {openAdmin} from './admin-fixture.js';
import {api} from './environment.js';
import {defaultStudySettings} from '../../src/utils/npepStudySettings.js';

for (const width of [320, 390, 768, 1440]) {
  test(`NPEP study controls remain reachable at ${width}px`, async ({browser}, testInfo) => {
    const settings = defaultStudySettings();
    settings.schedule.effectiveFrom = '2026-10-12';
    settings.schedule.rules[0] = {days: [1, 2, 3, 4, 5], start: '19:10', end: '21:20'};
    settings.homework.sourceMode = 'SelectedClasses';
    settings.homework.sourceClassIds = ['class-a'];
    const {context, page, errors} = await openAdmin(browser, width, 'OWNER', {}, 'npep-study', async context => {
      await context.route(`${api}/api/v2/npep/**`, async route => {
        const req = route.request(), path = new URL(req.url()).pathname;
        const reply = data => route.fulfill({json: {
          protocolVersion: req.headers()['x-npep-version'], requestId: req.headers()['x-request-id'],
          serverTime: new Date().toISOString(), data,
        }});
        if (path.endsWith('/info')) return reply({supportedCapabilities: ['device.status']});
        if (path.endsWith('/devices')) return reply({items: [], nextCursor: null});
        if (path.endsWith('/seating/catalog')) return reply({termId: 'term', classes: [{id: 'class-a', name: '一班'}]});
        if (path.endsWith('/study-settings')) return reply({termId: 'term', terms: [{id: 'term', name: '当前学期'}],
          grades: [{id: 'grade', name: '高二'}], classes: [{id: 'class-a', gradeId: 'grade', name: '高二年级第一行政班（物理、化学、生物方向）'}],
          settings: [{targetType: 'GRADE', targetId: 'grade', revision: 7, policy: {mode: 'Override', settings}}]});
        return route.fulfill({status: 404, json: {error: {code: 'NOT_FOUND'}}});
      });
    });
    try {
      const editor = page.locator('.study-settings');
      await expect(editor.getByLabel('自习开始 1', {exact: true})).toHaveValue('19:10');
      const advanced = editor.getByRole('button', {name: '高级设置', exact: true});
      await expect(advanced).toHaveAttribute('aria-expanded', 'false');
      await expect(editor.getByLabel('第一阈值线 · 高电平')).not.toBeVisible();
      await advanced.click();
      await expect(editor.getByLabel('第一阈值线 · 高电平')).toBeVisible();
      const visibleWithinPage = async locator => {
        await locator.scrollIntoViewIfNeeded();
        const box = await locator.boundingBox();
        expect(box).not.toBeNull();
        expect(box.x, 'control left edge').toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, 'control right edge').toBeLessThanOrEqual(width);
        expect(box.width, 'usable control width').toBeGreaterThanOrEqual(90);
      };
      await page.screenshot({path: testInfo.outputPath('study-settings.png'), fullPage: true, animations: 'disabled'});
      const clipped = await editor.locator('.v-field, .v-btn').evaluateAll(elements => elements.filter(element => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && (box.left < -1 || box.right > window.innerWidth + 1);
      }).map(element => ({text: element.textContent.trim(), right: Math.round(element.getBoundingClientRect().right)})));
      expect(clipped, 'every field and action is inside the viewport').toEqual([]);
      await visibleWithinPage(editor.getByRole('button', {name: '考试模式 · Windows 时间', exact: true}));
      for (const label of ['自习生效日期', '自习截止日期（可留空）', '自习开始 1', '自习结束 1']) {
        await visibleWithinPage(editor.getByLabel(label, {exact: true}));
      }
      await editor.getByRole('button', {name: '考试模式 · Windows 时间', exact: true}).click();
      await expect(editor).toContainText('当前模式不安排定时自习');
      await editor.getByRole('button', {name: '日常模式 · ClassIsland 时间', exact: true}).click();
      await expect(editor.getByLabel('自习开始 1', {exact: true})).toHaveValue('19:10');
      await expect(editor.getByLabel('自习结束 1', {exact: true})).toHaveValue('21:20');
      await editor.getByRole('button', {name: '日常模式 · ClassIsland 时间', exact: true}).scrollIntoViewIfNeeded();
      await page.screenshot({path: testInfo.outputPath('mode-switch.png'), animations: 'disabled'});
      await page.locator('.npep-study-navigation').getByRole('button', {name: '报告与照片', exact: true}).click();
      await expect(page.locator('.study-reports')).toBeVisible();
      await expect(page.locator('.study-photos')).toBeVisible();
      await expect(editor).toBeHidden();
      await visibleWithinPage(page.locator('.study-reports').getByLabel('自习开始日期（可留空）', {exact: true}));
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

test('invalid saved thresholds open advanced settings without changing the policy', async ({browser}) => {
  const settings = defaultStudySettings();
  settings.schedule.effectiveFrom = '2026-10-12';
  settings.schedule.rules[0] = {days: [1], start: '19:10', end: '21:20'};
  settings.noise.estimated = {highDbA: 50, mediumDbA: 65};
  const writes = [];
  const {context, page, errors} = await openAdmin(browser, 390, 'OWNER', {}, 'npep-study', async context => {
    await context.route(`${api}/api/v2/npep/**`, async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      if (req.method() !== 'GET') writes.push(path);
      const reply = data => route.fulfill({json: {
        protocolVersion: req.headers()['x-npep-version'], requestId: req.headers()['x-request-id'], serverTime: new Date().toISOString(), data,
      }});
      if (path.endsWith('/info')) return reply({supportedCapabilities: ['device.status']});
      if (path.endsWith('/devices')) return reply({items: [], nextCursor: null});
      if (path.endsWith('/study-settings')) return reply({termId: 'term', terms: [{id: 'term', name: '当前学期'}],
        grades: [{id: 'grade', name: '高二'}], classes: [{id: 'class-a', gradeId: 'grade', name: '一班'}],
        settings: [{targetType: 'GRADE', targetId: 'grade', revision: 7, policy: {mode: 'Override', settings}}]});
      return route.fulfill({status: 404, json: {error: {code: 'NOT_FOUND'}}});
    });
  });
  try {
    const editor = page.locator('.study-settings');
    await expect(editor.getByRole('button', {name: '高级设置', exact: true})).toHaveAttribute('aria-expanded', 'true');
    await expect(editor.getByLabel('第一阈值线 · 高电平')).toBeVisible();
    await expect(editor.getByLabel('第一阈值线 · 高电平')).toHaveValue('50');
    await expect(editor.getByLabel('第二阈值线 · 中电平')).toHaveValue('65');
    await expect(editor.getByRole('button', {name: '预览自习影响', exact: true})).toBeDisabled();
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('viewing legacy exam schedules stays clean and ordinary retention errors stay outside advanced settings', async ({browser}) => {
  const settings = defaultStudySettings();
  delete settings.examSchedule;
  settings.schedule.effectiveFrom = '2026-10-12';
  settings.schedule.rules[0] = {days: [1], start: '19:10', end: '21:20'};
  settings.photos.enabled = true;
  const writes = [];
  const {context, page, errors} = await openAdmin(browser, 390, 'OWNER', {}, 'npep-study', async context => {
    await context.route(`${api}/api/v2/npep/**`, async route => {
      const req=route.request(), path=new URL(req.url()).pathname;
      if(req.method()!=='GET') writes.push(path);
      const reply=data=>route.fulfill({json:{protocolVersion:req.headers()['x-npep-version'],requestId:req.headers()['x-request-id'],serverTime:new Date().toISOString(),data}});
      if(path.endsWith('/info')) return reply({supportedCapabilities:['device.status']});
      if(path.endsWith('/devices')) return reply({items:[],nextCursor:null});
      if(path.endsWith('/study-settings')) return reply({termId:'term',terms:[{id:'term',name:'当前学期'}],grades:[{id:'grade',name:'高二'}],classes:[{id:'class-a',gradeId:'grade',name:'一班'}],
        settings:[{targetType:'GRADE',targetId:'grade',revision:7,policy:{mode:'Override',settings}}]});
      return route.fulfill({status:404,json:{error:{code:'NOT_FOUND'}}});
    });
  });
  try {
    const editor=page.locator('.study-settings');
    await expect(editor.getByLabel('自习开始 1')).toHaveValue('19:10');
    await editor.getByRole('button',{name:'考试模式 · Windows 时间',exact:true}).click();
    await expect(editor).toContainText('当前模式不安排定时自习');
    await page.locator('.npep-study-navigation').getByRole('button',{name:'报告与照片',exact:true}).click();
    await expect(page.locator('.study-reports')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('.npep-study-navigation').getByRole('button',{name:'自习设置',exact:true}).click();
    await editor.getByLabel('照片保留时间',{exact:true}).fill('181');
    await expect(editor).toContainText('保留为 1–180 天');
    await expect(editor.getByRole('button',{name:'高级设置',exact:true})).toHaveAttribute('aria-expanded','false');
    await editor.getByLabel('照片保留时间',{exact:true}).fill('30');
    await editor.getByLabel('自习生效日期').fill('2026-10-13');
    await editor.getByRole('button',{name:'添加自习时段',exact:true}).click();
    await expect(editor.getByLabel('自习开始 1')).toHaveValue('19:15');
    await expect(editor.getByLabel('自习生效日期')).toHaveValue('2026-10-13');
    await editor.getByRole('button',{name:'日常模式 · ClassIsland 时间',exact:true}).click();
    await expect(editor.getByLabel('自习开始 1')).toHaveValue('19:10');
    expect(writes).toEqual([]);expect(errors).toEqual([]);
  } finally {await context.close();}
});
