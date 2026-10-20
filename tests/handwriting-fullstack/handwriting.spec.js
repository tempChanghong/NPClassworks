import {test, expect} from '../fullstack/fixture.js';
import {api, origin} from '../e2e/environment.js';
import {backendModule} from '../fullstack/environment.js';
import {todayBoardDate} from '../../src/utils/boardDate.js';
import {createHash, randomUUID} from 'node:crypto';

test.use({actionTimeout: 15000});

const work = page => page.locator('.handwriting-workspace:visible');
const composer = (page, role) => page.locator(role === 'screen' ? '.screen-composer' : '.publication-composer').first();
const body = (page, role) => composer(page, role).locator('textarea').first();
const result = page => work(page).getByLabel('识别结果，可直接修改', {exact: true});
const forbidden = /^(strokes?|ink|canvas|image|candidates?|modelText|memoryFeature|features?|inputPool|inferenceMs|modelBytes|runtimeThreads|changes)$/i;

function textOnly(value) {
  if (typeof value === 'string') expect(value).not.toMatch(/data:image|未确认绝不落库/);
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) { expect(key).not.toMatch(forbidden); textOnly(child); }
}
function observe(page) {
  const mutations = [];
  page.on('dialog', dialog => dialog.accept());
  page.on('request', request => {
    if (new URL(request.url()).origin === api && /publications/.test(request.url()) && ['POST', 'PATCH', 'PUT'].includes(request.method()))
      mutations.push({method: request.method(), path: new URL(request.url()).pathname, body: request.postDataJSON()});
  });
  return mutations;
}
async function chooseClass(page, scope, name) {
  const input = scope.getByRole('combobox', {name: '发布到 发布到', exact: true});
  await input.fill(name);
  await page.getByRole('option').filter({hasText: name}).first().click();
  await page.keyboard.press('Escape');
}
async function setup(classroom, role) {
  const session = await classroom.open(role, {viewport: {width: 1280, height: 720}, deviceScaleFactor: 2, hasTouch: true});
  const {page} = session;
  session.mutations = observe(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  if (role === 'screen') {
    await page.getByRole('button', {name: '录入作业', exact: true}).first().click();
    await page.getByRole('button', {name: '数学', exact: true}).click();
  } else {
    await composer(page, role).locator('.v-select').filter({hasText: '科目'}).click();
    await page.getByRole('option', {name: '数学', exact: true}).click();
    await chooseClass(page, composer(page, role), '高一一班');
  }
  return session;
}
async function open(page, field = 'content', scope = page) {
  await scope.locator(`.handwriting-launcher[data-field="${field}"]`).getByRole('button', {name: /^手写输入/}).click();
  await expect(work(page)).toBeVisible();
}
async function recognize(page) {
  const canvas = work(page).locator('canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * .02, box.y + box.height * .04); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .97, box.y + box.height * .30, {steps: 4}); await page.mouse.up();
  // Generated glyphs exercise the actual pinned model, not real handwriting accuracy.
  await canvas.evaluate(element => {
    const ctx = element.getContext('2d'); ctx.clearRect(0, 0, 1200, 480);
    ctx.font = '50px "Microsoft YaHei"'; ctx.fillStyle = '#192e25';
    ctx.fillText('完成第10—20页，第1、11题。', 35, 110);
  });
  await work(page).getByRole('button', {name: '识别文字', exact: true}).click();
  await expect(work(page)).toHaveAttribute('data-busy', 'false', {timeout: 90000});
  await expect(result(page)).toHaveValue(/10/);
}
async function insert(page, text) {
  await result(page).fill(text);
  await work(page).getByRole('button', {name: '插入正文', exact: true}).click();
  await expect(work(page)).toHaveCount(0);
}
async function write(page, text, field = 'content', scope = page) {
  await open(page, field, scope); await recognize(page); await insert(page, text);
}
async function storageTextOnly(page) {
  const records = await page.evaluate(() => Object.entries(localStorage).filter(([key]) =>
    /screen-homework-draft|screen-publication-queue/.test(key)).map(([key, value]) => ({key, value: JSON.parse(value)})));
  textOnly(records);
  return records;
}
async function persisted(classroom, mutations) {
  const rows = await classroom.rows();
  textOnly(rows); textOnly(mutations);
  textOnly(await classroom.prisma.auditLog.findMany({where: {schoolId: classroom.school.id}}));
  return rows;
}
async function create(classroom, request, content = '服务端原正文', overrides = {}) {
  const response = await request.post(`${api}/api/v2/publications`, {
    headers: {Authorization: `Bearer ${classroom.credentials.accessToken}`},
    data: {type: 'ASSIGNMENT', status: 'PUBLISHED', subjectId: classroom.subject.id,
      targetWorkspaceIds: [classroom.workspace.id], boardDate: todayBoardDate(), content, ...overrides},
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data;
}
async function edit(classroom, role, options) {
  const session = await classroom.open(role, options);
  session.mutations = observe(session.page);
  if (role === 'screen') await session.page.getByRole('button', {name: '修改', exact: true}).click();
  else {
    await session.page.locator('.publication-list-item button').filter({has: session.page.locator('.mdi-dots-vertical')}).first().click();
    await session.page.getByText('编辑', {exact: true}).click();
  }
  return session;
}

async function changePeerTeacherLogin(classroom, request, page, peer, change) {
  if (change === 'renewal') {
    const response = await request.post(`${api}/accounts/refresh`, {data: {refresh_token: classroom.credentials.refreshToken}});
    expect(response.status()).toBe(200);
    const payload = await response.json(), token = (payload.data || payload).access_token;
    expect(typeof token).toBe('string');
    await peer.evaluate(value => localStorage.setItem('classworks-v2-access-token', value), token);
  } else {
    const {generateTokenPair} = await backendModule('utils/tokenManager.js');
    const tokens = await generateTokenPair(classroom.account);
    const replaceLogin = values => {
      localStorage.setItem('classworks-v2-access-token', values.accessToken);
      localStorage.setItem('classworks-v2-refresh-token', values.refreshToken);
    };
    await peer.evaluate(replaceLogin, tokens);
    if (change === 'login-return') await peer.evaluate(replaceLogin, classroom.credentials);
  }
  await page.bringToFront();
}

test('the production test server serves the pinned module and WASM with their correct MIME types', async ({request}) => {
  for (const [name, type] of [['ort-wasm-simd-threaded.mjs', 'text/javascript'], ['ort-wasm-simd-threaded.wasm', 'application/wasm']]) {
    const response = await request.head(`${origin}/handwriting/r19/assets/${name}`);
    expect(response.status()).toBe(200); expect(response.headers()['content-type']).toBe(type);
  }
});

for (const role of ['screen', 'teacher']) test(`${role}: actual OCR confirmation persists only corrected required and optional text`, async ({classroom}) => {
  const {page, errors, mutations} = await setup(classroom, role);
  await open(page); await recognize(page);
  await result(page).fill('未确认绝不落库');
  expect(await classroom.rows()).toEqual([]); expect(mutations).toEqual([]);
  await insert(page, '必做第10—20页，第1、11题');
  if (role === 'teacher') await page.getByRole('button', {name: '添加选做内容', exact: true}).click();
  await write(page, '选做第8题，NaOH与CO2', 'optionalContent');
  expect(await classroom.rows()).toEqual([]); expect(mutations).toEqual([]);
  await page.getByRole('button', {name: role === 'screen' ? '保存作业' : '正式发布', exact: true}).click();
  await expect.poll(async () => (await classroom.rows()).length).toBe(1);
  const [row] = await persisted(classroom, mutations);
  expect(row.content).toBe('必做第10—20页，第1、11题');
  expect(row.contentJson).toEqual({optionalContent: '选做第8题，NaOH与CO2'});
  expect(row.revision).toBe(1); expect(row.revisions).toHaveLength(1);
  expect(row.revisions[0].snapshot.content).toBe(row.content);
  expect(row.revisions[0].snapshot.contentJson).toEqual(row.contentJson);
  expect(mutations).toHaveLength(1); expect(mutations[0].body.content).toBe(row.content);
  expect(errors).toEqual([]); await storageTextOnly(page);
});

test('screen draft reload keeps confirmed text and discards unconfirmed ink before actual save', async ({classroom}) => {
  const {page, errors, mutations} = await setup(classroom, 'screen');
  await write(page, '已确认的本机草稿正文');
  await open(page, 'optionalContent'); await recognize(page); await result(page).fill('未确认绝不落库');
  await work(page).getByRole('button', {name: '返回录入', exact: true}).click();
  await composer(page, 'screen').getByRole('button', {name: '取消', exact: true}).click();
  await storageTextOnly(page);
  expect(await classroom.rows()).toEqual([]); expect(mutations).toEqual([]);
  await page.reload();
  await page.getByRole('button', {name: '录入作业', exact: true}).first().click();
  await expect(body(page, 'screen')).toHaveValue('已确认的本机草稿正文');
  await expect(page.getByLabel('选做内容（可选）', {exact: true})).toHaveValue('');
  await page.getByRole('button', {name: '保存作业', exact: true}).click();
  await expect.poll(async () => (await classroom.rows()).length).toBe(1);
  const [row] = await persisted(classroom, mutations);
  expect(row.content).toBe('已确认的本机草稿正文'); expect(row.contentJson).toBeNull();
  expect(errors).toEqual([]);
});

test('teacher confirmed draft survives reload and edits without exposing unconfirmed results', async ({classroom}) => {
  const {page, errors, mutations} = await setup(classroom, 'teacher');
  await write(page, '教师确认后保存的草稿');
  await page.getByRole('button', {name: '添加选做内容', exact: true}).click();
  await write(page, '草稿选做第8题', 'optionalContent');
  await page.getByRole('button', {name: '保存草稿', exact: true}).click();
  await expect.poll(async () => (await classroom.rows()).length).toBe(1);
  const [draft] = await persisted(classroom, mutations); expect(draft.status).toBe('DRAFT');
  await page.reload();
  await page.locator('.publication-list-item button').filter({has: page.locator('.mdi-dots-vertical')}).first().click();
  await page.getByText('编辑', {exact: true}).click();
  await expect(body(page, 'teacher')).toHaveValue(draft.content);
  await body(page, 'teacher').fill(''); await write(page, '教师草稿第二版已确认');
  await open(page, 'optionalContent'); await recognize(page); await result(page).fill('未确认绝不落库');
  await work(page).getByRole('button', {name: '返回录入', exact: true}).click();
  await page.getByRole('button', {name: '保存草稿', exact: true}).click();
  await expect.poll(async () => (await classroom.rows())[0].revision).toBe(2);
  const [updated] = await persisted(classroom, mutations);
  expect(updated.content).toBe('教师草稿第二版已确认'); expect(updated.status).toBe('DRAFT');
  expect(updated.contentJson.optionalContent).toBe('草稿选做第8题');
  expect(updated.revisions.map(r => r.snapshot.content)).toEqual([draft.content, updated.content]);
  expect(errors).toEqual([]);
});

test('history reuse inserts confirmed handwriting into a new draft without changing its source', async ({classroom, request}) => {
  const source = await create(classroom, request, '历史来源必做', {title: '手写复用源', boardDate: '2020-01-01',
    publishAt: '2020-01-01T00:00:00Z', contentJson: {optionalContent: '来源选做'}});
  const {page, errors} = await classroom.open('teacher'); const mutations = observe(page);
  await page.getByRole('button', {name: '复用历史作业', exact: true}).click();
  const dialog = page.locator('.homework-reuse-dialog');
  await dialog.getByRole('checkbox', {name: '数学 · 手写复用源', exact: true}).check();
  await dialog.getByLabel('新作业板日期', {exact: true}).fill(todayBoardDate());
  await dialog.getByRole('button', {name: '核对所选 1 项作业', exact: true}).click();
  await dialog.locator('textarea').first().fill(''); await write(page, '复用后确认的第10—20页', 'content', dialog);
  await dialog.getByLabel('选做内容（可选）', {exact: true}).fill('');
  await write(page, '复用后选做第8题', 'optionalContent', dialog);
  await chooseClass(page, dialog, '高一一班');
  await dialog.getByRole('checkbox', {name: '已重新核对截止时间（可留空）和携带日期', exact: true}).check();
  await dialog.getByRole('button', {name: '保存草稿', exact: true}).click();
  await expect(dialog).toContainText('本项已保存为草稿');
  const rows = await persisted(classroom, mutations), original = rows.find(row => row.id === source.id), copy = rows.find(row => row.id !== source.id);
  expect(rows).toHaveLength(2); expect(original.content).toBe('历史来源必做'); expect(original.revision).toBe(1);
  expect(copy.content).toBe('复用后确认的第10—20页'); expect(copy.contentJson.optionalContent).toBe('复用后选做第8题');
  expect(copy.status).toBe('DRAFT'); expect(copy.revision).toBe(1); expect(errors).toEqual([]);
});

for (const change of ['login', 'login-return', 'renewal']) test(`history reuse ${change}: a held real source read retains its login ownership`, async ({classroom, request}) => {
  const source = await create(classroom, request, '等待期间的历史复用正文', {title: '登录交接复用源', boardDate: '2020-01-01', publishAt: '2020-01-01T00:00:00Z'});
  // This exact GET must reach page.route; offline/PWA cases keep the actual SW.
  const {page, context, errors} = await classroom.open('teacher', {serviceWorkers: 'block'});
  const mutations = observe(page), peer = await context.newPage();
  await peer.goto(origin); await expect(peer.getByRole('button', {name: '账号', exact: true}).first()).toBeVisible();
  await page.bringToFront();
  await page.getByRole('button', {name: '复用历史作业', exact: true}).click();
  const dialog = page.locator('.homework-reuse-dialog');
  await dialog.getByRole('checkbox', {name: '数学 · 登录交接复用源', exact: true}).check();
  await dialog.getByLabel('新作业板日期', {exact: true}).fill(todayBoardDate());
  let release, fetched = false;
  const gate = new Promise(resolve => { release = resolve; }), endpoint = `${api}/api/v2/publications/${source.id}`;
  await page.route(endpoint, async route => {
    const response = await route.fetch(); expect(response.status()).toBe(200);
    fetched = true; await gate; await route.fulfill({response});
  });
  try {
    await dialog.getByRole('button', {name: '核对所选 1 项作业', exact: true}).click();
    await expect.poll(() => fetched).toBe(true);
    await changePeerTeacherLogin(classroom, request, page, peer, change);
    const received = page.waitForResponse(response => response.url() === endpoint && response.request().method() === 'GET');
    release(); await (await received).finished();
    if (change === 'renewal') await expect(dialog.locator('textarea').first()).toHaveValue(source.content);
    else await expect(dialog).toHaveCount(0);
    expect(mutations).toEqual([]);
    const [row] = await persisted(classroom, mutations);
    expect(row.id).toBe(source.id); expect(row.revision).toBe(1); expect(row.revisions).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally { release(); }
});

for (const change of ['login', 'login-return', 'renewal']) test(`template ${change}: real replacement confirmation preserves handwritten text ownership`, async ({classroom, request}) => {
  const created = await request.post(`${api}/accounts/preferences/homework-templates`, {
    headers: {Authorization: `Bearer ${classroom.credentials.accessToken}`},
    data: {name: '登录交接模板', title: '', content: '模板必做第12页', optionalContent: '模板选做第9题', materials: '', submission: ''},
  });
  expect(created.status()).toBe(201);
  const {page, context, errors, mutations} = await setup(classroom, 'teacher');
  await write(page, '保留的手写确认正文第10—20页');
  await page.getByRole('button', {name: '添加选做内容', exact: true}).click();
  await write(page, '保留的手写选做第8题', 'optionalContent');
  const peer = await context.newPage();
  await peer.goto(origin); await expect(peer.getByRole('button', {name: '账号', exact: true}).first()).toBeVisible();
  await page.bringToFront();
  await page.getByRole('button', {name: '个人作业模板', exact: true}).click();
  const templates = page.locator('.homework-templates');
  await templates.getByRole('button', {name: '填写使用', exact: true}).click();
  await templates.getByRole('button', {name: '套用到编辑器', exact: true}).click();
  const confirm = page.getByRole('button', {name: '替换内容', exact: true});
  await expect(confirm).toBeVisible();
  await changePeerTeacherLogin(classroom, request, page, peer, change);
  await confirm.click();
  await expect(confirm).toHaveCount(0);
  await expect(body(page, 'teacher')).toHaveValue(change === 'renewal' ? '模板必做第12页' : '保留的手写确认正文第10—20页');
  await expect(composer(page, 'teacher').getByLabel('选做内容（可选）', {exact: true})).toHaveValue(change === 'renewal' ? '模板选做第9题' : '保留的手写选做第8题');
  await expect(templates).toHaveCount(0);
  expect(await persisted(classroom, mutations)).toEqual([]); expect(mutations).toEqual([]); expect(errors).toEqual([]);
});

test('changing the actual target class during editor download revokes the old handwriting request', async ({classroom}) => {
  // Exercise a genuinely cold module request. A controlling SW can serve its
  // precached editor without crossing the browser's network interception hook.
  const session = await classroom.open('teacher', {serviceWorkers: 'block'}), {page, errors} = session; const mutations = observe(page);
  const second = await classroom.prisma.workspace.create({data: {termId: classroom.workspace.termId, gradeId: classroom.workspace.gradeId,
    code: 'C2', name: '高一二班', type: 'ADMIN_CLASS', subjectRules: {create: {subjectId: classroom.subject.id, deliveryMode: 'ADMIN_CLASS'}},
    members: {create: {accountId: classroom.account.id, role: 'TEACHER'}}, teachingAssignments: {create: {accountId: classroom.account.id, subjectId: classroom.subject.id}}}});
  await page.reload(); await expect(page.getByText('已授权 2 个教学空间', {exact: true})).toBeVisible();
  const scope = composer(page, 'teacher');
  await scope.locator('.v-select').filter({hasText: '科目'}).click(); await page.getByRole('option', {name: '数学', exact: true}).click();
  await chooseClass(page, scope, '高一一班'); await body(page, 'teacher').fill('一班原正文');
  let release, held = false; const gate = new Promise(resolve => { release = resolve; });
  await page.route(/\/HandwritingInput-[^/]+\.js$/, async route => { held = true; await gate; await route.continue(); });
  try {
    await scope.locator('.handwriting-launcher[data-field="content"]').getByRole('button', {name: /^手写输入/}).click();
    await expect.poll(() => held).toBe(true);
    await chooseClass(page, scope, '高一一班'); // Toggle the first class off, then select only the second.
    await chooseClass(page, scope, '高一二班');
    release(); await expect(scope).toContainText('编辑范围已变化');
    await expect(work(page)).toHaveCount(0); expect(mutations).toEqual([]); expect(await classroom.rows()).toEqual([]);
    await page.unroute(/\/HandwritingInput-[^/]+\.js$/);
    await body(page, 'teacher').fill(''); await write(page, '二班确认后的作业');
    await page.getByRole('button', {name: '正式发布', exact: true}).click();
    await expect.poll(async () => (await classroom.rows()).length).toBe(1);
    const [row] = await persisted(classroom, mutations);
    expect(row.content).toBe('二班确认后的作业');
    const targets = await classroom.prisma.publicationTarget.findMany({where: {publicationId: row.id}});
    expect(targets.map(target => target.workspaceId)).toEqual([second.id]); expect(errors).toEqual([]);
  } finally { release(); }
});

for (const role of ['screen', 'teacher']) test(`${role}: real 409 preserves confirmed handwriting until explicit version reconciliation`, async ({classroom, request}) => {
  const original = await create(classroom, request, '初始正文', {contentJson: {optionalContent: '初始选做', submission: '交课代表'}});
  const {page, errors, mutations} = await edit(classroom, role);
  await body(page, role).fill(''); await write(page, '本机确认的第10—20页');
  await composer(page, role).getByLabel('选做内容（可选）', {exact: true}).fill('');
  await write(page, '本机确认的选做第8题', 'optionalContent');
  const changed = await request.patch(`${api}/api/v2/publications/${original.id}`, {
    headers: {Authorization: `Bearer ${classroom.credentials.accessToken}`, 'If-Match': '"1"'},
    data: {content: '另一设备已经保存', contentJson: {optionalContent: '远程选做', submission: '改交老师'}},
  });
  expect(changed.status()).toBe(200);
  const conflict = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().includes(`/publications/${original.id}`));
  await page.getByRole('button', {name: role === 'screen' ? '保存作业' : '保存修改', exact: true}).click();
  expect((await conflict).status()).toBe(409);
  await expect(body(page, role)).toHaveValue('本机确认的第10—20页');
  expect((await classroom.rows())[0].content).toBe('另一设备已经保存');
  await page.getByRole('button', {name: role === 'screen' ? '以本机输入生成新版本' : '以我的输入生成新版本', exact: true}).click();
  await page.getByRole('button', {name: '保存新版本', exact: true}).click();
  await expect.poll(async () => (await classroom.rows())[0].revision).toBe(3);
  const [row] = await persisted(classroom, mutations);
  expect(row.content).toBe('本机确认的第10—20页');
  expect(row.contentJson.optionalContent).toBe('本机确认的选做第8题');
  if (role === 'screen') expect(row.contentJson.submission).toBe('改交老师');
  expect(row.revisions.map(r => r.snapshot.content)).toEqual(['初始正文', '另一设备已经保存', row.content]);
  expect(errors).toEqual([]);
});

for (const loseReply of [false, true]) test(`offline screen reload and real replay persist one text-only row (${loseReply ? 'committed reply lost' : 'normal'})`, async ({classroom, request}) => {
  const {page, context, errors, mutations} = await setup(classroom, 'screen');
  await write(page, '离线前已确认的必做第10—20页');
  await context.setOffline(true);
  await write(page, '离线识别后确认的选做第8题', 'optionalContent');
  await page.getByRole('button', {name: '保存作业', exact: true}).click();
  await expect(composer(page, 'screen')).not.toBeVisible();
  const queueKey = `classworks-v2-screen-publication-queue:${classroom.binding.id}`;
  const queued = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), queueKey);
  expect(await queued()).toHaveLength(1); expect(await classroom.rows()).toEqual([]);
  await storageTextOnly(page);
  const reloaded = await page.reload({waitUntil: 'domcontentloaded'}); expect(reloaded.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('button', {name: '录入作业', exact: true}).first()).toBeVisible();
  expect(await queued()).toHaveLength(1);
  const replayInput = (await queued())[0].input;
  let lost = false;
  if (loseReply) await page.route(`${api}/api/v2/classroom-screens/publications`, async route => {
    if (route.request().method() === 'POST' && !lost) {
      lost = true; const actual = await route.fetch(); expect(actual.status()).toBe(201);
      await route.abort('failed'); // Only lose the response; the real API/transaction has executed.
    } else await route.continue();
  });
  await context.setOffline(false);
  await expect.poll(async () => (await classroom.rows()).length).toBe(1);
  if (loseReply) {
    await expect.poll(() => lost).toBe(true);
    // A transient upload failure remains pending (attempts counts review
    // failures). Exercise the existing real 15-30s retry backoff, not a fake
    // timer or an unrelated feed-refresh button.
  }
  await expect.poll(async () => (await queued()).length, {timeout: loseReply ? 45000 : 10000}).toBe(0);
  const [row] = await persisted(classroom, mutations);
  expect(row.content).toBe('离线前已确认的必做第10—20页'); expect(row.contentJson.optionalContent).toBe('离线识别后确认的选做第8题');
  expect(row.revision).toBe(1); expect(row.revisions).toHaveLength(1);
  if (loseReply) {
    const duplicate = await request.post(`${api}/api/v2/classroom-screens/publications`, {
      headers: {'X-Classworks-Screen-Token': classroom.screenToken}, data: replayInput,
    });
    expect(duplicate.status()).toBe(201); // The existing endpoint also returns 201 for an idempotent replay.
    expect((await duplicate.json()).data.id).toBe(row.id);
    const after = await classroom.rows(); expect(after).toHaveLength(1); expect(after[0].revisions).toHaveLength(1);
  }
  expect(new Set(mutations.map(m => m.body.clientRequestId)).size).toBe(1);
  await storageTextOnly(page); expect(errors).toEqual([]);
});

for (const loseReply of [false, true]) test(`explicit duplicate confirmation survives offline reload and real replay (${loseReply ? 'committed reply lost' : 'before commit outage'})`, async ({classroom, request}) => {
  const text = '已确认仍需发布的第10—20页，第1、11题';
  const source = await create(classroom, request, text);
  const {page, context, errors, mutations} = await setup(classroom, 'screen');
  await write(page, text);
  await context.setOffline(true);
  await page.getByRole('button', {name: '保存作业', exact: true}).click();
  await expect(composer(page, 'screen')).not.toBeVisible();
  const queueKey = `classworks-v2-screen-publication-queue:${classroom.binding.id}`;
  const queued = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), queueKey);
  const [original] = await queued();
  expect(original.input.content).toBe(text);
  await context.setOffline(false);
  await expect.poll(async () => (await queued())[0]?.error?.code).toBe('DUPLICATE_ASSIGNMENT_SUSPECTED');
  expect(await classroom.rows()).toHaveLength(1);
  let fault = false;
  await page.route(`${api}/api/v2/classroom-screens/publications`, async route => {
    if (route.request().method() === 'POST' && route.request().postDataJSON().allowDuplicate === true && !fault) {
      fault = true;
      if (loseReply) {
        const actual = await route.fetch(); expect(actual.status()).toBe(201);
        await route.abort('failed'); // Actual transaction commits; only its receipt is lost.
      } else await route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({message: 'controlled pre-commit outage'})});
    } else await route.continue();
  });
  await page.locator('.screen-sync-chip').click();
  await page.getByRole('button', {name: '确认仍然提交', exact: true}).click();
  await expect.poll(() => fault).toBe(true);
  await expect.poll(async () => (await queued())[0]?.status).toBe('pending');
  const [pending] = await queued();
  expect(pending.input).toEqual({...original.input, allowDuplicate: true});
  expect(pending.id).toBe(original.id); expect(pending.queuedAt).toBe(original.queuedAt);
  expect(await classroom.rows()).toHaveLength(loseReply ? 2 : 1);
  await context.setOffline(true);
  const reloaded = await page.reload({waitUntil: 'domcontentloaded'}); expect(reloaded.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('button', {name: '录入作业', exact: true}).first()).toBeVisible();
  expect((await queued())[0].input).toEqual(pending.input);
  await context.setOffline(false);
  await expect.poll(async () => (await queued()).length, {timeout: 45000}).toBe(0);
  const rows = await persisted(classroom, mutations);
  expect(rows).toHaveLength(2);
  const unchanged = rows.find(row => row.id === source.id), copy = rows.find(row => row.id !== source.id);
  expect(unchanged.content).toBe(text); expect(copy.content).toBe(text);
  for (const row of rows) { expect(row.revision).toBe(1); expect(row.revisions).toHaveLength(1); }
  expect(mutations.map(mutation => mutation.body.allowDuplicate === true)).toEqual([false, true, true]);
  expect(new Set(mutations.map(mutation => mutation.body.clientRequestId))).toEqual(new Set([original.input.clientRequestId]));
  await storageTextOnly(page); expect(errors).toEqual([]);
});

test('teacher offline save preserves confirmed text and writes only after explicit online retry', async ({classroom}) => {
  const {page, context, errors, mutations} = await setup(classroom, 'teacher');
  await write(page, '教师离线保留的确认正文');
  await context.setOffline(true);
  await page.getByRole('button', {name: '保存草稿', exact: true}).click();
  await expect(composer(page, 'teacher').locator('.v-alert')).toContainText('失败');
  await expect(body(page, 'teacher')).toHaveValue('教师离线保留的确认正文');
  expect(await classroom.rows()).toEqual([]);
  await context.setOffline(false);
  await page.getByRole('button', {name: '保存草稿', exact: true}).click();
  await expect.poll(async () => (await classroom.rows()).length).toBe(1);
  const [row] = await persisted(classroom, mutations);
  expect(row.content).toBe('教师离线保留的确认正文'); expect(row.status).toBe('DRAFT'); expect(row.revisions).toHaveLength(1);
  expect(errors).toEqual([]);
});

for (const loseReply of [false, true]) test(`a rotated real screen credential retains the confirmed draft after an old ${loseReply ? 'lost' : 'successful'} response`, async ({classroom, request}) => {
  const {page, errors, mutations} = await setup(classroom, 'screen');
  await write(page, '凭证变化前确认的第10—20页');
  let release, committed = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(`${api}/api/v2/classroom-screens/publications`, async route => {
    const response = await route.fetch(); expect(response.status()).toBe(201);
    committed = true; await gate;
    if (loseReply) await route.abort('failed'); else await route.fulfill({response});
  });
  try {
    await page.getByRole('button', {name: '保存作业', exact: true}).click();
    await expect.poll(() => committed).toBe(true);
    const token = randomUUID();
    await classroom.prisma.classroomScreenBinding.update({where: {id: classroom.binding.id},
      data: {tokenHash: createHash('sha256').update(token).digest('hex')}});
    const authorized = await request.get(`${api}/api/v2/classroom-screens/session`, {headers: {'X-Classworks-Screen-Token': token}});
    expect(authorized.status()).toBe(200);
    // Emulate a credential refreshed in another tab while this POST is waiting.
    await page.evaluate(value => localStorage.setItem('classworks-v2-screen-token', value), token);
    release();
    await expect(composer(page, 'screen')).toContainText('大屏绑定或凭证已变化');
    await expect(body(page, 'screen')).toHaveValue('凭证变化前确认的第10—20页');
    const records = await storageTextOnly(page);
    expect(records.some(record => record.key.includes('screen-homework-draft') && record.value.content === '凭证变化前确认的第10—20页')).toBe(true);
    expect(records.filter(record => record.key.includes('screen-publication-queue')).flatMap(record => record.value)).toEqual([]);
    const [row] = await persisted(classroom, mutations);
    expect((await classroom.rows())).toHaveLength(1); expect(row.revisions).toHaveLength(1);
    expect(row.content).toBe('凭证变化前确认的第10—20页'); expect(errors).toEqual([]);
  } finally { release(); }
});

test('a recovered confirmed screen draft keeps its old base and resolves a real later revision explicitly', async ({classroom, request}) => {
  const original = await create(classroom, request, '原始正文', {contentJson: {optionalContent: '原选做'}});
  const {page, errors, mutations} = await edit(classroom, 'screen');
  await body(page, 'screen').fill(''); await write(page, '恢复草稿的已确认必做');
  await composer(page, 'screen').getByLabel('选做内容（可选）', {exact: true}).fill('');
  await write(page, '恢复草稿的已确认选做', 'optionalContent');
  await composer(page, 'screen').getByRole('button', {name: '取消', exact: true}).click();
  const updated = await request.patch(`${api}/api/v2/publications/${original.id}`, {
    headers: {Authorization: `Bearer ${classroom.credentials.accessToken}`, 'If-Match': '"1"'},
    data: {content: '服务器第二版', contentJson: {optionalContent: '服务器选做'}},
  });
  expect(updated.status()).toBe(200);
  await page.reload(); await page.getByRole('button', {name: '修改', exact: true}).click();
  await expect(body(page, 'screen')).toHaveValue('恢复草稿的已确认必做');
  await expect(composer(page, 'screen')).toContainText('你打开的是版本 1，服务器现在是版本 2');
  await expect(page.getByRole('button', {name: '保存作业', exact: true})).toBeDisabled();
  expect((await classroom.rows())[0].content).toBe('服务器第二版');
  await page.getByRole('button', {name: '以本机输入生成新版本', exact: true}).click();
  await page.getByRole('button', {name: '保存新版本', exact: true}).click();
  await expect.poll(async () => (await classroom.rows())[0].revision).toBe(3);
  const [row] = await persisted(classroom, mutations);
  expect(row.content).toBe('恢复草稿的已确认必做'); expect(row.contentJson.optionalContent).toBe('恢复草稿的已确认选做');
  expect(row.revisions.map(r => r.snapshot.content)).toEqual(['原始正文', '服务器第二版', row.content]);
  expect(errors).toEqual([]);
});

test('a real conflict copied offline uploads confirmed text as a new assignment and preserves its source', async ({classroom, request}) => {
  const original = await create(classroom, request, '来源正文');
  const {page, context, errors, mutations} = await edit(classroom, 'screen');
  await body(page, 'screen').fill(''); await write(page, '另存后确认的第10—20页');
  await write(page, '另存后确认的选做第8题', 'optionalContent');
  const updated = await request.patch(`${api}/api/v2/publications/${original.id}`, {
    headers: {Authorization: `Bearer ${classroom.credentials.accessToken}`, 'If-Match': '"1"'},
    data: {content: '来源已被远程修改'},
  });
  expect(updated.status()).toBe(200);
  await page.getByRole('button', {name: '保存作业', exact: true}).click();
  await expect(composer(page, 'screen')).toContainText('服务器现在是版本 2');
  await context.setOffline(true);
  await page.getByRole('button', {name: '另存为一项新作业', exact: true}).click();
  await expect(composer(page, 'screen')).not.toBeVisible();
  const queueKey = `classworks-v2-screen-publication-queue:${classroom.binding.id}`;
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, queueKey)).toBe(1);
  expect((await classroom.rows())).toHaveLength(1); await storageTextOnly(page);
  await context.setOffline(false);
  await expect.poll(async () => (await classroom.rows()).length).toBe(2);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, queueKey)).toBe(0);
  const rows = await persisted(classroom, mutations), source = rows.find(row => row.id === original.id), copy = rows.find(row => row.id !== original.id);
  expect(source.content).toBe('来源已被远程修改'); expect(source.revision).toBe(2);
  expect(copy.content).toBe('另存后确认的第10—20页'); expect(copy.contentJson.optionalContent).toBe('另存后确认的选做第8题');
  expect(copy.revision).toBe(1); expect(copy.revisions).toHaveLength(1); expect(errors).toEqual([]);
});

test('credential rotation during real offline replay preserves its receipt and resumes idempotently after reload', async ({classroom}) => {
  const {page, context, errors, mutations} = await setup(classroom, 'screen');
  await write(page, '补传过程中更换凭证的确认文字');
  await context.setOffline(true);
  await page.getByRole('button', {name: '保存作业', exact: true}).click();
  await expect(composer(page, 'screen')).not.toBeVisible();
  const queueKey = `classworks-v2-screen-publication-queue:${classroom.binding.id}`;
  const queued = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), queueKey);
  const originalQueue = await queued(); expect(originalQueue).toHaveLength(1);
  let release, committed = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(`${api}/api/v2/classroom-screens/publications`, async route => {
    if (committed) { await route.continue(); return; }
    const response = await route.fetch(); expect(response.status()).toBe(201);
    committed = true; await gate; await route.fulfill({response});
  });
  try {
    await context.setOffline(false); await expect.poll(() => committed).toBe(true);
    const token = randomUUID();
    await classroom.prisma.classroomScreenBinding.update({where: {id: classroom.binding.id},
      data: {tokenHash: createHash('sha256').update(token).digest('hex')}});
    await page.evaluate(value => localStorage.setItem('classworks-v2-screen-token', value), token);
    release();
    await expect(page.getByText('大屏绑定或凭证已变化，本次补传已暂停，原队列已保留。请核对当前绑定后重试。', {exact: true})).toBeVisible();
    await expect(page.locator('.screen-sync-chip')).not.toContainText('正在同步');
    expect(await queued()).toEqual(originalQueue);
    await page.reload();
    await expect(page.getByRole('button', {name: '录入作业', exact: true}).first()).toBeVisible();
    await expect.poll(async () => (await queued()).length).toBe(0);
    const rows = await persisted(classroom, mutations); expect(rows).toHaveLength(1); expect(rows[0].revisions).toHaveLength(1);
    expect(rows[0].content).toBe('补传过程中更换凭证的确认文字');
    expect(new Set(mutations.map(m => m.body.clientRequestId)).size).toBe(1);
    await storageTextOnly(page); expect(errors).toEqual([]);
  } finally { release(); }
});

for (const restore of [false, true]) test(`another real tab rotating ${restore ? 'and restoring ' : ''}the token revokes an open handwriting selection`, async ({classroom}) => {
  const {page, context, errors, mutations} = await setup(classroom, 'screen');
  await body(page, 'screen').fill('原正文');
  await open(page); await result(page).fill('未确认绝不落库');
  const other = await context.newPage(); await other.goto(origin);
  await expect(other.getByRole('button', {name: '录入作业', exact: true}).first()).toBeVisible();
  const token = randomUUID();
  await classroom.prisma.classroomScreenBinding.update({where: {id: classroom.binding.id},
    data: {tokenHash: createHash('sha256').update(token).digest('hex')}});
  await other.evaluate(value => localStorage.setItem('classworks-v2-screen-token', value), token);
  await expect(work(page)).toContainText('编辑范围已变化');
  if (restore) {
    await classroom.prisma.classroomScreenBinding.update({where: {id: classroom.binding.id},
      data: {tokenHash: createHash('sha256').update(classroom.screenToken).digest('hex')}});
    await other.evaluate(value => localStorage.setItem('classworks-v2-screen-token', value), classroom.screenToken);
  }
  await page.bringToFront();
  await expect(work(page).getByRole('button', {name: '插入正文', exact: true})).toBeDisabled();
  await storageTextOnly(page); expect(await classroom.rows()).toEqual([]); expect(mutations).toEqual([]);
  await work(page).getByRole('button', {name: '返回录入', exact: true}).click();
  await expect(body(page, 'screen')).toHaveValue('原正文');
  await expect(composer(page, 'screen')).toContainText('大屏绑定已变化');
  await composer(page, 'screen').getByRole('button', {name: '取消', exact: true}).click();
  await page.getByRole('button', {name: '录入作业', exact: true}).first().click();
  await expect(body(page, 'screen')).toHaveValue('原正文');
  await body(page, 'screen').fill(''); await write(page, '重新打开后确认的正文');
  await page.getByRole('button', {name: '保存作业', exact: true}).click();
  await expect.poll(async () => (await classroom.rows()).length).toBe(1);
  const [row] = await persisted(classroom, mutations);
  expect(row.content).toBe('重新打开后确认的正文'); expect(row.revision).toBe(1);
  await storageTextOnly(page); expect(errors).toEqual([]);
});

for (const restore of [false, true]) test(`another real teacher login ${restore ? 'and return to the original login ' : ''}revokes unconfirmed text`, async ({classroom}) => {
  const {page, context, errors, mutations} = await setup(classroom, 'teacher');
  await body(page, 'teacher').fill('保留教师原正文');
  await open(page); await result(page).fill('未确认绝不落库');
  const other = await context.newPage(); await other.goto(origin);
  await expect(other.getByRole('button', {name: '账号', exact: true}).first()).toBeVisible();
  const {generateTokenPair} = await backendModule('utils/tokenManager.js');
  const tokens = await generateTokenPair(classroom.account);
  const changeLogin = values => {
    localStorage.setItem('classworks-v2-access-token', values.accessToken);
    localStorage.setItem('classworks-v2-refresh-token', values.refreshToken);
  };
  await other.evaluate(changeLogin, tokens);
  await expect(work(page)).toContainText('编辑范围已变化');
  if (restore) await other.evaluate(changeLogin, classroom.credentials);
  await page.bringToFront();
  await expect(work(page).getByRole('button', {name: '插入正文', exact: true})).toBeDisabled();
  await work(page).getByRole('button', {name: '返回录入', exact: true}).click();
  await expect(body(page, 'teacher')).toHaveValue('保留教师原正文');
  expect(await classroom.rows()).toEqual([]); expect(mutations).toEqual([]); expect(errors).toEqual([]);
});

test('a real access-token renewal leaves confirmed teacher text insertable and saveable', async ({classroom, request}) => {
  const {page, context, errors, mutations} = await setup(classroom, 'teacher');
  await body(page, 'teacher').fill('保留教师原正文');
  await open(page); await result(page).fill('正常续期后确认的文字');
  const other = await context.newPage(); await other.goto(origin);
  await expect(other.getByRole('button', {name: '账号', exact: true}).first()).toBeVisible();
  const response = await request.post(`${api}/accounts/refresh`, {data: {refresh_token: classroom.credentials.refreshToken}});
  expect(response.status()).toBe(200);
  const payload = await response.json(), token = (payload.data || payload).access_token;
  expect(typeof token).toBe('string'); expect(token.length).toBeGreaterThan(0);
  await other.evaluate(value => localStorage.setItem('classworks-v2-access-token', value), token);
  await page.bringToFront();
  await insert(page, '正常续期后确认的文字');
  await composer(page, 'teacher').getByRole('button', {name: '保存草稿', exact: true}).click();
  await expect.poll(async () => (await classroom.rows()).length).toBe(1);
  const [row] = await persisted(classroom, mutations);
  expect(row.content).toBe('保留教师原正文正常续期后确认的文字'); expect(row.status).toBe('DRAFT'); expect(errors).toEqual([]);
});

for (const loseReply of [false, true]) test(`same-document navigation preserves the next confirmed draft after an old ${loseReply ? 'lost' : 'successful'} save reply`, async ({classroom}) => {
  const {page, errors} = await classroom.open('screen');
  const mutations = observe(page);
  // Build a real SPA history entry; back/forward must not destroy the document
  // (which would cancel the old JavaScript and hide the continuation defect).
  await page.goto(`${origin}/settings?context=screen`);
  await page.getByTitle('返回作业板', {exact: true}).click();
  const marker = randomUUID(); await page.evaluate(value => { window.handoffDocument = value; }, marker);
  await page.getByRole('button', {name: '录入作业', exact: true}).first().click();
  await page.getByRole('button', {name: '数学', exact: true}).click();
  await write(page, '切页前已经确认并提交的文字');
  let release, committed = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(`${api}/api/v2/classroom-screens/publications`, async route => {
    const response = await route.fetch(); committed = true; await gate;
    if (loseReply) await route.abort('failed'); else await route.fulfill({response});
  });
  try {
    await page.getByRole('button', {name: '保存作业', exact: true}).click();
    await expect.poll(() => committed).toBe(true);
    await page.goBack(); await expect(page.locator('.settings-v2-page')).toBeVisible();
    await page.goForward();
    expect(await page.evaluate(() => window.handoffDocument)).toBe(marker);
    await page.getByRole('button', {name: '录入作业', exact: true}).first().click();
    await body(page, 'screen').fill(''); await write(page, '重新打开后确认但尚未提交的文字');
    const queueKey = `classworks-v2-screen-publication-queue:${classroom.binding.id}`;
    const finished = loseReply ? null
      : page.waitForResponse(response => new URL(response.url()).pathname === '/api/v2/classroom-screens/feed');
    // A successful old write refreshes the feed; a lost reply queues its stable
    // request ID. Neither owns this new composer or its per-document draft key.
    release();
    if (loseReply) {
      // The already-completed POST is not a new browser request; wait for its
      // local queue handoff rather than manufacturing another network retry.
      await expect.poll(async () => (await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, queueKey)) > 0
        || mutations.filter(item => item.method === 'POST').length > 1).toBe(true);
    } else await (await finished).finished();
    await page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))));
    await expect(body(page, 'screen')).toHaveValue('重新打开后确认但尚未提交的文字');
    await composer(page, 'screen').getByRole('button', {name: '取消', exact: true}).click();
    await page.getByRole('button', {name: '录入作业', exact: true}).first().click();
    await expect(body(page, 'screen')).toHaveValue('重新打开后确认但尚未提交的文字');
    await storageTextOnly(page);
    const [row] = await persisted(classroom, mutations);
    expect((await classroom.rows())).toHaveLength(1); expect(row.content).toBe('切页前已经确认并提交的文字');
    expect(row.revisions).toHaveLength(1); expect(errors).toEqual([]);
  } finally { release(); }
});

test('a real late conflict reload preserves confirmed screen text after token rotation', async ({classroom, request}) => {
  const original = await create(classroom, request, '原服务器正文');
  // Hold the real GET at the page boundary. A controlling service worker can
  // send its own fetch without passing through page.route; offline/PWA cases
  // above retain their actual service worker instead.
  const {page, errors, mutations} = await edit(classroom, 'screen', {serviceWorkers: 'block'});
  await body(page, 'screen').fill(''); await write(page, '凭证变化时仍需保留的确认正文');
  expect((await request.patch(`${api}/api/v2/publications/${original.id}`, {
    headers: {Authorization: `Bearer ${classroom.credentials.accessToken}`, 'If-Match': '"1"'},
    data: {content: '服务器第二版'},
  })).status()).toBe(200);
  await page.getByRole('button', {name: '保存作业', exact: true}).click();
  await expect(composer(page, 'screen')).toContainText('服务器现在是版本 2');
  let release, fetched = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(`${api}/api/v2/classroom-screens/publications/${original.id}`, async route => {
    const response = await route.fetch(); fetched = true; await gate; await route.fulfill({response});
  });
  try {
    await page.getByRole('button', {name: '放弃本机输入并载入最新版', exact: true}).click();
    await page.getByRole('button', {name: '载入最新版', exact: true}).click();
    await expect.poll(() => fetched).toBe(true);
    const token = randomUUID();
    await classroom.prisma.classroomScreenBinding.update({where: {id: classroom.binding.id},
      data: {tokenHash: createHash('sha256').update(token).digest('hex')}});
    await page.evaluate(value => localStorage.setItem('classworks-v2-screen-token', value), token);
    release();
    await expect(composer(page, 'screen')).toContainText('大屏绑定或凭证已变化');
    await expect(body(page, 'screen')).toHaveValue('凭证变化时仍需保留的确认正文');
    const records = await storageTextOnly(page);
    expect(records.some(record => record.key.includes('screen-homework-draft') && record.value.content === '凭证变化时仍需保留的确认正文')).toBe(true);
    const [row] = await persisted(classroom, mutations);
    expect(row.content).toBe('服务器第二版'); expect(row.revision).toBe(2); expect(errors).toEqual([]);
  } finally { release(); }
});

test('another real tab can remove later queued handwriting while an earlier real upload awaits its receipt', async ({classroom}) => {
  const {page, context, errors, mutations} = await setup(classroom, 'screen');
  const other = await context.newPage(), otherErrors = [];
  other.on('pageerror', error => otherErrors.push(error.message));
  const otherMutations = observe(other);
  await other.goto(origin);
  await expect(other.getByRole('button', {name: '录入作业', exact: true}).first()).toBeVisible();
  // Independent target network conditions let the second tab operate the real
  // local queue offline while the first tab reconnects. Do not pause the shared
  // context clock: that also stalls the first tab's editor transitions.
  const primaryNetwork = await context.newCDPSession(page), otherNetwork = await context.newCDPSession(other);
  const offline = (session, value) => session.send('Network.emulateNetworkConditions', {
    offline: value, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
  await offline(otherNetwork, true); await expect.poll(() => other.evaluate(() => navigator.onLine)).toBe(false);
  await page.bringToFront();
  await write(page, '第一项确认并允许补传的文字');
  await offline(primaryNetwork, true); await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.getByRole('button', {name: '保存作业', exact: true}).click();
  await expect(composer(page, 'screen')).not.toBeVisible();
  await page.getByRole('button', {name: '录入作业', exact: true}).first().click();
  await page.getByRole('button', {name: '数学', exact: true}).click();
  await body(page, 'screen').fill(''); await write(page, '第二项确认后决定移除的文字');
  await page.getByRole('button', {name: '保存作业', exact: true}).click();
  const queueKey = `classworks-v2-screen-publication-queue:${classroom.binding.id}`;
  const queued = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), queueKey);
  expect(await queued()).toHaveLength(2); expect(await classroom.rows()).toEqual([]);
  let release, committed = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(`${api}/api/v2/classroom-screens/publications`, async route => {
    const response = await route.fetch(); committed = true; await gate; await route.fulfill({response});
  });
  try {
    await offline(primaryNetwork, false); expect(await other.evaluate(() => navigator.onLine)).toBe(false);
    await expect.poll(() => committed).toBe(true);
    await other.bringToFront(); await other.locator('.screen-sync-chip').click();
    await expect(other.locator('.queued-publication')).toHaveCount(2);
    await other.getByTitle('移除本机待提交作业', {exact: true}).nth(1).click();
    await other.getByRole('button', {name: '确认移除', exact: true}).click();
    await expect.poll(async () => (await queued()).length).toBe(1);
    // Queue completion is the contract here. An offline peer can affect its
    // shared service worker's feed fetch; a successful unrelated GET is not the
    // upload receipt and must not be used to infer that this batch has ended.
    release();
    await expect.poll(async () => (await queued()).length).toBe(0);
    // Once the durable batch is empty, restore the offline peer too. A shared
    // SW feed fetch can otherwise remain pending until the client's existing
    // 15s HTTP deadline, which is longer than the default 10s assertion limit.
    await offline(otherNetwork, false);
    await expect(page.locator('.screen-sync-chip')).not.toContainText('正在同步', {timeout: 25000});
    expect(mutations.filter(item => item.method === 'POST')).toHaveLength(1);
    expect(otherMutations).toEqual([]);
    await storageTextOnly(page);
    const rows = await persisted(classroom, mutations);
    expect(rows).toHaveLength(1); expect(rows[0].content).toBe('第一项确认并允许补传的文字');
    expect(rows[0].revisions).toHaveLength(1); expect(errors).toEqual([]); expect(otherErrors).toEqual([]);
  } finally { release(); }
});

for (const change of ['login', 'login-return', 'renewal']) test(`teacher ${change}: a real held conflict reload keeps its login ownership`, async ({classroom, request}) => {
  const original = await create(classroom, request, '教师最初的服务器正文');
  // The held GET must pass through page.route, rather than a SW-owned fetch.
  // Other cases retain the actual service worker for offline/PWA coverage.
  const {page, context, errors, mutations} = await edit(classroom, 'teacher', {serviceWorkers: 'block'});
  await body(page, 'teacher').fill(''); await write(page, '等待期间必须保留的已确认正文');
  expect((await request.patch(`${api}/api/v2/publications/${original.id}`, {
    headers: {Authorization: `Bearer ${classroom.credentials.accessToken}`, 'If-Match': '"1"'},
    data: {content: '教师远程第二版'},
  })).status()).toBe(200);
  await page.getByRole('button', {name: '保存修改', exact: true}).click();
  await expect(composer(page, 'teacher')).toContainText('服务器现在是版本 2');
  const other = await context.newPage(); await other.goto(origin);
  await expect(other.getByRole('button', {name: '账号', exact: true}).first()).toBeVisible();
  let release, fetched = false;
  const gate = new Promise(resolve => { release = resolve; });
  const endpoint = `${api}/api/v2/publications/${original.id}`;
  await page.route(endpoint, async route => {
    expect(route.request().method()).toBe('GET');
    const response = await route.fetch(); expect(response.status()).toBe(200);
    fetched = true; await gate; await route.fulfill({response});
  });
  try {
    await page.bringToFront();
    const reload = composer(page, 'teacher').getByRole('button', {name: '放弃本机输入并载入最新版', exact: true});
    await reload.click(); await page.getByRole('button', {name: '载入最新版', exact: true}).click();
    await expect.poll(() => fetched).toBe(true);
    await expect(reload).toHaveClass(/v-btn--loading/);
    if (change === 'renewal') {
      const response = await request.post(`${api}/accounts/refresh`, {data: {refresh_token: classroom.credentials.refreshToken}});
      expect(response.status()).toBe(200);
      const payload = await response.json(), token = (payload.data || payload).access_token;
      expect(typeof token).toBe('string');
      await other.evaluate(value => localStorage.setItem('classworks-v2-access-token', value), token);
    } else {
      const {generateTokenPair} = await backendModule('utils/tokenManager.js');
      const tokens = await generateTokenPair(classroom.account);
      const replaceLogin = values => {
        localStorage.setItem('classworks-v2-access-token', values.accessToken);
        localStorage.setItem('classworks-v2-refresh-token', values.refreshToken);
      };
      await other.evaluate(replaceLogin, tokens);
      if (change === 'login-return') await other.evaluate(replaceLogin, classroom.credentials);
    }
    const received = page.waitForResponse(response => response.url() === endpoint && response.request().method() === 'GET');
    release(); await (await received).finished();
    await page.bringToFront();
    if (change === 'renewal') {
      await expect(body(page, 'teacher')).toHaveValue('教师远程第二版');
      await expect(reload).toHaveCount(0);
    } else {
      await expect(reload).not.toHaveClass(/v-btn--loading/);
      await expect(body(page, 'teacher')).toHaveValue('等待期间必须保留的已确认正文');
      await expect(composer(page, 'teacher')).toContainText('服务器现在是版本 2');
    }
    const rows = await persisted(classroom, mutations);
    expect(rows).toHaveLength(1); expect(rows[0].revision).toBe(2); expect(rows[0].content).toBe('教师远程第二版');
    expect(mutations).toHaveLength(1); expect(mutations[0].method).toBe('PATCH'); expect(errors).toEqual([]);
  } finally { release(); }
});
