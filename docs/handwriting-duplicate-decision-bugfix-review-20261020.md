# 手写正文接入：离线补传中重复发布确认的持久化

2026-10-20。本轮继续检查切班、草稿、版本冲突及离线补传，确认并修复一项重复确认丢失的问题。仅本地分批提交，未推送、未部署。

## 源码范围

- 前端：`D:\CodeProjects\NPClassworks`，`codex/handwriting-integration-20261020`，起点 `3484be01b611d988160a49255600b16b52e9f516`，开始时干净。
- 修复及交互回归：`f98cac3a402a39c356a388e7108befe46ca75f78`；真实 KV 回归：`9b3cac663b8ec9be05004143d527b3bfbb191cb8`。
- 最终完整联调针对 `9b3cac663b8ec9be05004143d527b3bfbb191cb8` 的干净源码，前后指纹一致；本文在验证后补记。
- 联调 KV：`D:\CodeProjects\Research\handwriting-integration-kv-main-20261020`，主分支快照 `ca0944ef3a2ce4b57620219895cf74a05ff3a551`。原 KV 根工作区仍在 `385db88547f0a12dd4a848366743a98dab4eaef2`，未修改其业务源码、模型或迁移。NPEduTools、NPEssentials 未改。

## 已确认的问题与最小修复

位置：`src/stores/classworksV2/screenSyncActions.js`，`retryScreenQueuedPublication`。

触发：手写结果经确认后离线排队，联网收到真实 `DUPLICATE_ASSIGNMENT_SUSPECTED`；用户在同步队列点击“确认仍然提交”，本次请求又遇到临时网络失败。原实现发送了 `allowDuplicate: true`，但失败时没有把它保存回本机队列。重试或刷新后，原输入再次触发重复检查，用户需要重复确认。

这是确认意图没有持久化造成的操作障碍，未据此认定数据丢失或现场已发生。修复前的交互反例中，恢复网络后的队列仍停留在 `needs_review`，与预期清空不符。

修复：在已有失败写回中保存本次实际提交的输入及明确确认，保留同一队列项、原 `clientRequestId` 和入队时间；没有额外增加发送前的存储写入。后续自动补传使用同一份输入。确认只属于该项作业，其他项及普通重试继续受重复检查约束；存储失败仍显式报错，不能保证在存储不可写时保存确认。

只读核对 KV 的 `domain/publicationRequest.js`、`domain/publicationDuplicate.js` 和 `services/publicationService.js`：重复确认不属于正文指纹；同请求编号的已保存结果会先做幂等回放，再进入新作业的重复检查。因此保存确认不会更换请求编号或制造额外修订。无需修改后端契约。

## 验证结果

- 修复前失败记录：`.artifacts/handwriting-duplicate-decision-before-fix.log`。新增两个交互回归验证刷新后保留确认，以及确认不传递给另一队列项。相关交互组 **56 通过**：`.artifacts/handwriting-duplicate-decision-after-fix.log`。
- 全量单元测试：**846 项，832 通过、14 项原有条件跳过、0 失败**。记录：`.artifacts/handwriting-duplicate-decision-full-unit.log`。ESLint、`git diff --check` 通过。
- 新增两个真实 KV 场景：先真实创建一条同班同科同日同正文作业，实际 OCR 后确认相同正文并离线排队；联网得到真实 409，使用实际“确认仍然提交”按钮。分别模拟提交前 503，以及真实事务成功后丢失回执，再离线刷新 PWA、自动补传。两种情况最终均为原作业加一条明确要求重复发布的新作业，只有各自一版修订，没有第三条重复记录；请求编号和确认标志跨刷新保留。
- 两项新增场景先单独通过；最终原生临时 PostgreSQL、真实 KV、正式 PWA 构建的完整回归 **31 通过，0 失败、0 跳过、0 flaky**，浏览器阶段约 172 秒。包括原有切班、草稿恢复、复用、真实版本冲突、登录/凭证切换、离线补传、丢回执及跨窗口队列场景。最终原始结果：`.artifacts/handwriting-kv/074df7ec2d274d26b76bff5552b6852d/result.json`；新增场景单独结果：`.artifacts/handwriting-kv/61b95030f3d34091b868cf85aed4b7b7/result.json`。
- 请求、数据库正文/修订、审计、本机草稿和补传队列继续校验只有已确认文字，没有笔迹、图片或未确认识别结果。教师端离线保存仍保留当前正文，联网后明确重试，没有新增教师离线发布队列。
- 针对最终候选目录 `dist-e2e/handwriting-kv/074df7ec2d274d26b76bff5552b6852d` 的 PWA 构建校验通过。`sourcesStable`、`generatedClientRestored`、`clusterStopped`、`clusterRemoved` 均为 `true`；临时集群目录不存在，51970/60129/58014 三个本次端口没有监听。未使用 Docker、既有数据库或真实学校配置。

## 证据边界

提交前 503 和丢回执是受控故障注入；重复检测、提交、幂等回放和数据库核对使用真实本地 KV。生成字体用于触发真实模型流程，不代表真人新笔迹准确率验收。

本轮未改模型、Worker、缓冲或触控事件，不宣称新的内存、耗时或准确率改善。DPR2/触控能力模拟不替代实体触控、实际 Windows 显示缩放或安装 PWA 的人工验收；无需将网页缩放设为 200%。人工验收与部署均未完成。
