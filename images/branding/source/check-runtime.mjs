// Read-only verification of the local built frontend and KV template fixture.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const source=path.dirname(fileURLToPath(import.meta.url));
const brand=path.resolve(source,'..');
const front=path.resolve(brand,'../..');
const kv=path.resolve(front,'../NPClassworksKV');
const hash=b=>createHash('sha256').update(b).digest('hex');
const mapping=JSON.parse(await fs.readFile(path.join(source,'integration-map.json'),'utf8'));
const copies={};
for(const [runtime,asset] of Object.entries(mapping)){
  const expected=await fs.readFile(path.join(brand,asset));
  assert.equal(hash(await fs.readFile(path.join(front,runtime))),hash(expected),runtime);
  if(runtime.startsWith('public/')){
    const url='http://127.0.0.1:4182/'+runtime.slice(7);
    const response=await fetch(url);assert.equal(response.status,200,url);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(expected),url);
    copies[runtime]={http:200,sha256:hash(expected)};
  }
}
for(const [runtime,asset] of [['public/favicon.ico','npclassworks.ico'],['public/branding/logo.svg','npclassworks-logo.svg'],['public/branding/logo-small.svg','npclassworks-logo-small.svg']]){
  const expected=await fs.readFile(path.join(brand,asset));
  assert.equal(hash(await fs.readFile(path.join(kv,runtime))),hash(expected),runtime);
  const response=await fetch('http://127.0.0.1:4183/'+runtime.slice(7));assert.equal(response.status,200);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(expected));
  copies['KV/'+runtime]={http:200,sha256:hash(expected)};
}
for(const route of ['/','/auth-success.html','/auth-error.html']){
  const response=await fetch('http://127.0.0.1:4183'+route);
  assert.equal(response.status,200);
  const html=await response.text();
  assert(html.includes('href="/favicon.ico"')&&html.includes('href="/branding/logo-small.svg"'),route);
}
const browser=await chromium.connectOverCDP(process.argv[2]);
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://127.0.0.1:4182'));
assert(page,'frontend page not open');
const client=await page.context().newCDPSession(page);
const manifest=await client.send('Page.getAppManifest');
// Existing cs:// registration is not a Chromium allowlisted web scheme.
// Preserve that unrelated contract; fail on critical or unexpected diagnostics.
assert(manifest.errors.every(e=>e.critical===0&&/scheme|protocol_handlers/.test(e.message)));
const install=await client.send('Page.getInstallabilityErrors');
assert.deepEqual(install.installabilityErrors,[]);
const runtime=await page.evaluate(async()=>{
  const reg=await navigator.serviceWorker.getRegistrations();
  const href=document.querySelector('link[rel="manifest"]').href;
  const manifest=await (await fetch(href)).json();
  const sizes=await Promise.all(manifest.icons.map(async icon=>{
    const image=new globalThis.Image();image.src=new URL(icon.src,href).href;await image.decode();
    return {src:icon.src,declared:icon.sizes,actual:`${image.naturalWidth}x${image.naturalHeight}`,purpose:icon.purpose||'any'};
  }));
  const logo=document.querySelector('img[alt="NPClassworks 标志"]');
  const css=logo?globalThis.getComputedStyle(logo):null;
  return {manifestUrl:href,icons:sizes,serviceWorkers:reg.map(r=>({scope:r.scope,active:r.active?.state})),logo:logo?{loaded:logo.complete&&logo.naturalWidth>0,objectFit:css.objectFit}:null};
});
assert(runtime.icons.every(i=>i.declared===i.actual));
assert(runtime.serviceWorkers.some(s=>s.active==='activated'));
assert(runtime.logo.loaded&&runtime.logo.objectFit==='contain');
const sw=await fs.readFile(path.join(front,'dist/sw.js'),'utf8');
for(const p of Object.keys(copies).filter(p=>p.startsWith('public/'))){assert(sw.includes(p.slice(7)),`not precached: ${p}`);}
const report={copies,manifestErrors:manifest.errors,installabilityErrors:install.installabilityErrors,...runtime,kvMode:'isolated Express static/template fixture; no database or backend business routes'};
await fs.writeFile(path.join(source,'runtime-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({assetCopies:Object.keys(copies).length,manifestErrors:manifest.errors,installabilityErrors:install.installabilityErrors,icons:runtime.icons,serviceWorkers:runtime.serviceWorkers,logo:runtime.logo},null,2));
await client.detach();await browser.close();
