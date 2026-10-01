// Isolated component + actual API client; all API responses below are fixtures, no real school connection.
import {createServer} from 'vite';
import {Buffer} from 'node:buffer';
import vue from '@vitejs/plugin-vue';
import {chromium, expect} from '@playwright/test';
import {randomUUID, createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createServer as createPortProbe} from 'node:net';
const root = fileURLToPath(new URL('../', import.meta.url));
const {validateExamPlan} = await import(pathToFileURL(resolve(root, '../NPClassworksKV/domain/npep/examPlans.js')));
const {validateRuntime} = await import(pathToFileURL(resolve(root, '../NPClassworksKV/domain/npep/runtimeControl.js')));
const output = resolve(root, '.artifacts/npep-exam-plans'); await mkdir(output, {recursive: true});
// Vite treats port 0 as its default 5173, which Windows may reserve. Select an
// available loopback port explicitly and fail rather than entering another app.
const probe = createPortProbe();
await new Promise((done, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', done); });
const port = probe.address().port;
await new Promise((done, reject) => probe.close(error => error ? reject(error) : done()));
const server = await createServer({configFile: false, root, envFile: false, cacheDir: resolve(output, 'vite-cache'),
  optimizeDeps: {entries: ['src/components/admin/NpepExamPlanControl.vue'], include: ['vue', 'vuetify', 'vuetify/components', 'vuetify/directives']},
  resolve: {alias: {'@': resolve(root, 'src')}}, plugins: [vue(), {name: 'isolated-plan-page', configureServer(s) {
    s.middlewares.use('/runtime-fixture', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/runtime-fixture', `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>返回日常隔离测试</title><div id="app"></div><script type="module">
      import {createApp,h} from 'vue';
      import {createVuetify} from 'vuetify'; import * as components from 'vuetify/components'; import * as directives from 'vuetify/directives'; import 'vuetify/styles';
      import Runtime from '/src/components/admin/NpepRuntimeControl.vue';
      createApp({render:()=>h(components.VApp,{},()=>h(components.VMain,{},()=>h(Runtime,{schoolId:'school',deviceId:'${deviceId}',schoolName:'隔离测试学校',deviceName:'测试大屏',bindingName:'高二一班'})))}).use(createVuetify({components,directives})).mount('#app');
    </script></html>`)); });
    s.middlewares.use('/plan-fixture', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await s.transformIndexHtml('/plan-fixture', `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>考试方案隔离测试</title><div id="app"></div><script type="module">
      import {createApp,h} from 'vue';
      import {createVuetify} from 'vuetify'; import * as components from 'vuetify/components'; import * as directives from 'vuetify/directives'; import 'vuetify/styles';
      import Plan from '/src/components/admin/NpepExamPlanControl.vue';
      createApp({render:()=>h(components.VApp,{},()=>h(components.VMain,{},()=>h(Plan,{schoolId:'school',deviceId:'${deviceId}',schoolName:'隔离测试学校',deviceName:'测试大屏',bindingName:'高二一班'})))}).use(createVuetify({components,directives})).mount('#app');
    </script></html>`)); });
  }}], server: {host: '127.0.0.1', port, strictPort: true, hmr: false}, define: {'import.meta.env.VITE_SERVER_URL': '""', 'import.meta.env.VITE_DEFAULT_KV_SERVER': '""'}});
const deviceId = randomUUID();
let browser;
try {
  await server.listen(); const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}}); const errors = [];
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  const context = {identity: {serverInstanceId: randomUUID(), deploymentEpoch: randomUUID(), deviceId, bindingRevision: 1, credentialGeneration: 1},
    runId: randomUUID(), sessionId: randomUUID(), statusEpoch: 1, controlEpoch: randomUUID()};
  const status = {enabled: true, consentId: randomUUID(), policyRevision: 1, revision: 1, available: true, blockReason: null,
    player: {known: true, sessions: [], lastSession: null}, preparedId: null};
  let op = null, starts = 0, creates = 0, lostReply = true, startId = null;
  let dailyOperation = null, dailyLostReply = true;
  const dailyRequests = [];
  const requests = [];
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { errors.push('External request blocked: ' + url.origin); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const body = request.method() === 'POST' ? request.postDataJSON() : null;
    const id = body?.requestId || request.headers()['x-request-id'];
    requests.push({path: url.pathname, body});
    if (url.pathname.includes('/runtime-')) {
      if (request.headers()['x-npep-version'] !== '0.4') throw new Error('Wrong runtime version');
      const reply = (data, code = 200) => route.fulfill({status:code, contentType:'application/json', body:JSON.stringify({protocolVersion:'0.4',requestId:id,serverTime:new Date().toISOString(),...(code < 400 ? {data} : {error:data})})});
      if (request.method() === 'GET') {
        if (url.pathname.endsWith('/runtime-operations')) return reply({items:dailyOperation ? [dailyOperation] : [],nextCursor:null});
        return reply({policy:{supported:true,enabled:true,pairedExamControl:true,remoteDailyControl:true,consentId:context.identity.deviceId,policyRevision:1},
          status:{runtimeMode:dailyOperation ? 'DAILY':'EXAM',runtimePhase:'IDLE',remoteExamPause:!dailyOperation,runtimeRevision:1,modeRevision:1,configurationRevision:1},
          receivedAt:new Date().toISOString(),sampleAsOf:new Date().toISOString(),connectivity:'ONLINE',controlEpoch:context.controlEpoch});
      }
      if (!validateRuntime('createRequest',body) || body.target !== 'DAILY') throw new Error('Invalid Daily browser target');
      dailyRequests.push(body);
      if (dailyRequests.length > 1 && JSON.stringify(dailyRequests[0]) !== JSON.stringify(body)) throw new Error('Daily retry changed request');
      dailyOperation ??= {operationId:randomUUID(),target:'DAILY',state:'SUCCEEDED',createdAt:new Date().toISOString(),initiator:{displayName:'测试管理员'},step:'VERIFY',resolvedAt:new Date().toISOString(),
        evidence:{examAware:'EXITED',classIsland:'READY',remoteExamPause:false,startup:'DAILY_MODE_APPLIED'}};
      if (dailyLostReply) {dailyLostReply=false;return reply({code:'TEMPORARILY_UNAVAILABLE',message:'fixture response lost'},503);}
      return reply(dailyOperation,201);
    }
    if (request.headers()['x-npep-version'] !== '0.5') throw new Error('Wrong wire version');
    const reply = (data, code = 200) => route.fulfill({status: code, contentType: 'application/json', body: JSON.stringify({protocolVersion: '0.5', requestId: id, serverTime: new Date().toISOString(), ...(code < 400 ? {data} : {error: data})})});
    if (request.method() === 'GET') return reply({context, status, online: true, receivedAt: new Date().toISOString(), items: op ? [op] : []});
    if (url.pathname.endsWith('/start')) {
      if (!validateExamPlan('startRequest', body)) throw new Error('Invalid browser start request');
      if (!startId) { startId = id; starts++; } else if (startId !== id) throw new Error('Retry changed request ID');
      op.state = 'STARTED'; op.sessionId = 'fixture-player'; op.grant = {grantId: randomUUID(), operationId: op.operationId, startNotAfter: new Date(Date.now() + 30000).toISOString()};
      status.available = false; status.blockReason = 'PLAYER_BUSY'; status.preparedId = null;
      status.player.sessions = [{id: 'fixture-player', state: 'opening', examName: op.summary.examName}];
      if (lostReply) { lostReply = false; return reply({code: 'TEMPORARILY_UNAVAILABLE', message: 'fixture response lost', retryAfterSeconds: null}, 503); }
      return reply(op);
    }
    if (!validateExamPlan('createRequest', body)) throw new Error('Invalid browser create request');
    creates++;
    const hash = createHash('sha256').update(Buffer.from(body.dataBase64, 'base64')).digest('hex');
    const summary = {preparationId: randomUUID(), sha256: hash, examName: '九月阶段练习', message: '请保持安静。\n按监考老师指示作答。',
      exams: [{name: '语文', start: '2026-09-28T09:00:00', end: '2026-09-28T11:00:00', alertTime: 15}]};
    status.preparedId = summary.preparationId;
    op = {...body, operationId: randomUUID(), sha256: hash, dataBase64: null, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300000).toISOString(),
      state: 'PREPARED', summary, sessionId: null, reasonCode: null, grant: null};
    return reply(op, 201);
  });
  await page.goto(origin + '/plan-fixture');
  await page.locator('input[type=file]').setInputFiles({name: '考试方案.json', mimeType: 'application/json', buffer: Buffer.from('{"examName":"九月阶段练习"}')});
  await page.getByRole('button', {name: '投递并校验', exact: true}).click();
  await expect(page.getByText('考试方案.json · 校验通过，等待确认放映')).toBeVisible();
  if (starts !== 0 || creates !== 1) throw new Error('Prepare auto-started or duplicated');
  await page.getByRole('button', {name: '核对并开始放映', exact: true}).click();
  await expect(page.getByText('确认在这台设备开始放映')).toBeVisible();
  await page.getByRole('button', {name: '返回核对', exact: true}).click();
  await expect(page.locator('.v-overlay__scrim')).toBeHidden();
  if (starts !== 0) throw new Error('Cancel confirmation dispatched start');
  await page.screenshot({path: resolve(output, 'prepared.png'), fullPage: true});
  await page.getByRole('button', {name: '核对并开始放映', exact: true}).click();
  await page.getByRole('button', {name: '开始放映', exact: true}).click();
  await expect(page.getByText('实际放映：正在打开窗口')).toBeVisible();
  await page.getByRole('button', {name: '核对并重试原请求', exact: true}).click();
  await expect(page.getByRole('button', {name: '核对并重试原请求', exact: true})).toHaveCount(0);
  if (starts !== 1) throw new Error('Unknown response caused replay');
  status.player.sessions[0].state = 'ready'; await page.getByRole('button', {name: '刷新状态', exact: true}).click();
  await expect(page.getByText('实际放映：放映已就绪')).toBeVisible();
  await page.screenshot({path: resolve(output, 'ready.png'), fullPage: true});
  await page.goto(origin + '/runtime-fixture');
  const dailyButton = page.getByRole('button',{name:'结束考试／返回日常',exact:true});
  await expect(dailyButton).toBeDisabled();
  await page.getByRole('checkbox').check();
  await dailyButton.click();
  await expect(page.getByRole('button',{name:'切入／重试考试模式',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'重试返回日常请求',exact:true}).click();
  await expect(page.getByRole('button',{name:'重试返回日常请求',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'结束考试／返回日常',exact:true})).toBeVisible();
  await expect(page.getByText('提交结果尚待核实。重试沿用同一请求，不会创建第二个任务。')).toHaveCount(0);
  await expect(page.getByText('返回日常 · 已返回日常模式')).toBeVisible();
  await expect(page.getByText('考试看板：已退出',{exact:true})).toBeVisible();
  await expect(page.getByText('ClassIsland：已就绪',{exact:true})).toBeVisible();
  if (dailyRequests.length !== 2) throw new Error('Daily request missing or duplicated');
  await page.screenshot({path:resolve(output,'daily-return.png'),fullPage:true});
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`PASS isolated browser: plan presentation and remote Daily return; ambiguous retries preserve target and ID, truthful result labels. ${requests.length} API requests. Screenshots: ${output}`);
} finally { await browser?.close(); await server.close(); }
