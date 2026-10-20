# 手写正文接入整理与复验

本地正式页面已接入；本轮整理依赖、补齐凭证边界与交付检查。尚未推送、部署或进行实体一体机验收。

## 源码与依赖

| 范围 | 源码 |
| --- | --- |
| 前端目标 `main`（已 fetch） | `ce618624e9664bf6442b5e007e21200f25583a34` |
| 本次通过的运行候选 | `codex/handwriting-integration-20261020`，`0ad45153dd31c88a405a8238843b19d95e7ca53e`，测试前后工作树均干净 |
| 原手写分支（完整保留） | `codex/handwriting-kv-validation-20261020`，`c464c4fbf00b327099d0da710fcf9eb889ba16ee` |
| 排除的无关修复 | `17a10ef` 考试计划错误提示、`1be26c8` 账号列表响应归属；另保留为 `codex/admin-sync-fixes-20261020` |
| 真实 KV 复验 | `main` 的 `ca0944ef3a2ce4b57620219895cf74a05ff3a551`，独立工作树 `D:/CodeProjects/Research/handwriting-integration-kv-main-20261020` |

原 KV 工作树仍为 `codex/manual-study-homework-20261020` / `385db88547f0a12dd4a848366743a98dab4eaef2`，原有内容未变。手写接入不依赖该分支的自习作业接口，也不需要数据库模型、迁移或新权限。NPEduTools、NPEssentials 和独立 Research 手写样例未改动。

手写提交应用到前端当前 `main` 时无文本合并冲突。大屏和教师仍共用输入适配器、懒加载编辑器及一套 r19 识别实现；历史复用继续共用教师编辑器。确认后只进入既有必做/选做文本字段、草稿、版本冲突和大屏离线队列，不另建保存通道。

## 本轮修复与检查

- **教师跨窗口登录边界**：先以浏览器反例复现，另一窗口更换登录刷新令牌后，旧选区仍可插入。现在用当前登录身份和跨窗口变化序号撤销旧选区，切回原登录也不能复活；原正文保留。正常访问令牌续期不撤销选区。真实 KV 新增两种重新登录及一次真实 `/accounts/refresh` 后保存的回归。这证明编辑归属修复，不代表发现了服务端越权。
- **按需加载**：新增大屏/教师两项检查；键盘录入、打开手写区、书写及未识别就返回，模型资源请求和识别 Worker 均为零。
- **PR 回归**：新增独立的原生 PostgreSQL 作业，针对上述 KV `main` 固定提交运行手写用例；本地 Edge 与 Linux Chromium 的选择分开。工作流 YAML 已解析检查，远端 CI 尚未执行。
- **隔离工具端口**：一次复验被系统随机分配到 Chromium 禁用的 `6566`，保存测试未能打开页面。已修正为保留互不冲突的动态私有端口；四项测试覆盖可交付端口、被占用时重选、部分失败释放和拒绝不合范围的候选。没有给浏览器添加安全限制豁免。

## 候选验证

以下针对 `0ad45153dd31c88a405a8238843b19d95e7ca53e`；本记录及计划更新是其后的纯文档提交。

| 检查 | 结果与本地记录 |
| --- | --- |
| 全量 Node 测试 | 823 项：809 通过、14 项既有条件跳过、0 失败；`.artifacts/handwriting-integration-final-unit.log` |
| 浏览器正式构建、真实模型、模拟 HTTP 后端 | 32 通过、无跳过/重试；`.artifacts/handwriting-integration-final-browser.json` |
| 真实 KV + 原生临时 PostgreSQL | 22 通过、无跳过/重试；`.artifacts/handwriting-kv/92b51020327d4b59b8b7336fef9dc460/result.json` |
| PWA 交付检查 | 显式检查上述 KV 用例的实际候选构建目录，通过；`.artifacts/handwriting-integration-pwa-validation.log` |
| ESLint / Git 空白检查 | 通过 |

KV 检查包含必做/选做保存、草稿刷新、历史复用、切班、真实 409、大屏断网补传与响应丢失去重、保存/补传途中换凭证，以及教师换登录与正常续期。请求、正文、修订、审计、草稿及补传队列均核查文字边界。通过结果记录 `sourcesStable`、`generatedClientRestored`、`clusterStopped`、`clusterRemoved` 均为真。失败端口那次的日志和已停止临时集群另留作诊断，未当作业务通过证据。

## 性能边界

r19 的权重、FP32 精度、语境规则、输入缓冲和空闲规则均未改。仍为单推理 Worker，资源准备 Worker 在推理前退出，不用强制 GC 或提前释放制造结果。32 项浏览器检查中的四种 CSS 宽度/DPR2 触控、取消、后台中断、多窗口竞争和关闭后无工作线程均通过。

固定生成字体样例 16 组、48 次请求的原始/语境输出均与既有期望一致；本次操作耗时 p50 233 ms、p95 342 ms，模型阶段 p95 242.6 ms，帧间隔 p95 7.3 ms。完整自有 Edge 进程组 PrivateBytes 在打开前约 588.5 MiB、请求结束后的采样最大约 768.1 MiB、关闭后约 608.2 MiB。这不是推理瞬时峰值、OCR 独占内存或同条件内存 A/B，也不能据此声称消除了耗时长尾或全部内存回落。

实体一体机的真人新笔迹、Windows 200% 缩放、实际触控和已安装 PWA 仍待现场验收；生成字体、CDP 触控和本机数据库通过不替代这些验收。正式启用顺序见 [接入计划](handwriting-production-rollout-plan.md)。
