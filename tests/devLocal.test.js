import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig, systemEnvironment} from '../scripts/dev-local.js';

const config = {NODE_ENV: 'development', PORT: '3000', DATABASE_URL: 'postgresql://dev:pass@127.0.0.1:5432/classworks_debug?schema=public',
  JWT_SECRET: 'fixture', REFRESH_TOKEN_SECRET: 'fixture', BOOTSTRAP_SETUP_KEY: 'fixture'};
test('unified dev accepts native localhost PostgreSQL and rejects production targets', () => {
  assert.equal(validateConfig(config).port, '5432');
  for (const url of ['postgresql://server/classworks_debug', 'postgresql://localhost/production',
    'postgresql://localhost/classworks_debug?host=remote', 'https://localhost/classworks_debug'])
    assert.throws(() => validateConfig({...config, DATABASE_URL: url}));
  assert.throws(() => validateConfig({...config, NODE_ENV: 'production'}));
  assert.throws(() => validateConfig({...config, PORT: '3001'}));
});
test('child environment preserves system paths but excludes inherited application credentials', () => {
  assert.deepEqual(systemEnvironment({Path: 'tools', SystemRoot: 'windows', DATABASE_URL: 'production',
    JWT_SECRET: 'secret', NPEP_ENABLED: 'true', VITE_SERVER_URL: 'https://production', NODE_OPTIONS: '--require=other'}),
  {Path: 'tools', SystemRoot: 'windows'});
});
