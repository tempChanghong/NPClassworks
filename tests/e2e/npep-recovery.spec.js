import {test, expect} from '@playwright/test';
import {openAdmin} from './admin-fixture.js';
import {api, origin} from './environment.js';

// Real production pages and controls; only loopback API responses and time are isolated.
const window = {start: '2026-10-04T19:00:00.000', end: '2026-10-04T20:00:00.000'};
const policy = {source: 'Grade', version: 'recovery-policy-1'};
const confirmation = '已核对学校、班级与设备，同意所选模式的软件切换及登录自启动设置';
const reply = (route, data) => route.fulfill({json: {
  protocolVersion: route.request().headers()['x-npep-version'],
  requestId: route.request().headers()['x-request-id'], serverTime: new Date().toISOString(), data,
}});
const reject = (route, code) => route.fulfill({status: 409, json: {
  protocolVersion: route.request().headers()['x-npep-version'],
  requestId: route.request().headers()['x-request-id'], error: {code},
}});
const report = sessionId => ({sessionId, startedAt: '2026-10-04T11:00:00Z', endedAt: '2026-10-04T11:10:00Z',
  outcome: 'Stopped', deviceName: '隔离统计夹具', algorithm: 'energy-v1',
  summary: {sampledSeconds: 590, elapsedSeconds: 600, coverage: 590 / 600,
    energyMeanDbfs: -57, peakDbfs: -30, clippedPercent: 0},
});
const schedule = (reason = 'WINDOW_ACTIVE', owner = 'Schedule') => ({supported: true, online: true, applied: true,
  receivedAt: new Date().toISOString(), policy, commands: [], sessions: [],
  status: {owner, reason, window, sessionId: owner === 'Schedule' ? 'current-session' : null,
    clockReady: true, dateNeedsReview: false, schoolNow: '2026-10-04T19:01:00.000'},
});
const runtime = (mode = 'DAILY', online = true) => ({connectivity: online ? 'ONLINE' : 'OFFLINE',
  receivedAt: new Date().toISOString(), sampleAsOf: new Date().toISOString(),
  controlEpoch: '00000000-0000-4000-8000-000000000001',
  policy: {supported: true, enabled: true, pairedExamControl: true, remoteDailyControl: true,
    consentId: '00000000-0000-4000-8000-000000000002', policyRevision: 1},
  status: online ? {runtimeMode: mode, runtimePhase: 'IDLE', runtimeRevision: 2,
    modeRevision: 1, configurationRevision: 3, remoteExamPause: false} : null,
});
const examHistory = {operationId: 'historical-exam', target: 'EXAM', state: 'SUCCEEDED', step: 'VERIFY',
  createdAt: '2026-10-03T11:00:00Z', resolvedAt: '2026-10-03T11:01:00Z',
  initiator: {displayName: '历史操作人'}, freshness: 'HISTORICAL',
};

async function openDevices(browser, handle) {
  const setup = await openAdmin(browser, 1440, 'ADMIN', {}, 'screens', async context => {
    await context.route(`${api}/api/v2/npep/**`, async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/info')) return reply(route, {supportedCapabilities: ['device.status']});
      if (path.endsWith('/noise-schedules')) return reply(route, {termId: 'term',
        terms: [{id: 'term', name: '当前学期'}], grades: [], classes: [], policies: [], executionEnabled: true});
      if (path.endsWith('/pairing-access')) return reply(route, {items: []});
      if (path.endsWith('/devices')) return reply(route, {items: ['a', 'b'].map(id => ({
        deviceId: `device-${id}`, deviceName: `设备 ${id.toUpperCase()}`, screenBindingId: 'screen-a',
        state: 'ACTIVE', bindingRevision: 1, connectivity: 'ONLINE', lastSeenAt: new Date().toISOString(),
        credentialExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        status: {mode: 'DAILY', recording: 'IDLE', automaticRecording: 'ENABLED'},
      })), nextCursor: null});
      if (await handle(route, path)) return;
      throw new Error(`Unconfigured recovery fixture: ${route.request().method()} ${path}`);
    });
  });
  await setup.page.clock.install();
  await setup.page.getByRole('button', {name: '打开 NPEP 设备互联', exact: true}).click();
  await expect(setup.page.locator('.npep-device')).toHaveCount(2);
  return setup;
}

async function openDevicePanel(page, device, button, selector) {
  await page.locator('.npep-device').filter({has: page.getByRole('heading', {name: `设备 ${device}`, exact: true})})
    .getByRole('button', {name: button, exact: true}).click();
  const panel = page.locator(selector);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(`设备 ${device}`);
  return panel;
}

async function capture(page, testInfo, name) {
  await testInfo.attach(name, {body: await page.screenshot({animations: 'disabled'}), contentType: 'image/png'});
}

test('noise report observation expires on the rendered page while ended reports remain', async ({browser}, testInfo) => {
  const {context, page, errors} = await openDevices(browser, async (route, path) => {
    if (path.endsWith('/noise-schedule')) { await reply(route, schedule()); return true; }
    if (path.endsWith('/noise')) { await reply(route, {reports: [report('historical-report-a')]}); return true; }
    return false;
  });
  try {
    const panel = await openDevicePanel(page, 'A', '噪音报告', '.noise-admin-card');
    const status = panel.getByRole('region', {name: '学校自动监测', exact: true});
    const history = panel.getByRole('article', {name: '统计报告 historical-report-a', exact: true});
    await expect(status).toContainText('最近观测可用');
    await expect(status).toContainText('桌面已应用当前规则');
    await expect(history).toContainText('已结束');
    await page.clock.fastForward(16000);
    await expect(status).toContainText('离线／观测陈旧');
    await expect(status).toContainText('下列内容为上次回传，不代表当前执行状态');
    await expect(status).toContainText('上次执行状态');
    await expect(status).toContainText('规则待桌面确认');
    await expect(status.getByText('最近观测可用', {exact: true})).toHaveCount(0);
    await expect(history).toBeVisible();
    await expect(history).toContainText('590.0 秒');
    await expect(panel.getByRole('button', {name: '刷新报告', exact: true})).toBeEnabled();
    await capture(page, testInfo, 'noise-expired-history-preserved');
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('late report responses from device A cannot replace device B after a quick selection change', async ({browser}, testInfo) => {
  let releaseA;
  const held = new Promise(resolve => { releaseA = resolve; });
  let heldRequests = 0;
  const {context, page, errors} = await openDevices(browser, async (route, path) => {
    if (!path.endsWith('/noise') && !path.endsWith('/noise-schedule')) return false;
    const isA = path.includes('/devices/device-a/');
    if (isA) { heldRequests++; await held; }
    await reply(route, path.endsWith('/noise') ? {reports: [report(isA ? 'late-report-a' : 'current-report-b')]} : schedule());
    return true;
  });
  try {
    const first = await openDevicePanel(page, 'A', '噪音报告', '.noise-admin-card');
    await expect.poll(() => heldRequests).toBe(2);
    await expect(first).toContainText('报告尚未完成加载');
    await first.getByRole('button', {name: '关闭', exact: true}).click();
    const second = await openDevicePanel(page, 'B', '噪音报告', '.noise-admin-card');
    const history = second.getByRole('article', {name: '统计报告 current-report-b', exact: true});
    await expect(history).toBeVisible();
    const lateResponses = [
      page.waitForResponse(response => response.url().endsWith('/devices/device-a/noise')),
      page.waitForResponse(response => response.url().endsWith('/devices/device-a/noise-schedule')),
    ];
    releaseA();
    await Promise.all(lateResponses.map(async response => (await response).finished()));
    // Allow response callbacks and Vue rendering to finish without issuing a B request
    // that could hide pollution from A by immediately overwriting it again.
    await page.clock.runFor(100);
    await expect(second.getByRole('button', {name: '刷新报告', exact: true})).toBeEnabled();
    await expect(second).toContainText('设备 B');
    await expect(history).toBeVisible();
    await expect(second.getByRole('article', {name: '统计报告 late-report-a', exact: true})).toHaveCount(0);
    await capture(page, testInfo, 'device-b-after-late-device-a-response');
    expect(errors).toEqual([]);
  } finally { releaseA(); await context.close(); }
});

test('exam switch failure remains visible after a successful automatic status poll', async ({browser}, testInfo) => {
  let observations = 0;
  let mode = 'DAILY';
  const {context, page, errors} = await openDevices(browser, async (route, path) => {
    if (path.endsWith('/runtime-status')) { observations++; await reply(route, runtime(mode)); return true; }
    if (path.endsWith('/runtime-operations')) {
      if (route.request().method() === 'POST') await reject(route, 'STATE_CHANGED');
      else await reply(route, {items: []});
      return true;
    }
    return false;
  });
  try {
    const panel = await openDevicePanel(page, 'A', '考试模式', '.npep-runtime-card');
    await expect(panel.locator('.npep-runtime-metrics')).toContainText('日常模式');
    await panel.getByLabel(confirmation, {exact: true}).check();
    await panel.getByRole('button', {name: '切入／重试考试模式', exact: true}).click();
    const failure = panel.getByRole('alert').filter({hasText: '设备状态已变化，请刷新后重新核对。'});
    await expect(failure).toBeVisible();
    await expect(panel.getByRole('button', {name: '刷新状态', exact: true})).toBeEnabled();
    const previous = observations;
    mode = 'OTHER';
    await page.clock.fastForward(10000);
    await expect.poll(() => observations).toBeGreaterThan(previous);
    await expect(panel.locator('.npep-runtime-metrics')).toContainText('其他运行环境');
    await expect(failure).toBeVisible();
    await expect(panel.getByLabel(confirmation, {exact: true})).not.toBeChecked();
    await expect(panel.getByRole('button', {name: '切入／重试考试模式', exact: true})).toBeDisabled();
    await capture(page, testInfo, 'exam-failure-after-successful-poll');
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

for (const online of [true, false]) {
  test(`historical exam success does not become current exam state on a ${online ? 'daily' : 'disconnected'} device`, async ({browser}, testInfo) => {
    const {context, page, errors} = await openDevices(browser, async (route, path) => {
      if (path.endsWith('/runtime-status')) { await reply(route, runtime('DAILY', online)); return true; }
      if (path.endsWith('/runtime-operations')) { await reply(route, {items: [examHistory]}); return true; }
      return false;
    });
    try {
      const panel = await openDevicePanel(page, 'A', '考试模式', '.npep-runtime-card');
      const current = panel.getByRole('region', {name: '当前观测', exact: true});
      const history = panel.getByRole('region', {name: '最近 20 项操作', exact: true});
      await expect(history).toContainText('进入考试 · 考试环境已就绪');
      await expect(history).toContainText('不代表设备此刻的运行状态');
      await expect(current.locator('.npep-runtime-metrics')).toContainText(online ? '日常模式' : '尚未确认');
      await expect(current).not.toContainText('考试环境已就绪');
      await expect(current.locator('.npep-runtime-metrics').getByText('考试环境', {exact: true})).toHaveCount(0);
      const checkbox = panel.getByLabel(confirmation, {exact: true});
      if (online) {
        await expect(checkbox).toBeEnabled();
        await checkbox.check();
        await expect(panel.getByRole('button', {name: '切入／重试考试模式', exact: true})).toBeEnabled();
      } else {
        await expect(panel).toContainText('设备状态已过时或已离线，请等待新的上报');
        await expect(checkbox).toBeDisabled();
        await expect(panel.getByRole('button', {name: '结束考试／返回日常', exact: true})).toBeDisabled();
      }
      await capture(page, testInfo, online ? 'daily-observation-with-exam-history' : 'disconnected-observation-with-exam-history');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

test.describe('native screen control failures', () => {
  test.use({serviceWorkers: 'block', storageState: {cookies: [], origins: [{origin, localStorage: [
    {name: 'classworks-v2-oobe', value: JSON.stringify({version: 1, completed: true, roleHint: 'screen'})},
    {name: 'classworks-v2-screen-oobe:screen-a', value: JSON.stringify({version: 1, completed: true})},
    {name: 'classworks-v2-screen-token', value: 'screen-token'},
  ]}]}});

  for (const action of ['stop', 'resume']) {
    test(`${action} failure remains rendered after successful noise and schedule polls`, async ({page, request}, testInfo) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await request.post(`${origin}/__test/release`, {data: {release: 'previous'}});
      await request.post(`${api}/__test/reset`);
      await page.addInitScript(() => {
        window.microphoneRequests = 0;
        navigator.mediaDevices.getUserMedia = async () => { window.microphoneRequests++; throw Error('Unexpected browser microphone'); };
      });
      let observedState = action === 'stop' ? 'Active' : 'Stopped';
      let observedReason = action === 'stop' ? 'MANUAL_ACTIVE' : 'WINDOW_FAILED';
      await page.route('**/api/v2/npep/screen/noise**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/noise/commands')) return reject(route, 'STATE_CHANGED');
        if (path.endsWith('/noise-schedule/resume')) return reject(route, 'SCHEDULE_VERSION_CONFLICT');
        if (path.endsWith('/noise-schedule')) return reply(route, schedule(observedReason, action === 'stop' ? 'Manual' : 'None'));
        if (path.endsWith('/noise')) return reply(route, {provider: 'native', online: true,
          receivedAt: new Date().toISOString(), reports: [], commands: [],
          status: {state: observedState, sessionId: 'current-session', instanceId: 'isolated-instance', revision: 2,
            quality: 'Good', currentDbfs: -57, deviceName: '隔离统计夹具', configured: true}});
        // Display/presence are unused for Manual/None ownership; keep native server fallback explicit.
        return route.fallback();
      });
      await page.goto(origin);
      await page.getByRole('button', {name: '课堂工具', exact: true}).first().click();
      await page.locator('.tool-entry').filter({hasText: '噪声监测'}).click();
      const panel = page.locator('.v-card').filter({has: page.getByRole('heading', {name: 'NPEduTools 原生噪音监测', exact: true})}).last();
      const command = panel.getByRole('button', {name: action === 'stop' ? '停止监测' : '恢复本次自动监测', exact: true});
      await expect(command).toBeEnabled();
      await command.click();
      const failure = panel.getByRole('alert').filter({hasText: action === 'stop' ? '请求未确认：STATE_CHANGED' : '恢复未确认：SCHEDULE_VERSION_CONFLICT'});
      await expect(failure).toBeVisible();
      observedState = 'Stopped'; observedReason = 'WINDOW_SKIPPED';
      await panel.getByRole('button', {name: '刷新', exact: true}).click();
      await expect(panel.getByRole('region', {name: '学校自动监测', exact: true})).toContainText('本次已手动停止');
      await expect(panel.getByRole('button', {name: '停止监测', exact: true})).toBeDisabled();
      await expect(panel.getByRole('button', {name: '开始监测', exact: true})).toBeEnabled();
      await expect(failure).toBeVisible();
      await capture(page, testInfo, `${action}-failure-after-successful-poll`);
      expect(await page.evaluate(() => window.microphoneRequests)).toBe(0);
      expect(errors).toEqual([]);
    });
  }
});
