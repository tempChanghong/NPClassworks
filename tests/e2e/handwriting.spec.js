import {test, expect} from '@playwright/test';
import {origin, api} from './environment.js';
import {startBrowserProcessSampler} from '../handwriting/browser-process-memory.mjs';
import generated from '../handwriting/generated-fixtures.json' with {type: 'json'};

const work = page => page.locator('.handwriting-workspace:visible');
const launcher = (page, field = 'content') => page.locator(`.handwriting-launcher[data-field="${field}"]`).getByRole('button', {name: /^手写输入/});
const result = page => work(page).getByLabel('识别结果，可直接修改', {exact: true});
const body = (page, role) => page.locator(role === 'screen' ? '.screen-composer textarea' : '.publication-composer textarea').first();

async function setup(browser, role, {twoClasses = false, ...options} = {}) {
  const values = {
    'classworks-v2-oobe': JSON.stringify({version: 1, completed: true, roleHint: role}),
    'classworks-v2-screen-oobe:screen-a': JSON.stringify({version: 1, completed: true}),
    ...(role === 'screen' ? {'classworks-v2-screen-token': 'screen-token'} :
      {'classworks-v2-access-token': 'teacher-token', 'classworks-v2-refresh-token': 'teacher-refresh'}),
  };
  const context = await browser.newContext({viewport: {width: 1280, height: 720}, deviceScaleFactor: 2, hasTouch: true,
    storageState: {cookies: [], origins: [{origin, localStorage: Object.entries(values).map(([name, value]) => ({name, value}))}]}, ...options});
  const resourceRequests = [];
  context.on('request', request => {
    if (new URL(request.url()).pathname.includes('/handwriting/r19/')) resourceRequests.push(request.url());
  });
  if (twoClasses) await context.route('**/api/v2/me/workspaces**', async route => {
    const response = await route.fetch(), payload = await response.json();
    const a = payload.data[0];
    payload.data.push({...a, workspace: {...a.workspace, id: 'class-b', name: '高一二班', code: 'C2'}});
    await route.fulfill({response, json: payload});
  });
  // Observation belongs only to this isolated browser, never to the shipped app.
  await context.addInitScript(() => {
    window.ocrTest = {workers: [], results: [], frames: []};
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        const entry = this.entry = {url: String(url), dead: false, sends: 0};
        window.ocrTest.workers.push(entry);
        this.addEventListener('message', ({data}) => {
          if (data?.type === 'result') window.ocrTest.results.push({lines: data.lines, inferenceMs: data.inferenceMs,
            modelBytes: data.modelBytes, runtimeThreads: data.runtimeThreads, cold: data.cold});
        });
      }
      postMessage(...args) { this.entry.sends++; return super.postMessage(...args); }
      terminate() { this.entry.dead = true; return super.terminate(); }
    };
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', d => d.accept());
  await page.goto(origin);
  if (options.serviceWorkers !== 'block') {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  }
  if (role === 'screen') {
    await page.getByRole('button', {name: '录入作业', exact: true}).first().click();
    await page.getByRole('button', {name: '数学', exact: true}).click();
  } else {
    await expect(page.getByRole('button', {name: '账号', exact: true}).first()).toBeVisible();
    const nav = page.locator('.teacher-task-nav');
    if (await nav.isVisible()) await nav.getByRole('button', {name: '新建发布'}).click();
    await page.locator('.publication-composer').getByRole('combobox').first().click();
    await page.getByRole('option', {name: '数学', exact: true}).click();
    await selectClass(page, '高一一班');
  }
  return {page, context, errors, resourceRequests};
}
async function selectClass(page, name) {
  const input = page.locator('.publication-composer').getByLabel('发布到', {exact: true});
  await input.fill(name);
  await page.getByRole('option').filter({hasText: name}).first().click();
  await page.keyboard.press('Escape');
}
async function open(page, field = 'content') { await launcher(page, field).click(); await work(page).waitFor(); }
async function paint(page, texts) {
  if (!Array.isArray(texts)) texts = [texts];
  const canvas = work(page).locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  for (let row = 0; row < texts.length; row++) {
    await page.mouse.move(box.x + box.width * .02, box.y + box.height * (row / 3 + .04));
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .97, box.y + box.height * (row / 3 + .30), {steps: 4});
    await page.mouse.up();
  }
  // Generated glyphs are a stable transport/model regression, not human ink acceptance.
  await canvas.evaluate((element, texts) => {
    const ctx = element.getContext('2d'); ctx.clearRect(0, 0, 1200, 480);
    ctx.font = '50px "Microsoft YaHei"'; ctx.fillStyle = '#192e25';
    texts.forEach((text, row) => ctx.fillText(text, 35, 110 + row * 160));
  }, texts);
}
async function recognize(page) {
  const previous = await page.evaluate(() => window.ocrTest.results.length);
  const start = Date.now();
  await work(page).getByRole('button', {name: '识别文字', exact: true}).click();
  await expect(work(page)).toHaveAttribute('data-busy', 'false', {timeout: 90000});
  expect(await page.evaluate(() => window.ocrTest.results.length), await work(page).locator('.handwriting-status').innerText()).toBeGreaterThan(previous);
  return {text: await result(page).inputValue(), totalMs: Date.now() - start, ...await page.evaluate(() => window.ocrTest.results.at(-1))};
}
async function insert(page, text) {
  if (text !== undefined) await result(page).fill(text);
  await work(page).getByRole('button', {name: '插入正文', exact: true}).click();
  await expect(work(page)).toHaveCount(0);
}
async function noLiveWorkers(page) {
  expect(await page.evaluate(() => window.ocrTest.workers.filter(w => !w.dead))).toEqual([]);
}
test.beforeEach(async ({request}) => {
  await request.post(`${origin}/__test/release`, {data: {release: 'previous'}});
  await request.post(`${api}/__test/reset`);
});

for (const role of ['screen', 'teacher']) test(`${role}: ordinary text entry and unconfirmed ink never start or download the model`, async ({browser}) => {
  const s = await setup(browser, role);
  try {
    await body(s.page, role).fill('正常键盘录入第10—20页，第1、11题。');
    expect(s.resourceRequests).toEqual([]);
    await noLiveWorkers(s.page);
    await open(s.page);
    await paint(s.page, '尚未请求识别');
    await expect(work(s.page)).toContainText('1 笔');
    expect(s.resourceRequests).toEqual([]);
    await noLiveWorkers(s.page);
    await work(s.page).getByRole('button', {name: '返回录入', exact: true}).click();
    await expect(work(s.page)).toHaveCount(0);
    await expect(body(s.page, role)).toHaveValue('正常键盘录入第10—20页，第1、11题。');
    expect(s.resourceRequests).toEqual([]);
    await noLiveWorkers(s.page);
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

for (const role of ['screen', 'teacher']) test(`${role}: required and optional confirmation only submits plain text through the existing save`, async ({browser, request}) => {
  const s = await setup(browser, role);
  try {
    await noLiveWorkers(s.page);
    await body(s.page, role).fill('题号12');
    await body(s.page, role).evaluate(el => el.setSelectionRange(4, 4));
    await open(s.page);
    await paint(s.page, '完成第10—20页，第1、11题。');
    const run = await recognize(s.page);
    expect(run.runtimeThreads).toBe(1);
    expect(run.text).toContain('10');
    expect((await (await request.get(`${api}/__test/state`)).json()).data.items).toEqual([]);
    await insert(s.page, ' 15\n');
    await expect(body(s.page, role)).toHaveValue('题号12 15\n');
    await noLiveWorkers(s.page);
    if (role === 'teacher') await s.page.getByRole('button', {name: '添加选做内容', exact: true}).click();
    await open(s.page, 'optionalContent');
    await insert(s.page, '选做第8题，NaOH与CO2');
    await expect(s.page.getByLabel('选做内容（可选）', {exact: true})).toHaveValue('选做第8题，NaOH与CO2');
    await s.page.getByRole('button', {name: role === 'screen' ? '保存作业' : '正式发布', exact: true}).click();
    await expect.poll(async () => (await (await request.get(`${api}/__test/state`)).json()).data.items.length).toBe(1);
    const saved = (await (await request.get(`${api}/__test/state`)).json()).data.items[0];
    expect(saved.content.trim()).toBe('题号12 15');
    expect(saved.contentJson.optionalContent).toBe('选做第8题，NaOH与CO2');
    expect(JSON.stringify(saved)).not.toMatch(/memoryFeature|data:image|strokes|Float32Array|modelText|inputPool/);
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test('prepared PWA recognizes offline and screen text follows the original offline queue and retry', async ({browser, request}) => {
  const s = await setup(browser, 'screen');
  try {
    await open(s.page); await paint(s.page, '第10—20页，第1、11题。'); await recognize(s.page);
    await insert(s.page, '联网已确认正文');
    await s.context.setOffline(true);
    await open(s.page, 'optionalContent');
    await paint(s.page, '第12～15页；第6至8题。');
    const offline = await recognize(s.page);
    expect(offline.text).toContain('12');
    await expect(work(s.page)).toContainText('识别资源已缓存');
    await expect(work(s.page)).not.toContainText('请保持联网');
    await insert(s.page, '离线识别后确认的选做');
    await s.page.getByRole('button', {name: '保存作业', exact: true}).click();
    await expect(s.page.locator('.screen-composer')).toHaveCount(0);
    const readQueue = () => s.page.evaluate(() => JSON.parse(localStorage.getItem('classworks-v2-screen-publication-queue:screen-a') || '[]'));
    expect((await readQueue())[0].input.contentJson.optionalContent).toBe('离线识别后确认的选做');
    expect(JSON.stringify(await readQueue())).not.toMatch(/strokes|modelText|memoryFeature|data:image/);
    await s.context.setOffline(false);
    await s.page.evaluate(() => window.dispatchEvent(new window.Event('online')));
    await expect.poll(async () => (await (await request.get(`${api}/__test/state`)).json()).data.items.length).toBe(1);
    await expect.poll(readQueue).toEqual([]);
    await noLiveWorkers(s.page); expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test('offline cold start keeps ink and existing draft instead of claiming recognition success', async ({browser}) => {
  const s = await setup(browser, 'screen', {serviceWorkers: 'block'});
  try {
    await body(s.page, 'screen').fill('原有正文'); await open(s.page);
    await s.context.setOffline(true); await paint(s.page, '第10页');
    await work(s.page).getByRole('button', {name: '识别文字', exact: true}).click();
    await expect(work(s.page)).toHaveAttribute('data-busy', 'false');
    await expect(work(s.page).locator('.handwriting-status')).toContainText('联网');
    await expect(work(s.page)).toContainText('1 笔');
    await noLiveWorkers(s.page);
    await work(s.page).getByRole('button', {name: '返回录入'}).click();
    await expect(body(s.page, 'screen')).toHaveValue('原有正文');
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test('boundary: cached resources do not promise offline access without a controlling service worker', async ({browser}) => {
  const s = await setup(browser, 'screen', {serviceWorkers: 'block'});
  try {
    await body(s.page, 'screen').fill('原正文');
    await open(s.page); await paint(s.page, '第10页，第8题。'); await recognize(s.page);
    const resourceHint = await work(s.page).locator('.handwriting-body > small').innerText();
    await work(s.page).getByRole('button', {name: '返回录入'}).click();
    await s.context.setOffline(true);
    await open(s.page); await paint(s.page, '第12页，第11题。');
    await work(s.page).getByRole('button', {name: '识别文字', exact: true}).click();
    await expect(work(s.page)).toHaveAttribute('data-busy', 'false', {timeout: 90000});
    await expect(work(s.page).locator('.handwriting-status')).toContainText('联网');
    await expect(result(s.page)).toHaveValue('');
    await expect(work(s.page)).toContainText('1 笔');
    await expect(body(s.page, 'screen')).toHaveValue('原正文');
    await noLiveWorkers(s.page);
    expect(resourceHint).toContain('已缓存');
    expect(resourceHint).toContain('请保持联网');
    expect(resourceHint).not.toContain('已可离线使用');
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

for (const role of ['screen', 'teacher']) test(`boundary: ${role} undo restores the replaced selection for continued typing`, async ({browser}) => {
  const s = await setup(browser, role);
  try {
    await body(s.page, role).fill('完成第10—20页');
    await body(s.page, role).evaluate(el => el.setSelectionRange(3, 5));
    await open(s.page); await insert(s.page, '12');
    await expect(body(s.page, role)).toHaveValue('完成第12—20页');
    await s.page.locator('.handwriting-launcher[data-field="content"]').getByRole('button', {name: '撤销本次插入', exact: true}).click();
    await expect(body(s.page, role)).toHaveValue('完成第10—20页');
    await expect(body(s.page, role)).toBeFocused();
    expect(await body(s.page, role).evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([3, 5]);
    await s.page.keyboard.insertText('15');
    await expect(body(s.page, role)).toHaveValue('完成第15—20页');
    await noLiveWorkers(s.page); expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test('teacher class switch while the editor chunk loads invalidates the old selection', async ({browser}) => {
  const s = await setup(browser, 'teacher', {serviceWorkers: 'block', twoClasses: true});
  try {
    // Real control input remains available until the asynchronous editor mounts.
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await s.page.route('**/assets/HandwritingInput-*.js', async route => { await gate; await route.continue(); });
    await body(s.page, 'teacher').fill('原班级正文');
    await launcher(s.page).click();
    const target = s.page.locator('.publication-composer').getByLabel('发布到', {exact: true});
    await target.click();
    await s.page.getByRole('option').filter({hasText: '高一一班'}).first().click();
    await s.page.keyboard.press('Escape');
    await selectClass(s.page, '高一二班');
    release();
    await expect(s.page.locator('.text-input-extension').first()).toContainText('编辑范围已变化');
    await expect(work(s.page)).toHaveCount(0);
    await expect(body(s.page, 'teacher')).toHaveValue('原班级正文');
    await noLiveWorkers(s.page); expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

for (const role of ['screen', 'teacher']) test(`race: ${role} only opens the latest field requested during the editor download`, async ({browser}) => {
  const s = await setup(browser, role, {serviceWorkers: 'block'});
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    if (role === 'teacher') await s.page.getByRole('button', {name: '添加选做内容', exact: true}).click();
    await body(s.page, role).fill('保留原有必做正文');
    await s.page.route('**/assets/HandwritingInput-*.js', async route => { await gate; await route.continue(); });
    await launcher(s.page).click();
    await launcher(s.page, 'optionalContent').click();
    release();
    await expect(work(s.page)).toHaveCount(1);
    await expect(work(s.page).getByRole('heading', {name: '手写选做正文', exact: true})).toBeVisible();
    await insert(s.page, '选做第8题');
    await expect(work(s.page)).toHaveCount(0);
    await expect(body(s.page, role)).toHaveValue('保留原有必做正文');
    await expect(s.page.getByLabel('选做内容（可选）', {exact: true})).toHaveValue('选做第8题');
    // The retired first button must be usable again, without another download.
    await open(s.page); await insert(s.page, '，补充第11题');
    await expect(body(s.page, role)).toHaveValue('保留原有必做正文，补充第11题');
    await noLiveWorkers(s.page); expect(s.errors).toEqual([]);
  } finally { release(); await s.context.close(); }
});

test('screen draft retains confirmed text across closing, and discards unconfirmed ink', async ({browser}) => {
  const s = await setup(browser, 'screen');
  try {
    await open(s.page); await insert(s.page, '已确认的草稿正文');
    await open(s.page, 'optionalContent');
    await paint(s.page, '尚未确认'); await result(s.page).fill('未确认的选做');
    await work(s.page).getByRole('button', {name: '返回录入'}).click();
    await expect(s.page.getByLabel('选做内容（可选）', {exact: true})).toHaveValue('');
    await s.page.locator('.screen-composer').getByRole('button', {name: '取消', exact: true}).click();
    await s.page.getByRole('button', {name: '录入作业', exact: true}).first().click();
    await expect(body(s.page, 'screen')).toHaveValue('已确认的草稿正文');
    await expect(s.page.getByLabel('选做内容（可选）', {exact: true})).toHaveValue('');
    const drafts = await s.page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.includes('screen-homework-draft')));
    expect(JSON.stringify(drafts)).not.toMatch(/未确认|strokes|data:image|modelText|memoryFeature/);
    await noLiveWorkers(s.page); expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test('teacher offline save retains confirmed text and never pretends it was published', async ({browser, request}) => {
  const s = await setup(browser, 'teacher');
  try {
    await open(s.page); await insert(s.page, '断网后仍保留的教师正文');
    await s.context.setOffline(true);
    await s.page.getByRole('button', {name: '保存草稿', exact: true}).click();
    await expect(s.page.locator('.publication-composer .v-alert')).toContainText('失败');
    await expect(body(s.page, 'teacher')).toHaveValue('断网后仍保留的教师正文');
    expect((await (await request.get(`${api}/__test/state`)).json()).data.items).toEqual([]);
    await noLiveWorkers(s.page); expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test('a failed editor download can retry without refreshing or discarding the original body', async ({browser}) => {
  const s = await setup(browser, 'screen', {serviceWorkers: 'block'});
  let attempts = 0;
  try {
    await s.page.route('**/assets/HandwritingInput-*.js', route => {
      attempts++;
      return attempts === 1 ? route.fulfill({status: 503, contentType: 'text/javascript', body: ''}) : route.continue();
    });
    await body(s.page, 'screen').fill('模块失败也保留原文');
    await launcher(s.page).click();
    await expect(s.page.locator('.text-input-extension').first()).toContainText('手写输入暂不可用');
    await expect(body(s.page, 'screen')).toHaveValue('模块失败也保留原文');
    await open(s.page); await insert(s.page, '恢复后的文字');
    await expect(body(s.page, 'screen')).toHaveValue('模块失败也保留原文恢复后的文字');
    expect(attempts).toBe(2); await noLiveWorkers(s.page);
  } finally { await s.context.close(); }
});

test('follow-up: unchanged ink retains manually corrected text when recognition is clicked again', async ({browser}) => {
  const s = await setup(browser, 'screen');
  try {
    await open(s.page); await paint(s.page, '完成第10—20页。'); await recognize(s.page);
    await result(s.page).fill('完成第10—20页，另做第8题。');
    const count = await s.page.evaluate(() => window.ocrTest.results.length);
    await work(s.page).getByRole('button', {name: '识别文字', exact: true}).click();
    await expect(work(s.page)).toHaveAttribute('data-busy', 'false');
    await expect(result(s.page)).toHaveValue('完成第10—20页，另做第8题。');
    expect(await s.page.evaluate(() => window.ocrTest.results.length)).toBe(count);
    await insert(s.page);
    await expect(body(s.page, 'screen')).toHaveValue('完成第10—20页，另做第8题。');
    await noLiveWorkers(s.page); expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test('follow-up: recognizing changed ink asks before replacing a manual correction', async ({browser}) => {
  const s = await setup(browser, 'teacher');
  try {
    await open(s.page); await paint(s.page, '第10页，第1题。'); await recognize(s.page);
    await result(s.page).fill('老师校对后的第10页，第11题。');
    await paint(s.page, '第20页，第8题。');
    s.page.removeAllListeners('dialog');
    const dismissed = s.page.waitForEvent('dialog');
    s.page.once('dialog', dialog => dialog.dismiss());
    await work(s.page).getByRole('button', {name: '识别文字', exact: true}).click();
    expect((await dismissed).message()).toContain('修改');
    await expect(result(s.page)).toHaveValue('老师校对后的第10页，第11题。');
    expect(await s.page.evaluate(() => window.ocrTest.results.length)).toBe(1);
    s.page.on('dialog', dialog => dialog.accept());
    await recognize(s.page);
    expect(await result(s.page).inputValue()).toContain('20');
    await insert(s.page); await noLiveWorkers(s.page); expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

for (const role of ['screen', 'teacher']) test(`follow-up: ${role} continues typing at the confirmed insertion cursor`, async ({browser}) => {
  const s = await setup(browser, role);
  try {
    // Begin from a non-text control, as when selecting a subject/class by touch.
    await open(s.page); await insert(s.page, '完成第10页');
    await expect(body(s.page, role)).toBeFocused();
    await s.page.keyboard.insertText('，第8题');
    await expect(body(s.page, role)).toHaveValue('完成第10页，第8题');
    await noLiveWorkers(s.page); expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test('follow-up: reused homework confirms only new body text and leaves its source unchanged', async ({browser, request}) => {
  const date = new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Shanghai'});
  await request.post(`${api}/api/v2/publications`, {data: {subjectId: 'math', targetWorkspaceIds: ['class-a'],
    title: '手写复用来源', content: '原历史必做', contentJson: {optionalContent: '原历史选做'},
    boardDate: date, publishAt: new Date(Date.now() - 60000).toISOString()}});
  const s = await setup(browser, 'teacher');
  try {
    await s.page.getByRole('button', {name: '复用历史作业', exact: true}).click();
    const reuse = s.page.locator('.homework-reuse-dialog');
    await reuse.getByRole('checkbox').check();
    await reuse.getByRole('button', {name: '核对所选 1 项作业', exact: true}).click();
    const required = reuse.locator('.publication-composer textarea').first();
    const optional = reuse.getByLabel('选做内容（可选）', {exact: true});
    await expect(required).toHaveValue('原历史必做');
    await expect(optional).toHaveValue('原历史选做');
    const target = reuse.getByLabel('发布到', {exact: true});
    await target.fill('高一一班');
    await s.page.getByRole('option').filter({hasText: '高一一班'}).first().click();
    await s.page.keyboard.press('Escape');
    await required.evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
    await reuse.locator('.handwriting-launcher[data-field="content"]').getByRole('button', {name: /^手写输入/}).click();
    await insert(s.page, '，补充第8题');
    await optional.evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
    await reuse.locator('.handwriting-launcher[data-field="optionalContent"]').getByRole('button', {name: /^手写输入/}).click();
    await insert(s.page, '，补充第11题');
    await reuse.getByLabel('已重新核对截止时间（可留空）和携带日期', {exact: true}).check();
    const submission = s.page.waitForRequest(req => req.method() === 'POST' && new URL(req.url()).pathname === '/api/v2/publications');
    await reuse.getByRole('button', {name: '保存草稿', exact: true}).click();
    expect((await submission).postDataJSON().status).toBe('DRAFT');
    await expect.poll(async () => (await (await request.get(`${api}/__test/state`)).json()).data.items.length).toBe(2);
    const items = (await (await request.get(`${api}/__test/state`)).json()).data.items;
    expect(items[0].content).toBe('原历史必做');
    expect(items[0].contentJson.optionalContent).toBe('原历史选做');
    expect(items[1].content).toBe('原历史必做，补充第8题');
    expect(items[1].contentJson.optionalContent).toBe('原历史选做，补充第11题');
    expect(JSON.stringify(items[1])).not.toMatch(/strokes|modelText|memoryFeature|data:image/);
    await noLiveWorkers(s.page); expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test('follow-up: repeated confirmation releases real workers and each reopen can recognize again', async ({browser}) => {
  const s = await setup(browser, 'screen'), control = await browser.newBrowserCDPSession();
  const workers = async () => (await control.send('Target.getTargets')).targetInfos.filter(t => t.type === 'worker' && t.url.startsWith(origin));
  try {
    for (let i = 0; i < 4; i++) {
      await open(s.page); await paint(s.page, '第10—20页，第1、11题。'); await recognize(s.page);
      expect((await workers()).length).toBe(1);
      await insert(s.page);
      await noLiveWorkers(s.page); await expect.poll(async () => (await workers()).length).toBe(0);
    }
    expect(await s.page.evaluate(() => window.ocrTest.results.length)).toBe(4);
    expect(s.errors).toEqual([]);
  } finally { await s.context.close(); await control.detach(); }
});

test('follow-up: background interruption retains correction and ink before a fresh foreground recognition', async ({browser}) => {
  const s = await setup(browser, 'screen');
  try {
    await open(s.page); await paint(s.page, '第10—20页，第1、11题。'); await recognize(s.page);
    await result(s.page).fill('已校对：第10—20页，第11题。');
    // Headless Edge keeps all tabs visible. Exercise the visibility event path
    // explicitly; this does not claim acceptance of an installed PWA background.
    await s.page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable: true, value: true});
      document.dispatchEvent(new window.Event('visibilitychange'));
    });
    await noLiveWorkers(s.page);
    await expect(result(s.page)).toHaveValue('已校对：第10—20页，第11题。');
    await s.page.evaluate(() => { delete document.hidden; document.dispatchEvent(new window.Event('visibilitychange')); });
    await work(s.page).getByRole('button', {name: '识别文字', exact: true}).click();
    await expect(result(s.page)).toHaveValue('已校对：第10—20页，第11题。');
    await noLiveWorkers(s.page);
    await paint(s.page, '第20页，第8题。'); await recognize(s.page);
    expect(await result(s.page).inputValue()).toContain('20');
    await insert(s.page); await noLiveWorkers(s.page); expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test('lifecycle: canceled cold preparation can retry before its delayed download finishes', async ({browser}) => {
  const s = await setup(browser, 'screen', {serviceWorkers: 'block'});
  let release, entered, requests = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const downloading = new Promise(resolve => { entered = resolve; });
  try {
    await s.context.route('**/handwriting/r19/assets/manifest.json', async route => {
      if (++requests === 1) { entered(); await gate; }
      await route.continue();
    });
    await body(s.page, 'screen').fill('保留原正文');
    await open(s.page); await paint(s.page, '第10—20页，第1、11题。');
    await result(s.page).fill('尚未插入的校对文字');
    await work(s.page).getByRole('button', {name: '识别文字', exact: true}).click();
    await downloading;
    await work(s.page).getByRole('button', {name: '取消识别', exact: true}).click();
    await noLiveWorkers(s.page);
    await expect(result(s.page)).toHaveValue('尚未插入的校对文字');
    await expect(work(s.page)).toContainText('1 笔');
    const run = await recognize(s.page);
    expect(run.text).toContain('10');
    release();
    await expect(work(s.page).locator('.handwriting-status')).toContainText('识别完成');
    await expect(body(s.page, 'screen')).toHaveValue('保留原正文');
    await insert(s.page);
    await noLiveWorkers(s.page); expect(s.errors).toEqual([]);
  } finally { release(); await s.context.close(); }
});

test('lifecycle: a second window retains its ink and can recognize after the owning window closes', async ({browser}) => {
  const s = await setup(browser, 'screen');
  try {
    await open(s.page); await paint(s.page, '第10页，第8题。'); await recognize(s.page);
    const other = await s.context.newPage();
    other.on('pageerror', error => s.errors.push(error.message));
    other.on('dialog', dialog => dialog.accept());
    await other.goto(origin);
    await other.getByRole('button', {name: '录入作业', exact: true}).first().click();
    await other.getByRole('button', {name: '数学', exact: true}).click();
    await open(other); await paint(other, '第12—15页，第11题。');
    await work(other).getByRole('button', {name: '识别文字', exact: true}).click();
    await expect(work(other)).toHaveAttribute('data-busy', 'false');
    await expect(work(other).locator('.handwriting-status')).toContainText('另一个窗口');
    await expect(work(other)).toContainText('1 笔');
    await noLiveWorkers(other);
    expect(await s.page.evaluate(() => window.ocrTest.workers.filter(w => !w.dead).length)).toBe(1);
    await s.page.close();
    await expect.poll(async () => (await other.evaluate(() => navigator.locks.query())).held.filter(lock => lock.name === 'npclassworks-handwriting-lab-ocr').length).toBe(0);
    expect((await recognize(other)).text).toContain('12');
    await insert(other); await noLiveWorkers(other); expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

for (const width of [1280, 640, 390, 320]) test(`DPR2 layout and real touch capture at ${width} CSS px retain reachable actions`, async ({browser}, info) => {
  const s = await setup(browser, 'screen', {viewport: {width, height: width === 1280 ? 720 : 480}});
  try {
    await open(s.page);
    const canvas = work(s.page).locator('canvas');
    await canvas.scrollIntoViewIfNeeded(); const box = await canvas.boundingBox();
    await canvas.evaluate(el => el.addEventListener('gotpointercapture', event => { el.dataset.testPointer = String(event.pointerId); }));
    const cdp = await s.context.newCDPSession(s.page);
    const p = {x: box.x + box.width * .2, y: box.y + box.height * .2};
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [p]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: p.x + 35, y: p.y + 5}]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await expect(work(s.page)).toContainText('1 笔');
    expect(await canvas.evaluate(el => Number(el.dataset.testPointer) > 0 && !el.hasPointerCapture(Number(el.dataset.testPointer)))).toBe(true);
    expect(await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await result(s.page).fill('第10—20页\n' + '第1、11题，选做第8题。'.repeat(30));
    const insertButton = work(s.page).getByRole('button', {name: '插入正文', exact: true});
    await expect(insertButton).toBeInViewport();
    await expect(work(s.page).getByRole('button', {name: '返回录入'})).toBeInViewport();
    await s.page.screenshot({path: info.outputPath(`handwriting-${width}-dpr2.png`)});
    await insert(s.page); await noLiveWorkers(s.page); expect(s.errors).toEqual([]);
  } finally { await s.context.close(); }
});

test('new mixed-text strokes keep the validated model output without worker overlap or retained workers', async ({browser}, info) => {
  const s = await setup(browser, 'screen');
  test.setTimeout(120000);
  const fixtures = generated.cases;
  const runs = [];
  const processSamples = [], control = await browser.newBrowserCDPSession();
  const sampler = process.platform === 'win32' ? await startBrowserProcessSampler(control, sample => processSamples.push({time: sample.time, privateBytes: sample.bytes})) : null;
  try {
    const beforeOpen = await sampler?.sample();
    await open(s.page);
    await s.page.evaluate(() => {
      let previous = window.performance.now();
      window.ocrTest.trackFrames = true;
      function frame(now) {
        if (!window.ocrTest.trackFrames) return;
        if (window.ocrTest.frames.length < 4000) window.ocrTest.frames.push(now - previous);
        previous = now; window.requestAnimationFrame(frame);
      }
      window.requestAnimationFrame(frame);
    });
    const cdp = await s.context.newCDPSession(s.page);
    await cdp.send('Performance.enable');
    for (let repeat = 0; repeat < 3; repeat++) for (const [i, fixture] of fixtures.entries()) {
      if (i || repeat) await work(s.page).getByRole('button', {name: '清空笔迹', exact: true}).click();
      await paint(s.page, fixture.fixture);
      const run = await recognize(s.page);
      await sampler?.sample();
      const heap = (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value;
      runs.push({fixture: fixture.fixture, text: run.text, totalMs: run.totalMs, modelMs: run.lines.reduce((n, line) => n + line.modelMs, 0), pageHeapBytes: heap});
      // This frozen font is available on our Windows validation workstation.
      // Linux CI still verifies transport/repeated output, without conflating a
      // different CJK fallback font with a changed recognition model.
      if (process.platform === 'win32') {
        expect(run.text).toBe(fixture.text);
        expect(run.lines.map(line => line.modelText).join('\n')).toBe(fixture.modelText);
      }
      expect(run.runtimeThreads).toBe(1);
      expect(await s.page.evaluate(() => window.ocrTest.workers.filter(w => !w.dead).length)).toBe(1);
      expect((await control.send('Target.getTargets')).targetInfos.filter(t => t.type === 'worker' && t.url.startsWith(origin)).length).toBe(1);
      if (repeat) expect(run.text).toBe(runs[i].text);
    }
    await insert(s.page);
    await noLiveWorkers(s.page);
    await expect.poll(async () => (await control.send('Target.getTargets')).targetInfos.filter(t => t.type === 'worker' && t.url.startsWith(origin)).length).toBe(0);
    const afterClose = await sampler?.sample();
    const frameGaps = await s.page.evaluate(() => { window.ocrTest.trackFrames = false; return window.ocrTest.frames; });
    expect(s.errors).toEqual([]);
    await info.attach('recognition-measurements', {body: JSON.stringify({scope: 'generated glyphs; page JS heap and owned browser-group PrivateBytes; no forced GC',
      beforeOpenBytes: beforeOpen?.bytes, afterCloseBytes: afterClose?.bytes, processSamples, frameGaps, runs}, null, 2), contentType: 'application/json'});
  } finally { await sampler?.stop(); await s.context.close(); await control.detach(); }
});
