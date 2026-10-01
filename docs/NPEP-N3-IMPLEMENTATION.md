# N3 网页入口（2026-09-26）

> 2026-09-27 更新：入口已改名“考试模式”，使用 N3 **0.4 / EXAM_MODE**；会修改 ClassIsland / ExamAware 登录自启动并保存本地考试模式。确认框、步骤与回执文案已同步。三端须配套更新，旧本机许可升级后需重新开启。以下 0.3 说明为历史；未部署新版。

入口：学校管理 → 大屏 → 打开 NPEP 设备互联 → 设备的「考试环境」。只向本校单台已授权设备申请 EXAM / CURRENT_RUNTIME，不修改 Windows 自启动。

`NpepRuntimeControl.vue` 使用 `useNpepRuntimeControl` 展示本机许可、状态及最近 20 项记录；数据请求集中在 `classworksV2Client.js` 的 `npepRuntimeApi`，固定 0.3。确认后才发送申请，模糊失败使用同一个 requestId 重试，收到创建回应只显示「已登记」。切换学校／设备或关闭面板会取消旧请求；已获开始许可的任务不能远程取消。

测试入口：`node --test --test-concurrency=1 tests/npepRuntime.test.js tests/npepAdminClientFlows.test.js tests/npepPresentation.test.js`，本轮 8 项通过；修改文件 ESLint 通过。实际 Vue／Vuetify 面板另在 Playwright 中用隔离接口验证确认、创建、排队与取消，未连接生产学校。

跨仓入口：同级 NPEduTools 的 `scripts/test-npep-n3.ps1 -Database`，同时验证实际网页请求与后端 Schema、共享样例、桌面执行与互联回归及真实隔离数据库。

网页、后端与桌面本轮源码均未推送部署。需要后端 N3 迁移及配套桌面版本才能现场控制。完整记录见 `NPEduTools/docs/npep/NPEP-N3-WEB-DELIVERY-20260926.md`。
