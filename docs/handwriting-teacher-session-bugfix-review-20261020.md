# 手写正文接入：教师登录交接与迟到回执复验

2026-10-20。本轮修复教师编辑器的一组异步会话归属缺陷，覆盖普通保存、冲突生成新版本、冲突另存和载入最新版。只做本地提交与隔离验证，未推送、未部署。

## 源码范围

- 前端：`D:\CodeProjects\NPClassworks`，`codex/handwriting-integration-20261020`，起点 `183ca53423f89468469d9339394c2ac8a098f4d5`，开始时干净。
- 业务修复：`99933b5af9ea246f173744499c10cd7a96e8df58`；真实 KV 回归：`85b6412f359e27e083614c1a3c038b63a11c8444`；既有双窗口测试的网络恢复/等待边界修正：`87daf61cf7eb7f04ee322ceb09ce60947413371f`。
- 最终完整 KV 回归针对 `87daf61cf7eb7f04ee322ceb09ce60947413371f` 的干净源码，前后指纹一致；本文在验证后补记。
- 联调 KV：`D:\CodeProjects\Research\handwriting-integration-kv-main-20261020`，主分支快照 `ca0944ef3a2ce4b57620219895cf74a05ff3a551`。原 KV 根工作区保持 `385db88547f0a12dd4a848366743a98dab4eaef2`；两个位置结束时均干净。本轮未修改 KV 业务源码、数据库结构或迁移，也未修改 NPEduTools、NPEssentials。

## 已确认并修复的问题

位置：`src/components/v2/PublicationComposer.vue` 的 `captureEditor`，由普通提交、`completeSave`、`applyLocalOnLatest`、`saveConflictCopy` 和 `reloadLatest` 共同使用。

触发：教师已经确认手写文字，保存或冲突处理请求等待期间，另一窗口更换登录凭证。当前窗口的教师工作台尚未重新初始化，`teacherSessionVersion` 未变化；即使另一窗口随后恢复原登录，旧异步操作也不应重新获得当前编辑器的控制权。

实际后果：原归属判断只检查组件存活和工作台版本，普通保存、生成新版本、另存的迟到成功回执仍可清空表单并发出完成事件；迟到的“载入最新版”仍可发出替换事件，父页面据此覆盖本机确认文字。四条路径分别覆盖更换登录、换回原登录，八个交互反例在修复前全部失败。

修复：请求开始时固定账号编号、刷新令牌与跨窗口凭证变化代数，完成前统一复查。账号/登录变化后，旧回调不再清空正文、继续修改当前编辑器或发出替换事件；只更新访问令牌的正常续期仍属于原登录。原有编辑内容切换、后续输入保护和离线保存规则保持不变。

边界：服务器可能已经接收旧保存，忽略旧回执不会回滚服务器事务。保留本机输入不代表服务器未保存，后续仍需按发布记录或版本冲突流程核对。本问题属于编辑器异步归属错误，不代表服务端权限绕过，也没有证据表明学校现场已经发生过此问题。

## 验证

- 新增八个迟到回执反例及两个普通访问令牌续期对照。相关交互组 **42 项通过**；全量 **844 项，830 通过、14 项原有条件跳过、0 失败**。原始记录：`.artifacts/handwriting-teacher-completion-before-fix.log`、`.artifacts/handwriting-teacher-completion-after-fix.log`、`.artifacts/handwriting-teacher-completion-full-unit.log`。
- 新增三项真实 KV 场景：真实 OCR 后确认文字，真实远程修改制造 409，延迟真正的最新版 GET；另一个真实页面分别更换有效登录、恢复原登录、仅续期访问令牌。前两种保留本机正文及冲突状态，续期对照正常载入远程第二版；数据库始终只有一条作业、两版修订，没有把本机未保存正文提交出去。
- 精确延迟 GET 的三个用例单独禁用 Service Worker，避免 SW 自行请求绕过 `page.route`；其他离线/PWA 用例继续使用实际 Service Worker。先单独三项通过，再加入完整回归。
- 完整回归曾发现上一轮双窗口队列用例的一处测试等待边界：队列已经清空，列表 GET/OPTIONS 仍在等待，默认 10 秒断言先于接口原有 15 秒超时。跟踪记录位于 `.artifacts/handwriting-kv/a4b4d2eae9f84e6084e1a95b12c9369c/`。现于队列清空后恢复另一个页面的网络，并允许最终批次状态覆盖原请求超时及调度余量；POST 次数、队列及数据库断言未放宽，业务超时没有改变。该用例连续两次通过后再次完整重跑。
- 最终原生临时 PostgreSQL、真实 KV 和正式 PWA 构建：**29 通过，0 失败、0 跳过、0 flaky**，浏览器阶段约 166 秒。原始结果：`.artifacts/handwriting-kv/a5c5c710d30a4e35a73c148650bc4789/result.json`。保留所有原有切班、草稿恢复、复用、真实版本冲突、离线刷新/补传、丢回执去重及跨窗口队列场景。
- `pnpm run lint:check`、`git diff --check`、针对本次产物的 `validate-pwa-build.js --dist dist-e2e/handwriting-kv/a5c5c710d30a4e35a73c148650bc4789` 均通过。
- `sourcesStable`、`generatedClientRestored`、`clusterStopped`、`clusterRemoved` 均为 `true`；另核对临时集群目录不存在，60645/62811/56665 三个本次端口没有监听。未使用 Docker、既有数据库或真实学校配置。

请求、数据库正文/修订、审计、本机草稿及补传队列继续检查只保存确认文字，不保存笔迹、图片或未确认结果。教师端仍为离线失败后保留当前正文、联网手动重试，没有新增离线发布队列。

本轮未改模型、Worker、输入缓冲或触控事件，也不宣称新的识别准确率、内存或耗时改善。生成字体、DPR2 及网络故障模拟是自动化证据，不能替代真人新笔迹、实体触控、实际 Windows 显示缩放或安装 PWA 的人工验收；不要求把网页缩放设为 200%。
