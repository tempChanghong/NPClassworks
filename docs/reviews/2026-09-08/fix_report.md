# 第一批修复与验证：S1、S2、S3、F1

日期：2026-09-08。基线为前端 `960c8d7bfed0229c372147a6795292682a5498e6`、后端 `0b4d8e1a6f844ac8e18c302b607018abff1926fc` 加本轮未提交修改。原审查报告及封存附件未修改。

结果：**fixed**。四项已完成实现、专项验证和相关完整回归；独立只读复核提出的登录竞态也已复现并修复。

## 修复边界

| 项目 | 实现与兼容性 |
| --- | --- |
| S1 迁移凭据 | 后端 `verifyManagerConfirmation` 在读取导出数据前要求 OWNER。ADMIN 可继续读取迁移统计，前端禁用其导出按钮并解释原因；OWNER 迁移仍保留 PIN 校验材料，导入后原 PIN 可登录。|
| S2 改 PIN 撤销 | 教师重导入和管理员 upsert 对已有账号替换 PIN 时，在同一事务中递增 tokenVersion、清空旧式 refresh 字段并撤销 AccountSession。无 PIN 的共享密码模式导入保留原会话。|
| S2 登录竞态 | 登录写入采用最初验证的 PIN 哈希、tokenVersion 和未停用状态作为条件。若改密已先提交，则返回原有 401 登录失败，不能用旧 PIN 校验结果签发新版本会话。|
| S3 认证一致性 | 复用现有认证范围规则，在写事务内按最终学科和所有目标计算认证状态，覆盖创建、修改、恢复、撤回；复制沿用创建入口。有编辑权但无认证资格仍可编辑，结果为未认证，认证者和时间为空；当前作业与修订一致。|
| F1 草稿来源版本 | 草稿保存 baseRevision 和 basePublishAt。重新打开时，来源版本不同或旧格式缺少版本，都进入已有对比流程；未知版本单独解释。普通保存受阻，只有明确确认才采用服务器当前版本生成新修订。来源版本相同可正常保存。关闭、刷新后再次恢复不自动重定基线；仍保留七天过期规则。|

未修改数据库结构、迁移文件、生产环境配置或 `deploy/agent/server.js`，没有推送、部署或访问生产数据库。未处理 S4～S6、F2～F7 或部署版本配对等后续事项。

## 复现与回归

新增后端 `tests/reviewBoundariesDatabase.integration.test.js`，已加入 `scripts/run-database-tests.js`，随既有数据库部署门槛执行。

- 修复前：正确 PIN 的 ADMIN 导出未被拒绝；教师重导入和管理员 upsert 后旧会话仍有效；跨学科创建、空 PATCH 与实际编辑得到认证。对应数据库断言失败，记录在 `review-security-red.log`。
- 独立只读复核提出登录竞态后，测试暂停旧 PIN 的 bcrypt 校验返回，先完成改密再继续登录。两种改密入口均复现错误接收旧 PIN，记录在 `review-race-red.log`。
- 修复后专项测试 8 项通过，包括两个旧会话的 access/refresh 失效、新 PIN 可登录、无 PIN 导入保留会话、两种登录竞态、跨学科/跨目标认证矩阵，以及合法管理员认证。`review-security-green.log` 保留结果。
- OWNER 迁移包真实导出、导入及原 PIN 登录由现有 `schoolMigrationDatabase.integration.test.js` 验证。全部数据库使用受保护的回环测试地址和可丢弃 PostgreSQL 17，不使用生产数据。
- 草稿浏览器测试覆盖：关闭编辑器后服务器升级、旧格式草稿、再次关闭并刷新、明确确认保存，以及同版本正常恢复。首次受限环境的浏览器启动失败不算问题复现；之后使用真实 Chromium 验证修复结果。

## 完整验证记录

命令使用本机 Node 24.14.1；直接执行项目脚本，避免本机 pnpm 包装器版本与项目声明不一致。数据库命令运行于后端，其余命令运行于前端。

| 检查 | 结果与日志 |
| --- | --- |
| `node --test tests/*.test.js` | 前端普通测试 317 项通过；`review-frontend-unit.log` |
| `node --test` | 后端普通测试 173 项通过；13 个数据库父测试按设计跳过，在下一行实际运行；`review-backend-unit.log` |
| `node scripts/run-database-tests.js` | 77 项通过、0 跳过；`review-database.log` |
| `node --test tests/contracts/core.test.js` | 2 项真实路由和 Socket 契约测试通过；`review-contracts.log` |
| `node scripts/run-fullstack.js` | 单会话数据库回归及 3 项真实前后端浏览器流程通过；`review-fullstack.log` |
| `node node_modules/@playwright/test/cli.js test` | 最终完整浏览器回归 44 项通过；`review-browser-final.log` |
| `node node_modules/eslint/bin/eslint.js . --max-warnings=0` | 通过；`review-lint.log` |
| 生产构建及 `node scripts/validate-pwa-build.js` | 通过；`review-build.log` |

完整浏览器首次运行 42 项通过、1 项失败：既有总览测试固定选择 9 月 7 日，离线刷新后却按当天 9 月 8 日展示，断言错误。测试改为使用页面当天日期创建作业，未放宽断言或修改业务日期逻辑；总览 4 项复跑通过，记录在 `review-overview-green.log`。补充同版本恢复正常保存用例后，最终完整浏览器 44 项全部通过。

日志位于前端仓库根目录并由 `*.log` 忽略规则排除。最终 GitHub Actions 和线上部署结果尚未验证，本地通过不等同于已经上线。

本轮专用 PostgreSQL 容器及完整套件创建的临时容器、网络均已清理；未删除其他 Docker 容器、镜像或卷。
