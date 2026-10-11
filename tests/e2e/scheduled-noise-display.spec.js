import {test, expect} from '@playwright/test';
import {api, origin} from './environment.js';
test.use({serviceWorkers:'block',timezoneId:'Asia/Shanghai',storageState:{cookies:[],origins:[{origin,localStorage:[
  {name:'classworks-v2-oobe',value:JSON.stringify({version:1,completed:true,roleHint:'screen'})},
  {name:'classworks-v2-screen-oobe:screen-a',value:JSON.stringify({version:1,completed:true})},
  {name:'classworks-v2-screen-token',value:'screen-token'},
]}]}});
test.beforeEach(async ({page,request})=>{
  await request.post(origin+'/__test/release',{data:{release:'previous'}});
  await request.post(api+'/__test/reset');
  await page.addInitScript(()=>{
    window.microphoneRequests=0;
    navigator.mediaDevices.getUserMedia=async()=>{window.microphoneRequests++;throw Error('Retired browser capture');};
  });
});

for(const online of [true,false]) test('retired scheduled PWA display stays closed with native provider '+online,async ({page})=>{
  const writes=[];
  await page.clock.install({time:new Date('2026-10-11T19:00:00+08:00')});
  await page.addInitScript(()=>{
    localStorage.setItem('classworks-v2-noise-schedule:screen-a',JSON.stringify({enabled:true,startTime:'19:00',endTime:'21:30'}));
    localStorage.setItem('npep.noise.provider:screen-a','native');
  });
  await page.route('**/api/v2/npep/screen/**',async route=>{
    const req=route.request();if(req.method()!=='GET')writes.push(req.url());
    await route.fulfill({json:{protocolVersion:req.headers()['x-npep-version'],requestId:req.headers()['x-request-id'],data:{
      provider:'native',online,supported:true,applied:true,status:{state:'Active',owner:'Schedule',reason:'WINDOW_ACTIVE'},reports:[],commands:[]}}});
  });
  await page.goto(origin);
  await expect(page.getByRole('button',{name:'录入作业',exact:true}).first()).toBeVisible();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('classworks-noise-schedule-settings-changed',{detail:{bindingId:'screen-a'}})));
  await page.clock.fastForward(151*60000);
  await expect(page.locator('.scheduled-noise-display')).toHaveCount(0);
  await expect(page.locator('.screen-noise-status')).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(await page.evaluate(()=>window.microphoneRequests)).toBe(0);
});
