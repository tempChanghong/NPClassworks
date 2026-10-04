# 学校设备运维概览

2026-10-04。入口：**学校管理 → 大屏设备 → 打开 NPEP 设备互联**。

顶部显示本校全部登记、在线、待检查和非授权登记。点击计数筛选，输入设备、班级或大屏名称并提交搜索；逐台设备沿用考试模式、考试方案、噪音报告和详情入口。全校计数不会随着翻页或搜索缩小，列表另标注匹配总数与已加载数。

在线只表示最近一分钟收到上报；“待检查”用于定位失联、未上报或当前模式对应的软件状态，不代表命令失败。页面注明观测时间，超过一分钟提示刷新。历史非授权登记与在授权设备的运行问题分开。

组件：`NpepDeviceOverview.vue`。读取与生命周期：`useNpepManager.js`。数据校验与检查原因文字：`npepDeviceOverview.js`。后端接口与字段定义见 [KV 契约](../../NPClassworksKV/docs/NPEP-DEVICE-OVERVIEW.md)。

刷新失败保留旧快照并禁用设备操作；401／403 或账号上下文失效清空数据，跨校与关闭面板后的迟到响应不会重新填入资料。旧服务没有接口时继续使用原设备列表，但明确提示它不是全校汇总。

验证入口：

```powershell
node --test tests/npepDeviceOverview.test.js tests/npepDeviceOverviewFlows.test.js
pnpm exec playwright test tests/e2e/admin-screens.spec.js --grep NPEP
```

另在 `tests/fullstack/npep.spec.js` 中增加真实网页／API／PostgreSQL 的概览、名称搜索、筛选和撤销后归档检查。此次本地运行使用独立临时 PostgreSQL 集群，通过显式 `FULLSTACK_DATABASE_URL` 提供给现有 fullstack 入口，不使用 Docker、不访问生产或现有调试库。

任务与本轮结果见 [跨项目任务卡](../../NPEduTools/docs/iterations/NPEP-DEVICE-OVERVIEW-20261004.md)。未推送或部署。

概览的“导出诊断摘要”下载本地 JSON，只包含当前已加载设备的状态与归属编号（最多 200 台），明确标注观测时间、过时状态和分页限制；不含设备名称、配对码、凭据或搜索词。可与 NPEduTools 学校互联页面导出的摘要对照。字段边界与排查方法见 [诊断任务卡](../../NPEduTools/docs/iterations/NPEP-DIAGNOSTIC-HANDOFF-20261004.md)。
