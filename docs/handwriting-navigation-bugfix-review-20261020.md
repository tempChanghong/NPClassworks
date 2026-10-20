# 手写正文接入：切页与迟到回执复验

2026-10-20。本轮确认并修复两类异步归属缺陷，覆盖普通保存、冲突另存、生成新版本和冲突重载。只做本地提交与隔离验证，未推送、未部署。

## 源码范围

- 前端：`D:\CodeProjects\NPClassworks`，`codex/handwriting-integration-20261020`，起点 `bae2b66c9b776ccbcc8fc1976e6309010df18783`，起始干净。
- 修复提交：`83a527156024236cb834e3f53e1da58caf433929`；测试拦截修正：`007f04b91d71107da5ae151df946b05b8c3c6e69`。最终真实 KV 联调针对后者的干净源码，前后指纹一致；本文在验证后补记。
- 联调 KV：`D:\CodeProjects\Research\handwriting-integration-kv-main-20261020`，主分支快照 `ca0944ef3a2ce4b57620219895cf74a05ff3a551`，未修改业务源码。没有要求合入其他功能分支的后端修改。
- 原 KV 工作区 `D:\CodeProjects\NPClassworksKV` 保持 `385db88547f0a12dd4a848366743a98dab4eaef2`，结束时干净。NPEduTools、NPEssentials 未修改，已有其他分支和改动保留。

## 旧保存完成后误清新草稿

位置：`src/components/v2/ScreenHomeworkDialog.vue`，`save`、`saveConflictCopy`、`applyLocalOnLatest`。

触发：保存请求未返回时，经 SPA 路由离开作业板，再返回并打开新的录入窗口、确认新的文字。同一文档内重新打开的窗口使用相同草稿键；旧组件销毁后，原异步函数仍可能继续运行。

实际后果：旧保存回执会清除新窗口刚写入的草稿。新正文可能仍显示在编辑框，但关闭重开或刷新后无法恢复。普通保存、冲突另存和生成新版本三个交互反例，修复前都能复现新草稿变为不存在。

修复：请求固定原窗口的草稿代数、存储包装对象和绑定/凭证身份；完成保存、处理冲突及失败回退时重新检查。窗口关闭、销毁或草稿重载后，旧回调不能清除草稿或发出当前编辑器的完成事件。服务器已经接受的旧提交不回滚，继续保持请求编号与离线补传的去重规则。

证据：三个 Vue/Axios 交互反例修后通过。新增两个真实 KV 场景保留同一个浏览器文档，真实提交成功后分别延迟成功回执、丢弃回执；返回后确认的新草稿均能关闭重开恢复，数据库最终只有一条原提交、一版修订，新草稿没有偷偷落库。

## 迟到的最新版覆盖已确认文字

位置：同组件的 `reloadLatest`，以及冲突处理中的最新版读取。

触发：已确认手写正文，发生版本冲突并选择载入最新版；GET 请求等待期间绑定或凭证变化，旧请求随后返回。

实际后果：旧结果仍替换当前编辑框中的确认文字。修复前反例能复现编辑框被旧范围返回的正文覆盖；该反例的本机草稿仍在，不把它描述成磁盘草稿永久丢失或跨班落库。

修复：复用上述归属检查，确认框返回后和 GET 完成后均复查。原窗口仍存在但身份已变化时，保留当前文字并提示关闭后重新打开录入。

证据：交互反例修前失败、修后通过。真实 KV 验证有效令牌在 GET 等待期间更换，迟到响应没有覆盖确认文字或草稿，服务器仍保留远程第二版。该精确延迟 GET 用例单独禁用 Service Worker，避免它自行发出的请求绕过 `page.route`；其余离线/PWA 用例继续使用实际 Service Worker。初次新增测试卡在未命中的拦截点，调整测试后完整重跑通过，没有放宽业务断言。

## 隔离验证

- 新增四个交互反例；相关交互组 **14 项通过**。修前/修后原始记录：`.artifacts/handwriting-navigation-before-fix.log`、`.artifacts/handwriting-navigation-boundaries-before-fix.log`、`.artifacts/handwriting-navigation-boundaries-after-fix.log`。
- 全量单元与交互测试：**830 项，816 通过，14 项原有条件跳过，0 失败**。记录：`.artifacts/handwriting-navigation-full-unit.log`。
- 原生临时 PostgreSQL、真实 KV、正式 PWA 构建：**25 通过，0 跳过、0 flaky**，浏览器阶段约 132 秒。结果：`.artifacts/handwriting-kv/2f467146f08340958ddc4d13712a2dae/result.json`。
- 浏览器与真实模型回归：**32 通过，0 跳过、0 flaky**。结果：`.artifacts/handwriting-navigation-browser-results.json`。包含编辑器下载中切班、草稿、实际离线缓存、撤销/再次确认、后台中断、跨窗口竞争、四档 CSS 宽度的触控模拟，以及 16 组固定生成字样的 48 次新识别；原始及语境结果继续符合 r19 基线，关闭后没有残留 Worker。
- `pnpm run lint:check`、`git diff --check`、针对本次真实 KV 构建目录的 `validate-pwa-build.js --dist dist-e2e/handwriting-kv/2f467146f08340958ddc4d13712a2dae` 均通过。
- `sourcesStable`、`generatedClientRestored`、`clusterStopped`、`clusterRemoved` 均为 `true`；另核对临时集群目录不存在，本次三个端口没有监听。

请求、数据库正文/修订、审计、本机草稿和补传队列继续检查仅包含确认文字，不保存笔迹、图片或未确认结果。教师端仍保留离线失败后保留正文、联网手动重试的行为，没有新增离线发布队列。

本轮没有修改模型、输入缓冲、触控事件或重试阈值，也没有声称新的内存/耗时改善。生成字体及 DPR2/CDP 触控属于自动化证据；实际 Windows 缩放下的可用视口、真人新笔迹、实体触控及安装 PWA 仍待人工验收，不要求把网页缩放设为 200%。
