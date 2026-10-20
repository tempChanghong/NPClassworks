// Only an owned native PostgreSQL cluster; never Docker, a service, or an ambient DATABASE_URL.
import {spawnSync} from 'node:child_process';
import {openSync, closeSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {mkdtemp, writeFile, readdir, access, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join, dirname, basename, relative, isAbsolute} from 'node:path';
import {randomUUID, randomBytes, createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {preserveGeneratedClient} from './handwriting-kv-generated.js';
import {allocateLoopbackPorts} from './handwriting-kv-ports.js';

const args = process.argv.slice(2);
const manual = args.includes('--manual'), smoke = args.includes('--manual-smoke');
if (manual && smoke || (manual || smoke) && args.length !== 1) throw new Error('Choose only --manual or --manual-smoke');
const acceptance = manual || smoke;
const root = fileURLToPath(new URL('../', import.meta.url));
const backend = resolve(process.env.CLASSWORKS_BACKEND_ROOT || join(root, '../NPClassworksKV'));
const requireBackend = createRequire(join(backend, 'package.json'));
const {Client} = requireBackend('pg');
const suffix = process.platform === 'win32' ? '.exe' : '';
const id = randomUUID().replaceAll('-', '');
const output = join(root, '.artifacts/handwriting-kv', id);
mkdirSync(output, {recursive: true});
const directory = await mkdtemp(join(tmpdir(), 'npclassworks-handwriting-kv-'));
const data = join(directory, 'pgdata'), marker = join(directory, 'owner.json');
await writeFile(marker, JSON.stringify({id}));
const report = {status: 'RUNNING', mode: manual ? 'manual-session' : smoke ? 'manual-startup-smoke' : 'automated',
  ...(acceptance ? {humanAcceptance: 'PENDING'} : {}), frontend: revision(root), backend: revision(backend),
  cluster: directory, database: `npclassworks_test_fullstack_hw_${id}`, loopbackOnly: true,
  docker: false, production: false, browserReport: join(output, 'browser-results.json'), error: null};
function revision(cwd) {
  const call = args => {
    const result = spawnSync('git', args, {cwd, encoding: 'utf8', windowsHide: true});
    if (result.error || result.status !== 0) throw new Error('Unable to identify test source');
    return result.stdout.trim();
  };
  const hash = createHash('sha256').update(call(['diff', '--binary', 'HEAD']));
  for (const file of call(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean).sort())
    hash.update(file).update('\0').update(readFileSync(join(cwd, file)));
  return {root: cwd, commit: call(['rev-parse', 'HEAD']), dirty: Boolean(call(['status', '--porcelain'])), workingTreeSha256: hash.digest('hex')};
}
function save() { writeFileSync(join(output, 'result.json'), JSON.stringify(report, null, 2)); }
async function pgBin() {
  if (process.env.NPEP_TEST_PG_BIN) return resolve(process.env.NPEP_TEST_PG_BIN);
  const base = join(process.env.ProgramFiles || 'C:/Program Files', 'PostgreSQL');
  for (const version of (await readdir(base)).sort((a, b) => Number(b) - Number(a))) {
    const bin = join(base, version, 'bin');
    try { await access(join(bin, 'initdb' + suffix)); return bin; } catch { /* next installation */ }
  }
  throw new Error('Set NPEP_TEST_PG_BIN to native PostgreSQL tools');
}
function run(command, args, cwd, env, name) {
  // pg_ctl children inherit handles on Windows: use owned files, not stdout pipes.
  const log = join(output, name + '.log'), fd = openSync(log, 'a');
  let result;
  try { result = spawnSync(command, args, {cwd, env, windowsHide: true, stdio: ['ignore', fd, fd]}); }
  finally { closeSync(fd); }
  if (result.error || result.status !== 0) throw new Error(`${name} failed (${result.status}); see ${log}`);
  console.log(`PASS: ${name}`);
}
let bin, env, generated, started = false;
save();
try {
  bin = await pgBin();
  for (const name of ['initdb', 'pg_ctl']) await access(join(bin, name + suffix));
  const [dbPort, webPort, apiPort] = await allocateLoopbackPorts();
  const password = randomBytes(24).toString('hex'), passwordFile = join(directory, 'password');
  const emptyEnv = join(directory, 'empty.env');
  await writeFile(passwordFile, password, {mode: 0o600}); await writeFile(emptyEnv, '');
  const url = `postgresql://npclassworks_test:${password}@127.0.0.1:${dbPort}/${report.database}?schema=public`;
  env = {...process.env, FULLSTACK_DATABASE_URL: url, DATABASE_URL: url,
    NODE_ENV: 'test', TZ: 'Asia/Shanghai', CLASSWORKS_BACKEND_ROOT: backend,
    DOTENV_CONFIG_PATH: emptyEnv, DOTENV_CONFIG_OVERRIDE: 'false',
    AXIOM_TOKEN: '', AXIOM_DATASET: '', OTEL_SDK_DISABLED: 'true', NPEP_ENABLED: 'false',
    E2E_WEB_PORT: String(webPort), E2E_API_PORT: String(apiPort),
    FULLSTACK_BUILD_ROOT: join(root, 'dist-e2e/handwriting-kv', id),
    HANDWRITING_ACCEPTANCE_MODE: manual ? 'interactive' : smoke ? 'smoke' : '',
    HANDWRITING_KV_OUTPUT: join(output, 'browser'), PLAYWRIGHT_JSON_OUTPUT_FILE: report.browserReport};
  for (const key of ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS',
    'NPEP_DEPLOYMENT_FILE', 'INTEGRATION_COMPOSE_PROJECT', 'FULLSTACK_NPEP', 'FULLSTACK_RELEASE_UPGRADE']) delete env[key];
  report.ports = {postgres: dbPort, web: webPort, api: apiPort}; save();
  run(join(bin, 'initdb' + suffix), ['-D', data, '-U', 'npclassworks_test', '--pwfile', passwordFile,
    '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C'], root, env, 'initdb');
  run(join(bin, 'pg_ctl' + suffix), ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${dbPort}`, '-w', '-t', '30', 'start'], root, env, 'start-postgres');
  started = true;
  const admin = new Client({host: '127.0.0.1', port: dbPort, user: 'npclassworks_test', password, database: 'postgres'});
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${report.database}"`);
    report.postgresIdentity = (await admin.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0];
  } finally { await admin.end(); }
  generated = await preserveGeneratedClient(join(backend, 'generated/prisma'), join(directory, 'generated-backup'));
  try { run(process.execPath, [join(backend, 'node_modules/prisma/build/index.js'), 'generate'], backend, env, 'prisma-generate'); }
  finally { await generated.recordGenerated(); }
  run(process.execPath, [join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], backend, env, 'migrate-owned-database');
  if (acceptance) {
    console.log(`Acceptance files: ${join(output, 'browser')}`);
    if (manual) console.log('Opening isolated screen and teacher windows. Close both windows to finish. Human acceptance stays PENDING.');
  }
  run(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config',
    acceptance ? 'playwright.handwriting-manual.config.js' : 'playwright.handwriting-fullstack.config.js',
    '--reporter=line,json', ...(acceptance ? [] : args)], root, env, 'handwriting-browser');
  const browser = JSON.parse(readFileSync(report.browserReport, 'utf8'));
  if (browser.stats.unexpected || browser.stats.flaky || browser.stats.skipped || !browser.stats.expected)
    throw new Error('Browser results must pass without retries or skips');
  report.tests = browser.stats; report.status = 'PASSED';
} catch (error) { report.status = 'FAILED'; report.error = error.message; process.exitCode = 1; }
finally {
  try {
    if (bin && env) {
      const status = spawnSync(join(bin, 'pg_ctl' + suffix), ['-D', data, 'status'], {env, windowsHide: true, stdio: 'ignore'});
      if (started || status.status === 0) run(join(bin, 'pg_ctl' + suffix), ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop'], root, env, 'stop-owned-postgres');
    }
    report.clusterStopped = true;
  } catch (error) { report.status = 'FAILED'; report.cleanupError = error.message; process.exitCode = 1; }
  try {
    if (generated) { await generated.restore(); report.generatedClientRestored = true; }
    report.sourcesAfter = {frontend: revision(root), backend: revision(backend)};
    report.sourcesStable = ['frontend', 'backend'].every(key => report[key].commit === report.sourcesAfter[key].commit &&
      report[key].workingTreeSha256 === report.sourcesAfter[key].workingTreeSha256);
    if (!report.sourcesStable) { report.status = 'FAILED'; report.error = 'Source changed while integration tests were running'; process.exitCode = 1; }
  } catch (error) { report.status = 'FAILED'; report.restorationError = error.message; process.exitCode = 1; }
  try {
    // Verify the absolute target and ownership before any recursive cleanup.
    const inside = relative(resolve(tmpdir()), resolve(directory));
    if (report.status === 'PASSED' && !isAbsolute(inside) && !inside.startsWith('..') &&
      dirname(resolve(directory)) === resolve(tmpdir()) && basename(directory).startsWith('npclassworks-handwriting-kv-') &&
      JSON.parse(readFileSync(marker, 'utf8')).id === id) {
      await rm(directory, {recursive: true}); report.clusterRemoved = true;
    }
  } catch (error) { report.status = 'FAILED'; report.cleanupError = error.message; process.exitCode = 1; }
  save(); console.log(`HANDWRITING_KV_RESULT: ${join(output, 'result.json')}`);
  console.log(JSON.stringify({status: report.status, tests: report.tests, error: report.error}));
}
