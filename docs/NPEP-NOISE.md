# N4.2 噪音监测互联

2026-10-01 当前：学校排程下发与执行已接入，任务卡见相邻 NPEduTools 的 `docs/npep/N4.3c-SCHEDULE-EXECUTION-20261001.md`。报告来源收尾见 `docs/npep/N4-REPORT-SOURCES-20261001.md`；本地实现和模拟验证完成，真实排程联调待做，未部署。

大屏入口：班级工具 → 噪声监测。学校后台入口：NPEP 设备互联 → 噪音报告。

原生接管后，网页只控制对应绑定的 NPEduTools、显示状态和报告，不调用浏览器麦克风。旧网页定时监测停用；新版桌面接收学校排程并按 ClassIsland 时间执行。网页关闭不停止桌面；失联显示未知，不自动回退浏览器采集。未接入原生设备保留网页实现。

`nativeNoiseController.js` 管理提供方、请求和失联；`NoiseScheduleManager.vue` 阻止旧采集；`NativeNoisePanel.vue` 展示本机状态；`NpepNoiseReports.vue` 提供后台报告查询。接口统一放在 `classworksV2Client.js`。大屏使用自己的凭据，不能调用管理员接口或取得桌面密钥。

启动前先应用 KV 的 `20260930000000_npep_noise` 迁移；桌面保存麦克风并保持同一绑定，然后网页开始／停止。统计为 dBFS，不是已校准声压级；不上传录音。

统一验收：相邻 NPEduTools 仓库 `scripts/test-npep-noise.ps1 -Browser -Database`。完整任务卡：`NPEduTools/docs/npep/N4.2-NOISE-TAKEOVER.md`。本轮未推送、未部署，真实麦克风待人工验收。

报告共用 `NoiseReportList.vue`，由 `noiseReportSources.js` 按 0.6 报告会话编号关联 0.7 排程来源，显示学校时段及历史规则提示；未匹配时标为“来源未确认”，不假定手动。排程及来源统一测试使用 `scripts/test-npep-noise-schedules.ps1 -Browser`，兼容 PowerShell 5.1。
