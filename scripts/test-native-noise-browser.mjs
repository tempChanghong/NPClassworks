// Isolated browser + real Vue/API client. HTTP and audio values below are explicitly fixtures.
import {createServer} from 'vite';
import vue from '@vitejs/plugin-vue';
import {chromium, expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createServer as createPortProbe} from 'node:net';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, '.artifacts/native-noise'); await mkdir(output, {recursive: true});
const status = {instanceId: randomUUID(), revision: 1, sessionId: null, state: 'Idle', configured: true,
  deviceName: '隔离测试麦克风', currentDbfs: null, quality: 'Waiting', uploadError: null};
const commands = [], reports = [], seen = [];
let offline = false;
// Vite 5 treats port 0 as its default 5173. Select a positive OS-assigned port instead.
const port = await new Promise((done, reject) => {
  const probe = createPortProbe();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const assigned = probe.address().port;
    probe.close(error => error ? reject(error) : done(assigned));
  });
});
const server = await createServer({configFile: false, envFile: false, root, cacheDir: resolve(output, 'vite-cache'),
  optimizeDeps: {entries: ['src/components/v2/NativeNoisePanel.vue'], include: ['vue', 'vuetify', 'vuetify/components', 'vuetify/directives']},
  resolve: {alias: {'@': resolve(root, 'src')}}, plugins: [vue(), {name: 'noise-fixture', configureServer(s) {
    s.middlewares.use(async (req, res, next) => {
      if (req.url === '/fixture-control') {
        let body = ''; for await (const c of req) body += c;
        const update = JSON.parse(body);
        if ('offline' in update) offline = update.offline === true;
        if ('currentDbfs' in update) status.currentDbfs = update.currentDbfs;
        if ('quality' in update) status.quality = update.quality;
        res.end('OK'); return;
      }
      if (req.url?.startsWith('/api/v2/npep/')) {
        let raw = ''; for await (const c of req) raw += c; const body = raw ? JSON.parse(raw) : null;
        seen.push({path: req.url, headers: req.headers, body});
        res.setHeader('Content-Type', 'application/json');
        const requestId = body?.requestId || req.headers['x-request-id'];
        if (offline) { res.statusCode = 503; res.end(JSON.stringify({protocolVersion: '0.6', requestId, error: {code: 'TEMPORARILY_UNAVAILABLE'}})); return; }
        let data;
        if (body) {
          if (req.headers['x-classworks-screen-token'] !== 'isolated-screen-token' || req.headers.authorization) throw new Error('Wrong screen authority');
          const command = {...body, commandId: randomUUID()};
          const item = {command, receipt: {outcome: 'ACCEPTED', reason: null}}; commands.push(item);
          if (body.action === 'START') Object.assign(status, {state: 'Active', sessionId: command.commandId, currentDbfs: -24.1, quality: 'Good'});
          else {
            reports.push({sessionId: status.sessionId, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), outcome: 'Stopped',
              deviceName: status.deviceName, algorithm: 'pcm-energy-v1', summary: {elapsedSeconds: 60, sampledSeconds: 55, coverage: 55/60, energyMeanDbfs: -25.2, peakDbfs: -9, clippedPercent: 0}});
            Object.assign(status, {state: 'Stopped', currentDbfs: null});
          }
          status.revision++; data = item;
        } else data = {provider: 'native', online: true, status, commands, reports, receivedAt: new Date().toISOString()};
        res.end(JSON.stringify({protocolVersion: '0.6', requestId, serverTime: new Date().toISOString(), data})); return;
      }
      if (req.url !== '/noise-fixture') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end(await s.transformIndexHtml('/noise-fixture', `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>原生噪音隔离验收</title><div id="app"></div><script type="module">
        import {createApp,h} from 'vue'; import {createVuetify} from 'vuetify'; import * as components from 'vuetify/components'; import * as directives from 'vuetify/directives'; import 'vuetify/styles';
        import Panel from '/src/components/v2/NativeNoisePanel.vue';
        import {saveClassroomScreenToken} from '/src/utils/classworksV2Client.js';
        import {nativeNoise} from '/src/utils/nativeNoise.js';
        saveClassroomScreenToken('isolated-screen-token'); nativeNoise.context('isolated-screen'); nativeNoise.poll();
        setInterval(()=>nativeNoise.poll(),1000);
        createApp({render:()=>h(components.VApp,{},()=>h(components.VMain,{class:'pa-6'},()=>h(Panel)))}).use(createVuetify({components,directives})).mount('#app');
      </script></html>`));
    });
  }}], server: {host: '127.0.0.1', port, strictPort: true, hmr: false}, define: {'import.meta.env.VITE_SERVER_URL': '""', 'import.meta.env.VITE_DEFAULT_KV_SERVER': '""'}});
let browser;
try {
  await server.listen(); const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  if (process.argv.includes('--serve')) { console.log(origin + '/noise-fixture'); await new Promise(() => {}); }
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}}); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__micRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => { window.__micRequests++; throw new Error('Browser microphone must remain unused'); };
  });
  await page.goto(origin + '/noise-fixture');
  await expect(page.getByRole('button', {name: '开始监测', exact: true})).toBeEnabled();
  await expect(page.getByText(/自动时段由学校设置、桌面按 ClassIsland 时间执行/)).toBeVisible();
  await page.getByRole('button', {name: '开始监测', exact: true}).click();
  await expect(page.getByText('-24.1', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: '开始监测', exact: true})).toBeDisabled();
  await page.screenshot({path: resolve(output, 'active.png'), fullPage: true});
  await page.request.post(origin + '/fixture-control', {data: {currentDbfs: -160, quality: 'Good'}});
  await expect(page.getByText('≤ -160.0', {exact: true})).toBeVisible();
  await expect(page.getByText(/采样质量：输入接近静音/)).toBeVisible();
  await expect(page.getByText(/已达到数值下限/)).toBeVisible();
  await page.screenshot({path: resolve(output, 'low-signal.png'), fullPage: true});
  await page.request.post(origin + '/fixture-control', {data: {offline: true}});
  await expect(page.getByText('未知／离线', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: '停止监测', exact: true})).toBeDisabled();
  await expect(page.getByText('≤ -160.0', {exact: true})).toHaveCount(0);
  await expect(page.getByText(/已达到数值下限/)).toHaveCount(0);
  await page.request.post(origin + '/fixture-control', {data: {offline: false}});
  await expect(page.getByRole('button', {name: '停止监测', exact: true})).toBeEnabled();
  await page.request.post(origin + '/fixture-control', {data: {currentDbfs: -57, quality: 'Good'}});
  await expect(page.getByText('-57.0', {exact: true})).toBeVisible();
  await expect(page.getByText(/采样质量：采样有效/)).toBeVisible();
  await expect(page.getByText(/已达到数值下限/)).toHaveCount(0);
  await page.getByRole('button', {name: '停止监测', exact: true}).click();
  await expect(page.getByText(/有效采样 55.0 秒/)).toBeVisible();
  await expect(page.getByText(/采样质量：已结束/)).toBeVisible();
  await page.screenshot({path: resolve(output, 'report.png'), fullPage: true});
  if (await page.evaluate(() => window.__micRequests) !== 0 || errors.length) throw new Error('Browser regression: ' + errors.join(';'));
  if (seen.filter(r => r.body).length !== 2) throw new Error('Unexpected command count');
  console.log('PASS browser: actual native panel/client start, low-signal/floor, offline hiding, speech recovery, stop, report; zero browser microphone requests.');
} finally { await browser?.close(); await server.close(); }
