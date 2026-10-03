// Actual Vue/Vuetify rendering and HTTP client; loopback fixtures only.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import vue from '@vitejs/plugin-vue';
import {chromium, expect} from '@playwright/test';
import {createServer as portProbe} from 'node:net';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdir, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const args=process.argv.slice(2);
if(args.length && (args.length!==2||args[0]!=='--backend-root'))throw new Error('Use --backend-root <checkout> or no options.');
const contract=args.length ? await import(pathToFileURL(resolve(args[1],'domain/npep/wire.js'))) : null;
const output = resolve(root, '.artifacts/pairing-browser', randomUUID());
await mkdir(output, {recursive:true});
const screens = [{id:'one',name:'一班大屏',gradeId:'grade',className:'高一一班',enabled:false,revision:1},
  {id:'two',name:'二班大屏',gradeId:'other-grade',className:'高二二班',enabled:false,revision:1}];
const calls = [], errors = [], checks = [];
let conflict = false, occupied = false, code = null, issueCount = 0;
const preview = body => {
  const selected = screens.filter(s=>body.targetType === 'SCHOOL' || s.gradeId === body.targetId);
  const items = selected.map(s=>({screenBindingId:s.id,name:s.name,administrativeClassName:s.className,enabled:s.enabled,
    revision:s.revision,changed:s.enabled !== body.enabled}));
  return {...body,termName:'测试学期',targetName:body.targetType === 'SCHOOL' ? '全校' : '高一',previewDigest:'a'.repeat(64),
    totalScreens:items.length,changedScreens:items.filter(s=>s.changed).length,unchangedScreens:items.filter(s=>!s.changed).length,
    excludedScreens:0,items,truncated:false};
};
const port = await new Promise((done,reject)=>{
  const probe = portProbe(); probe.once('error',reject);
  probe.listen(0,'127.0.0.1',()=>{const p=probe.address().port;probe.close(e=>e?reject(e):done(p));});
});
const server = await createServer({configFile:false,envFile:false,root,cacheDir:resolve(output,'vite-cache'),
  resolve:{alias:{'@':resolve(root,'src')}},
  optimizeDeps:{entries:['src/components/admin/NpepPairingAccess.vue','src/components/v2/NpepScreenPairingCard.vue'],
    include:['vue','vuetify','vuetify/components','vuetify/directives']},
  plugins:[vue(),{name:'pairing-browser-fixture',configureServer(s){s.middlewares.use(async(req,res,next)=>{
    try {
      if (req.url?.startsWith('/api/v2/npep/')) {
        let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):null;
        calls.push({path:req.url,method:req.method,body});
        assert.equal(req.headers['x-npep-version'],'0.1');
        if(body&&contract){
          const definition=req.url.includes('/screen/')?'issueScreenPairing':req.url.endsWith('/preview')?'previewPairingAccessBatch':'setPairingAccessBatch';
          assert.equal(contract.validate(definition,body),true,'Actual browser request must satisfy backend wire schema');
        }
        const requestId=body?.requestId||req.headers['x-request-id'];
        res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
        const reply=(data,status=200)=>{res.statusCode=status;res.end(JSON.stringify({protocolVersion:'0.1',requestId,serverTime:new Date().toISOString(),data}));};
        if(req.url==='/api/v2/npep/screen/pairing'){
          assert.equal(req.headers['x-classworks-screen-token'],'fixture-screen');assert.equal(req.headers.authorization,undefined);
          if(!body)return reply({enabled:screens[0].enabled,occupied,screenBindingId:'one',schoolName:'测试学校',
            administrativeClassName:'高一一班',screenBindingName:'一班大屏'});
          assert.equal(screens[0].enabled,true);assert.equal(occupied,false);
          code=++issueCount===1?'ABCD2345':'WXYZ2345';
          return reply({state:'READY',userCode:code,expiresAt:new Date(Date.now()+600000).toISOString()},201);
        }
        assert.equal(req.headers.authorization,'Bearer fixture-admin');assert.equal(req.headers['x-classworks-screen-token'],undefined);
        if(!body)return reply({items:screens.map(s=>({screenBindingId:s.id,enabled:s.enabled,revision:s.revision}))});
        const result=preview(body);
        if(req.url.endsWith('/preview'))return reply(result);
        assert.ok(req.url.endsWith('/batch'));assert.equal(body.previewDigest,'a'.repeat(64));
        if(conflict){res.statusCode=409;res.end(JSON.stringify({protocolVersion:'0.1',requestId,error:{code:'PREAUTHORIZATION_CHANGED'}}));return;}
        for(const screen of screens.filter(s=>body.targetType==='SCHOOL'||s.gradeId===body.targetId)){
          if(screen.enabled!==body.enabled){screen.enabled=body.enabled;screen.revision++;code=null;}
        }
        return reply({...result,applied:true,updatedAt:new Date().toISOString()});
      }
      if(!['/admin-fixture','/screen-fixture'].includes(req.url))return next();
      const admin=req.url==='/admin-fixture';
      res.setHeader('Content-Type','text/html');
      res.end(await s.transformIndexHtml(req.url,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>配对浏览器隔离验收</title><div id="app"></div><script type="module">
        import {createApp,h,ref} from 'vue';import {createVuetify} from 'vuetify';import * as components from 'vuetify/components';import * as directives from 'vuetify/directives';import 'vuetify/styles';
        import Panel from '${admin?'/src/components/admin/NpepPairingAccess.vue':'/src/components/v2/NpepScreenPairingCard.vue'}';
        import {saveAccountTokens,saveClassroomScreenToken,clearClassroomScreenToken} from '/src/utils/classworksV2Client.js';
        ${admin?"clearClassroomScreenToken();saveAccountTokens({accessToken:'fixture-admin',refreshToken:'fixture-session'});":"saveClassroomScreenToken('fixture-screen');"}
        const termId=ref('term');window.fixtureTerm=termId;
        const bindings=${JSON.stringify(screens.map(s=>({id:s.id,name:s.name,isActive:true,administrativeClass:{name:s.className,termId:'term',gradeId:s.gradeId,grade:{name:s.gradeId==='grade'?'高一':'高二'},isActive:true,term:{id:'term',status:'ACTIVE'}}})))};
        createApp({render:()=>h(components.VApp,{},()=>h(components.VMain,{class:'pa-6'},()=>h(Panel,{schoolId:'school',termId:termId.value,bindings})))}).use(createVuetify({components,directives})).mount('#app');
      </script></html>`));
    } catch(error){errors.push(error.message);res.statusCode=500;res.end('Fixture failed');}
  });}}],server:{host:'127.0.0.1',port,strictPort:true,hmr:false},
  define:{'import.meta.env.VITE_SERVER_URL':'""','import.meta.env.VITE_DEFAULT_KV_SERVER':'""'}});
let browser, admin, screen;
try {
  await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await chromium.launch({headless:true});
  const contexts=await Promise.all([browser.newContext({viewport:{width:1280,height:1100}}),browser.newContext({viewport:{width:1280,height:1100}})]);
  for(const context of contexts)await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  admin=await contexts[0].newPage();screen=await contexts[1].newPage();
  for(const page of [admin,screen]){page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));}
  await screen.goto(origin+'/screen-fixture');
  await expect(screen.getByRole('button',{name:'生成配对码',exact:true})).toBeDisabled();
  await expect(screen.getByText(/学校尚未开放/)).toBeVisible();checks.push('disabled screen blocks code');
  await admin.goto(origin+'/admin-fixture');
  async function select(label,value){
    const field=admin.locator('.v-select').filter({has:admin.getByText(label,{exact:true})}).locator('input');await field.press('ArrowDown');
    const option=admin.getByRole('option',{name:value,exact:true});await option.click();
    await expect(option).toBeHidden();
  }
  const previewButton=admin.getByRole('button',{name:'预览影响范围',exact:true});
  const confirm=admin.getByRole('checkbox',{name:'已核对范围，同意批量修改网页配对预授权',exact:true});
  await select('范围','指定年级');await select('年级','高一');
  await previewButton.click();await expect(admin.getByText(/有效大屏 1 台/)).toBeVisible();
  const apply=admin.getByRole('button',{name:'确认批量开放',exact:true});await expect(apply).toBeDisabled();
  await confirm.check();await expect(apply).toBeEnabled();
  await select('网页配对','关闭');await expect(confirm).toHaveCount(0);
  await select('网页配对','开放');await previewButton.click();await confirm.check();await apply.click();
  await expect(admin.getByText(/已开放 1 台大屏的网页配对/)).toBeVisible();
  assert.equal(screens[0].enabled,true);assert.equal(screens[1].enabled,false);checks.push('grade preview, consent reset and apply');
  await screen.getByRole('button',{name:'刷新授权状态',exact:true}).click();
  await screen.getByRole('button',{name:'生成配对码',exact:true}).click();
  await expect(screen.getByText('ABCD2345',{exact:true})).toBeVisible();
  await expect(screen.getByLabel('NPEduTools 服务提供商地址（后端）')).toHaveValue(origin);
  await screen.getByRole('button',{name:'重新生成配对码',exact:true}).click();
  await expect(screen.getByText('WXYZ2345',{exact:true})).toBeVisible();
  await expect(screen.getByText('ABCD2345',{exact:true})).toHaveCount(0);
  assert.equal(await screen.evaluate(()=>Object.values({...localStorage,...sessionStorage}).some(v=>/ABCD2345|WXYZ2345/.test(v))),false);
  await screen.reload();await expect(screen.getByText('WXYZ2345',{exact:true})).toHaveCount(0);
  checks.push('screen uses its own identity, transient code and backend origin');
  await select('范围','全校（当前学期）');await previewButton.click();await confirm.check();await apply.click();
  await expect(admin.getByText(/已开放 1 台大屏的网页配对；1 台保持原状态/)).toBeVisible();
  checks.push('school scope includes remaining screen');
  await select('网页配对','关闭');await previewButton.click();await confirm.check();conflict=true;
  await admin.getByRole('button',{name:'确认批量关闭',exact:true}).click();
  await expect(admin.getByText(/整批设置未保存/)).toBeVisible();await expect(previewButton).toBeDisabled();
  conflict=false;await admin.getByRole('button',{name:'刷新预授权',exact:true}).click();
  await previewButton.click();await confirm.check();
  await admin.getByRole('button',{name:'确认批量关闭',exact:true}).click();
  await expect(admin.getByText(/已关闭 2 台大屏/)).toBeVisible();
  await screen.getByRole('button',{name:'刷新授权状态',exact:true}).click();
  await expect(screen.getByRole('button',{name:'生成配对码',exact:true})).toBeDisabled();
  checks.push('conflict requires refresh; closing blocks screen');
  occupied=true;await screen.getByRole('button',{name:'刷新授权状态',exact:true}).click();
  await expect(screen.getByText(/此大屏已有 NPEduTools 绑定/)).toBeVisible();checks.push('occupied binding cannot be replaced');
  await select('网页配对','开放');await previewButton.click();await confirm.check();
  await admin.evaluate(()=>{window.fixtureTerm.value='other-term';});
  await expect(confirm).toHaveCount(0);await expect(admin.getByRole('button',{name:'确认批量开放',exact:true})).toHaveCount(0);
  checks.push('term switch discards preview and consent');
  assert.deepEqual(errors,[]);await admin.screenshot({path:resolve(output,'management.png'),fullPage:true});
  await screen.screenshot({path:resolve(output,'screen.png'),fullPage:true});
  await writeFile(resolve(output,'result.json'),JSON.stringify({status:'PASSED',checks,backendContractChecked:!!contract,fixtureOnly:true,deviceAcceptance:'NOT_RUN'},null,2));
  console.log(`PASS ${checks.length} browser checks: actual Vue/Vuetify and HTTP client, loopback fixtures. ${output}`);
} catch(error) {
  await admin?.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});
  await writeFile(resolve(output,'failure-aria.txt'),await admin?.locator('body').ariaSnapshot()||'');
  await writeFile(resolve(output,'result.json'),JSON.stringify({status:'FAILED',checks,error:error.message,errors,calls,fixtureOnly:true,deviceAcceptance:'NOT_RUN'},null,2));
  throw error;
} finally {await browser?.close();await server.close();}
