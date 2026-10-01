import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile, readdir, access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseEnv} from 'node:util';
import {createInterface} from 'node:readline';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webOrigin = 'http://localhost:3031';

export function validateConfig(config) {
  let db;
  try { db = new URL(config.DATABASE_URL); } catch { throw new Error('DATABASE_URL 无效，请检查后端 deploy/.env.debug。'); }
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !['localhost', '127.0.0.1'].includes(db.hostname) ||
      db.pathname !== '/classworks_debug' || db.hash || [...db.searchParams].some(([k, v]) => k !== 'schema' || v !== 'public'))
    throw new Error('仅允许本机 classworks_debug 数据库，禁止远程数据库或连接地址覆盖参数。');
  if (config.NODE_ENV !== 'development' || config.PORT !== '3000')
    throw new Error('deploy/.env.debug 必须设置 NODE_ENV=development、PORT=3000。');
  for (const key of ['JWT_SECRET', 'REFRESH_TOKEN_SECRET', 'BOOTSTRAP_SETUP_KEY'])
    if (!config[key]) throw new Error(`deploy/.env.debug 缺少 ${key}。`);
  return db;
}

// Deliberately do not inherit application credentials or VITE_* from the caller.
export function systemEnvironment(source = process.env) {
  const names = new Set(['path', 'pathext', 'systemroot', 'windir', 'comspec', 'temp', 'tmp', 'tmpdir',
    'userprofile', 'appdata', 'localappdata', 'programfiles', 'programfiles(x86)', 'programdata',
    'home', 'homedrive', 'homepath', 'lang', 'lc_all', 'term', 'username']);
  return Object.fromEntries(Object.entries(source).filter(([key]) => names.has(key.toLowerCase())));
}

async function available(port) {
  await new Promise((done, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`端口 ${port} 已被占用；请先关闭已有开发服务。`)));
    probe.listen(port, '127.0.0.1', () => probe.close(done));
  });
}

async function checkDatabase(backend, config) {
  const require = createRequire(resolve(backend, 'package.json'));
  const {Client} = require('pg');
  const client = new Client({connectionString: config.DATABASE_URL, connectionTimeoutMillis: 3000,
    query_timeout: 5000, statement_timeout: 5000, options: '-c default_transaction_read_only=on'});
  try {
    await client.connect();
    const {rows: tables} = await client.query(`SELECT to_regclass('public._prisma_migrations') AS name`);
    if (!tables[0].name) throw new Error('MIGRATIONS_MISSING');
    const {rows} = await client.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"');
    const expected = (await readdir(resolve(backend, 'prisma/migrations'), {withFileTypes: true})).filter(x => x.isDirectory()).map(x => x.name);
    if (rows.some(x => !x.finished_at && !x.rolled_back_at) || expected.some(name => !rows.some(x => x.migration_name === name && x.finished_at && !x.rolled_back_at)))
      throw new Error('MIGRATIONS_MISSING');
  } catch (error) {
    if (error.message === 'MIGRATIONS_MISSING') throw new Error('本地迁移不完整。请在 NPClassworksKV 执行：node --env-file=deploy/.env.debug node_modules/prisma/build/index.js migrate deploy');
    throw new Error('本地 PostgreSQL 检查失败。请检查 Windows 数据库服务、端口、开发库和 deploy/.env.debug 中的账号密码。');
  } finally { await client.end().catch(() => {}); }
}

async function stopChild(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    // Only the process tree launched by this invocation (including Node watch's child).
    await new Promise(done => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {stdio: 'ignore', windowsHide: true});
      killer.once('exit', done); killer.once('error', done);
    });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
  }
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('用法：pnpm dev 或 pnpm dev:doctor');
  const backend = resolve(process.env.CLASSWORKS_BACKEND_ROOT || resolve(root, '../NPClassworksKV'));
  const configPath = resolve(backend, 'deploy/.env.debug');
  let config;
  try { config = parseEnv(await readFile(configPath, 'utf8')); } catch { throw new Error('无法读取后端 deploy/.env.debug，请先按 docs/local-development.md 配置。'); }
  const db = validateConfig(config);
  for (const file of [resolve(root, 'node_modules/vite/bin/vite.js'), resolve(backend, 'scripts/dev-server.js'), resolve(backend, 'node_modules/pg/package.json')])
    await access(file).catch(() => { throw new Error('前后端目录或依赖不完整，请分别安装依赖；非同级后端可设置 CLASSWORKS_BACKEND_ROOT。'); });
  await Promise.all([available(3000), available(3031)]);
  await checkDatabase(backend, config);
  console.log(`[dev] 本地数据库已通过检查：${db.hostname}:${db.port || '5432'}/classworks_debug`);
  if (process.argv.includes('--check')) { console.log('[dev] 环境检查通过，未启动服务、未修改数据。'); return; }
  const children = [];
  let stopping = false;
  const stop = async code => {
    if (stopping) return;
    stopping = true;
    await Promise.all(children.map(stopChild));
    process.exitCode = code;
  };
  process.once('SIGINT', () => void stop(0));
  process.once('SIGTERM', () => void stop(0));
  const launch = (name, args, cwd, env) => {
    const child = spawn(process.execPath, args, {cwd, env, stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true, detached: process.platform !== 'win32'});
    children.push(child);
    for (const stream of [child.stdout, child.stderr])
      createInterface({input: stream}).on('line', line => console.log(`[${name}] ${line}`));
    child.once('error', () => { console.error(`[${name}] 无法启动。`); void stop(1); });
    child.once('exit', code => { if (!stopping) { console.error(`[${name}] 已退出（${code ?? 'signal'}），停止配套服务。`); void stop(1); } });
  };
  launch('api', ['--watch', 'scripts/dev-server.js'], backend, {...systemEnvironment(), ...config,
    NODE_ENV: 'development', PORT: '3000', BASE_URL: 'http://localhost:3000', FRONTEND_URL: webOrigin,
    DOTENV_CONFIG_PATH: configPath, DOTENV_CONFIG_OVERRIDE: 'false'});
  launch('web', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3031', '--strictPort'], root,
    {...systemEnvironment(), NODE_ENV: 'development', VITE_SERVER_URL: webOrigin, VITE_DEFAULT_KV_SERVER: webOrigin, VITE_ENABLE_ANALYTICS: 'false'});
  console.log(`[dev] 正在启动；等待 [web] 和 [api] 就绪日志。管理页：${webOrigin}/classworks-admin`);
  console.log('[dev] Ctrl+C 停止本次启动的前后端；PostgreSQL Windows 服务继续运行。');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => { console.error(`[dev] ${error.message}`); process.exitCode = 1; });
