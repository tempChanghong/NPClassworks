# 手写正文接入：历史与模板复用的登录交接复验

2026-10-20。本轮继续检查切班、草稿、版本冲突和离线补传，修复复用流程中的两处登录归属遗漏。保持本地修改与分批 Commit，未推送、未部署。

## 源码范围

- 前端：`D:\CodeProjects\NPClassworks`，`codex/handwriting-integration-20261020`，起点 `6b6a3d1a51ed247686c8aed66329de24059e95f0`，开始时干净。
- 异步归属修复及六项交互回归：`6090321085cd447cada2ec67d953929dca62c780`；旧模板选择及预览关闭：`07f2bfa532d7878cac22c1f63c297f315ae3b179`；真实 KV 回归：`4b42e7473279879a946bda4bce56efec22ff0ee8`。
- 完整联调针对 `4b42e7473279879a946bda4bce56efec22ff0ee8` 的干净源码，前后指纹一致；本文在验证后补记。
- 联调 KV：`D:\CodeProjects\Research\handwriting-integration-kv-main-20261020`，主分支快照 `ca0944ef3a2ce4b57620219895cf74a05ff3a551`。原 KV 根工作区仍为 `385db88547f0a12dd4a848366743a98dab4eaef2`，结束时两个位置均干净。本轮未修改后端业务源码、模型、迁移、NPEduTools 或 NPEssentials。

## 已确认并修复

1. `src/components/v2/TeacherHomeworkReuse.vue`：读取历史作业期间，另一个窗口更换登录，当前工作台的账号/版本尚未重新加载时，旧 GET 回执仍可打开复用队列；另一个窗口随后恢复原登录也存在同样问题。现在用刷新令牌及跨窗口凭证变化代数共同判断归属，登录变化关闭原复用流程并撤销等待结果，正常访问令牌续期继续完成。这里没有新增历史复用的自动发布行为。
2. `src/components/v2/PublicationComposer.vue`：等待“替换当前作业内容”确认期间发生同样的登录交接，原确认仍可用旧模板替换已确认的必做/选做手写文字；旧模板选择及预览窗口也没有及时撤下。现在模板替换复用已有 `captureEditor` 归属及表单快照判断，凭证变化同时关闭旧模板与预览，保留正文；仅访问令牌续期时仍可正常替换。

以上是本地可复现的前端归属错误，不代表学校现场已发生或服务端授权被绕过。关闭旧流程不会回滚服务器已经完成的请求，也没有为教师端新增自动持久化或离线发布队列。

## 验证

- 六项新交互回归分别覆盖更换登录、换回原登录、正常访问令牌续期。首轮反例四项失败、两个续期对照通过：`.artifacts/handwriting-reuse-session-before-fix.log`。补查旧模板选择与预览后，另外两项断言在修复前失败：`.artifacts/handwriting-reuse-session-selector-before-fix.log`。
- 最终相关交互组 **59 通过**：`.artifacts/handwriting-reuse-session-after-fix.log`；全量单元测试 **852 项，838 通过、14 项原有条件跳过、0 失败**：`.artifacts/handwriting-reuse-session-full-unit.log`。ESLint、`git diff --check` 通过。
- 新增六项真实页面/KV 场景：三个延迟真实历史 GET 的交接场景；三个实际 OCR、确认必做/选做文字、套用真实个人模板并等待替换确认的交接场景。另一个真实页面更换有效登录、恢复原登录或正常续期。更换登录时旧历史不再进入编辑器、已确认正文不被模板覆盖；续期对照照常完成。历史原记录仍只有一版，模板测试没有发布任何作业。
- 延迟历史 GET 的场景单独关闭 Service Worker，确保实际请求经过拦截点；其他离线/PWA 用例保留真实 Service Worker。延迟响应和跨窗口登录是受控操作，API、数据库及实际组件流程没有替换成模拟返回。
- 最终原生临时 PostgreSQL、真实 KV、正式 PWA 构建的完整回归 **37 通过，0 失败、0 跳过、0 flaky**，浏览器阶段约 187 秒。保留原有切班、草稿、复用、真实版本冲突、离线刷新/补传、丢回执、跨窗口队列及迟到回执场景。原始结果：`.artifacts/handwriting-kv/1cfa46040d50428b9ed2ed7289b381ed/result.json`。
- 针对该候选目录 `dist-e2e/handwriting-kv/1cfa46040d50428b9ed2ed7289b381ed` 的 PWA 构建校验通过。`sourcesStable`、`generatedClientRestored`、`clusterStopped`、`clusterRemoved` 全为 `true`；临时集群目录不存在，58765/54446/57370 三个本次端口没有监听。

请求、数据库正文/修订、审计、本机草稿及补传队列继续校验只保存确认文字，不保存笔迹、图片或未确认识别结果。本轮未修改模型、Worker、缓冲或触控事件，不宣称新的准确率、内存或耗时改善。

生成字体用于触发真实模型流程，不能替代真人新笔迹准确率验收；DPR2/触控能力模拟也不等于实体触控、实际 Windows 缩放或安装 PWA 验收。不要求把网页缩放设为 200%。人工验收与部署均未进行。
