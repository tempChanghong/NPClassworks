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

test('classroom tools and settings expose no retired manual browser monitoring or microphone picker',async ({page})=>{
  await page.goto(origin);
  await page.getByRole('button',{name:'课堂工具',exact:true}).first().click();
  await expect(page.locator('.tool-entry').filter({hasText:/噪声监测|噪音监测/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'开始监测',exact:true})).toHaveCount(0);
  await page.goto(origin+'/settings');
  await expect(page.getByRole('button',{name:/测试或更换麦克风|检查麦克风设备|选择麦克风/})).toHaveCount(0);
  expect(await page.evaluate(()=>window.microphoneRequests)).toBe(0);
});
test('refresh never reactivates old browser manual state or persisted microphone choice',async ({page})=>{
  await page.goto(origin);
  await page.evaluate(()=>{
    localStorage.setItem('classworks-v2-microphone-device:screen-a',JSON.stringify({deviceId:'old'}));
    localStorage.setItem('classworks-v2-classroom-tools:screen-a',JSON.stringify({enabledToolIds:['noise']}));
  });
  await page.reload();
  await expect(page.getByRole('button',{name:'录入作业',exact:true}).first()).toBeVisible();
  await expect(page.locator('.screen-noise-status')).toHaveCount(0);
  expect(await page.evaluate(()=>window.microphoneRequests)).toBe(0);
});
