// Actual administrator report UI/API and retired PWA commands; loopback fixtures only.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import vue from '@vitejs/plugin-vue';
import {chromium, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createServer as portProbe} from 'node:net';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(root,'.artifacts/native-noise');await mkdir(output,{recursive:true});
const sessionId=randomUUID(),errors=[],seen=[];
let offline=false;
const report={sessionId,startedAt:'2026-10-11T11:00:00Z',endedAt:'2026-10-11T11:01:00Z',outcome:'Stopped',deviceName:'隔离麦克风',algorithm:'pcm-energy-v1',
  summary:{elapsedSeconds:60,sampledSeconds:55,coverage:55/60,energyMeanDbfs:-25.2,peakDbfs:-9,clippedPercent:0}};
const port=await new Promise((done,reject)=>{
  const p=portProbe();p.once('error',reject);p.listen(0,'127.0.0.1',()=>{const value=p.address().port;p.close(e=>e?reject(e):done(value));});
});
const server=await createServer({configFile:false,envFile:false,root,cacheDir:resolve(output,'vite-cache'),
  optimizeDeps:{entries:['src/components/admin/NpepNoiseReports.vue'],include:['vue','vuetify','vuetify/components','vuetify/directives']},
  resolve:{alias:{'@':resolve(root,'src')}},plugins:[vue(),{name:'native-report-fixture',configureServer(s){
    s.middlewares.use(async(req,res,next)=>{
      if(req.url==='/fixture-control'){let raw='';for await(const part of req)raw+=part;offline=JSON.parse(raw).offline;res.end('OK');return;}
      if(req.url?.startsWith('/api/v2/npep/')){
        seen.push({path:req.url,method:req.method});
        assert.equal(req.method,'GET');assert.equal(req.headers.authorization,'Bearer isolated-admin-token');
        assert.equal(req.headers['x-classworks-screen-token'],undefined);
        res.setHeader('Content-Type','application/json');
        if(offline){res.statusCode=503;res.end(JSON.stringify({error:{code:'TEMPORARILY_UNAVAILABLE'}}));return;}
        const data=req.url.endsWith('/noise-schedule')?{supported:true,online:true,applied:true,receivedAt:new Date().toISOString(),
          policy:{source:'Grade',version:'isolated'},status:{owner:'Schedule',reason:'WINDOW_ACTIVE',window:{start:'2026-10-11T19:00:00',end:'2026-10-11T21:30:00'},clockReady:true,dateNeedsReview:false},sessions:[]}:{reports:[report]};
        res.end(JSON.stringify({protocolVersion:req.headers['x-npep-version'],requestId:req.headers['x-request-id'],serverTime:new Date().toISOString(),data}));return;
      }
      if(req.url!=='/noise-fixture')return next();
      res.setHeader('Content-Type','text/html');
      res.end(await s.transformIndexHtml('/noise-fixture',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><div id="app"></div><script type="module">
        import {createApp,h} from 'vue';import {createVuetify} from 'vuetify';import * as components from 'vuetify/components';import * as directives from 'vuetify/directives';import 'vuetify/styles';
        import Panel from '/src/components/admin/NpepNoiseReports.vue';
        import {saveAccountTokens} from '/src/utils/classworksV2Client.js';import {nativeNoise} from '/src/utils/nativeNoise.js';
        saveAccountTokens({accessToken:'isolated-admin-token',refreshToken:'isolated-refresh'});
        window.verifyRetiredCommands=async()=>{const errors=[];for(const action of ['command','protectedStop','resumeSchedule']){try{await nativeNoise[action]('START');errors.push('ACCEPTED');}catch(e){errors.push(e.message);}}return errors;};
        createApp({render:()=>h(components.VApp,{},()=>h(components.VMain,{class:'pa-6'},()=>h(Panel,{schoolId:'school',deviceId:'device',deviceName:'隔离原生设备'})))}).use(createVuetify({components,directives})).mount('#app');
      </script></html>`));
    });
  }}],server:{host:'127.0.0.1',port,strictPort:true,hmr:false},define:{'import.meta.env.VITE_SERVER_URL':'""','import.meta.env.VITE_DEFAULT_KV_SERVER':'""'}});
let browser;
try{
  await server.listen();const origin=`http://127.0.0.1:${port}`;browser=await chromium.launch();const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__micRequests=0;navigator.mediaDevices.getUserMedia=async()=>{window.__micRequests++;throw new Error('Real microphone forbidden');};});
  await page.goto(origin+'/noise-fixture');
  const article=page.getByRole('article',{name:`统计报告 ${sessionId}`});
  await expect(article).toHaveCount(1);await expect(article).toContainText(/有效采样\s*55\.0 秒/);
  await expect(article).toContainText(/总时长\s*60\.0 秒/);await expect(article).toContainText(/覆盖率\s*92%/);
  await expect(article).toContainText('dBFS');
  const rejected=await page.evaluate(()=>window.verifyRetiredCommands());
  assert.equal(rejected.length,3);assert(rejected.every(s=>s.includes('停用')));
  await page.screenshot({path:resolve(output,'report.png'),fullPage:true});
  await page.request.post(origin+'/fixture-control',{data:{offline:true}});
  await page.getByRole('button',{name:'刷新报告',exact:true}).click();
  await expect(page.getByText(/报告加载失败/)).toBeVisible();await expect(article).toBeVisible();
  await expect(page.getByText(/排程状态未确认/)).toBeVisible();
  await page.request.post(origin+'/fixture-control',{data:{offline:false}});
  await page.getByRole('button',{name:'刷新报告',exact:true}).click();
  await expect(page.getByText(/报告加载失败/)).toHaveCount(0);await expect(article).toHaveCount(1);
  assert.equal(await page.evaluate(()=>window.__micRequests),0);assert.deepEqual(errors,[]);
  assert(seen.length>=6);assert(seen.every(r=>r.method==='GET'));
  console.log('PASS browser: administrator report API, coverage/dBFS, retained history across offline recovery, retired PWA commands, zero microphone requests.');
}finally{await browser?.close();await server.close();}
