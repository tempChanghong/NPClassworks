# 真实前后端与 PostgreSQL 冒烟测试

最新实测（2026-09-07）：三个浏览器全链路场景及单会话 PostgreSQL 回归均通过，0 失败、0 跳过。具体结果与测试环境修正见文末。

`pnpm test:e2e:fullstack` 将前端生产 PWA、后端实际 `app.js` / Socket.IO 和独立 PostgreSQL 17 组合运行。没有替换 API 响应、Prisma 方法或 Socket 实现，也没有给生产应用添加测试接口。

## 场景与断言

1. 教师通过页面正式发布作业。数据库中生成作业和首份修订；大屏浏览器收到包含该作业 ID 的实际 `publication.created` 数据包，并显示正文。兼容观察 polling 与 WebSocket 两种传输，避免把 HTTP 轮询刷新当作 Socket 送达证明。
2. 大屏离线录入，依靠实际 Service Worker 重载页面，检查队列及稳定请求 ID 保留。恢复联网后显示作业并清空队列；再通过真实鉴权接口重放同一份输入，核对相同作业 ID、仅一条作业和一份修订。
3. 两个独立浏览器同时编辑同一条大屏作业。后一端先保存，前一端携带旧 If-Match 返回 409，输入保留、数据库内容和历史不变。通过明确确认按钮提交新版后，核对版本 3 和三份完整历史正文。

数据准备直接写入测试学校、普通教师的 VIEWER 学校成员关系、TEACHER 工作区成员关系和真实任课关系，以及大屏绑定；账户凭据通过后端 generateTokenPair 签发并持久化。此处不验证登录表单或初始化向导。每个场景使用独立学校和浏览器存储，工作进程串行运行。

## 本地运行

前后端依赖均需安装。默认后端路径为同级 `../NPClassworksKV`，可用 `CLASSWORKS_BACKEND_ROOT` 指定。

```sh
pnpm exec playwright install chromium
pnpm test:e2e:fullstack
```

默认由脚本创建独立 Compose 项目，只绑定回环地址，数据库目录为 tmpfs。运行已有迁移后，先执行后端 `accountSessionDatabase.integration.test.js`，再执行三个浏览器场景；结束时移除该测试项目。不会启动或修复 Docker Desktop 本身。

可用 `FULLSTACK_POSTGRES_PORT` 调整数据库端口（默认 55434）；前端和 API 端口沿用 `E2E_WEB_PORT` / `E2E_API_PORT`（默认 4180 / 4181）。

已有独立空测试库时，可显式设置 `FULLSTACK_DATABASE_URL`，此时脚本不管理数据库生命周期。仅允许回环地址、`npclassworks_test_fullstack` 或带测试后缀的库名，以及可选的 `schema=public`；不接受连接地址覆盖参数。脚本会应用迁移，因此必须使用专门的可丢弃测试库。浏览器服务启动时拒绝已有学校或账号的库，不会清空已有数据。

环境配置强制使用测试 JWT 密钥、回环 API/CORS 地址，并禁用 Axiom 上报和前端行为分析。未读取生产 DATABASE_URL 作为测试目标。

## CI 与版本记录

嵌套检出的 `.contract-backend` 必须使用 `pnpm install --frozen-lockfile --ignore-workspace` 安装依赖。普通安装会发现父目录的前端 `pnpm-workspace.yaml`，即使成功退出，也可能没有安装后端依赖，随后契约测试会报 `dotenv` 无法解析。前后端部署工作流均需要此隔离参数；不能用已安装依赖的同级后端代替此场景的验证。

现有可复用 `.github/workflows/contracts.yml` 先执行契约测试，再安装 Chromium 并运行全链路命令。两步使用同一份后端检出。前端 PR 检查和生产部署都已引用该工作流；生产 deploy 等待整个任务成功，无需改部署代理。

后端检出必须包含新增的单会话数据库测试；未包含时明确失败，不静默跳过。手动运行工作流可以指定后端分支、标签或 SHA，以便在配套变更合入前检查。

后端 `.github/workflows/production-deploy.yml` 也设置独立的 `fullstack` 任务，部署必须同时等待 `verify`（普通测试及完整数据库测试）和 `fullstack` 成功。后端单独推送 main 或手动运行部署时，显式检出前端 main 和触发本次运行的后端 `github.sha`；契约测试及三个真实浏览器场景共享这两份检出。任务不访问生产环境密钥。此处复用前端测试命令，不跨仓直接调用默认检出调用者仓库的工作流。

在安装依赖之前，任务校验后端 HEAD 与触发 SHA 相同，并将两端完整 SHA 写入 Actions 摘要和 `test-results/fullstack-metadata/checkout-versions.json`；即使随后安装依赖或测试失败，也尝试上传该记录。前端 main 在检出时确定，运行中不再拉取更新。无需新增 secrets，也不修改服务器部署代理；前端 main 必须已包含全链路测试脚本及其修正，缺失时检查失败并阻止部署。

`test-results/fullstack-metadata/versions.json` 由测试脚本记录前后端完整 HEAD SHA 和 dirty 状态；失败时保留 Playwright trace、截图，CI 上传测试目录并保留 7 天。后端任务的附件名为 `backend-fullstack-test-results`。本地 dirty 时，SHA 仅标识基线。这些记录证明所测试的版本组合，不保证服务器部署代理最终选中的版本恰好等于这对 SHA。

## 首次编写时的验证状态（2026-09-07）

- 前端普通测试：293 项通过；跨仓契约测试：2 项通过。
- Lint、脚本语法检查及三项 Playwright 用例发现通过。数据库目标校验测试覆盖远程地址、非测试库名及连接参数绕过拒绝。
- 实际尝试全链路入口，在启动临时 PostgreSQL 时因 Docker 引擎管道不存在而失败。未执行迁移或浏览器场景，不能据此声称三个场景已通过。
- GitHub 未查到本轮开始时两仓本地 HEAD 对应的 Actions 运行记录，新增 CI 接线也尚未远程执行。没有推送或触发部署。

这些测试覆盖实际 Express 应用及 Socket，不启动 `bin/www` 的后台清理任务，也不覆盖生产反向代理、HTTPS、真实设备休眠或历史版本 PWA 升级；原有分层测试继续保留。

## Docker 启动后的完整实测（2026-09-07）

使用本机 Node 24.14.1、Chromium、临时 PostgreSQL 17，运行 `pnpm test:e2e:fullstack` 对应的 `node scripts/run-fullstack.js`，前端/API 端口分别设为 15182/15183。

- 已有数据库迁移全部应用成功。
- 单会话退出 PostgreSQL 回归：1 项通过，0 跳过。
- 教师页面正式发布 → 数据库作业及首份修订 → 大屏收到真实 Socket 事件并显示：通过。
- 离线录入 → Service Worker 重载 → 恢复补传 → 同请求 ID 重放仍仅一条作业、一份修订：通过。
- 两端编辑 → 旧 If-Match 返回 409 且保留输入 → 明确确认保存版本 3、三份历史正文匹配：通过。
- Playwright 最终结果：3 项通过，0 失败、0 跳过；Lint、数据库目标安全校验和 git diff --check 通过。

实测修正了两处测试环境问题：

1. 后端 Prisma 生成代码会设置全局 `__dirname`，导致同进程中的 PWA 插件误读后端 generated/package.json。改用独立 Node 进程构建前端，后端全局变量不再污染构建插件。
2. 原教师夹具 provider 为 integration-test，而学校默认只允许本地教师登录。后端正确过滤了该账号的工作区。夹具改为 school-local，并在页面打开后先断言已授权一个教学空间；未放宽生产权限规则。

通过时的代码基线：前端 `01fd6557d0e4376d67ecca2fb01d29b5f20e45a9` 加本轮未提交的测试环境修正（dirty=true）；后端 `1bbb1e11fac90faeb415b24c947ef07a193b0d28`（dirty=false）。记录位于 test-results/fullstack-metadata/versions.json；输出日志为 fullstack-actual.log。版本冲突日志中的 409 为预期断言，不是遗漏的失败。

全部临时测试容器和网络已清理。此次未执行后端完整 test:database 清单，也未在 GitHub 远程触发工作流；未推送、部署或连接生产数据库，没有业务逻辑或数据库结构变更。

## Actions 故障修复复核（2026-09-07）

- 使用无 node_modules 的两仓源码归档，在 Linux 容器中按 CI 目录结构嵌套检出，运行 Node 22.23.2 和 pnpm 10.33.0：原安装命令复现后端 dotenv 缺失；加入 `--ignore-workspace` 后，两项真实路由/Socket 契约测试通过。
- 后端周总览数据库测试的种子缺少必填 content。补齐测试正文后，完整 PostgreSQL 套件 69 项通过、0 跳过，包含周总览查询及分页；未放宽数据库字段约束。
- 本地真实全链路重新执行：单会话数据库回归及三个 Playwright 场景通过。此项使用本机 Node 24.14.1，Linux Node 22 的独立验证覆盖上述依赖安装和契约测试。
- 后端 Docker 镜像本地构建通过。发布工作流默认使用当前仓库的 GHCR 路径，仅在 Docker Hub 用户名与令牌均配置时增加 Docker Hub 登录和镜像目标；本地未验证远程仓库推送权限。
- 验证日志保存在被 Git 忽略的 test-results/ci-clean.log、ci-database.log、ci-fullstack.log、ci-backend-unit.log、ci-docker-build.log。未触发远程 Actions、推送或部署；部署仍必须等待全部既有门槛通过。
