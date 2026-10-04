// Actual Vue component/client; all HTTP replies are fixtures, not a school deployment.
import {createServer} from 'vite';
import vue from '@vitejs/plugin-vue';
import {chromium, expect} from '@playwright/test';
import {createServer as portProbe} from 'node:net';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolvePolicy} from '../src/utils/schoolNoiseSchedule.js';
const root = fileURLToPath(new URL('../', import.meta.url)), output = resolve(root,'.artifacts/noise-schedules');
await mkdir(output,{recursive:true});
const policies=[], saves=[], requests=[];
const schoolWindow={start:'2026-10-01T19:00:00.000',end:'2026-10-01T20:00:00.000'};
let resumeCount=0;
const scheduledSession='aef542c3-3673-4768-8ed1-836c892dfd9f', unknownSession='ff680733-18c6-45e4-98e4-9e1d238c05db';
const reports=[scheduledSession,unknownSession].map(sessionId=>({sessionId,startedAt:'2026-10-01T11:05:00.000Z',endedAt:'2026-10-01T11:06:00.000Z',outcome:'Stopped',
  algorithm:'pcm-energy-v1',deviceName:'Synthetic microphone',summary:{sampledSeconds:59,elapsedSeconds:60,coverage:59/60,energyMeanDbfs:-57,peakDbfs:-48,clippedPercent:0}}));
let runtimeView={supported:true,online:true,applied:true,sessions:[],policy:{source:'Grade',version:'a'.repeat(64),rules:[{days:[4],start:'19:00',end:'20:00'}]},
  status:{source:'Grade',owner:'None',reason:'WINDOW_SKIPPED',schoolNow:'2026-10-01T19:30:00.000',clockReady:true,dateNeedsReview:false,
    window:schoolWindow,next:null,leaseRemainingSeconds:80000},commands:[]};
let conflict=false, reportFailure=false, scheduleFailure=false;
const classes=[{id:'one',name:'高二一班',gradeId:'grade',pairedDevices:1},{id:'two',name:'高二二班',gradeId:'grade',pairedDevices:0}];
const catalog=()=>({termId:'term',terms:[{id:'term',name:'测试学期'}],grades:[{id:'grade',name:'高二'}],classes,policies,executionEnabled:true});
const port=await new Promise((done,reject)=>{const probe=portProbe();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const p=probe.address().port;probe.close(e=>e?reject(e):done(p));});});
const server=await createServer({configFile:false,envFile:false,root,cacheDir:resolve(output,'vite-cache'),
  resolve:{alias:{'@':resolve(root,'src')}},optimizeDeps:{entries:['src/components/admin/NpepNoiseSchedules.vue'],include:['vue','vuetify','vuetify/components','vuetify/directives']},
  plugins:[vue(),{name:'noise-schedule-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
    if(req.url==='/runtime-control'){let raw='';for await(const chunk of req)raw+=chunk;Object.assign(runtimeView,JSON.parse(raw));res.end('OK');return;}
    if(req.url==='/fixture-control'){let raw='';for await(const chunk of req)raw+=chunk;const control=JSON.parse(raw);
      if(Object.hasOwn(control,'conflict'))conflict=control.conflict;
      if(Object.hasOwn(control,'reportFailure'))reportFailure=control.reportFailure;
      if(Object.hasOwn(control,'scheduleFailure'))scheduleFailure=control.scheduleFailure;
      res.end('OK');return;}
    if(req.url?.startsWith('/api/v2/npep/')){
      let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):null;
      requests.push({method:req.method,path:req.url,version:req.headers['x-npep-version'],body});
      res.setHeader('Content-Type','application/json');
      const requestId=body?.requestId||req.headers['x-request-id'];
      if(req.url.includes('/screen/')||/^\/api\/v2\/npep\/schools\/school\/devices\/device\/noise(?:-schedule)?$/.test(req.url)) {
        const schedule=req.url.includes('noise-schedule');
        if(reportFailure&&!schedule){res.statusCode=503;res.end(JSON.stringify({protocolVersion:'0.6',requestId,error:{code:'TEMPORARILY_UNAVAILABLE'}}));return;}
        if(scheduleFailure&&schedule){res.statusCode=503;res.end(JSON.stringify({protocolVersion:'0.7',requestId,error:{code:'TEMPORARILY_UNAVAILABLE'}}));return;}
        if(body&&schedule) {
          resumeCount++;if(body.version!==runtimeView.policy.version||JSON.stringify(body.window)!==JSON.stringify(schoolWindow))throw new Error('Stale resume');
          runtimeView.status.reason='WINDOW_ACTIVE';runtimeView.status.owner='Schedule';
          runtimeView.commands=[{command:{commandId:'fixture'},receipt:{outcome:'ACCEPTED'}}];
        }
        res.end(JSON.stringify({protocolVersion:schedule?'0.7':'0.6',requestId,serverTime:new Date().toISOString(),data:schedule?runtimeView:
          {provider:'native',online:true,status:{configured:true,state:'Stopped',currentDbfs:null,quality:'Good',deviceName:'Synthetic microphone'},commands:[],reports}}));return;
      }
      if(req.method==='GET'&&req.url==='/api/v2/npep/schools/school/noise-display-settings?termId=term'){
        res.end(JSON.stringify({protocolVersion:'0.8',requestId,serverTime:new Date().toISOString(),data:{...catalog(),settings:[]}}));return;
      }
      if(body&&conflict){res.statusCode=409;res.end(JSON.stringify({protocolVersion:'0.7',requestId,error:{code:'SCHEDULE_VERSION_CONFLICT'}}));return;}
      let data=catalog();
      if(body){
        const selected=classes.filter(c=>body.targetType==='GRADE'||c.id===body.targetId);
        data={baseRevision:body.expectedRevision,termId:'term',targetType:body.targetType,targetId:body.targetId,policy:body.policy,
          totalClasses:selected.length,changedClasses:selected.length,pairedDevices:1,executionEnabled:true,truncated:false,
          items:selected.map(c=>({classId:c.id,name:c.name,changed:true,pairedDevices:c.pairedDevices,
            effective:resolvePolicy(body.targetType==='GRADE'?body.policy:policies.find(p=>p.targetType==='GRADE')?.policy??null,
              body.targetType==='CLASS'?body.policy:null)}))};
        if(!req.url.endsWith('/preview')){
          saves.push(body);data.revision=body.expectedRevision+1;data.updatedAt=new Date().toISOString();
          const row={targetType:body.targetType,targetId:body.targetId,policy:body.policy,revision:data.revision,updatedAt:data.updatedAt};
          const index=policies.findIndex(p=>p.targetType===body.targetType&&p.targetId===body.targetId);
          if(index<0)policies.push(row);else policies[index]=row;
        }
      }
      res.end(JSON.stringify({protocolVersion:'0.7',requestId,serverTime:new Date().toISOString(),data}));return;
    }
    if(req.url==='/execution-fixture') {
      res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/execution-fixture',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><div id="app"></div><script type="module">
        import {createApp,h} from 'vue';import {createVuetify} from 'vuetify';import * as components from 'vuetify/components';import * as directives from 'vuetify/directives';import 'vuetify/styles';import '@mdi/font/css/materialdesignicons.css';
        import Panel from '/src/components/v2/NativeNoisePanel.vue';import {nativeNoise} from '/src/utils/nativeNoise.js';import {saveClassroomScreenToken} from '/src/utils/classworksV2Client.js';
        saveClassroomScreenToken('isolated-screen');nativeNoise.context('fixture');nativeNoise.poll();
        createApp({render:()=>h(components.VApp,{},()=>h(components.VMain,{class:'pa-6'},()=>h(Panel)))}).use(createVuetify({components,directives})).mount('#app');
      </script></html>`));return;
    }
    if(req.url==='/reports-fixture') {
      res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/reports-fixture',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><div id="app"></div><script type="module">
        import {createApp,h} from 'vue';import {createVuetify} from 'vuetify';import * as components from 'vuetify/components';import * as directives from 'vuetify/directives';import 'vuetify/styles';import '@mdi/font/css/materialdesignicons.css';
        import Panel from '/src/components/admin/NpepNoiseReports.vue';import {saveAccountTokens,clearClassroomScreenToken} from '/src/utils/classworksV2Client.js';
        clearClassroomScreenToken();
        saveAccountTokens({accessToken:'isolated-access',refreshToken:'isolated-session'});
        const vuetify=createVuetify({components,directives});window.fixtureSetReportTheme=name=>{vuetify.theme.global.name.value=name;};
        createApp({render:()=>h(components.VApp,{},()=>h(components.VMain,{class:'pa-6'},()=>h(Panel,{schoolId:'school',deviceId:'device',deviceName:'隔离测试设备'})))}).use(vuetify).mount('#app');
      </script></html>`));return;
    }
    if(req.url!=='/schedule-fixture')return next();
    res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/schedule-fixture',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>学校排程隔离验收</title><div id="app"></div><script type="module">
      import {createApp,h} from 'vue';import {createVuetify} from 'vuetify';import * as components from 'vuetify/components';import * as directives from 'vuetify/directives';import 'vuetify/styles';import '@mdi/font/css/materialdesignicons.css';
      import Panel from '/src/components/admin/NpepNoiseSchedules.vue';import {saveAccountTokens} from '/src/utils/classworksV2Client.js';
      saveAccountTokens({accessToken:'isolated-access',refreshToken:'isolated-session'});
      const vuetify=createVuetify({components,directives});window.fixtureSetScheduleTheme=name=>{vuetify.theme.global.name.value=name;};
      createApp({render:()=>h(components.VApp,{},()=>h(components.VMain,{class:'pa-6'},()=>h(Panel,{schoolId:'school',schoolName:'隔离测试学校',termId:'term'})))}).use(vuetify).mount('#app');
    </script></html>`));
  });}}],server:{host:'127.0.0.1',port,strictPort:true,hmr:false},define:{'import.meta.env.VITE_SERVER_URL':'""','import.meta.env.VITE_DEFAULT_KV_SERVER':'""'}});
let browser, page;
const errors=[];
try{
  await server.listen();browser=await chromium.launch({headless:true});
  page=await browser.newPage({viewport:{width:1280,height:1050}});
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__microphones=0;navigator.mediaDevices.getUserMedia=async()=>{window.__microphones++;throw new Error('No browser capture allowed');};
    window.__focusEvents=[];
    for(const name of ['focusin','focusout','keydown'])document.addEventListener(name,event=>{
      window.__focusEvents.push({time:window.performance.now(),name,key:event.key,target:event.target?.outerHTML?.slice(0,220),related:event.relatedTarget?.outerHTML?.slice(0,220)});
      if(window.__focusEvents.length>80)window.__focusEvents.shift();
    },true);
  });
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  async function selectOption(field, title) {
    const input=page.getByRole('combobox',{name:field,exact:true});
    await expect(input).toBeEnabled();
    await input.scrollIntoViewIfNeeded();
    await input.press('ArrowDown');
    await page.getByRole('option',{name:title,exact:true}).click();
    // Vuetify restores the originating input's focus after its leave animation.
    // Wait for the actual menu to hide before opening another selection.
    await expect(page.getByRole('option',{name:title,exact:true,includeHidden:true})).toBeHidden();
  }
  await page.goto(origin+'/schedule-fixture');
  await expect(page.getByText(/保存后，支持自动排程的/)).toBeVisible();
  await selectOption('自动监测规则','使用本范围时段');
  await expect(page.getByRole('button',{name:'保存排程',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'预览影响',exact:true}).click();
  await expect(page.getByText('有效规则预览',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'保存排程',exact:true}).click();
  await expect(page.getByText(/规则已保存，等待支持排程的桌面确认/)).toBeVisible();
  await expect(page.getByRole('button',{name:'保存排程',exact:true})).toBeDisabled();
  await page.waitForTimeout(350);
  await page.screenshot({path:resolve(output,'grade-saved.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  if(!(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)))throw new Error('Schedule editor overflows narrow viewport');
  await expect(page.getByRole('button',{name:'删除时段 1'})).toBeVisible();
  await page.screenshot({path:resolve(output,'grade-saved-mobile.png'),fullPage:true});
  await page.evaluate(()=>window.fixtureSetScheduleTheme('dark'));
  await expect.poll(()=>page.locator('.noise-schedule-editor').evaluate(element=>window.getComputedStyle(element).backgroundColor)).toBe('rgb(33, 33, 33)');
  await page.screenshot({path:resolve(output,'grade-saved-mobile-dark.png'),fullPage:true});
  await page.evaluate(()=>window.fixtureSetScheduleTheme('light'));
  await expect.poll(()=>page.locator('.noise-schedule-editor').evaluate(element=>window.getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
  await page.setViewportSize({width:1280,height:1050});
  await selectOption('配置范围','行政班');
  await page.getByRole('button',{name:'预览影响',exact:true}).click();
  await expect(page.getByText(/范围内 1 个班级/)).toBeVisible();
  await selectOption('自动监测规则','关闭自动监测');
  await expect(page.getByText('有效规则预览',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'预览影响',exact:true}).click();
  await page.request.post(origin+'/fixture-control',{data:{conflict:true}});
  await page.getByRole('button',{name:'保存排程',exact:true}).click();
  await expect(page.getByText(/草稿已保留/)).toBeVisible();
  await expect(page.getByRole('button',{name:'保存排程',exact:true})).toBeDisabled();
  await page.waitForTimeout(350);
  await page.screenshot({path:resolve(output,'class-conflict.png'),fullPage:true});
  await page.request.post(origin+'/fixture-control',{data:{conflict:false}});
  await page.getByRole('button',{name:'重新加载服务器配置',exact:true}).click();
  await expect(page.getByText(/其他管理员已更新此配置/)).toHaveCount(0);
  await expect(page.getByRole('button',{name:'预览影响',exact:true})).toBeEnabled();
  if(errors.length||await page.evaluate(()=>window.__microphones)!==0)throw new Error('UI regression: '+errors.join(';'));
  const schedulePath='/api/v2/npep/schools/school/noise-schedules';
  const displaySettingsPath='/api/v2/npep/schools/school/noise-display-settings?termId=term';
  const unexpectedRequests=requests.filter(r=>!([
    ['GET',`${schedulePath}?termId=term`,'0.7'],
    ['POST',`${schedulePath}/preview`,'0.7'],
    ['POST',schedulePath,'0.7'],
    ['GET',displaySettingsPath,'0.8'],
  ].some(([method,path,version])=>r.method===method&&r.path===path&&r.version===version)
    && (r.method==='GET'?r.body===null:r.body!==null)));
  if(saves.length!==1||unexpectedRequests.length)throw new Error(`Unexpected writes or protocol version: ${JSON.stringify({saves:saves.length,unexpectedRequests})}`);
  await page.goto(origin+'/execution-fixture');
  await expect(page.getByText(/本次已手动停止/)).toBeVisible();
  await expect(page.getByText(/2026-10-01 19:30:00/)).toBeVisible();
  await expect(page.getByText('来源未确认',{exact:true})).toHaveCount(2);
  await page.request.post(origin+'/runtime-control',{data:{sessions:[{sessionId:scheduledSession,version:'a'.repeat(64),window:schoolWindow}]}});
  await page.getByRole('button',{name:'刷新',exact:true}).click();
  const scheduledReport=page.getByRole('article',{name:`统计报告 ${scheduledSession}`,exact:true});
  const unknownReport=page.getByRole('article',{name:`统计报告 ${unknownSession}`,exact:true});
  await expect(scheduledReport.getByText('学校自动排程',{exact:true})).toBeVisible();
  await expect(unknownReport.getByText('来源未确认',{exact:true})).toBeVisible();
  await expect(scheduledReport.getByText('学校时段：2026-10-01 19:00:00 → 2026-10-01 20:00:00',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'恢复本次自动监测',exact:true}).click();
  await expect(page.getByText(/正在按排程监测/)).toBeVisible();
  await expect(page.getByRole('button',{name:'恢复本次自动监测',exact:true})).toHaveCount(0);
  if(resumeCount!==1)throw new Error('Repeated resume');
  await page.request.post(origin+'/runtime-control',{data:{online:false,applied:false,policy:{...runtimeView.policy,version:'b'.repeat(64)}}});
  await page.getByRole('button',{name:'刷新',exact:true}).click();
  await expect(page.getByText(/下列内容为上次回传/)).toBeVisible();
  await expect(page.getByText(/规则待桌面确认/)).toBeVisible();
  await expect(scheduledReport.getByText(/按当时规则执行/)).toBeVisible();
  await expect(scheduledReport.getByText('学校自动排程',{exact:true})).toBeVisible();
  await page.screenshot({path:resolve(output,'execution-status.png'),fullPage:true});
  await page.goto(origin+'/reports-fixture');
  await expect(page.getByRole('article',{name:`统计报告 ${scheduledSession}`,exact:true}).getByText('学校自动排程',{exact:true})).toBeVisible();
  await expect(page.getByRole('article',{name:`统计报告 ${unknownSession}`,exact:true}).getByText('来源未确认',{exact:true})).toBeVisible();
  await expect(page.getByText(/按当时规则执行/)).toBeVisible();
  await expect(page.getByRole('button',{name:'刷新报告',exact:true})).toBeEnabled();
  await page.screenshot({path:resolve(output,'report-sources.png'),fullPage:true});
  await page.setViewportSize({width:900,height:950});
  await page.screenshot({path:resolve(output,'report-sources-900.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  if(!(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)))throw new Error('Noise report overflows narrow viewport');
  await page.screenshot({path:resolve(output,'report-sources-mobile.png'),fullPage:true});
  await page.evaluate(()=>window.fixtureSetReportTheme('dark'));
  await expect.poll(()=>page.locator('.noise-admin-card').evaluate(element=>window.getComputedStyle(element).backgroundColor)).toBe('rgb(33, 33, 33)');
  await page.screenshot({path:resolve(output,'report-sources-mobile-dark.png'),fullPage:true});
  await page.request.post(origin+'/fixture-control',{data:{reportFailure:true}});
  await page.getByRole('button',{name:'刷新报告',exact:true}).click();
  await expect(page.getByText(/以下为上次成功加载的报告/)).toBeVisible();
  await expect(page.getByRole('article',{name:`统计报告 ${scheduledSession}`,exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByText(/报告加载失败/)).toBeVisible();
  await expect(page.getByText('报告尚未完成加载，请刷新后再核对。',{exact:true})).toBeVisible();
  await expect(page.getByText('尚无已上传的结束报告。监测结束并恢复连接后会补传。',{exact:true})).toHaveCount(0);
  await expect(page.getByText('年级排程',{exact:true})).toBeVisible();
  await page.request.post(origin+'/fixture-control',{data:{scheduleFailure:true}});
  await page.reload();
  await expect(page.getByText(/排程状态未确认/)).toBeVisible();
  await expect(page.getByText('正在核对排程接口…',{exact:true})).toHaveCount(0);
  if(errors.length||await page.evaluate(()=>window.__microphones)!==0)throw new Error('Runtime UI regression: '+errors.join(';'));
  console.log('PASS browser: actual management editing and native schedule status/resume client, report source joins in screen/admin, late metadata, historical policy and offline retention, school calendar carrier, zero browser microphone requests. Fixtures only.');
}catch(error){
  if(page){await page.screenshot({path:resolve(output,'failure.png'),fullPage:true});
    const evidence={text:await page.locator('body').innerText(),aria:await page.locator('body').ariaSnapshot(),focusEvents:await page.evaluate(()=>window.__focusEvents),errors,requests};
    await writeFile(resolve(output,'failure.json'),JSON.stringify(evidence,null,2));console.error(evidence);
  }
  throw error;
}finally{await browser?.close();await server.close();}
