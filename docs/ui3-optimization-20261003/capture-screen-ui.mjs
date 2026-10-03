/* global getComputedStyle, innerWidth, innerHeight, devicePixelRatio, performance, location */
import {chromium, request} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const origin = 'http://127.0.0.1:4180', api = 'http://127.0.0.1:4181';
const out = path.resolve('docs/ui3-optimization-20261003');
await fs.mkdir(out, {recursive:true});
const client = await request.newContext();
const subjects = ['语文','数学','英语','物理','化学','生物'].map((name,i)=>({id:i===1?'math':'subject-'+i,name,code:'S'+i}));
const school={id:'school',code:'E2E',name:'示例中学',teacherAuthMode:'PERSONAL_PIN'};
const term={id:'term',schoolId:'school',school,status:'ACTIVE',name:'2026 学年秋季'};
const classroom={id:'class-a',code:'C1',name:'高一（1）班',type:'ADMIN_CLASS',termId:'term',term,gradeId:'grade',
  subjectRules:subjects.map(s=>({subjectId:s.id,deliveryMode:'ADMIN_CLASS'}))};
const fixed=new Date('2026-10-03T08:00:00+08:00'), date='2026-10-03';
const content=[
  '1. 背诵《劝学》第三段，圈出易错字。\n2. 完成阅读训练第 12 页第 1—4 题，写出答题依据。',
  '1. 完成课本第 86 页习题 3.2 的第 1、3、5 题。\n2. 整理函数单调性的两种证明方法，每种各举一例。\n3. 订正今天随堂练习中的错题，写出关键步骤。',
  '1. 熟记 Unit 3 重点词汇 20 个，明天课前听写。\n2. 阅读短文并完成表格，标注对应原句。',
  '完成实验报告：记录测量数据，计算平均值，并说明误差来源。',
  '复习离子反应与离子方程式，完成练习册第 24 页。',
  '画出细胞结构示意图，标注各结构名称及主要功能。'
];
await client.post(api+'/__test/reset');
for(const [i,s] of subjects.entries()){
  const response=await client.post(api+'/api/v2/publications',{data:{boardDate:date,subjectId:s.id,
    title:['课文背诵与阅读','函数单调性练习','Unit 3 词汇与阅读','探究加速度实验','离子反应练习','细胞结构整理'][i],
    content:content[i],publishAt:'2026-10-01T00:00:00Z',dueAt:'2026-10-04T00:00:00Z',
    contentJson:i===1?{optionalContent:'学有余力可选做第 8 题。',submission:'明早交数学课代表。',preparation:{date:'2026-10-04',text:'直尺、草稿本'}}:null}});
  const item=(await response.json()).data;
  await client.patch(api+'/api/v2/publications/'+item.id,{headers:{'If-Match':'"1"'},data:{subject:s,subjectId:s.id,isCertified:i!==3}});
}
const browser=await chromium.launch({headless:true});
const records=[];
async function open(role,width,height,{light=false,touch=false,admin=false,fontScale}={}){
  const values={'classworks-v2-oobe':JSON.stringify({version:1,completed:true,roleHint:role}),
    'Classworks_settings':JSON.stringify({'theme.mode':light?'light':'dark'}),
    ...(role==='teacher'?{'classworks-v2-access-token':'teacher-token','classworks-v2-refresh-token':'teacher-refresh'}:{}),
    ...(role==='screen'?{'classworks-v2-screen-token':'screen-token','classworks-v2-screen-oobe:screen-a':JSON.stringify({version:1,completed:true})}:{}),
    ...(fontScale?{'classworks-v2-screen-display:screen-a':JSON.stringify({fontScale})}:{}),
    ...(role==='student'?{'classworks-v2-student-selection':JSON.stringify({schoolId:'school',administrativeClassId:'class-a',administrativeClassName:classroom.name,courseGroupIds:{},declinedSubjectIds:[]})}:{})};
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:touch,
    isMobile:touch&&role!=='screen',serviceWorkers:'block',timezoneId:'Asia/Shanghai',
    storageState:{cookies:[],origins:[{origin,localStorage:Object.entries(values).map(([name,value])=>({name,value}))}]}});
  const reply=(r,data)=>r.fulfill({json:{data}});
  await context.route(api+'/api/v2/catalog/schools',r=>reply(r,[school]));
  await context.route(api+'/api/v2/catalog/subjects?**',r=>reply(r,subjects));
  await context.route(api+'/api/v2/catalog/workspaces?**',r=>reply(r,[classroom]));
  await context.route(api+'/api/v2/catalog/administrative-classes/class-a/course-options',r=>reply(r,{administrativeClass:classroom,
    subjects:subjects.map(subject=>({subject,deliveryMode:'ADMIN_CLASS',courseGroups:[],requiresSelection:false}))}));
  await context.route(api+'/api/v2/classroom-screens/session',r=>reply(r,{binding:{id:'screen-a',schoolId:'school',name:'教室一体机',administrativeClassId:'class-a',administrativeClass:classroom},
    workspaces:[classroom],homeworkSettings:{}}));
  await context.route(api+'/api/v2/classroom-screens/students',r=>reply(r,[]));
  await context.route(api+'/api/v2/classroom-screens/attendance/*',r=>reply(r,{absent:[],late:[],excluded:[]}));
  await context.route(api+'/accounts/profile',r=>reply(r,{id:'teacher',name:'示例教师',provider:'school-local'}));
  await context.route(api+'/api/v2/me/workspaces',r=>reply(r,[{role:'TEACHER',workspace:classroom}]));
  if(admin){
    await context.route(api+'/accounts/local/status',r=>reply(r,{bootstrapRequired:false}));
    await context.route(url=>url.origin===api&&url.pathname==='/api/v2/me/schools',r=>reply(r,[{role:'ADMIN',school:{...school,terms:[term]}}]));
    await context.route(api+'/api/v2/admin/**',r=>{
      const p=new URL(r.request().url()).pathname;
      if(p.endsWith('/classroom-screens')) return reply(r,[{id:'screen-a',name:'高一（1）班大屏',loginCode:'class-1',administrativeClassId:'class-a',administrativeClass:classroom,isActive:true,dutyState:'ONLINE'}]);
      if(p.endsWith('/workspace-memberships')) return reply(r,{workspaces:[{...classroom,members:[],pendingInvitations:[]}]});
      if(p.endsWith('/homework-settings'))return reply(r,{});
      if(p.endsWith('/local-accounts'))return reply(r,[]);
      if(p.endsWith('/staff-responsibilities'))return reply(r,{policy:{},people:[],grades:[],administrativeClasses:[]});
      return r.fulfill({status:404,json:{message:'UI fixture endpoint not configured'}});
    });
  }
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(fixed);
  await page.goto(admin?origin+'/classworks-admin?section=screens&school=school&term=term':origin);
  await page.locator(admin?'.admin-navigation':role==='teacher'?'.teacher-session-summary':'.publication-card').first().waitFor({timeout:20000});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>!document.querySelector('.md3-enter-active,.md3-leave-active'));
  await page.waitForTimeout(450);
  return {page,context,errors,role,width,height};
}
async function capture(view,name,{full=false}={}){
  const {page}=view;
  await page.waitForTimeout(250);
  await page.screenshot({path:path.join(out,name+'.png'),fullPage:full,animations:'disabled'});
  const data=await page.evaluate(()=>{
    const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();const s=getComputedStyle(e);
      return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),font:s.fontSize,fontFamily:s.fontFamily,line:s.lineHeight,color:s.color,bg:s.backgroundColor};};
    const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
    const buttons=[...document.querySelectorAll('button')].filter(visible);
    return{viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,
      cards:[...document.querySelectorAll('.screen-feed .publication-grid-item')].map(e=>({subject:e.querySelector('.publication-title')?.innerText.slice(0,20),...rect(e)})),
      firstCard:rect(document.querySelector('.publication-card')),firstContent:rect(document.querySelector('.publication-content')),
      overview:rect(document.querySelector('.classworks-overview')),toolbar:rect(document.querySelector('.screen-toolbar')),
      dock:rect(document.querySelector('.screen-action-dock')),composer:rect(document.querySelector('.publication-composer')),
      screenToolbar:rect(document.querySelector('.screen-toolbar')),screenClassName:rect(document.querySelector('.screen-class-name')),
      screenSubject:rect(document.querySelector('.screen-feed .publication-title')),
      screenMetadata:rect(document.querySelector('.screen-feed .publication-metadata')),
      appBar:rect(document.querySelector('.classworks-app-bar')),
      dockBlur:document.querySelector('.screen-action-dock__surface')?getComputedStyle(document.querySelector('.screen-action-dock__surface')).backdropFilter:null,
      teacherManager:rect(document.querySelector('.teacher-publication-manager')),teacherTextarea:rect(document.querySelector('.publication-composer textarea')),
      primaryButtons:buttons.filter(e=>e.classList.contains('bg-primary')).map(e=>({text:e.innerText,fontWeight:getComputedStyle(e).fontWeight,...rect(e)})),
      chips:[...document.querySelectorAll('.v-chip')].filter(visible).slice(0,20).map(e=>({text:e.innerText,...rect(e)})),
      pageTitle:document.title,buttons:buttons.length,smallButtons:buttons.filter(e=>e.getBoundingClientRect().width<44||e.getBoundingClientRect().height<44).map(e=>({text:(e.innerText||e.title||e.getAttribute('aria-label')||'').slice(0,36),...rect(e)})),
      colors:{primary:getComputedStyle(document.querySelector('.v-application')).getPropertyValue('--v-theme-primary'),surface:getComputedStyle(document.querySelector('.v-application')).getPropertyValue('--v-theme-surface')},
      bodyNodes:document.body.querySelectorAll('*').length,bodyText:document.body.innerText.slice(0,5000),
      filters:[...document.querySelectorAll('*')].filter(visible).map(e=>({e,s:getComputedStyle(e)})).filter(({s})=>s.backdropFilter!=='none'||s.filter!=='none').slice(0,20).map(({e,s})=>({className:String(e.className),filter:s.filter,backdropFilter:s.backdropFilter}))};
  });
  if(name==='student-390-font-audit'){
    const cdp=await view.context.newCDPSession(page);
    await cdp.send('DOM.enable');await cdp.send('CSS.enable');
    const doc=await cdp.send('DOM.getDocument');
    const node=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.publication-content'});
    data.platformFonts=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:node.nodeId});
    data.resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>new URL(r.name).origin===location.origin).map(r=>({path:new URL(r.name).pathname,kind:r.initiatorType,bytes:r.encodedBodySize})));
    await cdp.detach();
  }
  const old=records.findIndex(r=>r.name===name);if(old>=0)records.splice(old,1);
  records.push({name,role:view.role,errors:view.errors,...data});
  await fs.writeFile(path.join(out,'measurements.json'),JSON.stringify(records,null,2));
  console.log(JSON.stringify({name,firstCard:data.firstCard,firstContent:data.firstContent,scrollWidth:data.scrollWidth,scrollHeight:data.scrollHeight,buttons:data.buttons,smallButtons:data.smallButtons.length,errors:view.errors}));
}
try{
  for(const [role,w,h,name,options] of [
    ['screen',1920,1080,'screen-1920',{touch:true}],
    ['screen',1366,768,'screen-1366',{touch:true}],
    ['screen',1280,720,'screen-1280',{touch:true}],
    ['screen',1920,1080,'screen-1920-light',{touch:true,light:true}],
    ['screen',3840,2160,'screen-3840',{touch:true}],
    ['screen',1920,1080,'screen-1920-near',{touch:true,fontScale:120}],
    ['screen',1920,1080,'screen-1920-back',{touch:true,fontScale:200}],
  ]){
    const view=await open(role,w,h,options);
    await capture(view,name);
    if(name==='screen-1920'){
      await capture(view,'screen-1920-full',{full:true});
      await view.page.getByRole('button',{name:'录入作业',exact:true}).first().click();
      await view.page.locator('.screen-composer').waitFor();
      await capture(view,'screen-composer-1920');
      await view.page.keyboard.press('Escape');
      await view.page.locator('.screen-composer').waitFor({state:'hidden'});
      await view.page.getByRole('button',{name:'抄写模式',exact:true}).click();
      await view.page.locator('.screen-copy-mode').waitFor();
      await capture(view,'screen-copy-mode-1920');
      await view.page.keyboard.press('Escape');
      await view.page.goto(origin+'/settings?context=screen&section=screen-display');
      await view.page.locator('.screen-reading-presets').waitFor();
      await capture(view,'screen-reading-settings-1920');
    }
    await view.context.close();
  }
}finally{await browser.close();await client.dispose();}
