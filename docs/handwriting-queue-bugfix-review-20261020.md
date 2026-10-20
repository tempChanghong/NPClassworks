# 手写正文接入：补传批次与跨窗口队列复验

2026-10-20。本轮修复一组离线补传竞态，并增加切班草稿、队列读取中断和真实双窗口回归。只做本地修改、隔离验证和分批提交，未推送、未部署。

## 源码范围

- 前端：`D:\CodeProjects\NPClassworks`，`codex/handwriting-integration-20261020`，起点 `b74255e8a0df42afdb60a7fc78bb49b4f43bce22`，起始干净。
- 业务修复：`ff9366797e24d2197853c6e4b31353d6a0d6afa5`；测试交接修正：`706093806ce16b0c36b691d1dd977417c6ca83c7`、`be8e5f97904c01bbb7056ac0b028bed033d2fbd2`。最终完整 KV 回归针对后者的干净源码，前后指纹一致；本文在验证后补记。
- 联调 KV：`D:\CodeProjects\Research\handwriting-integration-kv-main-20261020`，主分支快照 `ca0944ef3a2ce4b57620219895cf74a05ff3a551`，没有修改业务源码。
- `D:\CodeProjects\NPClassworksKV` 保持 `385db88547f0a12dd4a848366743a98dab4eaef2`，根工作区和联调快照结束时均干净。NPEduTools、NPEssentials 未修改，已有其他分支和改动保留。

## 已确认并修复：后续作业被移除或改为待核对后仍补传

位置：`src/stores/classworksV2/screenSyncActions.js`，`flushScreenPublicationQueue`。

触发：批次中第一项补传正在等待回执，另一窗口通过共享队列移除第二项，或把它标为 `needs_review`。原实现只在开始时读取整批作业对象，此后仍使用旧快照发送第二项。

实际后果：用户已经移除或要求人工核对的后续作业，仍被发出自动提交请求；服务器可能接收，也可能按权限/重复规则拒绝，不能把它一概描述成已经落库。两个交互反例修前均能观察到不该发出的第二个 POST。

修复：批次只固定待处理编号，每项发送前重新读取持久队列，只提交当前仍存在且为 `pending` 的项。读取失败时停止后续发送、保留未完成项；存储恢复后仍沿用原请求编号补传。没有修改重试间隔、保留期限、确认规则或服务器去重契约。

补充说明：已经发出的请求不能靠删除本机记录撤销，服务器已经保存的作业也不会被撤回。`src/components/v2/ScreenSyncStatus.vue` 的移除确认文案现在明确说明这一点，避免把“回执尚未收到”误写成“服务器一定未接收”。

## 验证

- 新增四项交互回归：移除后续项、后续项转待核对、两次发送之间队列不可读及恢复、草稿写入失败后切班再关闭。相关交互组 **44 项通过**；全量 **834 项，820 通过、14 项原有条件跳过、0 失败**。
- 两个修前失败反例：`.artifacts/handwriting-queue-recheck-before-fix.log`；修后相关组：`.artifacts/handwriting-queue-recheck-after-fix.log`；全量记录：`.artifacts/handwriting-queue-recheck-full-unit.log`。
- 新增真实 KV 双窗口场景：两个页面共享浏览器存储和 Web Locks，真实 OCR 确认两项文字并离线入队；第一项真实事务已经提交、回执被延迟时，另一个页面通过正式队列 UI 移除第二项。最终只发出第一项 POST，队列清空，数据库只有第一项及一版修订，第二项未落库。
- 为稳定复现交接顺序，该用例用 CDP 分别控制两个页面的网络状态；没有暂停共享上下文时钟，没有替换模型、API、队列逻辑或数据库结果。测试以队列清空及补传状态结束为完成依据，内容列表 GET 成功不是上传回执。初次新增用例的时钟/刷新等待不合适，调整测试后单独通过，再完整重跑通过，没有放宽核心 POST/数据库断言。
- 最终原生临时 PostgreSQL、真实 KV 和正式 PWA 构建：**26 通过，0 失败、0 跳过、0 flaky**，浏览器阶段约 149 秒。原始结果：`.artifacts/handwriting-kv/92569c14e37f45f5a5e020b66031d99e/result.json`。保留原有切班、草稿、复用、真实 409、令牌变化、离线刷新、丢回执去重及迟到回执场景。
- `pnpm run lint:check`、`git diff --check`、针对本次产物的 `validate-pwa-build.js --dist dist-e2e/handwriting-kv/92569c14e37f45f5a5e020b66031d99e` 均通过。
- `sourcesStable`、`generatedClientRestored`、`clusterStopped`、`clusterRemoved` 均为 `true`。另核对临时集群目录不存在，49828/61921/54860 三个本次端口没有监听。未使用 Docker、现有数据库或真实学校配置。

## 边界

最初检查的“草稿写入失败后切班”未出现跨班覆盖：`screenDraftSession.js` 的存储包装已经固定原班级与文档草稿键。保留相应正向回归，没有把这一猜测列作缺陷或改写已有隔离机制。

请求、数据库正文/修订、审计、本机草稿和补传队列继续检查只保存确认后的文字，不保存笔迹、图片或未确认结果。教师端离线失败仍保留当前正文、联网后手动重试，没有新增教师离线发布队列。

本轮未改模型、输入缓冲或触控事件，也不宣称新的内存或耗时改善。自动化中的生成字体、DPR2 和网络故障模拟不代表真人新笔迹、实体触控、Windows 显示缩放或安装 PWA 的人工验收；这些仍待人工验证，不要求把网页缩放设为 200%。
