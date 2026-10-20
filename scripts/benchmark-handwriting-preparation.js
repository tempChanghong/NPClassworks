import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
const source = await readFile('src/features/handwriting/prepare-input.js', 'utf8');
const limits = await readFile('src/features/handwriting/recognition-limits.js', 'utf8');
const baselineRef = process.argv[2];
if (!/^[a-f0-9]{7,40}$/i.test(baselineRef || '')) throw Error('Pass an explicit baseline commit SHA');
const baselineSource = execFileSync('git', ['show', `${baselineRef}:src/features/handwriting/prepare-input.js`], {encoding: 'utf8', windowsHide: true});
const baselineLimits = execFileSync('git', ['show', `${baselineRef}:src/features/handwriting/recognition-limits.js`], {encoding: 'utf8', windowsHide: true});
if (baselineLimits.replaceAll('\r', '') !== limits.replaceAll('\r', '')) throw Error('Input dimension rules changed; use a complete pipeline comparison');
const compile = value => limits.replaceAll('export ', '') + '\n' + value.replace(/^import .*;\r?\n/m, '').replaceAll('export ', '') + '\nreturn prepareLine;';
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const page = await browser.newPage();
  const result = await page.evaluate(({baseline, candidate}) => {
    const variants = [new Function(baseline)(), new Function(candidate)()];
    const cases = [200, 600, 1120].map(width => {
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 160;
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      ctx.font = '40px Microsoft YaHei'; ctx.fillStyle = '#192e25';
      ctx.fillText('完成第10—20页 NaOH CO2 第1、11题'.repeat(4), 10, 65, width);
      return {canvas, bound: {row: 0, x: 0, y: 0, width: width + 20, height: 95}};
    });
    let bytesCompared = 0;
    for (const entry of cases) for (const profile of ['accurate', 'baseline']) {
      const [a, b] = variants.map(fn => fn(entry.canvas, entry.bound, profile));
      if (a.width !== b.width || a.validWidth !== b.validWidth) throw Error('Geometry differs');
      const x = new Uint8Array(a.data.buffer), y = new Uint8Array(b.data.buffer);
      if (x.length !== y.length || x.some((v, i) => v !== y[i])) throw Error('Tensor bytes differ');
      bytesCompared += x.length;
    }
    const buffer = new ArrayBuffer(3 * 48 * 1536 * 4);
    const pool = {take(n) {new Float32Array(buffer).fill(0); return new Float32Array(buffer, 0, n);}};
    function batch(index, count) {
      const start = window.performance.now(); let checksum = 0;
      for (let i = 0; i < count; i++) {
        const entry = cases[i % cases.length];
        const out = variants[index](entry.canvas, entry.bound, 'accurate', pool);
        checksum += out.data[0];
      }
      return {ms: window.performance.now() - start, checksum};
    }
    for (let i = 0; i < 4; i++) {batch(0, 80); batch(1, 80);}
    const runs = [];
    for (let round = 0; round < 10; round++) for (const variant of round % 2 ? [1, 0] : [0, 1])
      runs.push({round, variant, ...batch(variant, 180)});
    const median = items => items.toSorted((a, b) => a - b)[Math.floor(items.length / 2)];
    return {scope: 'Edge real canvas preprocessing, generated glyphs, fixed reusable tensor buffer, no forced GC',
      bytesCompared, runs, medianMs: variants.map((_, i) => median(runs.filter(r => r.variant === i).map(r => r.ms)))};
  }, {baseline: compile(baselineSource), candidate: compile(source)});
  result.baseline = baselineRef;
  result.sourceHashes = [baselineSource, source].map(text => createHash('sha256').update(text).digest('hex'));
  await mkdir('.artifacts/handwriting-preparation', {recursive: true});
  const output = `.artifacts/handwriting-preparation/${Date.now()}.json`;
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({output, bytesCompared: result.bytesCompared, medianMs: result.medianMs, improvementPercent: (1-result.medianMs[1]/result.medianMs[0])*100}));
} finally {await browser.close();}
