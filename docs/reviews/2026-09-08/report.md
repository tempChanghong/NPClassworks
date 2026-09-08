# Security Review: NPClassworksKV

## Scope

当前 NPClassworksKV 后端整体源代码范围，核心运行时目录完整审阅，其他库存部分覆盖；前端另行功能/架构分析并支持跨端验证。

- Scan mode: repository
- Target kind: git_revision
- Target ID: target_sha256_e97b9dbca85c24fb30551f8a1e8dd466fc1f32732a6287e5f8993d2c28982f59
- Revision: 0b4d8e1a6f844ac8e18c302b607018abff1926fc
- Inventory strategy: repository
- Included paths: .
- Excluded paths: none
- Runtime or test status: 未运行应用、测试或攻击请求
- Scan context: 目前，报告中的一部分问题已被修复。接下来进行新一轮分析，重点针对功能漏洞和安全问题、架构问题等等。

Limitations and exclusions:
- 101/279 个登记文件完成逐文件安全审阅；剩余178路径已列入覆盖附件，含生成代码、迁移、测试、文档和部分运维配置。
- 外部 OAuth 服务商邮箱政策未验证，S5 保留相应前提。
- 未检查生产服务器、真实环境值、实际访问控制、依赖漏洞库或真实密码恢复耗时。
- Excluded ../NPClassworks/\*\*: 前端不属于本次后端登记库存；另行分析并作为跨端支持证据。

### Scan Summary

| Field | Value |
| --- | --- |
| Scan outcome | completed |
| Reportable findings | 6 |
| Severity mix | medium: 5, low: 1 |
| Confidence mix | high: 5, medium: 1 |
| Coverage | partial |
| Validation mode | static source trace |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

NPClassworksKV is the Express/Prisma/PostgreSQL backend for school structure, accounts, publications, classroom screens and Socket.IO invalidation (README.md:19; app.js:134). Production starts bin/www, validates production configuration, serves HTTP on 0.0.0.0:3000 and initializes Socket.IO; the container first applies Prisma migrations and runs as node (bin/www:14; bin/www:38; Dockerfile:26; Dockerfile:32). Standalone Compose exposes Caddy on 80/443; shared Compose exposes backend/frontend only at host loopback ports 13000/13080 (docker-compose.yml:75; docker-compose.shared.yml:30; docker-compose.shared.yml:73). Host development reads deploy/.env.debug, uses a separate loopback PostgreSQL container and sets development mode (package.json:10; scripts/dev-server.js:2; docker-compose.debug.yml:14). This is a source-backed architecture map, not completed vulnerability-audit coverage.

### Assets

- School, workspace, staff-role and publication integrity; draft/history confidentiality; publication certification and optimistic revision state (services/publicationAuthorizationService.js:74; services/publicationAuthorizationService.js:119; services/publicationService.js:954).
- Account identities, PIN/shared-password hashes, access/refresh signing keys and AccountSession refresh-token hashes. Access defaults to 15 minutes, refresh to 180 days; session and account tokenVersion are checked against PostgreSQL (utils/tokenManager.js:6; utils/tokenManager.js:10; utils/tokenManager.js:149; utils/tokenManager.js:325).
- Classroom screen PIN hashes, bearer token hashes, binding status/version, associated class roster and attendance. Screen login returns a random bearer token; subsequent authentication resolves its database hash and active binding/class/term (services/classroomScreenService.js:233; services/classroomScreenService.js:342; services/classroomToolsService.js:148).
- BOOTSTRAP_SETUP_KEY grants setup-session issuance and local OWNER recovery, independently of ordinary JWT/account authority (utils/setupToken.js:21; utils/setupToken.js:26; services/localAccountService.js:446).
- Production PostgreSQL state resides at container /var/lib/postgresql/data in the Compose postgres-data named volume; Prisma receives a credential-bearing DATABASE_URL whose default database is classworks at postgres:5432. Debug instead uses classworks_debug at host 127.0.0.1:55432 and postgres-debug-data (utils/prisma.js:5; docker-compose.yml:12; docker-compose.yml:31; docker-compose.debug.yml:16; scripts/init-debug-env.js:33).
- Encrypted school migration downloads include school business records and retained credential hashes, while excluding account sessions/OAuth tokens and resetting screen device credentials. Full operator database dumps instead include complete database state at deploy/backups/npclassworks_\<database\>_\<timestamp\>_\<label\>.dump by default (services/schoolMigrationService.js:197; services/schoolMigrationService.js:234; services/schoolMigrationService.js:325; deploy/lib.sh:9; deploy/backup.sh:31).
- Deployment HMAC secret, writable repositories, Docker authority, deployment subprocess output and backups belong to the operator/deployment-agent boundary, not school administrators (deploy/agent/server.js:92; deploy/agent/server.js:220; deploy/npclassworks-deploy-agent.service.example:9).

### Trust Boundaries

- Anonymous clients may read catalog/public publication feed and join active-workspace Socket.IO rooms. Public feed restricts requests to active same-term workspaces and published, scheduled-visible records; its author projection excludes email. Socket room joins require active workspaces/current term, not account membership (routes/v2/publications.js:48; services/publicationService.js:54; services/publicationService.js:462; services/publicationService.js:496; utils/socket.js:32).
- Bearer JWT callers cross into account authority through signature/type/issuer/audience checks, database account-version/session checks, and a separately gated legacy-token compatibility path. JWT identity alone does not supply school privileges (utils/tokenManager.js:92; utils/tokenManager.js:325; middleware/jwt-auth.js:22; middleware/jwt-auth.js:62).
- School management uses current OWNER/ADMIN membership for the specified school. Publication access combines school roles, workspace roles, responsibility assignments and school login-mode policy. Owner-role/provisioning mutations have a shared School row lock and explicit OWNER/last-owner checks (services/academicAuthorizationService.js:13; services/publicationAuthorizationService.js:74; services/publicationAuthorizationService.js:119; services/schoolOwnerPolicy.js:5).
- A screen token is a separate capability. Binding authentication and workspace relationship checks constrain screen actions; covered publication/attendance write paths recheck active tokenHash, credentialVersion and administrativeClassId while holding a binding row lock inside the write transaction (services/classroomScreenService.js:342; services/classroomScreenService.js:365; services/screenWriteAuthorization.js:3; services/publicationService.js:761; services/publicationService.js:954; services/classroomToolsService.js:148).
- Setup-key holders obtain a purpose-bound 15-minute HMAC setup token. Setup routes can create initial authority and import data; setup services check instance state. The same persistent environment key separately authorizes OWNER recovery after initialization (routes/v2/setup.js:49; utils/setupToken.js:26; services/instanceSetupService.js:138; services/localAccountService.js:446).
- OAuth exchanges send credentials to fixed provider endpoints; provider identity/email is consumed for account and invitation assignment. Provider state is stored in process memory. The final access/refresh pair is redirected to configured FRONTEND_URL, not the stored request redirect_uri; backend callback URLs derive from BASE_URL (config/oauth.js:3; config/oauth.js:90; routes/accounts.js:234; routes/accounts.js:294; routes/accounts.js:470).
- School migration export requires school-manager authority plus local PIN or school-code confirmation. Import requires setup token and an empty target, decrypts and validates the uploaded package, then rechecks emptiness inside the import transaction. Encryption uses scrypt and AES-256-GCM (services/schoolMigrationService.js:67; services/schoolMigrationService.js:127; services/schoolMigrationService.js:409; routes/v2/setup.js:77).
- Operators may source the trusted production environment, dump/replace the full database and execute repository upgrade scripts. Restore requires --yes, a realpath beneath BACKUP_DIR and a readable dump; the deploy agent instead authenticates a timestamp/nonce/body HMAC, allows only upgrade plus metadata, serializes jobs and invokes a fixed script. That script selects both repositories' origin/main; request commit metadata does not select executable revisions (deploy/lib.sh:26; deploy/restore.sh:23; deploy/restore.sh:31; deploy/restore.sh:55; deploy/agent/server.js:31; deploy/agent/server.js:60; deploy/agent/server.js:92; deploy/agent/server.js:152; deploy/ci-deploy.sh:8).
- CORS exposes responses to configured origins, allowing absent Origin; it is distinct from JWT/screen authorization. Production gateway terminates HTTPS and forwards API/Socket/metrics routes. Metrics checks METRICS_TOKEN when configured; production startup requires it. Optional Axiom tracing exports to https://api.axiom.co/v1/traces only when both AXIOM_TOKEN and AXIOM_DATASET exist (utils/corsConfig.js:14; utils/corsConfig.js:23; deploy/Caddyfile:12; app.js:112; utils/productionConfig.js:72; utils/instrumentation.js:9).

### Attacker Capabilities

- An unauthenticated network client can supply HTTP/Socket payloads, public workspace IDs, login attempts and OAuth initiation inputs; it does not initially possess an account JWT, screen token, setup key, deployment HMAC secret or database access.
- An ordinary authenticated teacher can act within assigned workspace/responsibility scope and supply publication content/targets/revisions; a compromised screen bearer can exercise its screen binding's existing authority. Cross-school, unassigned-workspace and administrative authority would be additional capabilities (services/publicationAuthorizationService.js:74; services/classroomScreenService.js:365).
- A school OWNER/ADMIN already controls school management and authorized school exports. That authority does not inherently include host shell, Docker, deployment configuration or instance environment secrets (services/academicAuthorizationService.js:13; services/schoolMigrationService.js:127; deploy/npclassworks-deploy-agent.service.example:9).
- A deployment-secret holder can trigger the fixed upgrade workflow and receive its result/output, but cannot select shell commands, filesystem paths or arbitrary Git refs through request fields. Operator control of repository scripts, environment files or Docker is preexisting privileged control (deploy/agent/server.js:60; deploy/agent/server.js:92; deploy/ci-deploy.sh:8).

### Security Objectives

- Preserve public-feed visibility while preventing account, school, workspace, draft/history and screen capabilities from crossing their intended scopes (services/publicationService.js:496; services/academicAuthorizationService.js:13; services/publicationAuthorizationService.js:74; services/classroomScreenService.js:365).
- Revocation must invalidate applicable account/screen authority; concurrent writes must preserve revision integrity and check screen authority at the transaction boundary (utils/tokenManager.js:243; utils/tokenManager.js:325; services/screenWriteAuthorization.js:3; services/publicationService.js:954).
- Keep credential material out of public projections and restrict powerful setup/recovery, export/import and deployment operations with their independent controls (services/publicationService.js:54; utils/setupToken.js:21; services/localAccountService.js:446; services/schoolMigrationService.js:127; deploy/agent/server.js:31).
- Maintain coherent deployment destinations, restrict database exposure, and protect secrets/backups with host access controls. Import must preserve selected-school data integrity while invalidating copied sessions/device authority (docker-compose.shared.yml:30; docker-compose.yml:31; deploy/lib.sh:56; deploy/backup.sh:59; services/schoolMigrationService.js:197; services/schoolMigrationService.js:234).

### Assumptions

- User context: this round evaluates current functionality/security/architecture after prior fixes. Scope here is the current NPClassworksKV repository only; no history or deployed-state inspection, application execution, network contact or source changes occurred. Frontend implementation is external to this worker's scope.
- Actual production environment values, Docker volume host backing paths, reverse-proxy deployment and filesystem ACLs were not inspected. Values above are resolved supported defaults/templates, not claims about a live server.
- REFRESH_TOKEN_API.md:8 describes a seven-day refresh default, while its own configuration at REFRESH_TOKEN_API.md:19 and the consumer at utils/tokenManager.js:10 use 180 days. Preserve this documentation disagreement.
- Without VITE_DEFAULT_KV_SERVER, Compose backend BASE_URL falls back to https://\<CLASSWORKS_DOMAIN\> but the frontend build argument falls back to https://api.newfires.top (docker-compose.yml:31; docker-compose.yml:65; docker-compose.shared.yml:35; docker-compose.shared.yml:69). The initializer copies an explicit split-domain configuration (scripts/init-production-env.js:18; deploy/.env.production.example:8); the beginner guide instructs an explicit same-origin value (docs/beginner-deployment-guide.md:282). Impact requires omission of the explicit override.
- The deployment guide's 'low-privilege deployment user' description must not imply Docker/host isolation: its systemd example grants the docker supplementary group, and the beginner guide explicitly acknowledges Docker-group high system authority (docs/automatic-deployment.md:14; deploy/npclassworks-deploy-agent.service.example:11; docs/beginner-deployment-guide.md:224).
- Migration documentation requires a migrated OWNER login test before launch, but backend completeInstanceSetup only checks owner and active-term counts; no persisted login-test result is checked there. Treat login testing as a workflow obligation unless the parent establishes a separate consumer-side control (docs/school-server-migration.md:12; services/instanceSetupService.js:408).
- Host debug HTTP still binds all interfaces even though the debug database is loopback-only; production-only configuration validation is skipped outside NODE_ENV=production. Network access to a developer machine is deployment-dependent (bin/www:38; docker-compose.debug.yml:14; utils/productionConfig.js:64).
- The legacy account-device HTTP code remains in the file but is blocked by an earlier router middleware; old-source presence is not evidence of exposure (routes/accounts.js:27).
- Unix chmod modes in backup/environment creation are intended host controls; actual Windows ACL behavior is not established. Deployment-agent process-group termination differs on Windows, and deployment scripts require Bash (scripts/init-production-env.js:29; deploy/lib.sh:56; deploy/agent/server.js:92).

## Findings

| Finding | Severity | Confidence | Detailed write-up |
| --- | --- | --- | --- |
| [自选设备 ID 可绕过本地 PIN 登录的 8 次失败限制](#finding-1) | medium | high | inline below |
| [未验证的 OAuth 邮箱被用于认领教师工作区邀请](#finding-2) | medium | medium | inline below |
| [普通修改和历史恢复绕过发布认证的学科范围检查](#finding-3) | medium | high | inline below |
| [ADMIN 整校迁移导出暴露 OWNER 的 PIN 校验哈希](#finding-4) | medium | high | inline below |
| [教师重导入和管理员 upsert 更换 PIN 后保留旧会话](#finding-5) | medium | high | inline below |
| [OAuth 登录结果未绑定发起浏览器，可强制切换会话](#finding-6) | low | high | inline below |

### Confidence Scale

| Label | Meaning |
| --- | --- |
| high | Direct evidence supports the finding with no material unresolved blocker. |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low | Evidence is incomplete and the item is retained only for explicit follow-up. |

<a id="finding-1"></a>

### [1] 自选设备 ID 可绕过本地 PIN 登录的 8 次失败限制

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | 父审查已核对入口、控制、结果及已有对照防护；未作运行时复现。 |
| Category | Excessive Authentication Attempts |
| CWE | CWE-307 |
| Affected lines | middleware/rateLimiter.js:89-94, routes/accounts.js:74-80, middleware/rateLimiter.js:89-94, middleware/rateLimiter.js:99-107, middleware/rateLimiter.js:73-79, domain/localAccount.js:17-19 |

#### Summary

POST /accounts/local/login runs localAuthLimiter and localLoginSourceLimiter. The latter's key uses X-Classworks-Device-Id instead of the source IP when present. Sending a new syntactically valid device ID every eight failures resets that bucket. localAccountService no longer enforces account-level failed-login lockouts. The remaining IP limiter allows 300 failed attempts per 15 minutes.

#### Root Cause

The short numeric PIN authentication path must enforce its per-account/source guessing limit independently of attacker-controlled device identifiers. 当前入口未统一执行对应控制。

**源码证据 1** — `routes/accounts.js:74-80`

An unauthenticated client must not choose a fresh authentication throttling identity

```javascript
router.post("/local/login", localAuthLimiter, localLoginSourceLimiter, async (req, res, next) => {
    try {
        const result = await loginLocalAccount({
            schoolCode: req.body?.schoolCode,
            username: req.body?.username,
            password: req.body?.password,
        });
```

**源码证据 2** — `middleware/rateLimiter.js:89-94`

An unauthenticated client must not choose a fresh authentication throttling identity

```javascript
export function getLocalLoginSourceKey(req) {
    const deviceId = normalizeLocalAuthKeyPart(req.headers?.["x-classworks-device-id"], "");
    const source = deviceId || `ip-${getClientIp(req)}`;
    const schoolCode = normalizeLocalAuthKeyPart(req.body?.schoolCode, "unknown-school");
    const username = normalizeLocalAuthKeyPart(req.body?.username, "unknown-account");
    return `local-login:${source}:${schoolCode}:${username}`;
```

**源码证据 3** — `middleware/rateLimiter.js:99-107`

An unauthenticated client must not choose a fresh authentication throttling identity；完整源码区间保留。

```javascript
export const localLoginSourceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {success: false, code: "LOCAL_LOGIN_SOURCE_RATE_LIMITED", message: "���豸�Ը��˺ŵĳ��Թ���Ƶ������15���Ӻ�����"},
    keyGenerator: getLocalLoginSourceKey,
    skipSuccessfulRequests: true,
    skipFailedRequests: false,
```

**源码证据 4** — `middleware/rateLimiter.js:73-79`

An unauthenticated client must not choose a fresh authentication throttling identity；完整源码区间保留。

```javascript
export const localAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {success: false, code: "LOCAL_AUTH_NETWORK_RATE_LIMITED", message: "�������¼�����쳣Ƶ�������Ժ�����"},
    keyGenerator: getClientIp,
```

**源码证据 5** — `domain/localAccount.js:17-19`

An unauthenticated client must not choose a fresh authentication throttling identity

```javascript
export function validateTeacherPin(value) {
    return typeof value === "string" && /^\d{4,8}$/.test(value);
}
```

#### Validation

POST /accounts/local/login runs localAuthLimiter and localLoginSourceLimiter. The latter's key uses X-Classworks-Device-Id instead of the source IP when present. Sending a new syntactically valid device ID every eight failures resets that bucket. localAccountService no longer enforces account-level failed-login lockouts. The remaining IP limiter allows 300 failed attempts per 15 minutes.

Validation method: static source trace

**源码证据 1** — `routes/accounts.js:74-80`

An unauthenticated client must not choose a fresh authentication throttling identity

```javascript
router.post("/local/login", localAuthLimiter, localLoginSourceLimiter, async (req, res, next) => {
    try {
        const result = await loginLocalAccount({
            schoolCode: req.body?.schoolCode,
            username: req.body?.username,
            password: req.body?.password,
        });
```

**源码证据 2** — `middleware/rateLimiter.js:89-94`

An unauthenticated client must not choose a fresh authentication throttling identity

```javascript
export function getLocalLoginSourceKey(req) {
    const deviceId = normalizeLocalAuthKeyPart(req.headers?.["x-classworks-device-id"], "");
    const source = deviceId || `ip-${getClientIp(req)}`;
    const schoolCode = normalizeLocalAuthKeyPart(req.body?.schoolCode, "unknown-school");
    const username = normalizeLocalAuthKeyPart(req.body?.username, "unknown-account");
    return `local-login:${source}:${schoolCode}:${username}`;
```

**源码证据 3** — `middleware/rateLimiter.js:99-107`

An unauthenticated client must not choose a fresh authentication throttling identity；完整源码区间保留。

```javascript
export const localLoginSourceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {success: false, code: "LOCAL_LOGIN_SOURCE_RATE_LIMITED", message: "���豸�Ը��˺ŵĳ��Թ���Ƶ������15���Ӻ�����"},
    keyGenerator: getLocalLoginSourceKey,
    skipSuccessfulRequests: true,
    skipFailedRequests: false,
```

**源码证据 4** — `middleware/rateLimiter.js:73-79`

An unauthenticated client must not choose a fresh authentication throttling identity；完整源码区间保留。

```javascript
export const localAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {success: false, code: "LOCAL_AUTH_NETWORK_RATE_LIMITED", message: "�������¼�����쳣Ƶ�������Ժ�����"},
    keyGenerator: getClientIp,
```

**源码证据 5** — `domain/localAccount.js:17-19`

An unauthenticated client must not choose a fresh authentication throttling identity

```javascript
export function validateTeacherPin(value) {
    return typeof value === "string" && /^\d{4,8}$/.test(value);
}
```

Assertions:
- The short numeric PIN authentication path must enforce its per-account/source guessing limit independently of attacker-controlled device identifiers.
- The advertised eight-attempt protection becomes 300 attempts per 15 minutes per IP. A single source can exhaust a four-digit PIN in 34 windows (about 8.5 hours), and different source IPs multiply the rate. A recovered administrator PIN can grant school administration rights. This is a partial throttling bypass, not an unlimited same-IP bypass.

Limitations:
- 未运行程序、发送攻击请求或执行 PIN 恢复。
- A separate request-IP limiter remains and caps failures at 300/15 minutes. The implementation intentionally avoids global lockouts to prevent teachers being locked out by other people, as tests/localAuthRateLimit.test.js confirms. That is a legitimate usability concern, but a caller-selected identifier does not provide a reliable security limit.

#### Dataflow

POST /accounts/local/login runs localAuthLimiter and localLoginSourceLimiter. The latter's key uses X-Classworks-Device-Id instead of the source IP when present. Sending a new syntactically valid device ID every eight failures resets that bucket. localAccountService no longer enforces account-level failed-login lockouts. The remaining IP limiter allows 300 failed attempts per 15 minutes.

- **Source:** routes/accounts.js

- **Sink:** middleware/rateLimiter.js

- **Outcome:** The advertised eight-attempt protection becomes 300 attempts per 15 minutes per IP. A single source can exhaust a four-digit PIN in 34 windows (about 8.5 hours), and different source IPs multiply the rate. A recovered administrator PIN can grant school administration rights. This is a partial throttling bypass, not an unlimited same-IP bypass.

**源码证据 1** — `routes/accounts.js:74-80`

An unauthenticated client must not choose a fresh authentication throttling identity

```javascript
router.post("/local/login", localAuthLimiter, localLoginSourceLimiter, async (req, res, next) => {
    try {
        const result = await loginLocalAccount({
            schoolCode: req.body?.schoolCode,
            username: req.body?.username,
            password: req.body?.password,
        });
```

**源码证据 2** — `middleware/rateLimiter.js:89-94`

An unauthenticated client must not choose a fresh authentication throttling identity

```javascript
export function getLocalLoginSourceKey(req) {
    const deviceId = normalizeLocalAuthKeyPart(req.headers?.["x-classworks-device-id"], "");
    const source = deviceId || `ip-${getClientIp(req)}`;
    const schoolCode = normalizeLocalAuthKeyPart(req.body?.schoolCode, "unknown-school");
    const username = normalizeLocalAuthKeyPart(req.body?.username, "unknown-account");
    return `local-login:${source}:${schoolCode}:${username}`;
```

**源码证据 3** — `middleware/rateLimiter.js:99-107`

An unauthenticated client must not choose a fresh authentication throttling identity；完整源码区间保留。

```javascript
export const localLoginSourceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {success: false, code: "LOCAL_LOGIN_SOURCE_RATE_LIMITED", message: "���豸�Ը��˺ŵĳ��Թ���Ƶ������15���Ӻ�����"},
    keyGenerator: getLocalLoginSourceKey,
    skipSuccessfulRequests: true,
    skipFailedRequests: false,
```

**源码证据 4** — `middleware/rateLimiter.js:73-79`

An unauthenticated client must not choose a fresh authentication throttling identity；完整源码区间保留。

```javascript
export const localAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {success: false, code: "LOCAL_AUTH_NETWORK_RATE_LIMITED", message: "�������¼�����쳣Ƶ�������Ժ�����"},
    keyGenerator: getClientIp,
```

**源码证据 5** — `domain/localAccount.js:17-19`

An unauthenticated client must not choose a fresh authentication throttling identity

```javascript
export function validateTeacherPin(value) {
    return typeof value === "string" && /^\d{4,8}$/.test(value);
}
```

#### Reachability

An unauthenticated remote client who knows a school code and local teacher or administrator username and can change HTTP headers.

- **Attacker:** An unauthenticated remote client who knows a school code and local teacher or administrator username and can change HTTP headers.

- **Entry point:** routes/accounts.js

- **Outcome:** The advertised eight-attempt protection becomes 300 attempts per 15 minutes per IP. A single source can exhaust a four-digit PIN in 34 windows (about 8.5 hours), and different source IPs multiply the rate. A recovered administrator PIN can grant school administration rights. This is a partial throttling bypass, not an unlimited same-IP bypass.

Limitations:
- A separate request-IP limiter remains and caps failures at 300/15 minutes. The implementation intentionally avoids global lockouts to prevent teachers being locked out by other people, as tests/localAuthRateLimit.test.js confirms. That is a legitimate usability concern, but a caller-selected identifier does not provide a reliable security limit.

#### Severity

**Medium** — 匿名调用者可稳定轮换设备头绕过细粒度限制；仍受每 IP 300 次/15 分钟限制。短 PIN 包括管理员凭据，存在可实际持续尝试的账号接管风险，非无限速。

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** high
- **Why:** The advertised eight-attempt protection becomes 300 attempts per 15 minutes per IP. A single source can exhaust a four-digit PIN in 34 windows (about 8.5 hours), and different source IPs multiply the rate. A recovered administrator PIN can grant school administration rights. This is a partial throttling bypass, not an unlimited same-IP bypass.

Likelihood assessment:
- **Level:** medium
- **Why:** 匿名调用者可稳定轮换设备头绕过细粒度限制；仍受每 IP 300 次/15 分钟限制。短 PIN 包括管理员凭据，存在可实际持续尝试的账号接管风险，非无限速。

#### Remediation

Retain a stable source-IP plus account limit even when a device ID is supplied. Use device buckets only as an additional limit. For short PINs, add bounded account-wide progressive delay or another abuse control that does not create a long global lockout, and enforce stronger credentials for administrator accounts.

Tests:
- 同一来源、学校和账号轮换设备头，累计失败仍触发稳定限流。
- 不同合法设备共享校园 IP 的正常登录不被单人误输长期锁定。

Preventive controls:
- 对同一安全不变量的所有入口执行统一策略，并以权限矩阵和实际数据库回归约束。

<a id="finding-2"></a>

### [2] 未验证的 OAuth 邮箱被用于认领教师工作区邀请

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | medium |
| Confidence rationale | 源码数据流确定；外部服务商是否允许攻击者设置未验证邮箱未核实。 |
| Category | Improper Authentication |
| CWE | CWE-287 |
| Affected lines | routes/accounts.js:397-409, routes/accounts.js:397-410, routes/accounts.js:463-464, services/workspaceAssignmentImportService.js:153-173 |

#### Summary

OAuth userinfo email and email_verified flow into normalizedUser. Both STCN and Dlass branches preserve userData.email even when email_verified is false or absent. The value is persisted to Account.email, then passed unconditionally to claimWorkspaceInvitations. That function selects all unclaimed invitations by normalized email and upserts the requesting OAuth account into each invited workspace with the invitation role.

#### Root Cause

A pending workspace invitation belongs only to the person proven to control its email address. 当前入口未统一执行对应控制。

**源码证据 1** — `routes/accounts.js:397-410`

Email-based authorization requires verified ownership of the asserted address；完整源码区间保留。

```javascript
        } else if (provider === "stcn") {
            // STCN��Casdoor����׼OIDC�û���Ϣ
            normalizedUser = {
                providerId: userData.sub,
                email: userData.email_verified ? userData.email : userData.email || null,
                name: userData.name || userData.preferred_username || userData.nickname,
                avatarUrl: userData.picture,
            };
        } else if (provider === "dlass") {
            // Dlass��Casdoor����׼OIDC�û���Ϣ
            normalizedUser = {
                providerId: userData.sub,
                email: userData.email_verified ? userData.email : userData.email || null,
                name: userData.name || userData.preferred_username || userData.nickname,
```

**源码证据 2** — `routes/accounts.js:463-464`

Email-based authorization requires verified ownership of the asserted address；完整源码区间保留。

```javascript
        // 5. �������Ա�ڽ�ʦ�״ε�¼ǰ������Ԥ����Ľ�ѧ�ռ䡣
        await claimWorkspaceInvitations({accountId: account.id, email: account.email});
```

**源码证据 3** — `services/workspaceAssignmentImportService.js:153-173`

Email-based authorization requires verified ownership of the asserted address

```javascript
export async function claimWorkspaceInvitations({accountId, email}) {
    const normalizedEmail = normalizeAssignmentEmail(email);
    if (!normalizedEmail) return {claimed: 0};
    const invitations = await prisma.workspaceMemberInvite.findMany({
        where: {normalizedEmail, claimedAt: null},
    });
    if (invitations.length === 0) return {claimed: 0};

    await prisma.$transaction(async (tx) => {
        for (const invitation of invitations) {
            await tx.workspaceMember.upsert({
                where: {
                    workspaceId_accountId: {workspaceId: invitation.workspaceId, accountId},
                },
                update: {role: invitation.role},
                create: {workspaceId: invitation.workspaceId, accountId, role: invitation.role},
            });
            await tx.workspaceMemberInvite.update({
                where: {id: invitation.id},
                data: {claimedAt: new Date(), claimedByAccountId: accountId},
            });
```

#### Validation

OAuth userinfo email and email_verified flow into normalizedUser. Both STCN and Dlass branches preserve userData.email even when email_verified is false or absent. The value is persisted to Account.email, then passed unconditionally to claimWorkspaceInvitations. That function selects all unclaimed invitations by normalized email and upserts the requesting OAuth account into each invited workspace with the invitation role.

Validation method: static source trace

**源码证据 1** — `routes/accounts.js:397-410`

Email-based authorization requires verified ownership of the asserted address；完整源码区间保留。

```javascript
        } else if (provider === "stcn") {
            // STCN��Casdoor����׼OIDC�û���Ϣ
            normalizedUser = {
                providerId: userData.sub,
                email: userData.email_verified ? userData.email : userData.email || null,
                name: userData.name || userData.preferred_username || userData.nickname,
                avatarUrl: userData.picture,
            };
        } else if (provider === "dlass") {
            // Dlass��Casdoor����׼OIDC�û���Ϣ
            normalizedUser = {
                providerId: userData.sub,
                email: userData.email_verified ? userData.email : userData.email || null,
                name: userData.name || userData.preferred_username || userData.nickname,
```

**源码证据 2** — `routes/accounts.js:463-464`

Email-based authorization requires verified ownership of the asserted address；完整源码区间保留。

```javascript
        // 5. �������Ա�ڽ�ʦ�״ε�¼ǰ������Ԥ����Ľ�ѧ�ռ䡣
        await claimWorkspaceInvitations({accountId: account.id, email: account.email});
```

**源码证据 3** — `services/workspaceAssignmentImportService.js:153-173`

Email-based authorization requires verified ownership of the asserted address

```javascript
export async function claimWorkspaceInvitations({accountId, email}) {
    const normalizedEmail = normalizeAssignmentEmail(email);
    if (!normalizedEmail) return {claimed: 0};
    const invitations = await prisma.workspaceMemberInvite.findMany({
        where: {normalizedEmail, claimedAt: null},
    });
    if (invitations.length === 0) return {claimed: 0};

    await prisma.$transaction(async (tx) => {
        for (const invitation of invitations) {
            await tx.workspaceMember.upsert({
                where: {
                    workspaceId_accountId: {workspaceId: invitation.workspaceId, accountId},
                },
                update: {role: invitation.role},
                create: {workspaceId: invitation.workspaceId, accountId, role: invitation.role},
            });
            await tx.workspaceMemberInvite.update({
                where: {id: invitation.id},
                data: {claimedAt: new Date(), claimedByAccountId: accountId},
            });
```

Assertions:
- A pending workspace invitation belongs only to the person proven to control its email address.
- An unverified email claim can acquire TEACHER, ASSISTANT or OWNER workspace membership intended for another teacher. In a school permitting OAuth teacher access, the attacker can read drafts and create or modify class publications. This does not establish takeover of the victim's existing OAuth account.

Limitations:
- 未运行程序、发送攻击请求或执行 PIN 恢复。
- The token exchange and userinfo URLs are fixed trusted provider URLs; the attacker must actually control an account at that provider. ZeroCat and HLY discard unverified email claims. Provider registration and email-change policies are external and were not inspected; exploitability for the two configured production providers remains conditional. Workspace access also checks the school's OAuth login policy. Account creation/update contains no separate email verification state, and invitation claiming checks none.

#### Dataflow

OAuth userinfo email and email_verified flow into normalizedUser. Both STCN and Dlass branches preserve userData.email even when email_verified is false or absent. The value is persisted to Account.email, then passed unconditionally to claimWorkspaceInvitations. That function selects all unclaimed invitations by normalized email and upserts the requesting OAuth account into each invited workspace with the invitation role.

- **Source:** routes/accounts.js

- **Sink:** routes/accounts.js

- **Outcome:** An unverified email claim can acquire TEACHER, ASSISTANT or OWNER workspace membership intended for another teacher. In a school permitting OAuth teacher access, the attacker can read drafts and create or modify class publications. This does not establish takeover of the victim's existing OAuth account.

**源码证据 1** — `routes/accounts.js:397-410`

Email-based authorization requires verified ownership of the asserted address；完整源码区间保留。

```javascript
        } else if (provider === "stcn") {
            // STCN��Casdoor����׼OIDC�û���Ϣ
            normalizedUser = {
                providerId: userData.sub,
                email: userData.email_verified ? userData.email : userData.email || null,
                name: userData.name || userData.preferred_username || userData.nickname,
                avatarUrl: userData.picture,
            };
        } else if (provider === "dlass") {
            // Dlass��Casdoor����׼OIDC�û���Ϣ
            normalizedUser = {
                providerId: userData.sub,
                email: userData.email_verified ? userData.email : userData.email || null,
                name: userData.name || userData.preferred_username || userData.nickname,
```

**源码证据 2** — `routes/accounts.js:463-464`

Email-based authorization requires verified ownership of the asserted address；完整源码区间保留。

```javascript
        // 5. �������Ա�ڽ�ʦ�״ε�¼ǰ������Ԥ����Ľ�ѧ�ռ䡣
        await claimWorkspaceInvitations({accountId: account.id, email: account.email});
```

**源码证据 3** — `services/workspaceAssignmentImportService.js:153-173`

Email-based authorization requires verified ownership of the asserted address

```javascript
export async function claimWorkspaceInvitations({accountId, email}) {
    const normalizedEmail = normalizeAssignmentEmail(email);
    if (!normalizedEmail) return {claimed: 0};
    const invitations = await prisma.workspaceMemberInvite.findMany({
        where: {normalizedEmail, claimedAt: null},
    });
    if (invitations.length === 0) return {claimed: 0};

    await prisma.$transaction(async (tx) => {
        for (const invitation of invitations) {
            await tx.workspaceMember.upsert({
                where: {
                    workspaceId_accountId: {workspaceId: invitation.workspaceId, accountId},
                },
                update: {role: invitation.role},
                create: {workspaceId: invitation.workspaceId, accountId, role: invitation.role},
            });
            await tx.workspaceMemberInvite.update({
                where: {id: invitation.id},
                data: {claimedAt: new Date(), claimedByAccountId: accountId},
            });
```

#### Reachability

An account holder at an enabled STCN or Dlass OAuth provider whose userinfo response can contain a chosen, unverified teacher email. Requires that provider to permit such a claim and an existing invitation for that address, or a later administrator assignment by that address.

- **Attacker:** An account holder at an enabled STCN or Dlass OAuth provider whose userinfo response can contain a chosen, unverified teacher email. Requires that provider to permit such a claim and an existing invitation for that address, or a later administrator assignment by that address.

- **Entry point:** routes/accounts.js

- **Outcome:** An unverified email claim can acquire TEACHER, ASSISTANT or OWNER workspace membership intended for another teacher. In a school permitting OAuth teacher access, the attacker can read drafts and create or modify class publications. This does not establish takeover of the victim's existing OAuth account.

Limitations:
- The token exchange and userinfo URLs are fixed trusted provider URLs; the attacker must actually control an account at that provider. ZeroCat and HLY discard unverified email claims. Provider registration and email-change policies are external and were not inspected; exploitability for the two configured production providers remains conditional. Workspace access also checks the school's OAuth login policy. Account creation/update contains no separate email verification state, and invitation claiming checks none.

#### Severity

**Medium** — 可能获得他人的教师空间权限；需启用 STCN/Dlass、服务商允许可控未验证邮箱、存在同邮箱邀请且学校允许 OAuth。外部服务商策略未确认，保留条件并降为中危。

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** high
- **Why:** An unverified email claim can acquire TEACHER, ASSISTANT or OWNER workspace membership intended for another teacher. In a school permitting OAuth teacher access, the attacker can read drafts and create or modify class publications. This does not establish takeover of the victim's existing OAuth account.

Likelihood assessment:
- **Level:** medium
- **Why:** 可能获得他人的教师空间权限；需启用 STCN/Dlass、服务商允许可控未验证邮箱、存在同邮箱邀请且学校允许 OAuth。外部服务商策略未确认，保留条件并降为中危。

#### Remediation

Persist email verification separately, accept the address for authorization only when email_verified is strictly true or when an equivalent provider-specific verified-email endpoint proves ownership, and pass that verified address to invitation claiming. Clear or quarantine previously stored unverified addresses rather than retaining them through normalizedUser.email || account.email.

Tests:
- 对 STCN/Dlass 的 email_verified=false 或缺失字段，断言不会认领邀请。
- 严格 true 的合法邮箱可以认领；既有未验证邮箱不得通过旧 Account.email 回填认领。

Preventive controls:
- 对同一安全不变量的所有入口执行统一策略，并以权限矩阵和实际数据库回归约束。

<a id="finding-3"></a>

### [3] 普通修改和历史恢复绕过发布认证的学科范围检查

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | 父审查核对空 PATCH 合并、空间授权和认证写入；当前数据库测试明确同班非任教学科显式认证应拒绝。 |
| Category | Incorrect Authorization |
| CWE | CWE-863 |
| Affected lines | services/publicationService.js:1245-1247, services/publicationService.js:669-671, services/publicationService.js:1201-1204, services/publicationService.js:1229-1247, services/publicationService.js:652-670, services/publicationService.js:587-596, services/publicationAuthorizationService.js:119-125, domain/publicationActionCenter.js:15-23 |

#### Summary

具备行政班 TEACHER/ASSISTANT 写角色、但不任教目标科目的账户，可对大屏未认证作业发送携带当前 If-Match 的空 PATCH 或恢复请求。普通更新/恢复只查空间写权限并将 isCertified 置 true，显式 certify 却按学科拒绝。

#### Root Cause

认证的学科授权只覆盖显式 certify，update/restore 的同一状态转换直接依赖更宽的空间写权限。

**发布认证权限路径对照** — `services/publicationService.js:1229-1247`

空间可写后直接赋予认证

```javascript
    const workspaces = await loadPublicationWorkspaces(
        Array.isArray(targetWorkspaceIds) ? targetWorkspaceIds : [],
    );
    await assertCanWriteWorkspaces(accountId, workspaces);
    const validation = validatePublicationSnapshot({input: mergedInput, workspaces});
    if (!validation.valid) throw validationError(validation);
    const normalized = validation.normalized;
    await assertSubjectMatchesTargets(normalized.subjectId, workspaces);
    await assertNoDuplicateAssignment({normalized, input, excludePublicationId: publicationId});

    const certifiedAt = new Date();
    const publication = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.publication.updateMany({
            where: {id: publicationId, revision: expectedRevision},
            data: {
                ...toPublicationData(normalized),
                isCertified: true,
                certifiedByAccountId: accountId,
                certifiedAt,
```

**发布认证权限路径对照** — `services/publicationService.js:652-670`

恢复操作使用相同的认证捷径

```javascript
    const targetWorkspaceIds = Array.isArray(source.snapshot?.targetWorkspaceIds)
        ? source.snapshot.targetWorkspaceIds
        : [];
    const workspaces = await loadPublicationWorkspaces(targetWorkspaceIds);
    await assertCanWriteWorkspaces(accountId, workspaces);
    const validation = validatePublicationSnapshot({input: source.snapshot, workspaces});
    if (!validation.valid) throw validationError(validation);
    const normalized = validation.normalized;
    await assertSubjectMatchesTargets(normalized.subjectId, workspaces);
    const certifiedAt = new Date();

    const publication = await prisma.$transaction(async (tx) => {
        const result = await tx.publication.updateMany({
            where: {id: publicationId, revision: expectedRevision},
            data: {
                ...toPublicationData(normalized),
                withdrawnAt: null,
                isCertified: true,
                certifiedByAccountId: accountId,
```

**发布认证权限路径对照** — `services/publicationService.js:587-596`

显式认证调用独立范围检查

```javascript
export async function certifyPublication({accountId, publicationId, expectedRevision}) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
        throw publicationError("��Ҫ�ṩ��Ч�� revision �� If-Match", "PUBLICATION_REVISION_REQUIRED", 428);
    }
    const existing = await getPublicationOrThrow(publicationId);
    await assertCanCertifyPublication(accountId, existing);
    if (existing.status !== PUBLICATION_STATUSES.PUBLISHED) {
        throw publicationError("ֻ��ȷ���ѷ�������", "PUBLICATION_NOT_PUBLISHED", 409);
    }
    if (existing.isCertified) return existing;
```

**发布认证权限路径对照** — `services/publicationAuthorizationService.js:119-125`

学科/职责拒绝策略

```javascript
export async function assertCanCertifyPublication(accountId, publication, client = prisma) {
    const workspaces = publication.targets.map((target) => target.workspace);
    const scope = await getPublicationCertificationScope(accountId, workspaces, client);
    if (isPublicationWithinActionScope(publication, scope)) return;
    throw authorizationError(
        "ֻ��ȷ���Լ��ν�ѧ�ƻ����ְ��Χ�ڵ�����",
        "PUBLICATION_CERTIFY_FORBIDDEN",
```

**发布认证权限路径对照** — `domain/publicationActionCenter.js:15-23`

必须对全部目标具备对应科目或管理权限

```javascript
    const fullyManaged = new Set(fullWorkspaceIds);
    const assignedForSubject = new Set(
        teachingAssignments
            .filter((assignment) => assignment.subjectId === publication.subjectId)
            .map((assignment) => assignment.workspaceId),
    );
    return targetWorkspaceIds.every((workspaceId) =>
        fullyManaged.has(workspaceId) || assignedForSubject.has(workspaceId));
}
```

#### Validation

具备行政班 TEACHER/ASSISTANT 写角色、但不任教目标科目的账户，可对大屏未认证作业发送携带当前 If-Match 的空 PATCH 或恢复请求。普通更新/恢复只查空间写权限并将 isCertified 置 true，显式 certify 却按学科拒绝。

Validation method: static source trace

**发布认证权限路径对照** — `services/publicationService.js:1201-1204`

普通修改仅要求内容管理权限

```javascript
    const existing = await getPublicationOrThrow(publicationId);
    await assertCanManagePublication(accountId, existing);
    if (existing.status === PUBLICATION_STATUSES.WITHDRAWN) {
        throw publicationError("�ѳ������ݲ��ܼ����޸�", "PUBLICATION_WITHDRAWN", 409);
```

**发布认证权限路径对照** — `services/publicationService.js:1229-1247`

空间可写后直接赋予认证

```javascript
    const workspaces = await loadPublicationWorkspaces(
        Array.isArray(targetWorkspaceIds) ? targetWorkspaceIds : [],
    );
    await assertCanWriteWorkspaces(accountId, workspaces);
    const validation = validatePublicationSnapshot({input: mergedInput, workspaces});
    if (!validation.valid) throw validationError(validation);
    const normalized = validation.normalized;
    await assertSubjectMatchesTargets(normalized.subjectId, workspaces);
    await assertNoDuplicateAssignment({normalized, input, excludePublicationId: publicationId});

    const certifiedAt = new Date();
    const publication = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.publication.updateMany({
            where: {id: publicationId, revision: expectedRevision},
            data: {
                ...toPublicationData(normalized),
                isCertified: true,
                certifiedByAccountId: accountId,
                certifiedAt,
```

**发布认证权限路径对照** — `services/publicationService.js:652-670`

恢复操作使用相同的认证捷径

```javascript
    const targetWorkspaceIds = Array.isArray(source.snapshot?.targetWorkspaceIds)
        ? source.snapshot.targetWorkspaceIds
        : [];
    const workspaces = await loadPublicationWorkspaces(targetWorkspaceIds);
    await assertCanWriteWorkspaces(accountId, workspaces);
    const validation = validatePublicationSnapshot({input: source.snapshot, workspaces});
    if (!validation.valid) throw validationError(validation);
    const normalized = validation.normalized;
    await assertSubjectMatchesTargets(normalized.subjectId, workspaces);
    const certifiedAt = new Date();

    const publication = await prisma.$transaction(async (tx) => {
        const result = await tx.publication.updateMany({
            where: {id: publicationId, revision: expectedRevision},
            data: {
                ...toPublicationData(normalized),
                withdrawnAt: null,
                isCertified: true,
                certifiedByAccountId: accountId,
```

**发布认证权限路径对照** — `services/publicationService.js:587-596`

显式认证调用独立范围检查

```javascript
export async function certifyPublication({accountId, publicationId, expectedRevision}) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
        throw publicationError("��Ҫ�ṩ��Ч�� revision �� If-Match", "PUBLICATION_REVISION_REQUIRED", 428);
    }
    const existing = await getPublicationOrThrow(publicationId);
    await assertCanCertifyPublication(accountId, existing);
    if (existing.status !== PUBLICATION_STATUSES.PUBLISHED) {
        throw publicationError("ֻ��ȷ���ѷ�������", "PUBLICATION_NOT_PUBLISHED", 409);
    }
    if (existing.isCertified) return existing;
```

**发布认证权限路径对照** — `services/publicationAuthorizationService.js:119-125`

学科/职责拒绝策略

```javascript
export async function assertCanCertifyPublication(accountId, publication, client = prisma) {
    const workspaces = publication.targets.map((target) => target.workspace);
    const scope = await getPublicationCertificationScope(accountId, workspaces, client);
    if (isPublicationWithinActionScope(publication, scope)) return;
    throw authorizationError(
        "ֻ��ȷ���Լ��ν�ѧ�ƻ����ְ��Χ�ڵ�����",
        "PUBLICATION_CERTIFY_FORBIDDEN",
```

**发布认证权限路径对照** — `domain/publicationActionCenter.js:15-23`

必须对全部目标具备对应科目或管理权限

```javascript
    const fullyManaged = new Set(fullWorkspaceIds);
    const assignedForSubject = new Set(
        teachingAssignments
            .filter((assignment) => assignment.subjectId === publication.subjectId)
            .map((assignment) => assignment.workspaceId),
    );
    return targetWorkspaceIds.every((workspaceId) =>
        fullyManaged.has(workspaceId) || assignedForSubject.has(workspaceId));
}
```

Assertions:
- tests/workspaceAssignmentDatabase.integration.test.js:199-207,258-283 已包含物理教师不得认证同班语文作业的真实关系夹具。
- 待处理 SQL services/publicationActionQuery.js:24 仅包含未认证内容，因此此状态变化会移除该项。

Limitations:
- 未运行数据库或实际请求。
- docs/classworks-2-phase-6.md:8 规定教师修改自动认证；该设计与较窄的显式认证策略不一致。本发现不否认调用者已有编辑权限。
- If-Match 仍有效，记录真实调用者且保留历史。

#### Dataflow

具备行政班 TEACHER/ASSISTANT 写角色、但不任教目标科目的账户，可对大屏未认证作业发送携带当前 If-Match 的空 PATCH 或恢复请求。普通更新/恢复只查空间写权限并将 isCertified 置 true，显式 certify 却按学科拒绝。

- **Source:** PATCH /api/v2/publications/:id 或 POST /:id/restore

- **Sink:** Publication.isCertified / PublicationRevision.isCertified

- **Outcome:** 非任教学科作业成为已认证并退出待处理列表

**发布认证权限路径对照** — `services/publicationService.js:1201-1204`

普通修改仅要求内容管理权限

```javascript
    const existing = await getPublicationOrThrow(publicationId);
    await assertCanManagePublication(accountId, existing);
    if (existing.status === PUBLICATION_STATUSES.WITHDRAWN) {
        throw publicationError("�ѳ������ݲ��ܼ����޸�", "PUBLICATION_WITHDRAWN", 409);
```

**发布认证权限路径对照** — `services/publicationService.js:1229-1247`

空间可写后直接赋予认证

```javascript
    const workspaces = await loadPublicationWorkspaces(
        Array.isArray(targetWorkspaceIds) ? targetWorkspaceIds : [],
    );
    await assertCanWriteWorkspaces(accountId, workspaces);
    const validation = validatePublicationSnapshot({input: mergedInput, workspaces});
    if (!validation.valid) throw validationError(validation);
    const normalized = validation.normalized;
    await assertSubjectMatchesTargets(normalized.subjectId, workspaces);
    await assertNoDuplicateAssignment({normalized, input, excludePublicationId: publicationId});

    const certifiedAt = new Date();
    const publication = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.publication.updateMany({
            where: {id: publicationId, revision: expectedRevision},
            data: {
                ...toPublicationData(normalized),
                isCertified: true,
                certifiedByAccountId: accountId,
                certifiedAt,
```

**发布认证权限路径对照** — `services/publicationService.js:652-670`

恢复操作使用相同的认证捷径

```javascript
    const targetWorkspaceIds = Array.isArray(source.snapshot?.targetWorkspaceIds)
        ? source.snapshot.targetWorkspaceIds
        : [];
    const workspaces = await loadPublicationWorkspaces(targetWorkspaceIds);
    await assertCanWriteWorkspaces(accountId, workspaces);
    const validation = validatePublicationSnapshot({input: source.snapshot, workspaces});
    if (!validation.valid) throw validationError(validation);
    const normalized = validation.normalized;
    await assertSubjectMatchesTargets(normalized.subjectId, workspaces);
    const certifiedAt = new Date();

    const publication = await prisma.$transaction(async (tx) => {
        const result = await tx.publication.updateMany({
            where: {id: publicationId, revision: expectedRevision},
            data: {
                ...toPublicationData(normalized),
                withdrawnAt: null,
                isCertified: true,
                certifiedByAccountId: accountId,
```

**发布认证权限路径对照** — `services/publicationService.js:587-596`

显式认证调用独立范围检查

```javascript
export async function certifyPublication({accountId, publicationId, expectedRevision}) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
        throw publicationError("��Ҫ�ṩ��Ч�� revision �� If-Match", "PUBLICATION_REVISION_REQUIRED", 428);
    }
    const existing = await getPublicationOrThrow(publicationId);
    await assertCanCertifyPublication(accountId, existing);
    if (existing.status !== PUBLICATION_STATUSES.PUBLISHED) {
        throw publicationError("ֻ��ȷ���ѷ�������", "PUBLICATION_NOT_PUBLISHED", 409);
    }
    if (existing.isCertified) return existing;
```

**发布认证权限路径对照** — `services/publicationAuthorizationService.js:119-125`

学科/职责拒绝策略

```javascript
export async function assertCanCertifyPublication(accountId, publication, client = prisma) {
    const workspaces = publication.targets.map((target) => target.workspace);
    const scope = await getPublicationCertificationScope(accountId, workspaces, client);
    if (isPublicationWithinActionScope(publication, scope)) return;
    throw authorizationError(
        "ֻ��ȷ���Լ��ν�ѧ�ƻ����ְ��Χ�ڵ�����",
        "PUBLICATION_CERTIFY_FORBIDDEN",
```

**发布认证权限路径对照** — `domain/publicationActionCenter.js:15-23`

必须对全部目标具备对应科目或管理权限

```javascript
    const fullyManaged = new Set(fullWorkspaceIds);
    const assignedForSubject = new Set(
        teachingAssignments
            .filter((assignment) => assignment.subjectId === publication.subjectId)
            .map((assignment) => assignment.workspaceId),
    );
    return targetWorkspaceIds.every((workspaceId) =>
        fullyManaged.has(workspaceId) || assignedForSubject.has(workspaceId));
}
```

#### Reachability

学校允许登录方式，普通教师具有该班写角色但缺乏对应学科/全科管理职责，目标当前版本有效。

- **Attacker:** 同班普通非任教学科教师

- **Entry point:** routes/v2/publications.js:149-176

- **Outcome:** 跨越既有认证学科边界

#### Severity

**Medium** — 现有普通任课模型即可触发；影响同一已授权空间内的认证状态与待处理列表，不扩大学校范围、不伪造其他教师身份。

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** medium
- **Why:** 改变已授权班级的认证完整性和负责教师待处理状态

Likelihood assessment:
- **Level:** high
- **Why:** 普通任课关系自动生成宽泛空间写角色，无特殊竞态或外部配置要求

#### Remediation

将认证状态变更集中为统一策略：按最终快照的学科和全部目标检查认证权限；无该权限时拒绝或保持未认证。覆盖创建、修改、恢复和显式认证；仅拒绝空 PATCH 不足。

Tests:
- 复用现有跨学科数据库夹具，比较 certify、PATCH 空正文、PATCH 实际变更及 restore 的认证结果。
- 对应学科教师和学校管理者可合法认证，过期 If-Match 仍拒绝。

Preventive controls:
- 为所有将 isCertified 变为 true 的入口维护一致的认证矩阵。

<a id="finding-4"></a>

### [4] ADMIN 整校迁移导出暴露 OWNER 的 PIN 校验哈希

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | 父审查已核对入口、控制、结果及已有对照防护；未作运行时复现。 |
| Category | Credential Exposure |
| CWE | CWE-522 |
| Affected lines | services/schoolMigrationService.js:127-128, routes/v2/academic-admin.js:114-129, services/schoolMigrationService.js:127-137, services/schoolMigrationService.js:197-208, domain/localAccount.js:17-19, services/schoolOwnerPolicy.js:14-16 |

#### Summary

POST /api/v2/admin/schools/:schoolId/migration/export accepts the caller's chosen passphrase and authenticates only assertSchoolManager (OWNER or ADMIN). Reauthentication checks the caller's own PIN. collectSchoolData includes every schoolMember account, selects localPasswordHash, and copies it unchanged into the encrypted export. The ADMIN knows the encryption passphrase, can recover the OWNER bcrypt verifier and try all 10,000 allowed four-digit values offline, then use normal local login as OWNER.

#### Root Cause

ADMIN users cannot manage OWNER credentials or grant themselves OWNER. Owner credential material must not be available to ADMIN for unrestricted offline guessing. 当前入口未统一执行对应控制。

**源码证据 1** — `routes/v2/academic-admin.js:114-129`

Credential exports must respect the OWNER versus ADMIN privilege boundary；完整源码区间保留。

```javascript
router.post("/schools/:schoolId/migration/export", localAuthLimiter, errors.catchAsync(async (req, res) => {
    req.setTimeout(180000);
    res.setTimeout(180000);
    const result = await createSchoolMigrationPackage({
        managerAccountId: res.locals.account.id,
        schoolId: req.params.schoolId,
        currentPin: req.body?.currentPin,
        confirmationSchoolCode: req.body?.confirmationSchoolCode,
        passphrase: req.body?.passphrase,
    });
    res.set({
        "Content-Type": "application/vnd.npclassworks.transfer+json",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-NPClassworks-Migration-Id": result.manifest.migrationId,
    });
    return res.send(result.buffer);
```

**源码证据 2** — `services/schoolMigrationService.js:127-137`

Credential exports must respect the OWNER versus ADMIN privilege boundary；完整源码区间保留。

```javascript
async function verifyManagerConfirmation({managerAccountId, schoolId, currentPin, confirmationSchoolCode}) {
    await assertSchoolManager(managerAccountId, schoolId);
    const [account, school] = await Promise.all([
        prisma.account.findUnique({where: {id: managerAccountId}}),
        prisma.school.findUnique({where: {id: schoolId}}),
    ]);
    if (!school) throw migrationError("ѧУ������", "SCHOOL_NOT_FOUND", 404);
    if (account?.localPasswordHash) {
        const matches = await bcrypt.compare(String(currentPin || ""), account.localPasswordHash || DUMMY_HASH);
        if (!matches) throw migrationError("����Ա PIN ����ȷ", "MIGRATION_REAUTH_FAILED", 401);
        return {school, reauthMethod: "PIN"};
```

**源码证据 3** — `services/schoolMigrationService.js:197-208`

Credential exports must respect the OWNER versus ADMIN privilege boundary

```javascript
    const accounts = await client.account.findMany({
        where: {id: {in: accountIds}},
        orderBy: {id: "asc"},
        select: {
            id: true, provider: true, providerId: true, email: true, name: true, avatarUrl: true,
            createdAt: true, updatedAt: true, tokenVersion: true, localUsername: true,
            localPasswordHash: true, localDisabled: true, lastLoginAt: true,
        },
    });
    return {
        accounts: accounts.map((account) => ({
            ...account,
```

**源码证据 4** — `domain/localAccount.js:17-19`

Credential exports must respect the OWNER versus ADMIN privilege boundary

```javascript
export function validateTeacherPin(value) {
    return typeof value === "string" && /^\d{4,8}$/.test(value);
}
```

**源码证据 5** — `services/schoolOwnerPolicy.js:14-16`

Credential exports must respect the OWNER versus ADMIN privilege boundary；完整源码区间保留。

```javascript
    if ((target?.role === "OWNER" || nextRole === "OWNER") && manager.role !== "OWNER") {
        throw authorizationError("ֻ��ѧУ�����߿��Թ��� OWNER", "SCHOOL_OWNER_REQUIRED");
    }
```

#### Validation

POST /api/v2/admin/schools/:schoolId/migration/export accepts the caller's chosen passphrase and authenticates only assertSchoolManager (OWNER or ADMIN). Reauthentication checks the caller's own PIN. collectSchoolData includes every schoolMember account, selects localPasswordHash, and copies it unchanged into the encrypted export. The ADMIN knows the encryption passphrase, can recover the OWNER bcrypt verifier and try all 10,000 allowed four-digit values offline, then use normal local login as OWNER.

Validation method: static source trace

**源码证据 1** — `routes/v2/academic-admin.js:114-129`

Credential exports must respect the OWNER versus ADMIN privilege boundary；完整源码区间保留。

```javascript
router.post("/schools/:schoolId/migration/export", localAuthLimiter, errors.catchAsync(async (req, res) => {
    req.setTimeout(180000);
    res.setTimeout(180000);
    const result = await createSchoolMigrationPackage({
        managerAccountId: res.locals.account.id,
        schoolId: req.params.schoolId,
        currentPin: req.body?.currentPin,
        confirmationSchoolCode: req.body?.confirmationSchoolCode,
        passphrase: req.body?.passphrase,
    });
    res.set({
        "Content-Type": "application/vnd.npclassworks.transfer+json",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-NPClassworks-Migration-Id": result.manifest.migrationId,
    });
    return res.send(result.buffer);
```

**源码证据 2** — `services/schoolMigrationService.js:127-137`

Credential exports must respect the OWNER versus ADMIN privilege boundary；完整源码区间保留。

```javascript
async function verifyManagerConfirmation({managerAccountId, schoolId, currentPin, confirmationSchoolCode}) {
    await assertSchoolManager(managerAccountId, schoolId);
    const [account, school] = await Promise.all([
        prisma.account.findUnique({where: {id: managerAccountId}}),
        prisma.school.findUnique({where: {id: schoolId}}),
    ]);
    if (!school) throw migrationError("ѧУ������", "SCHOOL_NOT_FOUND", 404);
    if (account?.localPasswordHash) {
        const matches = await bcrypt.compare(String(currentPin || ""), account.localPasswordHash || DUMMY_HASH);
        if (!matches) throw migrationError("����Ա PIN ����ȷ", "MIGRATION_REAUTH_FAILED", 401);
        return {school, reauthMethod: "PIN"};
```

**源码证据 3** — `services/schoolMigrationService.js:197-208`

Credential exports must respect the OWNER versus ADMIN privilege boundary

```javascript
    const accounts = await client.account.findMany({
        where: {id: {in: accountIds}},
        orderBy: {id: "asc"},
        select: {
            id: true, provider: true, providerId: true, email: true, name: true, avatarUrl: true,
            createdAt: true, updatedAt: true, tokenVersion: true, localUsername: true,
            localPasswordHash: true, localDisabled: true, lastLoginAt: true,
        },
    });
    return {
        accounts: accounts.map((account) => ({
            ...account,
```

**源码证据 4** — `domain/localAccount.js:17-19`

Credential exports must respect the OWNER versus ADMIN privilege boundary

```javascript
export function validateTeacherPin(value) {
    return typeof value === "string" && /^\d{4,8}$/.test(value);
}
```

**源码证据 5** — `services/schoolOwnerPolicy.js:14-16`

Credential exports must respect the OWNER versus ADMIN privilege boundary；完整源码区间保留。

```javascript
    if ((target?.role === "OWNER" || nextRole === "OWNER") && manager.role !== "OWNER") {
        throw authorizationError("ֻ��ѧУ�����߿��Թ��� OWNER", "SCHOOL_OWNER_REQUIRED");
    }
```

Assertions:
- ADMIN users cannot manage OWNER credentials or grant themselves OWNER. Owner credential material must not be available to ADMIN for unrestricted offline guessing.
- Bypasses explicit OWNER protections and online login throttling; successful PIN recovery grants OWNER operations, including managing other OWNER accounts. Offline recovery timing was not measured. Longer PINs increase recovery work but do not fix the verifier disclosure.

Limitations:
- 未运行程序、发送攻击请求或执行 PIN 恢复。
- Export requires a valid manager account, caller reauthentication, and an encrypted package. Those controls protect against outsiders and incidental disclosure, but the malicious ADMIN is an authorized exporter and chooses the decryption passphrase. Ordinary local-account management and school-role management explicitly deny ADMIN access to OWNER changes, establishing a separate boundary. Sessions and OAuth tokens are correctly excluded from exports.

#### Dataflow

POST /api/v2/admin/schools/:schoolId/migration/export accepts the caller's chosen passphrase and authenticates only assertSchoolManager (OWNER or ADMIN). Reauthentication checks the caller's own PIN. collectSchoolData includes every schoolMember account, selects localPasswordHash, and copies it unchanged into the encrypted export. The ADMIN knows the encryption passphrase, can recover the OWNER bcrypt verifier and try all 10,000 allowed four-digit values offline, then use normal local login as OWNER.

- **Source:** routes/v2/academic-admin.js

- **Sink:** services/schoolMigrationService.js

- **Outcome:** Bypasses explicit OWNER protections and online login throttling; successful PIN recovery grants OWNER operations, including managing other OWNER accounts. Offline recovery timing was not measured. Longer PINs increase recovery work but do not fix the verifier disclosure.

**源码证据 1** — `routes/v2/academic-admin.js:114-129`

Credential exports must respect the OWNER versus ADMIN privilege boundary；完整源码区间保留。

```javascript
router.post("/schools/:schoolId/migration/export", localAuthLimiter, errors.catchAsync(async (req, res) => {
    req.setTimeout(180000);
    res.setTimeout(180000);
    const result = await createSchoolMigrationPackage({
        managerAccountId: res.locals.account.id,
        schoolId: req.params.schoolId,
        currentPin: req.body?.currentPin,
        confirmationSchoolCode: req.body?.confirmationSchoolCode,
        passphrase: req.body?.passphrase,
    });
    res.set({
        "Content-Type": "application/vnd.npclassworks.transfer+json",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-NPClassworks-Migration-Id": result.manifest.migrationId,
    });
    return res.send(result.buffer);
```

**源码证据 2** — `services/schoolMigrationService.js:127-137`

Credential exports must respect the OWNER versus ADMIN privilege boundary；完整源码区间保留。

```javascript
async function verifyManagerConfirmation({managerAccountId, schoolId, currentPin, confirmationSchoolCode}) {
    await assertSchoolManager(managerAccountId, schoolId);
    const [account, school] = await Promise.all([
        prisma.account.findUnique({where: {id: managerAccountId}}),
        prisma.school.findUnique({where: {id: schoolId}}),
    ]);
    if (!school) throw migrationError("ѧУ������", "SCHOOL_NOT_FOUND", 404);
    if (account?.localPasswordHash) {
        const matches = await bcrypt.compare(String(currentPin || ""), account.localPasswordHash || DUMMY_HASH);
        if (!matches) throw migrationError("����Ա PIN ����ȷ", "MIGRATION_REAUTH_FAILED", 401);
        return {school, reauthMethod: "PIN"};
```

**源码证据 3** — `services/schoolMigrationService.js:197-208`

Credential exports must respect the OWNER versus ADMIN privilege boundary

```javascript
    const accounts = await client.account.findMany({
        where: {id: {in: accountIds}},
        orderBy: {id: "asc"},
        select: {
            id: true, provider: true, providerId: true, email: true, name: true, avatarUrl: true,
            createdAt: true, updatedAt: true, tokenVersion: true, localUsername: true,
            localPasswordHash: true, localDisabled: true, lastLoginAt: true,
        },
    });
    return {
        accounts: accounts.map((account) => ({
            ...account,
```

**源码证据 4** — `domain/localAccount.js:17-19`

Credential exports must respect the OWNER versus ADMIN privilege boundary

```javascript
export function validateTeacherPin(value) {
    return typeof value === "string" && /^\d{4,8}$/.test(value);
}
```

**源码证据 5** — `services/schoolOwnerPolicy.js:14-16`

Credential exports must respect the OWNER versus ADMIN privilege boundary；完整源码区间保留。

```javascript
    if ((target?.role === "OWNER" || nextRole === "OWNER") && manager.role !== "OWNER") {
        throw authorizationError("ֻ��ѧУ�����߿��Թ��� OWNER", "SCHOOL_OWNER_REQUIRED");
    }
```

#### Reachability

An authenticated school ADMIN who knows their own PIN, or an OAuth ADMIN who knows the public school code. The shortest takeover chain requires a local OWNER using a permitted four-digit PIN.

- **Attacker:** An authenticated school ADMIN who knows their own PIN, or an OAuth ADMIN who knows the public school code. The shortest takeover chain requires a local OWNER using a permitted four-digit PIN.

- **Entry point:** routes/v2/academic-admin.js

- **Outcome:** Bypasses explicit OWNER protections and online login throttling; successful PIN recovery grants OWNER operations, including managing other OWNER accounts. Offline recovery timing was not measured. Longer PINs increase recovery work but do not fix the verifier disclosure.

Limitations:
- Export requires a valid manager account, caller reauthentication, and an encrypted package. Those controls protect against outsiders and incidental disclosure, but the malicious ADMIN is an authorized exporter and chooses the decryption passphrase. Ordinary local-account management and school-role management explicitly deny ADMIN access to OWNER changes, establishing a separate boundary. Sessions and OAuth tokens are correctly excluded from exports.

#### Severity

**Medium** — 可跨越 ADMIN 到 OWNER 的凭据边界；需已登录本校 ADMIN，实际接管还要求恢复本地 OWNER PIN。4 位 PIN 是受支持配置，但未测恢复耗时，按中危处理。

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** high
- **Why:** Bypasses explicit OWNER protections and online login throttling; successful PIN recovery grants OWNER operations, including managing other OWNER accounts. Offline recovery timing was not measured. Longer PINs increase recovery work but do not fix the verifier disclosure.

Likelihood assessment:
- **Level:** medium
- **Why:** 可跨越 ADMIN 到 OWNER 的凭据边界；需已登录本校 ADMIN，实际接管还要求恢复本地 OWNER PIN。4 位 PIN 是受支持配置，但未测恢复耗时，按中危处理。

#### Remediation

Require OWNER authorization for migration packages that contain credential verifiers, or provide an ADMIN export that omits credential hashes and forces credential reset at import. Apply the stronger authorization to the actual export service, not only the UI.

Tests:
- 普通 ADMIN 导出不得包含任何 OWNER 凭据校验材料。
- OWNER 授权导出与 ADMIN 无凭据导出分别验证；目标导入后使用重新设置的凭据。

Preventive controls:
- 对同一安全不变量的所有入口执行统一策略，并以权限矩阵和实际数据库回归约束。

<a id="finding-5"></a>

### [5] 教师重导入和管理员 upsert 更换 PIN 后保留旧会话

| Field | Value |
| --- | --- |
| Severity | medium |
| Confidence | high |
| Confidence rationale | 父审查已核对入口、控制、结果及已有对照防护；未作运行时复现。 |
| Category | Insufficient Session Expiration |
| CWE | CWE-613 |
| Affected lines | services/localAccountService.js:174-180, routes/v2/academic-admin.js:177-185, services/localAccountService.js:168-181, services/localAccountService.js:310-319, utils/tokenManager.js:209-215 |

#### Summary

POST /api/v2/admin/local-teachers/import calls importLocalTeachers and POST /api/v2/admin/schools/:schoolId/local-admins calls createLocalAdministrator. Both use Account.upsert and replace localPasswordHash for an existing account without incrementing tokenVersion or revoking AccountSession. validateAccountToken and refreshAccessToken authorize using precisely those unchanged values, so old access tokens and refresh tokens remain valid.

#### Root Cause

Replacing a compromised local PIN must revoke sessions obtained under the old credential, consistently with the ordinary account-update and recovery paths. 当前入口未统一执行对应控制。

**源码证据 1** — `routes/v2/academic-admin.js:177-185`

All credential-reset paths must invalidate the account's existing authentication sessions

```javascript
router.post("/local-teachers/import", errors.catchAsync(async (req, res) => {
    const dryRun = req.query.dryRun === "true" || req.body?.dryRun === true;
    const result = await importLocalTeachers({
        managerAccountId: res.locals.account.id,
        schoolId: req.body?.schoolId,
        termId: req.body?.termId,
        document: req.body?.assignmentPlan || req.body,
        dryRun,
    });
```

**源码证据 2** — `services/localAccountService.js:168-181`

All credential-reset paths must invalidate the account's existing authentication sessions

```javascript
            await assertOwnerTargetChange(tx, {manager, schoolId, accountId: existing?.id});
            const passwordHash = assignment.pin
                ? await bcrypt.hash(assignment.pin, BCRYPT_ROUNDS)
                : existing?.localPasswordHash || null;
            const account = await tx.account.upsert({
                where: {provider_providerId: {provider: LOCAL_PROVIDER, providerId}},
                update: {
                    name: assignment.name,
                    localUsername: assignment.username,
                    ...(passwordHash ? {localPasswordHash: passwordHash} : {}),
                    localDisabled: false,
                    localLoginFailures: 0,
                    localLockedUntil: null,
                },
```

**源码证据 3** — `services/localAccountService.js:310-319`

All credential-reset paths must invalidate the account's existing authentication sessions

```javascript
        const account = await tx.account.upsert({
            where: {provider_providerId: {provider: LOCAL_PROVIDER, providerId}},
            update: {
                name: displayName,
                localUsername: normalizedUsername,
                localPasswordHash: passwordHash,
                localDisabled: false,
                localLoginFailures: 0,
                localLockedUntil: null,
            },
```

**源码证据 4** — `utils/tokenManager.js:209-215`

All credential-reset paths must invalidate the account's existing authentication sessions；完整源码区间保留。

```javascript
        // ��֤���ư汾
        if (account.tokenVersion !== decoded.tokenVersion) {
            throw new Error('Token version mismatch');
        }

        // �����µķ�������
        const newAccessToken = generateAccessToken(account, sessionId);
```

#### Validation

POST /api/v2/admin/local-teachers/import calls importLocalTeachers and POST /api/v2/admin/schools/:schoolId/local-admins calls createLocalAdministrator. Both use Account.upsert and replace localPasswordHash for an existing account without incrementing tokenVersion or revoking AccountSession. validateAccountToken and refreshAccessToken authorize using precisely those unchanged values, so old access tokens and refresh tokens remain valid.

Validation method: static source trace

**源码证据 1** — `routes/v2/academic-admin.js:177-185`

All credential-reset paths must invalidate the account's existing authentication sessions

```javascript
router.post("/local-teachers/import", errors.catchAsync(async (req, res) => {
    const dryRun = req.query.dryRun === "true" || req.body?.dryRun === true;
    const result = await importLocalTeachers({
        managerAccountId: res.locals.account.id,
        schoolId: req.body?.schoolId,
        termId: req.body?.termId,
        document: req.body?.assignmentPlan || req.body,
        dryRun,
    });
```

**源码证据 2** — `services/localAccountService.js:168-181`

All credential-reset paths must invalidate the account's existing authentication sessions

```javascript
            await assertOwnerTargetChange(tx, {manager, schoolId, accountId: existing?.id});
            const passwordHash = assignment.pin
                ? await bcrypt.hash(assignment.pin, BCRYPT_ROUNDS)
                : existing?.localPasswordHash || null;
            const account = await tx.account.upsert({
                where: {provider_providerId: {provider: LOCAL_PROVIDER, providerId}},
                update: {
                    name: assignment.name,
                    localUsername: assignment.username,
                    ...(passwordHash ? {localPasswordHash: passwordHash} : {}),
                    localDisabled: false,
                    localLoginFailures: 0,
                    localLockedUntil: null,
                },
```

**源码证据 3** — `services/localAccountService.js:310-319`

All credential-reset paths must invalidate the account's existing authentication sessions

```javascript
        const account = await tx.account.upsert({
            where: {provider_providerId: {provider: LOCAL_PROVIDER, providerId}},
            update: {
                name: displayName,
                localUsername: normalizedUsername,
                localPasswordHash: passwordHash,
                localDisabled: false,
                localLoginFailures: 0,
                localLockedUntil: null,
            },
```

**源码证据 4** — `utils/tokenManager.js:209-215`

All credential-reset paths must invalidate the account's existing authentication sessions；完整源码区间保留。

```javascript
        // ��֤���ư汾
        if (account.tokenVersion !== decoded.tokenVersion) {
            throw new Error('Token version mismatch');
        }

        // �����µķ�������
        const newAccessToken = generateAccessToken(account, sessionId);
```

Assertions:
- Replacing a compromised local PIN must revoke sessions obtained under the old credential, consistently with the ordinary account-update and recovery paths.
- An existing compromised session survives a successful PIN replacement and can continue using the account's current permissions. Refresh tokens default to 180 days, so the old holder can retain access much longer than the 15-minute access-token lifetime. Privileges removed separately are still evaluated by downstream authorization.

Limitations:
- 未运行程序、发送攻击请求或执行 PIN 恢复。
- The direct updateManagedLocalAccount, changeOwnLocalPin and recoverLocalOwner paths increment tokenVersion and revoke sessions. The newer, separate importStaffConfiguration service increments tokenVersion and is exposed only through setup; it does not fix the older ordinary-admin importLocalTeachers route. Existing OWNER target checks are present in both affected upserts, so this finding is session persistence rather than an ADMIN-to-OWNER password reset bypass.

#### Dataflow

POST /api/v2/admin/local-teachers/import calls importLocalTeachers and POST /api/v2/admin/schools/:schoolId/local-admins calls createLocalAdministrator. Both use Account.upsert and replace localPasswordHash for an existing account without incrementing tokenVersion or revoking AccountSession. validateAccountToken and refreshAccessToken authorize using precisely those unchanged values, so old access tokens and refresh tokens remain valid.

- **Source:** routes/v2/academic-admin.js

- **Sink:** services/localAccountService.js

- **Outcome:** An existing compromised session survives a successful PIN replacement and can continue using the account's current permissions. Refresh tokens default to 180 days, so the old holder can retain access much longer than the 15-minute access-token lifetime. Privileges removed separately are still evaluated by downstream authorization.

**源码证据 1** — `routes/v2/academic-admin.js:177-185`

All credential-reset paths must invalidate the account's existing authentication sessions

```javascript
router.post("/local-teachers/import", errors.catchAsync(async (req, res) => {
    const dryRun = req.query.dryRun === "true" || req.body?.dryRun === true;
    const result = await importLocalTeachers({
        managerAccountId: res.locals.account.id,
        schoolId: req.body?.schoolId,
        termId: req.body?.termId,
        document: req.body?.assignmentPlan || req.body,
        dryRun,
    });
```

**源码证据 2** — `services/localAccountService.js:168-181`

All credential-reset paths must invalidate the account's existing authentication sessions

```javascript
            await assertOwnerTargetChange(tx, {manager, schoolId, accountId: existing?.id});
            const passwordHash = assignment.pin
                ? await bcrypt.hash(assignment.pin, BCRYPT_ROUNDS)
                : existing?.localPasswordHash || null;
            const account = await tx.account.upsert({
                where: {provider_providerId: {provider: LOCAL_PROVIDER, providerId}},
                update: {
                    name: assignment.name,
                    localUsername: assignment.username,
                    ...(passwordHash ? {localPasswordHash: passwordHash} : {}),
                    localDisabled: false,
                    localLoginFailures: 0,
                    localLockedUntil: null,
                },
```

**源码证据 3** — `services/localAccountService.js:310-319`

All credential-reset paths must invalidate the account's existing authentication sessions

```javascript
        const account = await tx.account.upsert({
            where: {provider_providerId: {provider: LOCAL_PROVIDER, providerId}},
            update: {
                name: displayName,
                localUsername: normalizedUsername,
                localPasswordHash: passwordHash,
                localDisabled: false,
                localLoginFailures: 0,
                localLockedUntil: null,
            },
```

**源码证据 4** — `utils/tokenManager.js:209-215`

All credential-reset paths must invalidate the account's existing authentication sessions；完整源码区间保留。

```javascript
        // ��֤���ư汾
        if (account.tokenVersion !== decoded.tokenVersion) {
            throw new Error('Token version mismatch');
        }

        // �����µķ�������
        const newAccessToken = generateAccessToken(account, sessionId);
```

#### Reachability

A former account holder or attacker holding an existing account access/refresh token before an administrator replaces the account PIN through reimport or administrator creation/upsert.

- **Attacker:** A former account holder or attacker holding an existing account access/refresh token before an administrator replaces the account PIN through reimport or administrator creation/upsert.

- **Entry point:** routes/v2/academic-admin.js

- **Outcome:** An existing compromised session survives a successful PIN replacement and can continue using the account's current permissions. Refresh tokens default to 180 days, so the old holder can retain access much longer than the 15-minute access-token lifetime. Privileges removed separately are still evaluated by downstream authorization.

Limitations:
- The direct updateManagedLocalAccount, changeOwnLocalPin and recoverLocalOwner paths increment tokenVersion and revoke sessions. The newer, separate importStaffConfiguration service increments tokenVersion and is exposed only through setup; it does not fix the older ordinary-admin importLocalTeachers route. Existing OWNER target checks are present in both affected upserts, so this finding is session persistence rather than an ADMIN-to-OWNER password reset bypass.

#### Severity

**Medium** — 旧令牌持有者在管理员更换 PIN 后仍可使用原账号当前权限；需要已持有会话以及命中特定重置入口，故为中危。刷新默认 180 天使影响超出 access token 生命周期。

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** high
- **Why:** An existing compromised session survives a successful PIN replacement and can continue using the account's current permissions. Refresh tokens default to 180 days, so the old holder can retain access much longer than the 15-minute access-token lifetime. Privileges removed separately are still evaluated by downstream authorization.

Likelihood assessment:
- **Level:** medium
- **Why:** 旧令牌持有者在管理员更换 PIN 后仍可使用原账号当前权限；需要已持有会话以及命中特定重置入口，故为中危。刷新默认 180 天使影响超出 access token 生命周期。

#### Remediation

Centralize PIN replacement so every existing-account password change increments tokenVersion and revokes active AccountSession rows in the same transaction. Reuse it from teacher import and administrator upsert; alternatively reject duplicate usernames in the create-administrator route and use the protected update endpoint.

Tests:
- 真实数据库中先签发会话，再分别重导教师和 upsert 管理员 PIN；旧 access/refresh 均须失败，新 PIN 可登录。
- 仅修改显示名称且未变更凭据时按既定会话策略处理；OWNER 保护仍需通过。

Preventive controls:
- 对同一安全不变量的所有入口执行统一策略，并以权限矩阵和实际数据库回归约束。

<a id="finding-6"></a>

### [6] OAuth 登录结果未绑定发起浏览器，可强制切换会话

| Field | Value |
| --- | --- |
| Severity | low |
| Confidence | high |
| Confidence rationale | 后端 state 存取和令牌重定向已核对；前端实际入口、存储及动态请求拦截器由独立审查与父审查确认。 |
| Category | Login CSRF |
| CWE | CWE-352 |
| Affected lines | routes/accounts.js:293-301, routes/accounts.js:234-240, routes/accounts.js:293-305, routes/accounts.js:463-480 |

#### Summary

后端 OAuth state 只存 provider 等流程数据，回调不校验发起浏览器；前端启动直接接受 URL 中的令牌并覆盖当前登录。攻击者可引导用户打开其登录结果，使浏览器使用攻击者账号。

#### Root Cause

OAuth state 防伪和一次使用记录未证明结果属于当前浏览器；前端也没有待完成登录事务的验证。

**OAuth 发起、状态验证与令牌交付** — `routes/accounts.js:234-240`

state 记录未关联发起浏览器

```
    // ����state��redirect_uri��5���ӹ��ڣ�
    oauthStates.set(state, {
        provider,
        redirect_uri,
        timestamp: Date.now(),
        codeVerifier,
    });
```

**OAuth 发起、状态验证与令牌交付** — `routes/accounts.js:293-305`

回调只凭 state/provider 接受流程

```
    // ��֤state
    const stateData = oauthStates.get(state);
    if (!stateData || stateData.provider !== provider) {
        const frontendBaseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const errorUrl = new URL(frontendBaseUrl);
        errorUrl.searchParams.append("error", "invalid_state");
        errorUrl.searchParams.append("provider", provider);
        errorUrl.searchParams.append("success", "false");
        return res.redirect(errorUrl.toString());
    }

    // ɾ����ʹ�õ�state
    oauthStates.delete(state);
```

**OAuth 发起、状态验证与令牌交付** — `routes/accounts.js:463-480`

签发长期账号令牌并转交前端 URL

```
        // 5. �������Ա�ڽ�ʦ�״ε�¼ǰ������Ԥ����Ľ�ѧ�ռ䡣
        await claimWorkspaceInvitations({accountId: account.id, email: account.email});

        // 6. �������ƶԣ��������� + ˢ�����ƣ�
        const tokens = await generateTokenPair(account);

        // 7. �ض���ǰ�˸�·����Я��JWT token
        const frontendBaseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const callbackUrl = new URL(frontendBaseUrl);
        callbackUrl.searchParams.append("access_token", tokens.accessToken);
        callbackUrl.searchParams.append("refresh_token", tokens.refreshToken);
        callbackUrl.searchParams.append("expires_in", tokens.accessTokenExpiresIn);
        callbackUrl.searchParams.append("provider", provider);
        // ����չʾ��Ϣ������ǰ����ʾƷ��������
        const pconf = oauthProviders[provider] || {};
        callbackUrl.searchParams.append("providerName", pconf.displayName || pconf.name || provider);
        if (pconf.brandColor || pconf.color) {
            callbackUrl.searchParams.append("providerColor", pconf.brandColor || pconf.color);
```

#### Validation

攻击者在自身账号完成或准备完成登录，将尚未消费的回调链接交给受害者；后端接受 state 后把 token 送至前端，前端直接保存。前端还可直接接受攻击者自有的有效 token 链接，修复需覆盖双方。

Validation method: static source trace

**OAuth 发起、状态验证与令牌交付** — `routes/accounts.js:234-240`

state 记录未关联发起浏览器

```
    // ����state��redirect_uri��5���ӹ��ڣ�
    oauthStates.set(state, {
        provider,
        redirect_uri,
        timestamp: Date.now(),
        codeVerifier,
    });
```

**OAuth 发起、状态验证与令牌交付** — `routes/accounts.js:293-305`

回调只凭 state/provider 接受流程

```
    // ��֤state
    const stateData = oauthStates.get(state);
    if (!stateData || stateData.provider !== provider) {
        const frontendBaseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const errorUrl = new URL(frontendBaseUrl);
        errorUrl.searchParams.append("error", "invalid_state");
        errorUrl.searchParams.append("provider", provider);
        errorUrl.searchParams.append("success", "false");
        return res.redirect(errorUrl.toString());
    }

    // ɾ����ʹ�õ�state
    oauthStates.delete(state);
```

**OAuth 发起、状态验证与令牌交付** — `routes/accounts.js:463-480`

签发长期账号令牌并转交前端 URL

```
        // 5. �������Ա�ڽ�ʦ�״ε�¼ǰ������Ԥ����Ľ�ѧ�ռ䡣
        await claimWorkspaceInvitations({accountId: account.id, email: account.email});

        // 6. �������ƶԣ��������� + ˢ�����ƣ�
        const tokens = await generateTokenPair(account);

        // 7. �ض���ǰ�˸�·����Я��JWT token
        const frontendBaseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const callbackUrl = new URL(frontendBaseUrl);
        callbackUrl.searchParams.append("access_token", tokens.accessToken);
        callbackUrl.searchParams.append("refresh_token", tokens.refreshToken);
        callbackUrl.searchParams.append("expires_in", tokens.accessTokenExpiresIn);
        callbackUrl.searchParams.append("provider", provider);
        // ����չʾ��Ϣ������ǰ����ʾƷ��������
        const pconf = oauthProviders[provider] || {};
        callbackUrl.searchParams.append("providerName", pconf.displayName || pconf.name || provider);
        if (pconf.brandColor || pconf.color) {
            callbackUrl.searchParams.append("providerColor", pconf.brandColor || pconf.color);
```

Assertions:
- 已登录浏览器的令牌可被覆盖。
- 没有原账号凭据读取或任意更高权限证明。

Limitations:
- 用户必须打开攻击链接；后续错投还受学校/空间写权限约束。
- 未调用外部 OAuth 或运行浏览器。

#### Dataflow

未关联浏览器的 state → 回调账号 token → URL → 前端 saveAccountTokens

- **Source:** GET /accounts/oauth/:provider

- **Sink:** GET /accounts/oauth/:provider/callback 的 JWT URL 重定向

- **Outcome:** 浏览器登录到攻击者账号

**OAuth 发起、状态验证与令牌交付** — `routes/accounts.js:234-240`

state 记录未关联发起浏览器

```
    // ����state��redirect_uri��5���ӹ��ڣ�
    oauthStates.set(state, {
        provider,
        redirect_uri,
        timestamp: Date.now(),
        codeVerifier,
    });
```

**OAuth 发起、状态验证与令牌交付** — `routes/accounts.js:293-305`

回调只凭 state/provider 接受流程

```
    // ��֤state
    const stateData = oauthStates.get(state);
    if (!stateData || stateData.provider !== provider) {
        const frontendBaseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const errorUrl = new URL(frontendBaseUrl);
        errorUrl.searchParams.append("error", "invalid_state");
        errorUrl.searchParams.append("provider", provider);
        errorUrl.searchParams.append("success", "false");
        return res.redirect(errorUrl.toString());
    }

    // ɾ����ʹ�õ�state
    oauthStates.delete(state);
```

**OAuth 发起、状态验证与令牌交付** — `routes/accounts.js:463-480`

签发长期账号令牌并转交前端 URL

```
        // 5. �������Ա�ڽ�ʦ�״ε�¼ǰ������Ԥ����Ľ�ѧ�ռ䡣
        await claimWorkspaceInvitations({accountId: account.id, email: account.email});

        // 6. �������ƶԣ��������� + ˢ�����ƣ�
        const tokens = await generateTokenPair(account);

        // 7. �ض���ǰ�˸�·����Я��JWT token
        const frontendBaseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const callbackUrl = new URL(frontendBaseUrl);
        callbackUrl.searchParams.append("access_token", tokens.accessToken);
        callbackUrl.searchParams.append("refresh_token", tokens.refreshToken);
        callbackUrl.searchParams.append("expires_in", tokens.accessTokenExpiresIn);
        callbackUrl.searchParams.append("provider", provider);
        // ����չʾ��Ϣ������ǰ����ʾƷ��������
        const pconf = oauthProviders[provider] || {};
        callbackUrl.searchParams.append("providerName", pconf.displayName || pconf.name || provider);
        if (pconf.brandColor || pconf.color) {
            callbackUrl.searchParams.append("providerColor", pconf.brandColor || pconf.color);
```

#### Reachability

攻击者拥有合法账号并诱导用户打开链接。

- **Attacker:** 能分享自己有效登录结果链接的用户

- **Entry point:** routes/accounts.js:279

- **Outcome:** 强制会话替换

#### Severity

**Low** — 强制账号切换可由链接触发，但未证明原账号令牌或历史数据泄露；进一步内容错投需用户继续操作且攻击者具有目标写权限，新页面还会显示其姓名。

Additional runtime or deployment evidence could raise or lower this severity.

Impact assessment:
- **Level:** medium
- **Why:** 会话完整性受损；同目标写权限下后续草稿可能提交到攻击者账号

Likelihood assessment:
- **Level:** low
- **Why:** 需要用户操作且进一步数据影响有额外权限与交互前提

#### Remediation

使用关联发起浏览器的一次性登录事务；回调交付短期一次性结果码，由同一浏览器证明事务绑定后交换。前端仅接受正在等待的匹配流程，禁止任意 URL token 覆盖账号，跨标签同步身份变化。

Tests:
- 其他浏览器拿到有效 state/code 也不能完成原发起端登录。
- 未发起流程时带 success/access_token 的前端 URL 不改变已有账号。
- 账号在其他标签变化时，旧界面不得用新账号无提示提交。

Preventive controls:
- 将登录发起、回调兑换、账号切换作为同一会话状态机约束。

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
| --- | --- | --- | --- |
| 核心 HTTP 路由、账号/屏端身份、业务服务、domain 与基础工具 | not recorded | Reported | 当前 services、routes、middleware、utils、domain 目录下的源文件已完成静态安全审阅；另完整审閱入口、schema、选定脚本、页面和回归测试。去重路径清单仅代表完整安全审阅，不计架构映射或片段检索。 |
| 初始化锁定、学校角色与跨校资源绑定 | not recorded | No issue found | 初始化服务检查 setup 状态；管理路由统一 jwtAuth，actor 来自认证上下文；资源校验绑定所属学校/学期。未确认新的未认证初始化绕过或任意跨校管理写入。 |
| 匿名目录、停用走班与组织导入业务约束 | not recorded | No issue found | 未确认新的安全越权；已确认两项功能/历史一致性问题，详见项目主报告 F2/F3。事务和管理员授权存在，但不保证目录有效性和历史语义。 |
| 屏端持久状态、日期和编辑流程（后端范围外支持） | not recorded | Not applicable | 前端发现的7项功能问题在 docs/engineering-review-2026-09-08.md 独立记录；前端文件不计入后端279文件覆盖。OAuth前端消费端作为后端登录CSRF的跨端证据。 |
| 原会话退出漏洞与新令牌兼容降级候选 | not recorded | Rejected | No additional canonical notes were recorded. |
| 旧作者撤回权限是否应随成员资格撤销 | not recorded | Rejected | No additional canonical notes were recorded. |
| 初始化专用人员导入的 OWNER 改密候选 | not recorded | Rejected | No additional canonical notes were recorded. |
| 部署入口与有效配置 | not recorded | Needs follow-up | 部署代理、ci-deploy、release-plan、upgrade 的完整源码检查未发现任意命令/引用输入；Docker权限属于原有运维边界。配置默认值、精确部署组合和其他运维脚本仅完成部分架构核查，不能视为全量运维安全审计。 |
| 账户认证及入口控制初审 | not recorded | Needs follow-up | 基线审阅确认当前 validateAccountToken 检查会话撤销，正式验证尚未结束；已完整审查文件见 auditedFiles。 |
| 账号凭据生命周期、迁移凭据边界、登录来源及发布认证 | not recorded | Reported | 父审查以当前源码完成6项验证，保留外部服务商前提、已有IP限流、作者权限和自动认证设计反证。 |

## Open Questions And Follow Up

- 当前 STCN/Dlass 是否允许账号提交未验证且可自选的邮箱？
- 移除成员后应保留作者撤回权吗？
- 组织导入 ACTIVE 学期是否必须执行正式切换的 readiness 和大屏重绑？
- 临时退出大屏是否同时承诺撤销临时教师账号会话？
- 未完成逐文件安全审阅的当前库存；部分配置/文档已用于架构核查，但不计完整审阅。
  - Follow-up prompt: Review deferred unit deferred-12964612e001aad0 and close its stated proof gap. Paths: .claude/settings.local.json, .dockerignore, .env.oauth.example, .github/dependabot.yml, .github/workflows/docker-publish.yml, .github/workflows/production-deploy.yml, .github/workflows/quality.yml, .gitignore, .idea/.gitignore, .idea/FixClassworksKV.iml, .idea/modules.xml, .idea/vcs.xml, API_QUICK_REFERENCE.md, LICENSE, MIGRATION_CHECKLIST.md, NEW_APIS_SUMMARY.md, README.md, REFRESH_TOKEN_API.md, REFRESH_TOKEN_QUICKSTART.md, REFRESH_TOKEN_SUMMARY.md, config/examples/high-school-organization.example.json, config/examples/newfires-high-school-organization.example.json, config/examples/teacher-configuration.example.json, deploy/.env.debug.example, deploy/.env.production.example, deploy/Caddyfile, deploy/Caddyfile.shared-same-origin.example, deploy/Caddyfile.shared.example, deploy/backup.sh, deploy/compatibility.json, deploy/deploy-agent.env.example, deploy/install-backup-timer.sh, deploy/lib.sh, deploy/nginx.shared.conf.example, deploy/npclassworks-deploy-agent.service.example, deploy/restore.sh, deploy/rollback.sh, docker-compose.debug.yml, docker-compose.integration.yml, docker-compose.shared.yml, docker-compose.yml, docs/account-session-database.md, docs/automatic-deployment.md, docs/backup-restore-and-history-pagination.md, docs/beginner-deployment-guide.md, docs/classworks-2-classroom-tools.md, docs/classworks-2-local-debugging.md, docs/classworks-2-phase-1.md, docs/classworks-2-phase-2.md, docs/classworks-2-phase-3.md, docs/classworks-2-phase-5a.md, docs/classworks-2-phase-5b.md, docs/classworks-2-phase-5c.md, docs/classworks-2-phase-5d.md, docs/classworks-2-phase-5e.md, docs/deployment-gate-and-revision-cleanup.md, docs/deployment-version-pairing.md, docs/release-v1.0.0.md, docs/release-v1.0.1.md, docs/runtime-metrics-and-development.md, docs/school-server-migration.md, docs/screen-publication-idempotency.md, docs/session-revocation-database.md, generated/prisma/browser.ts, generated/prisma/client.ts, generated/prisma/commonInputTypes.ts, generated/prisma/enums.ts, generated/prisma/internal/class.ts, generated/prisma/internal/prismaNamespace.ts, generated/prisma/internal/prismaNamespaceBrowser.ts, generated/prisma/models.ts, generated/prisma/models/AcademicTerm.ts, generated/prisma/models/Account.ts, generated/prisma/models/AccountPreference.ts, generated/prisma/models/AccountSession.ts, generated/prisma/models/AdministrativeClassLeadership.ts, generated/prisma/models/AdministrativeClassStudent.ts, generated/prisma/models/AdministrativeClassSubject.ts, generated/prisma/models/AppInstall.ts, generated/prisma/models/AuditLog.ts, generated/prisma/models/AutoAuth.ts, generated/prisma/models/ClassAttendanceDay.ts, generated/prisma/models/ClassroomScreenBinding.ts, generated/prisma/models/ClassroomScreenCommand.ts, generated/prisma/models/Device.ts, generated/prisma/models/Grade.ts, generated/prisma/models/GradeLeadership.ts, generated/prisma/models/InstanceSetup.ts, generated/prisma/models/KVStore.ts, generated/prisma/models/NotificationScreenDelivery.ts, generated/prisma/models/Publication.ts, generated/prisma/models/PublicationRevision.ts, generated/prisma/models/PublicationTarget.ts, generated/prisma/models/School.ts, generated/prisma/models/SchoolMember.ts, generated/prisma/models/Subject.ts, generated/prisma/models/TeachingAssignment.ts, generated/prisma/models/Workspace.ts, generated/prisma/models/WorkspaceMember.ts, generated/prisma/models/WorkspaceMemberInvite.ts, generated/prisma/models/WorkspaceSourceClass.ts, images/官网用星火动力反色.svg, images/星火动力0702.svg, images/星火动力反色.svg, package-lock.json, package.json, pnpm-lock.yaml, prisma/migrations/20260209032205_init/migration.sql, prisma/migrations/20260809000000_academic_catalog_phase1/migration.sql, prisma/migrations/20260809010000_academic_admin_phase2/migration.sql, prisma/migrations/20260809020000_publications_phase3/migration.sql, prisma/migrations/20260809030000_account_sessions_phase5a/migration.sql, prisma/migrations/20260809040000_workspace_member_invites_phase5c/migration.sql, prisma/migrations/20260809050000_school_local_auth_phase5d/migration.sql, prisma/migrations/20260809060000_publication_revision_backups/migration.sql, prisma/migrations/20260809061000_publication_revision_cleanup/migration.sql, prisma/migrations/20260809062000_publication_relation_indexes/migration.sql, prisma/migrations/20260809070000_classroom_tools_roster_attendance/migration.sql, prisma/migrations/20260810093000_publication_board_date/migration.sql, prisma/migrations/20260810194500_notification_screen_delivery/migration.sql, prisma/migrations/20260811090000_account_preferences/migration.sql, prisma/migrations/20260815093000_notification_screen_acknowledgement/migration.sql, prisma/migrations/20260815170000_classroom_screen_accounts/migration.sql, prisma/migrations/20260815214500_school_homework_quick_deadlines/migration.sql, prisma/migrations/20260816123000_school_homework_quick_inputs/migration.sql, prisma/migrations/20260821113000_teaching_assignments/migration.sql, prisma/migrations/20260821180000_staff_responsibilities/migration.sql, prisma/migrations/20260821220000_instance_setup_oobe/migration.sql, prisma/migrations/20260822150000_audit_screen_duty/migration.sql, prisma/migrations/20260822173000_default_notice_expiry/migration.sql, prisma/migrations/20260905000000_screen_publication_idempotency/migration.sql, prisma/migrations/migration_lock.toml, public/stylesheets/style.css, scripts/init-debug-env.js, scripts/run-database-tests.js, tests/academicCatalog.test.js, tests/academicMeCachePolicy.test.js, tests/academicStructureManagement.test.js, tests/accountSessionDatabase.integration.test.js, tests/accountSessionHttp.test.js, tests/asyncPool.test.js, tests/auditDutySelection.test.js, tests/backupRestoreDatabase.integration.test.js, tests/classroomScreenAccount.test.js, tests/corsConfig.test.js, tests/deployAgent.test.js, tests/deploymentConfig.test.js, tests/localAccount.test.js, tests/managementDatabase.integration.test.js, tests/managementHttp.test.js, tests/notificationDelivery.test.js, tests/notificationDeliveryDatabase.integration.test.js, tests/operationalDatabase.integration.test.js, tests/optimisticConcurrency.test.js, tests/organizationImport.test.js, tests/productionConfig.test.js, tests/publication.test.js, tests/publicationDuplicate.test.js, tests/publicationIdempotencyDatabase.integration.test.js, tests/publicationRequest.test.js, tests/publicationRevisionCleanupDatabase.integration.test.js, tests/publicationWeek.test.js, tests/publicationWeekDatabase.integration.test.js, tests/releasePlan.test.js, tests/runtimeMetrics.test.js, tests/schoolHomeworkSettings.test.js, tests/schoolMigrationDatabase.integration.test.js, tests/schoolMigrationPackage.test.js, tests/sessionRevocationDatabase.integration.test.js, tests/sessionRevocationHttp.test.js, tests/setupToken.test.js, tests/staffAuthorization.test.js, tests/staffConfigurationImport.test.js, tests/staffResponsibilities.test.js, tests/teacherTargetPreferences.test.js, tests/teachingRelationships.test.js, tests/workspaceAssignmentDatabase.integration.test.js, tests/workspaceAssignmentImport.test.js.
- 屏端计划发布可见性政策未明确，不能把公开feed的时间门槛自动套用为屏端编辑权限。
  - Follow-up prompt: Review deferred unit deferred-ef041152131fff68 and close its stated proof gap.
- 权限撤销/重绑和部分写入事务之间的竞态尚未建立完整可控链路。
  - Follow-up prompt: Review deferred unit deferred-4ea98449cd34921f and close its stated proof gap.
- 基线正在继续核查 OAuth 邮箱信任、导入改密会话及来源限流，尚无已验证漏洞。
  - Follow-up prompt: Review deferred unit deferred-1af74eb52fcf69db and close its stated proof gap.
- 前端独立审查结果已返回，作为跨端功能报告候选；不计入后端安全发现，父审查待核验。
  - Follow-up prompt: Review deferred unit deferred-a0abe3c4be70e627 and close its stated proof gap.
- 独立基线完整候选已持久化，父审查验证和评级校准待完成。
  - Follow-up prompt: Review deferred unit deferred-8f7a8ae85824262d and close its stated proof gap.
- 独立基线完整候选已持久化，父审查验证和评级校准待完成。
  - Follow-up prompt: Review deferred unit deferred-8f7a8ae85824262d-2 and close its stated proof gap.
- 独立基线完整候选已持久化，父审查验证和评级校准待完成。
  - Follow-up prompt: Review deferred unit deferred-8f7a8ae85824262d-3 and close its stated proof gap.
- 独立基线完整候选已持久化，父审查验证和评级校准待完成。
  - Follow-up prompt: Review deferred unit deferred-8f7a8ae85824262d-4 and close its stated proof gap.
- 目录和导入功能候选已返回，待父审查核验。
  - Follow-up prompt: Review deferred unit deferred-95bec186bd02bdd3 and close its stated proof gap.
- 导入业务不变量候选已返回，待父审查核验。
  - Follow-up prompt: Review deferred unit deferred-869f251c835a3f77 and close its stated proof gap.
- 基线补充 OAuth 浏览器绑定候选，前端消费端核验中。
  - Follow-up prompt: Review deferred unit deferred-cf1a7f894174ec6c and close its stated proof gap.
- 独立基线和前端补充候选，尚待父审查验证。
  - Follow-up prompt: Review deferred unit deferred-2d3f5ad1ed0955a9 and close its stated proof gap.
- 独立基线新候选，待核验管理员与 OWNER 的凭据边界。
  - Follow-up prompt: Review deferred unit deferred-1bb9959d9eb8cad3 and close its stated proof gap.
- 前端 OAuth 令牌接收边界候选，后端相关性待判定。
  - Follow-up prompt: Review deferred unit deferred-dfafbde444fff53e and close its stated proof gap.
- 发布权限独立调查补充，父审查已核对修改代码，等待恢复操作完整证据。
  - Follow-up prompt: Review deferred unit deferred-4aa5d9c44ea30e14 and close its stated proof gap.
