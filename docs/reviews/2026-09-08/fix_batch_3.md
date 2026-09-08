# 第三批修复：大屏临时退出与跨日日期

日期：2026-09-08。范围：工程报告 F4、F6。基于第二批已提交代码继续修复，仅修改前端。

结果：**fixed**。原场景与复核发现均通过回归，普通账号登录、锁定屏设置及已有发布流程保持可用。

## F4：共享设备的临时账号访问

原问题已在真实 Chromium 中复现：验证 PIN 临时退出后进入设置，推进 16 分钟仍停留在设置页。原期限及 interval 属于首页组件，卸载即失效；原返回大屏只切换显示模式，账号凭据仍可保留。

修复边界采用独立临时退出状态、App 生命周期协调、路由准入、API 凭据读写检查和同步教师状态清理。只移动首页计时器不能阻止迟到登录写回或管理页确认阻止返回。

- `screenTemporaryExit.js` 保存与 API 地址、大屏令牌和退出代次绑定的固定 15 分钟期限。刷新、到期、手动结束、绑定变化均不能把旧授权延长为新期限。
- `screenSessionLifecycle.js` 在所有路由监听计时、前台恢复、页面恢复与跨标签存储事件。到期时立即清理本机教师凭据和 Store 状态、关闭旧确认窗口并返回大屏；管理页失效界面同时隐藏，离开确认不再阻塞锁定。
- `classworksV2Client.js` 在账号请求和登录写回时检查当前期限/代次。迟到的 PIN、登录、续期及旧成功响应不能继承后一次解锁。OAuth 在大屏上还需匹配本标签发起时记录的临时退出上下文。
- 本地登出同步清凭据；使用捕获的旧令牌和 API 地址尽力请求服务端注销，不等待网络再锁屏，也不会在旧注销完成时清除后一次登录。网络失败时，本地锁屏仍生效；不能据此保证失联服务器已经撤销该会话。
- 浏览器手动刷新保留“结束临时退出并返回大屏”的既有承诺；OAuth 整页导航可沿用仍有效、同代次的退出期限。该检查没有把报告 S6 的一般 OAuth 登录 CSRF 宣称为已修复。
- 锁定屏仍可使用显示设置、屏端作业与课堂工具。大屏绑定、草稿、离线队列与噪声计划不由临时退出清理。
- 初始化使用独立 setup 授权。残留绑定不能造成首页与 `/setup` 循环；只有服务器接受初始化密钥后，才释放旧实例的大屏绑定，以继续配置新实例。

独立只读调查与一次候选复核按 `codex-security:fix-finding` 执行。复核复现的两个问题均已纳入修复：旧 PIN 响应可在另一标签手动锁回后重新解锁；残留 screen token 可与初始化重定向构成循环。新增专项测试验证旧请求拒绝、新一次主动解锁成功、初始化页面可达及合法 setup 会话继续工作。

## F6：当前日期随午夜与唤醒更新

原错误在真实浏览器中复现：跨午夜后仍显示“今天”，找不到“昨天”标签。

`useCurrentBoardDate.js` 提供共享响应式当前日，只保留一个午夜定时器，并在页面可见性、focus 和 pageshow 时校准，最后一个使用者卸载后清理监听与计时。日期导航、首页和大屏日期标签使用同一当前日。

“回到今天”采用更新后的当天日期；手动选择的历史日期不会被自动跳走。浏览器测试覆盖 9 月 8 日跨到 9 日、再模拟休眠到 11 日，并确认历史日期仍保留、点击按钮后跳到实际当天。

## 文件范围与验证

核心文件：`src/utils/screenTemporaryExit.js`、`src/utils/screenSessionLifecycle.js`、`src/utils/classworksV2Client.js`、`src/stores/classworksV2/teacherActions.js`、`src/main.js`、`src/App.vue`、`src/router/index.js`、`src/pages/classworks-admin.vue`；日期及首页接入位于 `src/composables/useCurrentBoardDate.js`、`BoardDateNavigator.vue`、`ClassroomScreenView.vue` 和 `ClassworksHome.vue`。

新增 `tests/screenTemporaryExit.test.js` 与 `tests/e2e/screen-session-lifecycle.spec.js`。现有历史测试改为按角色建立夹具；共用 localStorage 的单元测试不再假设教师与锁定大屏能同时持有独立账号会话。真实独立浏览器中的“教师发布→大屏更新”仍由完整浏览器和全链路测试验证。

| 验证步骤 | 结果与日志 |
| --- | --- |
| 修复前浏览器复现 | 日期断言失败见 `lifecycle-browser-red.log`；修正菜单定位后，跨路由到期断言失败见 `lifecycle-screen-red.log` |
| 专项会话测试 | 9 项通过，含期限、迟到登录/PIN、旧注销、新登录、非法存储、OAuth 上下文及初始化；`lifecycle-security.log` |
| 专项浏览器 | 5 项通过，含跨路由、两标签、手动返回、真实刷新、未保存管理确认、初始化及跨日；`lifecycle-browser-focused.log` |
| 前端普通测试 | 331 项通过；`lifecycle-unit.log` |
| 路由和 Socket 契约测试 | 2 项通过；`lifecycle-contracts.log` |
| 真实前后端全链路 | 持久化单会话回归及 3 项浏览器流程通过；`lifecycle-fullstack.log` |
| ESLint（无自动修改） | 通过；`lifecycle-lint.log` |
| 生产构建与 PWA 校验 | 通过；`lifecycle-build.log` |
| 完整浏览器回归 | 51 项通过；`lifecycle-browser-all.log` |

命令使用本机 Node，直接运行 `node --test tests/*.test.js`、`node --test tests/contracts/core.test.js`、`node node_modules/@playwright/test/cli.js test`、`node scripts/run-fullstack.js`、`node node_modules/eslint/bin/eslint.js . --max-warnings=0`、Vite build 与 `node scripts/validate-pwa-build.js`。日志在前端仓库根目录，由 `*.log` 忽略规则排除。

浏览器刷新专项最初被 Playwright 模拟时钟清空 navigation performance entries 的行为干扰；已拆开真实刷新与模拟休眠两个阶段，未伪造刷新判定结果。测试定位中的重复 `.v-application` 也已纠正。

本轮未修改后端、数据库结构、部署配置或 `deploy/agent/server.js`，未推送、部署或访问生产。全链路测试只使用临时 PostgreSQL，其容器和网络已由脚本清理。第三方 OAuth 服务商网络未访问；本轮验证了本地发起记录、回调接收与过期拒绝，未声称验证服务商自身策略。F5、F7 和其他剩余报告事项未纳入本批。
