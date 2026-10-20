# NPClassworks / KV 收尾与整体复验

2026-10-20。完成本机可执行的计划收尾，复验发布、复制、草稿、版本、离线补传、名册、账号和 NPEP 管理主要链路。仅本地分批 Commit，未推送、创建 PR、运行远端 CI 或部署。未使用 Docker、真实学校配置或现有数据库。

## 源码与计划收尾

- 前端起点：`D:\CodeProjects\NPClassworks`，`codex/handwriting-integration-20261020`，`f022493c232a9f4c2d904e5e1e209a7772d38373`；起始干净，原分支完整保留。新建 `codex/classworks-quality-20261020` 承接本轮综合检查，包含原手写代码与本轮通用修复，不将其称作纯手写候选。
- KV 起点：`D:\CodeProjects\NPClassworksKV`，`codex/manual-study-homework-20261020`，`385db88547f0a12dd4a848366743a98dab4eaef2`；起始干净，原分支保留。新建同名质量分支；本轮业务候选为 `eb25f04c3f2bbf28d4f81a1a9193f5f20f80a950`。起点已有的手动自习作业读取修复不是本轮新增改动。
- 前端业务及核心联调候选：`fb0a06b85153b34abcd8a8c77322d145140c208b`。最终手写完整回归针对 `42ff28f4d34b5d96ce870b7b4643b96b7c4ee584`；两者差异只有手写联调测试，业务代码一致。本文及计划更新在验证后补记。
- 已收束两项此前从手写范围分离、保存在 `codex/admin-sync-fixes-20261020` 的修复：考试查询恢复后残留错误提示，以及切换学校/重复查询时本地账号列表接受旧响应。分别以 `1553f94`、`6139069` 带入并复验，原独立分支保留。
- 手写正式表单入口、文字保存和自动回归已接入；人工入口启动冒烟再次通过，`humanAcceptance` 仍为 `PENDING`。实体一体机新笔迹、真实触控、实际 Windows 显示缩放及已安装 PWA 验收仍需现场完成。个人笔迹记忆、其他表单字段不属于本次正式接入范围。
- 没有修改数据库模型、迁移、识别权重、语境规则、Worker、触控或 NPEduTools/NPEssentials。原 KV `main` 的手写联调快照未修改；本轮综合测试直接采用上述实际 KV 候选。

## 新增确认与修复

1. **整日复制提前展示未到发布时间的作业**。位置：KV `services/publicationService.js` 的 `copyScreenBoardDate`。原查询只过滤 `PUBLISHED`，没有限制 `publishAt`，复制时又将发布时间改成当前时间。真实 HTTP 反例原本复制出两项（可见作业及定时未展示作业），预期只有一项。现在来源查询沿用大屏可见时间限制；草稿不复制、重复复制不新增、原定时记录及版本不变。后端 `eb25f04` 加入原生数据库回归，前端 `board-copy-visibility.spec.js` 验证真实接口；未改用户排程或默认时间。
2. **管理员创建回执使用后续表单值，并清空新草稿**。位置：前端 `useAdminAccounts.js`。输入框在保存中仍可编辑，旧代码收到成功后从当前字段生成凭据，可能导出错误 PIN/姓名。现在固定实际提交的学校与输入，仅在字段未改变时清空；迟到回执不向另一学校发布凭据或覆盖新草稿。真实页面测试在请求已由 KV 成功处理、回执延迟期间修改字段，再下载 CSV，核对导出的实际提交值和数据库账号。
3. **页面关闭后的账号确认仍能发送请求**。同一组合函数的重置 PIN、启停用及注销操作，原确认框等待结束后没有复查页面/学校归属。现在在确认前、确认后与回执处理前共用归属判断；显式撤销操作继续使用原学校。忽略迟到回执不会回滚服务器已完成的创建或修改。

管理员两组新反例共六项，修复前均失败：`.artifacts/classworks-quality-admin-before-fix.log`；修复后连同原账号/考试组共 **22 通过**：`.artifacts/classworks-quality-admin-after-fix.log`。账号修复为 `da597a2`，真实凭据导出回归为 `fb0a06b`。

复制反例原始记录：`.artifacts/quality-review/006f54acdc5b49df9c25b04f3841e7b4/`，期望一项实际两项；修复后两项新增真实联调通过，记录 `40a0118eb42f42409f7ad4b45f5e08e3`。上述均为隔离复现，不据此认定现场已发生。

## 最终验证

原始结果均位于前端 `.artifacts/quality-review/<编号>/result.json`。

| 检查 | 结果 | 编号或日志 |
| --- | --- | --- |
| 前端全量单元 | 869 项，855 通过、14 项原有条件跳过、0 失败 | `.artifacts/classworks-quality-full-unit.log` |
| KV 全量单元复验 | 607 项，587 通过、20 项数据库条件跳过、0 失败 | KV `.artifacts/quality-unit-final.log` |
| 原生 PostgreSQL 业务套件 | 142 项，137 通过、5 项依赖桌面验收程序的检查跳过、0 失败 | `a20eee0528a54f1cbdb2431da74d47ac` |
| 网页主要流程，真实 API/数据库/Socket.IO/PWA | 39 通过，无跳过、重试或 flaky | `31c897e8e4614ddaa72e9a586bce1581` |
| NPEP 管理页面真实配对、现场确认协议、上报和撤销 | 1 通过，无跳过或重试；客户端为测试协议请求 | `5a181c2233f14323a7d3212dbd67f9f7` |
| 人工入口启动冒烟 | 1 通过；两个角色可打开，人工结论仍待填 | `a94403b8d334497993b2e6c9564c4b0b` |
| 最终手写保存完整回归 | 39 通过，无跳过、重试或 flaky，约 207 秒 | `d0ab90e75bd74b9799da2b475a5102aa` |

两份实际候选目录 `dist-e2e/handwriting-kv/31c897e8e4614ddaa72e9a586bce1581` 和 `dist-e2e/handwriting-kv/d0ab90e75bd74b9799da2b475a5102aa` 的 PWA 构建校验通过。ESLint、Git 空白检查通过。本机 Node 为 v24.14.1。

### 测试边界与清理

- 首次手写完整组有一项在目标竞态开始前超时：按标签页 CDP 模拟断网时，首次 POST 没有 HTTP 响应，共享 Service Worker 会耦合两页的模拟网络。`42ff28f` 只对这两个 HTTP/队列竞态用例隔离 Service Worker；专门的离线识别、刷新与补传测试继续使用真实 Service Worker。数据库结果、原请求编号与请求次数断言未放宽。两项各连续通过两次（`fa8c9f9719a84da9924014626844c1de`）后，完整 39 项再次通过；首次失败 `d3923cea3a13416e824cf4b6cc8309a5` 未算通过。
- 原生数据库首次运行包含一项依赖 Docker Compose 部署脚本的 `backupRestoreDatabase`，在环境前置检查失败，尚未调用 Docker。该项在本轮明确未验证，未伪造 Compose 环境。其余 137 项原生业务检查重新通过；五项实际 .NET 传输检查因本轮未提供验收 DLL 跳过。不能将这些结果称作完整 Docker 恢复、实际桌面设备或生产验收。
- 隔离脚本保存在 `D:\CodeProjects\Research\classworks-quality-20261020\run-native-quality.mjs`，由既有手写原生集群工具复用生成文件保护与端口分配逻辑，支持 `database/core/npep/smoke/handwriting`，结果记录脚本 SHA256。它只管理自有临时集群。
- 五项最终通过记录的 `sourcesStable`、`generatedClientRestored`、`clusterStopped`、`clusterRemoved` 全为 `true`；集群目录不存在，本次各套件端口无监听，前后端工作区恢复干净。失败复现的集群均已停止，保留诊断，没有当成已清理或通过。
- 手写请求、正文/修订、审计、本机草稿与队列继续核对只保存已确认文字。生成字体和 DPR2/CDP 触控模拟不能替代真人识别与实体设备验收；本轮不宣称识别准确率、内存或耗时改善。

后续剩余为现场验收，以及获得对应授权后的 PR、远端 CI 和启用流程。完整回归通过不等于已合并或部署，也不代表穷尽所有缺陷。
