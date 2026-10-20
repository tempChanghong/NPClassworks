# 手写正文接入：双窗口补传旧失败回执复验

2026-10-20。本轮完成最后一次切班、草稿、版本冲突与离线补传回归，修复一项跨窗口队列竞态。仅本地分批 Commit，未推送、未部署。

## 源码范围

- 前端：`D:\CodeProjects\NPClassworks`，`codex/handwriting-integration-20261020`，起点 `c9e5761a32e3d112d6b662b1ffe1cc819c982449`，开始时干净。
- 修复及交互反例：`84a69881ff62ad7e42d417b4c30c045be76851e1`；真实 KV 回归：`bd8d72fd017f854be018ef5e0bf52d6dbea0005e`。完整联调针对后者的干净源码，前后指纹一致；本文在验证后补记。
- 联调 KV：`D:\CodeProjects\Research\handwriting-integration-kv-main-20261020`，主分支快照 `ca0944ef3a2ce4b57620219895cf74a05ff3a551`；原 KV 根工作区仍为 `385db88547f0a12dd4a848366743a98dab4eaef2`。本轮未修改 KV 业务源码、模型、迁移、NPEduTools 或 NPEssentials。

## 已确认并修复的问题

位置：`src/stores/classworksV2/screenSyncActions.js` 的自动补传与手动重试失败处理。

触发：两个窗口处理同一队列项。窗口 A 的普通提交请求等待期间，窗口 B 已收到重复检查结果，并点击“确认仍然提交”；B 的明确提交临时失败后，队列正确保存了确认并等待重试。随后 A 的旧 409 返回，原逻辑仍根据旧快照覆盖队列。

实际后果：自动补传旧回执会把新确认改回 `needs_review`；手动重试旧回执还会把 `allowDuplicate: true` 覆盖掉，用户再次需要处理已经确认的作业。两个交互反例修复前均失败，记录为 `.artifacts/handwriting-stale-queue-rejection-before-fix.log`。这是本地已复现的操作障碍，没有据此认定学校现场已发生或数据丢失。

修复：两个入口共用 `updateFailedScreenUpload`，在已有跨窗口存储锁内重读队列，只有该项仍存在且输入与原请求快照一致时才写入失败。另一窗口已经更新输入后，旧失败不再覆盖新决定，也不再产生“该项需要处理”的过时诊断。成功回执仍沿用原提交编号的幂等逻辑；没有放宽普通作业的重复检查。

## 验证结果与边界

- 相关交互组 **58 通过**：`.artifacts/handwriting-stale-queue-rejection-after-fix.log`；全量单元测试 **854 项，840 通过、14 项原有条件跳过、0 失败**：`.artifacts/handwriting-stale-queue-rejection-full-unit.log`。ESLint、`git diff --check` 通过。
- 新增两个真实双页面/KV 场景，分别延迟 A 自动补传或手动重试得到的真实 409。B 使用真实重复检测和“确认仍然提交”按钮，注入一次提交前 503，确认落盘后将 B 暂时离线，只让 A 自动补传新的决定。最终均为原作业加一条明确要求重复发布的新作业，各只有一版修订，所有尝试使用同一原请求编号；没有生成第三条作业。临时断网、503 和回执延迟为受控故障，重复检测、实际提交和数据库核对使用真实本地 KV。
- 新增两项先独立通过；最终原生临时 PostgreSQL、真实 KV、正式 PWA 构建的完整回归 **39 通过，0 失败、0 跳过、0 flaky**，浏览器阶段约 213 秒。包括原有切班、草稿恢复、历史/模板复用、真实版本冲突、凭证切换、离线刷新/补传、丢回执及跨窗口队列。原始结果：`.artifacts/handwriting-kv/ab6064c96d6c436a83435d12899abe7c/result.json`。
- 针对最终候选目录 `dist-e2e/handwriting-kv/ab6064c96d6c436a83435d12899abe7c` 的 PWA 构建校验通过。`sourcesStable`、`generatedClientRestored`、`clusterStopped`、`clusterRemoved` 全为 `true`；临时集群目录不存在，56126/61374/55035 三个本次端口没有监听，前端、原 KV 及联调快照结束时干净。未使用 Docker、既有数据库或真实学校配置。

请求、数据库正文/修订、审计、草稿与队列继续校验只保存确认文字，不保存笔迹、图片或未确认结果。教师端离线失败仍保留当前正文，联网后明确重试，没有新增自动发布队列。

本轮未修改模型、Worker、缓冲或触控事件，不宣称新的准确率、内存或耗时改善。生成字体用于触发真实模型流程，DPR2/触控模拟和自动回归不能替代真人新笔迹、实体触控、实际 Windows 缩放或安装 PWA 的人工验收；不要求网页缩放设为 200%。本轮人工验收与部署均未进行。
