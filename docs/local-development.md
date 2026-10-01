# Windows 原生本地开发

当前统一入口不使用 Docker。需要 Node.js 22.18+、项目指定的 pnpm，以及已经启动的原生 PostgreSQL Windows 服务。建议 PostgreSQL 17.x x64，与仓库生产配置的主版本一致。

## 一次性准备

1. 从 https://www.postgresql.org/download/windows/ 进入 EDB 安装器。安装 Server、pgAdmin、Command Line Tools；使用默认端口 5432。Stack Builder 扩展当前不需要。
2. 前后端分别执行 `pnpm install --frozen-lockfile`。
3. 在 NPClassworksKV 执行 `pnpm run debug:init`，只生成缺失的配置文件，保留已有文件。它不创建数据库。
4. 用 pgAdmin 在本机实例中创建登录角色 `classworks_debug` 和同名数据库，数据库所有者设为此角色。密码自行设置并只在本地保存。
5. 修改后端 `deploy/.env.debug` 的 DATABASE_URL，使用上述角色、密码、5432 端口和 `classworks_debug` 数据库；URL 密码中的特殊字符需要 URL 编码。保留文件中的 JWT 等开发密钥。已有配置可能还指向 55432，请检查并改为实际原生服务端口。

格式示例（不是可直接使用的真实密码）：

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://classworks_debug:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/classworks_debug?schema=public
```

首次创建示例学校和账号，在 NPClassworksKV 执行 `pnpm run debug:prepare`。该命令应用迁移并导入示例组织、账号，不能当作日常启动命令。原有开发数据需要保留时，仅执行迁移：

```powershell
node --env-file=deploy/.env.debug node_modules/prisma/build/index.js migrate deploy
```

固定示例学校为 `DEBUG-SCHOOL`，示例 OWNER 为 `admin` / PIN `260100`；仅限本机开发。已有环境请使用自己的本地账号。

## 日常操作

在 NPClassworks 根目录打开一个终端：

```powershell
pnpm dev:doctor   # 检查依赖、配置、端口、数据库认证和已应用迁移
pnpm dev          # 同时启动网页与 Node 后端，修改代码自动重新加载
```

管理页：http://localhost:3031/classworks-admin 。网页 API 通过同源代理访问 127.0.0.1:3000。

日志带 `[web]` / `[api]` 前缀，等待服务各自的就绪日志。Ctrl+C 停止本次启动的前后端，包括 Node watch 的子进程；不会停止 PostgreSQL Windows 服务或删除数据。一方启动失败／退出时统一停止配套服务。Windows 清理只作用于本脚本创建的进程树，不按端口或程序名批量杀进程。

后端默认位于同级 `../NPClassworksKV`。非同级目录可先设置 `$env:CLASSWORKS_BACKEND_ROOT='实际路径'`。Node 入口可在 Windows PowerShell 5.1、PowerShell 7 或 cmd 中运行；不依赖某个 PowerShell 版本。

`pnpm dev:web` 保留单独启动前端的能力；后端仍可在其仓库执行 `pnpm dev`。使用统一入口前必须关闭占用 3031 / 3000 的旧开发进程。doctor 的端口检查也是启动前检查，服务已经运行时提示占用属于预期。

## 行为边界与验证

统一入口不会安装 PostgreSQL、启动 Docker、创建／重置数据库、应用迁移、导入账号或部署。后端只读取 `deploy/.env.debug`；子进程不继承终端中的业务密钥，网页连接地址固定为本地 3031。数据库必须是回环地址上的 `classworks_debug`，不接受覆盖连接地址的查询参数。请自行保证该本机数据库不是到生产库的隧道。

已验证配置拒绝、环境变量隔离及脚本语法。2026-09-26 用户已完成 PostgreSQL 17 原生服务和开发库配置，统一入口的数据库检查通过，前后端已启动。

首次实际启动暴露了 Vite 扫描旧 `dist-e2e/` 与 `test-results/` HTML 的问题：已将 `optimizeDeps.entries` 固定为 SPA 的 `index.html`，不需要删除测试产物。同时修正初始化页对 const reactive 登录对象的整对象 v-model 赋值。实际强制预扫描完成（8 个依赖），3 项相关测试及修改页面的 ESLint 通过；Playwright 实际访问管理登录页及首页，没有 Vite 错误遮罩或页面异常。agent-browser 的本机连接失败，浏览器验证改用现有 Playwright。

后端启动日志现在显示实际监听地址；可选 Axiom 遥测未配置改为中性提示。未改动数据库数据，未使用 Docker。Ctrl+C 完整进程树清理仍待专门验证。

既有 `test:e2e:fullstack`、`test:database` 等旧测试入口仍有 Docker 依赖，当前无 Docker 流程不要调用这些命令。N3 的统一 `-Database` 已单独改成原生 PostgreSQL，见下文。

## NPEduTools 学校互联联调

NPEduTools 始终支持 HTTP／HTTPS。本地网页正常并不代表 NPEP 已初始化：NPEP 还需要独立的部署身份、数据库登记和启用配置。

完成上面的数据库准备后，在 **NPClassworksKV** 执行一次：

```powershell
pnpm debug:npep
```

该命令只读取 `deploy/.env.debug`，只允许 development 下本机的 `classworks_debug`。它生成 `deploy/runtime/npep-debug/deployment.json`、登记数据库身份，并在 `.env.debug` 中写入 `NPEP_ENABLED=true` 及身份文件绝对路径；这两个本机文件均不提交 Git。重复执行保留身份与已有配对；文件缺失、身份不一致或异常历史登记会报错，不会自动重置设备。它不迁移数据库、不导入账号、不使用 Docker，也不配置生产服务。

配置完成后，在原来的统一开发终端按 **Ctrl+C**，回到 **NPClassworks** 再运行 `pnpm dev`。环境变量在进程启动时载入，修改配置后应重启整个统一入口。

NPEduTools 的学校服务地址填写 **`http://localhost:3000`**（不加 `/api/v2/npep`）。`http://localhost:3031` 也能经 Vite 代理访问，但开发期间建议固定使用一个地址。然后在桌面端发起配对，在 `http://localhost:3031/classworks-admin` 登录本地学校管理员批准配对。开发电脑上的 `localhost` 指向本机；其他设备上的 `localhost` 不会指向这台开发电脑。

### INVALID_RESPONSE 排查记录（2026-09-26）

当时两个端口的 `/api/v2/npep/info` 都返回 503 `TEMPORARILY_UNAVAILABLE`：开发配置未启用 NPEP，数据库没有部署登记。后端提前检查启用状态，在读取请求编号之前抛出错误，生成了与请求不一致的响应编号，桌面端因此显示 `INVALID_RESPONSE`。

已修复错误响应的请求编号关联，保留桌面端严格校验。18 项协议／HTTP 错误／N3 测试和 2 项初始化配置测试通过；已在本机原生 PostgreSQL 上初始化，并通过临时 HTTP 监听验证真实 `/info` 返回 200，重复初始化身份不变。实际桌面配对仍需重启开发入口后操作。

### N3 完整验收

在 NPEduTools 执行 `./scripts/test-npep-n3.ps1 -Database`，或在 NPClassworksKV 执行 `pnpm test:npep:native`。此入口自动启动临时原生 PostgreSQL 集群，随机回环端口、独立数据库、成功后清理，不访问当前开发库和已配对设备，不使用 Docker。包含真实 .NET 传输与 Node/SQL 的成功、部分完成、现场结束和重启验收；OS 操作在自动化中模拟。

网页真实设备入口：学校管理 → 大屏设备 → 打开 NPEP 设备互联 → 考试环境。先在对应 NPEduTools 本机允许学校远程控制，网页核对目标后提交。提交成功不等于切换成功，应等待设备回执。结束后在桌面核实并结束远程考试状态。

当前实现与证据边界见同级 NPEduTools 的 `docs/npep/NPEP-N3-COMPLETION-20260926.md`。

### N4 噪音监测统一验收

在 NPEduTools 执行 `./scripts/test-npep-n4.ps1 -CheckOnly -Browser -Database` 只核对三仓依赖和契约，不连接当前开发库。完整自动验收用 `./scripts/test-npep-n4.ps1 -Browser -Database`，兼容 PowerShell 5.1；模拟音频、隔离浏览器与临时原生 PostgreSQL，不使用 Docker 或真实麦克风。

每次结果位于桌面仓 `.artifacts/npep-n4/<本次编号>/result.json`，未选择的阶段单列，自动通过不代表真实设备验收或可发布。详细操作见相邻 `NPEduTools/docs/npep/N4-UNIFIED-ACCEPTANCE-20261001.md`。
