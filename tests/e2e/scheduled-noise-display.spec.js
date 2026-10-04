import {test, expect} from '@playwright/test';
import {api, origin} from './environment.js';

test.use({serviceWorkers: 'block', viewport: {width: 1366, height: 768}, storageState: {cookies: [], origins: [{origin, localStorage: [
  {name: 'classworks-v2-oobe', value: JSON.stringify({version: 1, completed: true, roleHint: 'screen'})},
  {name: 'classworks-v2-screen-oobe:screen-a', value: JSON.stringify({version: 1, completed: true})},
  {name: 'classworks-v2-screen-token', value: 'screen-token'},
]}]}});

test('scheduled capture enters its own screen, returns without STOP, and waits for a verified end', async ({page, request}, testInfo) => {
  test.setTimeout(90000);
  await request.post(`${origin}/__test/release`, {data: {release: 'previous'}});
  await request.post(`${api}/__test/reset`);
  let phase = 'starting';
  let commandCount = 0;
  let commandSessionId = '';
  let returnExpiresAt = 0;
  let returnStarts = 0;
  const presenceStates = [];
  let sessionId = 'synthetic-session-1';
  let lastScheduleSession = '';
  let releaseHeldNoise;
  const window = {start: '2026-10-04T19:00:00.000', end: '2026-10-04T20:00:00.000'};
  await page.addInitScript(() => {
    window.microphoneRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => { window.microphoneRequests++; throw Error('Unexpected browser microphone'); };
  });
  await page.route('**/api/v2/npep/screen/noise-management/commands', async route => {
    const pin = route.request().postDataJSON().pin;
    if (pin !== '725316') {
      await route.fulfill({status: 401, json: {protocolVersion: '0.8',
        requestId: route.request().headers()['x-request-id'], error: {code: 'SCREEN_PIN_INCORRECT'}}});
      return;
    }
    commandCount++;
    commandSessionId = route.request().postDataJSON().command.sessionId;
    await route.fulfill({json: {protocolVersion: '0.8', requestId: route.request().headers()['x-request-id'], data: {accepted: true}}});
  });
  await page.route('**/api/v2/npep/screen/noise-display**', async route => {
    const remainingSeconds = Math.max(0, Math.ceil((returnExpiresAt - Date.now()) / 1000));
    if (route.request().method() === 'POST' && !remainingSeconds) {
      returnStarts++;
      returnExpiresAt = Date.now() + 600000;
    }
    const seconds = Math.max(0, Math.ceil((returnExpiresAt - Date.now()) / 1000));
    await route.fulfill({json: {protocolVersion: '0.8', requestId: route.request().headers()['x-request-id'],
      data: {supported: true, serverNow: new Date().toISOString(), returnMinutes: 10, source: 'Default',
        activeReturn: seconds ? {window, startedAt: new Date(returnExpiresAt - 600000).toISOString(),
          expiresAt: new Date(returnExpiresAt).toISOString(), returnMinutes: 10, remainingSeconds: seconds} : null}}});
  });
  await page.route('**/api/v2/npep/screen/noise-display/presence', async route => {
    const body = route.request().postDataJSON();
    presenceStates.push(body.state);
    await route.fulfill({json: {protocolVersion: '0.9', requestId: body.requestId,
      data: {accepted: true, serverNow: new Date().toISOString()}}});
  });
  await page.route('**/api/v2/npep/screen/noise', async route => {
    if (phase === 'stall') await new Promise(resolve => { releaseHeldNoise = resolve; });
    const state = phase === 'starting' ? 'Starting' : phase === 'ended' ? 'Stopped' : 'Active';
    await route.fulfill({json: {protocolVersion: '0.6', requestId: route.request().headers()['x-request-id'], data: {
      provider: 'native', online: phase !== 'offline', receivedAt: new Date().toISOString(), reports: [], commands: [],
      status: {state, sessionId, instanceId: 'synthetic-instance', revision: 2, quality: 'Good', currentDbfs: state === 'Active' ? -57 : null,
        deviceName: '合成麦克风', configured: true},
    }}});
  });
  await page.route('**/api/v2/npep/screen/noise-schedule', async route => {
    const reason = phase === 'starting' ? 'CAPTURE_STARTING' : phase === 'ended' ? 'OUTSIDE_WINDOW' : 'WINDOW_ACTIVE';
    lastScheduleSession = sessionId;
    await route.fulfill({json: {protocolVersion: '0.7', requestId: route.request().headers()['x-request-id'], data: {
      supported: true, online: phase !== 'offline', applied: true, policy: {source: 'Grade'},
      status: {owner: phase === 'ended' ? 'None' : 'Schedule', reason, sessionId: phase === 'ended' ? null : sessionId,
        clockReady: true, dateNeedsReview: false, schoolNow: phase === 'ended' ? '2026-10-04T20:00:01.500' : '2026-10-04T19:01:00.500',
        window: phase === 'ended' ? null : window},
    }}});
  });
  await page.goto(origin);
  await expect(page.getByRole('button', {name: '录入作业', exact: true}).first()).toBeVisible();
  await expect(page.getByRole('region', {name: '定时监测展示'})).toHaveCount(0);

  await page.getByRole('button', {name: '课堂工具', exact: true}).first().click();
  phase = 'active';
  const display = page.getByRole('region', {name: '定时监测展示'});
  await page.waitForTimeout(3500);
  await expect(display).toHaveCount(0);
  await expect.poll(() => presenceStates.includes('BLOCKED')).toBe(true);
  await page.getByTitle('关闭', {exact: true}).click();
  await expect(display).toBeVisible({timeout: 12000});
  await expect.poll(() => presenceStates.includes('DISPLAY_VISIBLE')).toBe(true);
  await expect(display).toContainText('自习监测中');
  await expect(display).toContainText('-57.0');
  await expect(display).toContainText('年级排程');
  await page.screenshot({path: testInfo.outputPath('scheduled-noise-display-1366x768.png')});
  await page.setViewportSize({width: 1280, height: 720});
  await expect.poll(() => display.getByRole('button', {name: '返回作业板'}).evaluate(button =>
    button.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
  await page.screenshot({path: testInfo.outputPath('scheduled-noise-display-1280x720.png')});
  await page.setViewportSize({width: 1920, height: 1080});
  await page.screenshot({path: testInfo.outputPath('scheduled-noise-display-1920x1080.png')});
  await page.setViewportSize({width: 1366, height: 768});
  await page.evaluate(() => localStorage.setItem('Classworks_settings', JSON.stringify({'theme.mode': 'light'})));
  await page.reload();
  await expect(display).toBeVisible({timeout: 12000});
  await page.screenshot({path: testInfo.outputPath('scheduled-noise-display-1366x768-light.png')});
  expect(await page.evaluate(() => window.microphoneRequests)).toBe(0);

  await display.getByRole('button', {name: '返回作业板'}).click();
  await expect(display).toHaveCount(0);
  await expect.poll(() => presenceStates.includes('RETURNING')).toBe(true);
  expect(commandCount).toBe(0);
  await page.waitForTimeout(3500);
  await expect(display).toHaveCount(0);
  await page.reload();
  await expect(display).toHaveCount(0);
  expect(returnStarts).toBe(1);
  await page.getByRole('button', {name: '查看展示'}).click();
  await expect(display).toBeVisible();
  await display.getByRole('button', {name: '返回作业板'}).click();
  await expect(display).toHaveCount(0);
  expect(returnStarts).toBe(1);
  returnExpiresAt = Date.now() + 8000;
  await page.reload();
  await page.getByRole('button', {name: '课堂工具', exact: true}).first().click();
  await expect(display).toHaveCount(0);
  await expect(page.getByText('返回期限已到；完成当前操作后会恢复监测展示。'))
    .toBeVisible({timeout: 12000});
  await page.getByTitle('关闭', {exact: true}).click();
  await expect(display).toBeVisible({timeout: 12000});

  phase = 'stall';
  await expect.poll(() => Boolean(releaseHeldNoise)).toBe(true);
  await expect(display).toContainText('监测状态待确认', {timeout: 10000});
  await expect(display.locator('.scheduled-noise-display__value')).toContainText('—');
  phase = 'active';
  releaseHeldNoise();
  releaseHeldNoise = null;
  await expect(display).toContainText('自习监测中', {timeout: 12000});

  phase = 'offline';
  await expect(display).toContainText('监测状态待确认', {timeout: 12000});
  await expect(display.locator('.scheduled-noise-display__value')).toContainText('—');
  phase = 'active';
  await expect(display).toContainText('自习监测中', {timeout: 12000});
  await expect.poll(() => display.locator('.scheduled-noise-display__trend span').count()).toBeGreaterThan(1);
  sessionId = 'synthetic-session-2';
  await expect.poll(() => lastScheduleSession).toBe('synthetic-session-2');
  await expect.poll(() => display.locator('.scheduled-noise-display__trend span').count()).toBeLessThan(2);

  await display.getByRole('button', {name: '结束本次监测'}).click();
  await page.getByLabel('本大屏 PIN').fill('000000');
  await page.getByRole('button', {name: '发送停止请求'}).click();
  await expect(page.getByRole('dialog').getByText('SCREEN_PIN_INCORRECT')).toBeVisible();
  expect(commandCount).toBe(0);
  await page.getByLabel('本大屏 PIN').fill('725316');
  await page.getByRole('button', {name: '发送停止请求'}).click();
  await expect(display).toContainText('等待桌面执行回执');
  expect(commandCount).toBe(1);
  expect(commandSessionId).toBe('synthetic-session-2');
  phase = 'ended';
  await expect(display).toContainText('本次监测已结束', {timeout: 12000});
  await expect(display).toHaveCount(0, {timeout: 10000});
  expect(await page.evaluate(() => window.microphoneRequests)).toBe(0);
});
