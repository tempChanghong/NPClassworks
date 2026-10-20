import {test, expect} from '../fullstack/fixture.js';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// This suite is opt-in and excluded from ordinary CI and automated KV cases.
test('isolated screen and teacher handwriting acceptance session', async ({classroom}, info) => {
  const mode = process.env.HANDWRITING_ACCEPTANCE_MODE;
  expect(['interactive', 'smoke']).toContain(mode);
  const directory = process.env.HANDWRITING_KV_OUTPUT || info.outputDir;
  await mkdir(directory, {recursive: true});
  const sessions = [], measurements = {}, output = join(directory, 'manual-session.json');
  const report = {mode, humanAcceptance: 'PENDING', installedPwaAcceptance: 'PENDING',
    pageZoom: '100%; OS display scale unchanged; no DPR/touch emulation',
    browserContexts: 'isolated temporary contexts; not an installed PWA',
    recording: 'bounded numeric timing/counters and saved-row metadata; no ink or text recording', measurements};
  async function save() { await writeFile(output, JSON.stringify(report, null, 2)); }
  try {
    for (const role of ['screen', 'teacher']) {
      const session = await classroom.open(role, {viewport: null});
      sessions.push(session);
      measurements[role] = {observedRequests: 0, recentRequests: [], lastObservedLiveWorkers: 0, maxLiveWorkers: 0};
      await session.context.exposeBinding('__handwritingAcceptanceMetric', (source, value) => {
        // Only bounded numeric timing/counters escape the page. No ink, model output or tokens.
        const state = measurements[role];
        if (Number.isFinite(value?.live)) state.lastObservedLiveWorkers = value.live;
        if (Number.isFinite(value?.max)) state.maxLiveWorkers = Math.max(state.maxLiveWorkers, value.max);
        if (Number.isFinite(value?.workerRoundTripMs) && Number.isFinite(value?.modelMs)) {
          state.observedRequests++;
          state.recentRequests.push({workerRoundTripMs: value.workerRoundTripMs, modelMs: value.modelMs});
          if (state.recentRequests.length > 200) state.recentRequests.shift();
        }
      });
      await session.context.addInitScript(() => {
        const NativeWorker = window.Worker;
        let live = 0, maximum = 0;
        const send = value => { void window.__handwritingAcceptanceMetric(value).catch(() => {}); };
        window.Worker = class extends NativeWorker {
          constructor(url, options) {
            super(url, options);
            this.acceptanceAlive = true;
            this.acceptancePending = new Map();
            maximum = Math.max(maximum, ++live); send({live, max: maximum});
            this.addEventListener('message', ({data}) => {
              if (!['result', 'error'].includes(data?.type)) return;
              const start = this.acceptancePending.get(data.id); this.acceptancePending.delete(data.id);
              if (data.type === 'result' && start !== undefined && Array.isArray(data.lines)) send({
                workerRoundTripMs: window.performance.now() - start,
                modelMs: data.lines.reduce((sum, line) => sum + (Number(line.modelMs) || 0), 0),
              });
            });
          }
          postMessage(message, ...rest) {
            if (message?.type === 'recognize') this.acceptancePending.set(message.id, window.performance.now());
            return super.postMessage(message, ...rest);
          }
          terminate() {
            if (this.acceptanceAlive) { this.acceptanceAlive = false; --live; send({live, max: maximum}); }
            this.acceptancePending.clear(); return super.terminate();
          }
        };
      });
    }
    // The fixture opens with one teaching space. Add another only after that
    // bootstrap so the operator can exercise class switching in the teacher UI.
    await classroom.prisma.workspace.create({data: {
      termId: classroom.workspace.termId, gradeId: classroom.workspace.gradeId,
      code: 'MANUAL-C2', name: '高一二班', type: 'ADMIN_CLASS',
      subjectRules: {create: {subjectId: classroom.subject.id, deliveryMode: 'ADMIN_CLASS'}},
      members: {create: {accountId: classroom.account.id, role: 'TEACHER'}},
      teachingAssignments: {create: {accountId: classroom.account.id, subjectId: classroom.subject.id}},
    }});
    for (const [index, role] of ['screen', 'teacher'].entries()) {
      const {page} = sessions[index];
      await page.reload();
      await page.evaluate(label => { document.title = `[隔离验收·${label}] NPClassworks`; }, role === 'screen' ? '大屏' : '教师');
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      if (role === 'screen') {
        await page.getByRole('button', {name: '录入作业', exact: true}).first().click();
        await page.getByRole('button', {name: '数学', exact: true}).click();
      } else {
        const composer = page.locator('.publication-composer');
        await composer.locator('.v-select').filter({hasText: '科目'}).click();
        await page.getByRole('option', {name: '数学', exact: true}).click();
        await composer.getByRole('combobox', {name: '发布到 发布到', exact: true}).fill('高一一班');
        await page.getByRole('option').filter({hasText: '高一一班'}).first().click();
        await page.keyboard.press('Escape');
      }
      const launcher = page.locator('.handwriting-launcher[data-field="content"]').getByRole('button', {name: /^手写输入/});
      await expect(launcher).toBeEnabled();
      if (mode === 'smoke') {
        await launcher.click();
        await page.locator('.handwriting-workspace:visible').getByRole('button', {name: '返回录入', exact: true}).click();
      }
    }
    await save();
    if (mode === 'interactive') {
      // Track extra tabs too, so closing the first tab cannot end a conflict/replay check.
      await Promise.all(sessions.map(({context}) => new Promise(resolve => {
        const check = () => { if (!context.pages().length) resolve(); };
        const track = page => page.on('close', check);
        context.on('page', track); context.pages().forEach(track); check();
      })));
    }
    report.completedAt = new Date().toISOString();
    report.savedRows = (await classroom.rows()).map(row => ({id: row.id, revision: row.revision, status: row.status}));
    report.pageErrorCounts = sessions.map(session => session.errors.length);
    // Session completion is never automatic human sign-off.
    await save();
    expect(report.pageErrorCounts).toEqual([0, 0]);
    if (mode === 'smoke') expect(Object.values(measurements).every(state => state.maxLiveWorkers === 0)).toBe(true);
  } finally { await save(); }
});
