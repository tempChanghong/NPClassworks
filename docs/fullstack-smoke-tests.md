# 真实前后端与 PostgreSQL 冒烟测试

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

现有可复用 `.github/workflows/contracts.yml` 先执行契约测试，再安装 Chromium 并运行全链路命令。两步使用同一份后端检出。前端 PR 检查和生产部署都已引用该工作流；生产 deploy 等待整个任务成功，无需改部署代理。

后端检出必须包含新增的单会话数据库测试；未包含时明确失败，不静默跳过。手动运行工作流可以指定后端分支、标签或 SHA，以便在配套变更合入前检查。

`test-results/fullstack-metadata/versions.json` 记录前后端完整 HEAD SHA 和 dirty 状态；失败时保留 Playwright trace、截图，CI 上传测试目录并保留 7 天。本地 dirty 时，SHA 仅标识基线。它不保证服务器部署代理最终选中的版本恰好等于这对 SHA，也不为后端单独推送新增跨仓部署门槛。

## 本轮验证状态（2026-09-07）

- 前端普通测试：293 项通过；跨仓契约测试：2 项通过。
- Lint、脚本语法检查及三项 Playwright 用例发现通过。数据库目标校验测试覆盖远程地址、非测试库名及连接参数绕过拒绝。
- 实际尝试全链路入口，在启动临时 PostgreSQL 时因 Docker 引擎管道不存在而失败。未执行迁移或浏览器场景，不能据此声称三个场景已通过。
- GitHub 未查到本轮开始时两仓本地 HEAD 对应的 Actions 运行记录，新增 CI 接线也尚未远程执行。没有推送或触发部署。

这些测试覆盖实际 Express 应用及 Socket，不启动 `bin/www` 的后台清理任务，也不覆盖生产反向代理、HTTPS、真实设备休眠或历史版本 PWA 升级；原有分层测试继续保留。
