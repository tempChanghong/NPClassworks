import {test, expect} from '../fullstack/fixture.js';
import {api, origin} from '../e2e/environment.js';
import {todayBoardDate} from '../../src/utils/boardDate.js';

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
async function edit(classroom, role) {
  const session = await classroom.open(role);
  session.mutations = observe(session.page);
  if (role === 'screen') await session.page.getByRole('button', {name: '修改', exact: true}).click();
  else {
    await session.page.locator('.publication-list-item button').filter({has: session.page.locator('.mdi-dots-vertical')}).first().click();
    await session.page.getByText('编辑', {exact: true}).click();
  }
  return session;
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
