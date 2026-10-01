import test from 'node:test';
import assert from 'node:assert/strict';
import {level, qualityName, statistic, signalHint, weakSignal} from '../src/utils/nativeNoisePresentation.js';

test('floor is a bound; low nonzero capture is distinguished from responsive speech', () => {
  assert.equal(level(-160), '≤ -160.0');
  assert.equal(statistic(-160), '≤ -160.0 dBFS（数值下限）');
  assert.equal(qualityName('Good', -160), '输入接近静音');
  assert.match(signalHint(-160), /数值下限/);
  assert.equal(qualityName('Good', -100), '输入接近静音');
  assert.equal(qualityName('Good', -99.9), '采样有效');
  assert.equal(level(-57), '-57.0');
  assert.equal(statistic(-57), '-57.0 dBFS');
  assert.equal(qualityName('Good', -57), '采样有效');
  assert.equal(signalHint(-57), '');
});

test('absence, nonfinite values and capture errors are not replaced with a quiet signal', () => {
  for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
    assert.equal(level(value), '—');
    assert.equal(statistic(value), '无有效值');
    assert.equal(weakSignal(value), false);
    assert.equal(signalHint(value), '');
  }
  assert.equal(qualityName('Invalid', -160), '采样无效');
  assert.equal(qualityName('NoData', -160), '没有新数据');
  assert.equal(qualityName('DigitalSilence', null), '全零信号，检查静音');
  assert.equal(qualityName('Clipping', -160), '削波');
});
