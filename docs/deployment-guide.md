# NPClassworks 前后端通用部署指南

> 适用版本：前端 NPClassworks `v1.0.0 Nijika`、后端 NPClassworksKV `v1.0.0 Nijika` 及后续兼容版本  
> 推荐系统：Ubuntu Server 24.04 LTS  
> 默认示例域名：`cs.example.com`，部署时请替换为实际域名

本文覆盖两种生产部署方式：

- **单服务器部署**：Caddy、前端、后端和 PostgreSQL 均在同一台服务器上。适合单校部署和初期使用，也是当前仓库自动化脚本完整支持的方式。
- **多服务器部署**：公网网关/前端、后端、PostgreSQL 分离。适合已有基础设施、需要隔离数据库或后续扩容的环境。

无论采用哪种方式，都建议浏览器只访问一个 HTTPS 域名。网关按路径把 API 和 Socket.IO 请求转给后端，其余请求交给前端。这样可以避免跨域、Cookie、PWA 和通知权限方面的额外问题。

## 1. 部署结构选择

| 项目 | 单服务器 | 多服务器 |
| --- | --- | --- |
| 部署难度 | 低 | 中高 |
| 初期成本 | 低 | 较高 |
| 故障范围 | 整机为单点 | 可按服务隔离 |
| 网络要求 | Docker 内部网络 | 服务器间需可靠私网 |
| 当前脚本支持 | 完整 | 需按本文拆分执行 |
| 推荐场景 | 单校、初次上线 | 已有网关/数据库设施、需要扩容 |

小规模单校可从 2 核 CPU、4 GB 内存起步；磁盘应根据备份保留期和附件增长预留空间。正式上线前应进行实际并发测试，不能仅按人数估算。

## 2. 公共准备工作

### 2.1 软件与目录

服务器需要：

- Git
- Docker Engine 和 Docker Compose 插件
- Node.js 22+
- pnpm 10+

建议让两个仓库保持同级：

```text
/opt/npclassworks/
├── NPClassworks/       # 前端
└── NPClassworksKV/     # 后端及联合 Compose
```

示例：

```bash
sudo mkdir -p /opt/npclassworks
sudo chown "$USER":"$USER" /opt/npclassworks
cd /opt/npclassworks
git clone https://github.com/tempChanghong/NPClassworks.git
git clone https://github.com/tempChanghong/NPClassworksKV.git
corepack enable
```

确认环境：

```bash
docker version
docker compose version
node --version
pnpm --version
```

### 2.2 域名与端口

为站点域名添加指向公网网关的 A 记录；仅当服务器确实配置了 IPv6 时才添加 AAAA 记录。

公网通常只需开放：

- SSH 管理端口，且应限制来源或使用密钥登录；
- TCP 80，用于 HTTP 跳转和证书签发；
- TCP 443，用于 HTTPS；
- UDP 443，可选，用于 HTTP/3。

不要把后端 `3000` 或 PostgreSQL `5432` 直接暴露到公网。

### 2.3 生产密钥

以下值必须彼此不同，并使用至少 32 字符的强随机值：

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `METRICS_TOKEN`
- `BOOTSTRAP_SETUP_KEY`

`BOOTSTRAP_SETUP_KEY` 是首次初始化和 OWNER 恢复密钥，不是管理员或教师的日常登录密码。应由部署负责人离线保存，不得提交到 Git、聊天记录或公开工单。

OAuth 是可选的备用登录方式。使用教师短账号与 PIN 时，无需配置 OAuth Client ID 和 Client Secret。

## 3. 单服务器部署（推荐起步方案）

### 3.1 结构

```text
浏览器
  │ HTTPS
  ▼
Caddy :80/:443
  ├── 静态页面 ──> frontend (Nginx)
  └── API/Socket.IO ──> backend (Node.js)
                              │
                              └──> postgres
```

仓库根目录的 `NPClassworksKV/docker-compose.yml` 已包含四个服务：

- `caddy`：唯一对公网开放的入口，自动申请和续期 TLS 证书；
- `frontend`：构建并托管 PWA 静态文件；
- `backend`：API、认证和 Socket.IO；
- `postgres`：PostgreSQL 数据库，仅在 Compose 内部网络可见。

### 3.2 初始化配置

```bash
cd /opt/npclassworks/NPClassworksKV
pnpm install --frozen-lockfile
pnpm run deploy:init
```

编辑 `deploy/.env.production`，至少确认：

```dotenv
CLASSWORKS_DOMAIN=cs.example.com
POSTGRES_USER=classworks
POSTGRES_DB=classworks
POSTGRES_PASSWORD=<随机强密码>
JWT_SECRET=<随机强密钥>
REFRESH_TOKEN_SECRET=<另一随机强密钥>
METRICS_TOKEN=<随机强密钥>
BOOTSTRAP_SETUP_KEY=<一次性初始化密钥>
BACKUP_RETENTION_DAYS=14
ALLOW_OAUTH_BOOTSTRAP=false
```

检查配置：

```bash
pnpm run deploy:check
```

不要修改或提交 `deploy/.env.production.example` 来保存真实密码。

### 3.3 启动

确保 DNS 已经指向本机，并且 80/443 未被其他 Web 服务占用：

```bash
pnpm run deploy:up
docker compose --env-file deploy/.env.production ps
```

后端容器启动时会先执行 `prisma migrate deploy`。如果数据库迁移失败，后端不会绕过迁移继续运行。

查看启动日志：

```bash
docker compose --env-file deploy/.env.production logs --tail=200 backend frontend caddy postgres
```

### 3.4 首次初始化 OOBE

服务就绪后打开：

```text
https://cs.example.com/setup
```

使用 `BOOTSTRAP_SETUP_KEY` 进入初始化向导，依次完成：

1. 创建首位 OWNER 管理员；
2. 创建学校和启用学期；
3. 选择教师登录方式；
4. 导入或手动配置行政班、走班、教师和任课关系；
5. 创建并绑定班级大屏账号。

组织导入、教师分配和大屏创建可在 OOBE 中跳过，之后在学校管理后台补充。初始化密钥仍应保留在部署侧，用于必要的 OWNER 恢复。

### 3.5 上线验收

```bash
curl -fsS https://cs.example.com/check
curl -fsS https://cs.example.com/ready
```

- `/check` 成功：Node.js 进程存活；
- `/ready` 成功：后端可正常查询 PostgreSQL；
- `/metrics` 需要 `Authorization: Bearer <METRICS_TOKEN>`，不应作为公开监控页。

浏览器还应验证：

1. 首页和 `/setup` 刷新后不会出现 404；
2. 教师能够登录、发布作业和通知；
3. 学生能够选班、查看作业并使用本地完成标记；
4. 大屏账号能够绑定并在刷新后保持登录；
5. 两个浏览器之间能实时收到作业和通知变更；
6. 麦克风选择、噪音监测和浏览器通知权限在 HTTPS 下正常；
7. 浏览器开发者工具中没有持续的 API、Socket.IO 或 Service Worker 错误。

## 4. 多服务器部署

### 4.1 推荐拓扑

```text
互联网
  │ HTTPS
  ▼
网关服务器（Caddy）
  ├──> 前端服务器（Nginx :8080）
  └──> 后端服务器（Node.js :3000）
                           │
                           └──> 数据库服务器（PostgreSQL :5432）
```

也可以将 Caddy 与前端放在同一台网关服务器上，形成两机结构：

- 服务器 A：Caddy + 前端；
- 服务器 B：后端 + PostgreSQL。

三机结构隔离性更好；两机结构更容易维护。学校规模不大时，没有必要仅为了“看起来高可用”而强行拆分。

### 4.2 服务器间网络

服务器之间应通过以下任一方式通信：

- 云厂商 VPC/内网；
- WireGuard 等点对点加密网络；
- 已有的可信内部网络。

建议使用固定私网地址，例如：

| 服务 | 示例私网地址 | 允许访问者 |
| --- | --- | --- |
| 网关/前端 | `10.20.0.10` | 公网 80/443 |
| 后端 | `10.20.0.20:3000` | 仅网关 |
| PostgreSQL | `10.20.0.30:5432` | 仅后端和备份主机 |

即使使用云防火墙，也应让服务只绑定私网地址。不要仅依赖 PostgreSQL 密码保护公网端口。

### 4.3 数据库服务器

可使用受支持的 PostgreSQL 17 托管实例，也可以自行运行 `postgres:17-alpine`。数据库连接串示例：

```dotenv
DATABASE_URL=postgresql://classworks:<密码>@10.20.0.30:5432/classworks?schema=public
```

要求：

- 仅允许后端和备份主机连接；
- 数据库、用户和编码在首次启动前确定；
- 跨公网或不可信网络时必须启用 TLS，并在连接串中使用合适的 `sslmode`；
- 备份存放在数据库服务器之外，不能只保存在同一块磁盘。

如数据库运行在 Docker 中，应将数据目录放入持久卷，并把端口绑定到明确的私网 IP，而不是 `0.0.0.0:5432`。

### 4.4 后端服务器

在后端仓库构建镜像：

```bash
cd /opt/npclassworks/NPClassworksKV
docker build -t npclassworks-backend:v1.0.0 .
```

准备仅部署用户可读的 `backend.env`：

```dotenv
NODE_ENV=production
PORT=3000
TRUST_PROXY=1
DATABASE_URL=postgresql://classworks:<密码>@10.20.0.30:5432/classworks?schema=public
BASE_URL=https://cs.example.com
FRONTEND_URL=https://cs.example.com
JWT_ALG=HS256
JWT_SECRET=<随机强密钥>
REFRESH_TOKEN_SECRET=<另一随机强密钥>
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=30d
METRICS_TOKEN=<随机强密钥>
BOOTSTRAP_SETUP_KEY=<一次性初始化密钥>
ALLOW_OAUTH_BOOTSTRAP=false
```

示例 Compose 文件：

```yaml
services:
  backend:
    image: npclassworks-backend:v1.0.0
    restart: unless-stopped
    env_file: ./backend.env
    ports:
      - "10.20.0.20:3000:3000"
```

启动并检查：

```bash
docker compose up -d
docker compose ps
curl -fsS http://10.20.0.20:3000/ready
```

镜像入口会自动执行 Prisma 生产迁移。多副本部署时，应先用单独的迁移任务完成迁移，再逐批启动应用副本，避免多个新容器同时承担迁移职责。

`TRUST_PROXY=1` 适用于“网关直接反向代理到后端”的一层代理结构。如果前面还有 CDN 或额外代理，应按真实链路配置并限制可信来源，不要无条件增大该值。

### 4.5 前端服务器

前端的后端地址在构建时写入。推荐将两个地址都设置为对外统一域名：

```bash
cd /opt/npclassworks/NPClassworks
docker build \
  --build-arg VITE_DEFAULT_KV_SERVER=https://cs.example.com \
  --build-arg VITE_DEFAULT_AUTH_SERVER=https://cs.example.com \
  --build-arg VITE_DEFAULT_SERVER_PROVIDER=kv-server \
  -t npclassworks-frontend:v1.0.0 .
```

`VITE_DEFAULT_SERVER_PROVIDER=kv-server` 表示首次打开时直接使用学校自建后端；只有明确部署为 Classworks 官方云端客户端时才应改为 `classworkscloud`，以免请求被云端节点轮换逻辑带离学校服务器。

生产构建还应保持 `VITE_ENABLE_ANALYTICS=false`（默认值）。这样不会加载 Clarity 和 FingerprintJS；只有学校明确同意采集访问分析数据时才应主动改为 `true`。

正式发布后端前，可在 `NPClassworksKV` 目录执行：

```bash
pnpm run test:release
```

该命令先运行普通测试，再启动一个隔离的临时 PostgreSQL 17，执行正式数据库迁移与集成测试，最后自动销毁测试容器和数据卷；不会连接调试库或生产库。

示例 Compose 文件：

```yaml
services:
  frontend:
    image: npclassworks-frontend:v1.0.0
    restart: unless-stopped
    ports:
      - "10.20.0.10:8080:80"
```

若 Caddy 与前端同机，可以绑定到 `127.0.0.1:8080:80`。

前端 Nginx 配置已经处理 SPA 回退和 PWA 缓存：带哈希的静态资源长期缓存，`index.html` 和 Service Worker 不长期缓存。不要用普通静态文件服务器覆盖仓库内的 `deploy/nginx.conf`，除非同步保留这些规则。

### 4.6 网关服务器

Caddy 示例：

```caddyfile
cs.example.com {
    encode zstd gzip

    @backend {
        path /api /api/* /accounts /accounts/* /kv /kv/* /apps /apps/* /devices /devices/* /auth /auth/* /auto-auth /auto-auth/* /socket.io /socket.io/* /check /ready
    }

    handle @backend {
        reverse_proxy 10.20.0.20:3000
    }

    handle {
        reverse_proxy 10.20.0.10:8080
    }

    header {
        -Server
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "camera=(), geolocation=(), payment=()"
    }
}
```

Caddy 会自动处理 Socket.IO 的 WebSocket 升级。`/metrics` 默认不在上例的公网转发列表中；应由监控服务器通过私网读取。如果确需经公网网关转发，仍必须携带 Bearer Token，并建议再增加来源 IP 限制。

完成后从公网验收统一域名，而不是只测试每台服务器：

```bash
curl -fsS https://cs.example.com/check
curl -fsS https://cs.example.com/ready
```

## 5. 备份与恢复

### 5.1 单服务器

仓库脚本会生成 PostgreSQL 自定义格式备份、SHA-256 校验文件和版本元数据：

```bash
cd /opt/npclassworks/NPClassworksKV
bash deploy/backup.sh --label manual
sudo bash deploy/install-backup-timer.sh
```

默认每日 03:30 备份，保留 14 天。应定期把 `deploy/backups` 同步到另一台服务器或对象存储，并实际演练恢复。

恢复会替换当前数据库，执行前会再创建一份安全备份：

```bash
bash deploy/restore.sh deploy/backups/<备份文件>.dump --yes
```

不要执行 `docker compose down -v`，它会删除 PostgreSQL 和 Caddy 的命名卷。

### 5.2 多服务器

现有 `deploy/backup.sh` 和 `deploy/restore.sh` 假设 PostgreSQL 是同一个 Compose 项目中的 `postgres` 服务，**不能直接用于远程数据库**。

多服务器部署应在数据库主机或专用备份主机上使用 `pg_dump --format=custom`，并至少保存：

- 数据库备份文件；
- SHA-256 校验值；
- 备份时间；
- 前后端 Git 提交或镜像标签；
- 数据库迁移版本。

建议同时具备：

- 每日逻辑备份；
- 云磁盘或数据库快照；
- 异地副本；
- 定期恢复演练。

恢复时先停止后端写入，再恢复数据库，最后启动单个后端实例验证 `/ready`。不要在仍有多个后端副本写入时直接替换数据库。

## 6. 升级与回滚

### 6.1 单服务器

升级脚本要求前后端仓库同级、工作区干净，并且两个仓库中存在相同的目标 Git 标签：

```bash
cd /opt/npclassworks/NPClassworksKV
bash deploy/upgrade.sh v1.0.1
```

脚本会先备份数据库、保留当前前后端镜像，再构建并启动新版本。

仅回退应用镜像和代码：

```bash
bash deploy/rollback.sh
```

同时恢复升级前数据库：

```bash
bash deploy/rollback.sh --restore-database --yes
```

数据库迁移不保证向下兼容。只有确认新数据库结构兼容旧后端时，才可仅回退应用。

### 6.2 多服务器

现有 `upgrade.sh` 和 `rollback.sh` 面向单机联合 Compose，不能跨多台服务器自动编排。多服务器建议按以下顺序升级：

1. 记录当前前端、后端镜像标签和 Git 提交；
2. 创建数据库备份并校验；
3. 在维护窗口执行数据库迁移；
4. 启动一个新后端实例，验证 `/check` 和 `/ready`；
5. 逐批替换其余后端实例；
6. 更新前端；
7. 从公网完成教师、学生、大屏和实时同步冒烟测试；
8. 保留上一组镜像和备份，直至观察期结束。

前后端技术上可以使用独立版本号，但生产部署应记录一组经过联调的兼容版本。当前项目使用相同发布标签最容易排查问题。

## 7. 高可用与扩容注意事项

- **网关**：可由已有负载均衡器或两台网关承担，但证书、配置和健康检查必须一致。
- **前端**：静态且无状态，可直接水平扩容。
- **后端**：HTTP 可水平扩容；Socket.IO 多实例前必须确认房间事件具有共享适配器或粘性会话方案。未完成该配置前，建议只运行一个后端实例。
- **数据库**：优先使用可靠的托管 PostgreSQL 或成熟的主备方案，不要自行拼装未经演练的“双主”。
- **文件与状态**：数据库、备份和证书不得依赖容器可写层。
- **时间同步**：所有服务器启用 NTP，避免令牌、审计时间和通知计划偏移。

## 8. 日常运维

建议至少监控：

- 公网首页、`/check` 和 `/ready`；
- 后端 5xx、延迟和重启次数；
- Socket.IO 连接异常；
- PostgreSQL 连接数、磁盘和备份结果；
- 网关证书续期；
- 服务器磁盘、内存和系统时间；
- 大屏端离线、同步积压和值守异常。

常用单机命令：

```bash
docker compose --env-file deploy/.env.production ps
docker compose --env-file deploy/.env.production logs --tail=200 backend
docker compose --env-file deploy/.env.production logs --tail=200 caddy
systemctl status npclassworks-backup.timer
journalctl -u npclassworks-backup.service --since today
```

## 9. 常见问题

### 域名能打开，但登录或实时同步失败

检查网关是否完整转发 `/accounts`、`/api`、`/kv`、`/apps`、`/devices`、`/auth`、`/auto-auth` 和 `/socket.io`。只代理 `/api` 会导致认证或旧 KV 功能异常。

### `/check` 正常而 `/ready` 失败

后端进程存在，但数据库不可用。检查 `DATABASE_URL`、数据库防火墙、PostgreSQL 用户权限和迁移日志。

### 浏览器仍显示旧版本

先确认新前端镜像已部署，再等待 Service Worker 更新并刷新页面。不要给 `index.html`、`sw.js` 或注册脚本配置长期缓存。

### Caddy 无法签发证书

检查 A/AAAA 记录、80/443 入站规则、是否存在错误 IPv6 记录，以及端口是否被其他服务占用。

### 多服务器内网偶发断连

检查私网 MTU、NAT 空闲超时、WireGuard keepalive、网关到后端的超时配置和服务器时间同步。Socket.IO 长连接比普通页面请求更容易暴露这些问题。

## 10. 上线检查表

- [ ] 域名仅指向实际可用的 IPv4/IPv6 网关
- [ ] 公网未开放后端 3000 和数据库 5432
- [ ] 所有生产密钥随机、互不相同且未提交 Git
- [ ] `ALLOW_OAUTH_BOOTSTRAP=false`，除非明确需要旧兼容流程
- [ ] `/check` 和 `/ready` 均通过
- [ ] 完成学校 OOBE、管理员恢复信息留存
- [ ] 教师、学生和大屏三端冒烟测试通过
- [ ] 作业、通知和 Socket.IO 实时同步通过
- [ ] PWA、通知和麦克风权限在 HTTPS 下通过
- [ ] 自动备份已运行并产生有效校验文件
- [ ] 备份已有服务器外副本，并完成至少一次恢复演练
- [ ] 已记录本次部署的前端、后端和数据库版本
- [ ] 已准备可执行的升级回滚窗口与负责人
