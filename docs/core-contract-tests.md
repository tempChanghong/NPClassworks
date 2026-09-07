# 前后端核心契约检查

`pnpm test:contracts` 加载本仓库真实 API 客户端、Store 和 Socket 客户端，并启动 `NPClassworksKV` 的真实 Express 路由、service 和 Socket.IO 实现。数据库记录使用隔离夹具，连接地址强制指向不可用的本机测试地址，不会连接生产数据库。

覆盖：

- 大屏会话的响应包装、绑定与工作区结构、独立科目目录，以及前端的科目状态计算。不假设会话接口必须包含 `subjects`。
- 无效大屏令牌的 HTTP 状态和业务错误码。
- 后端每次最多 20 个工作区的订阅限制，前端 45 个工作区的分批发送、去重、最终批次事件接收、重连订阅与退订。

本地默认读取同级 `../NPClassworksKV`，也可设置 `CLASSWORKS_BACKEND_ROOT`。两仓都需要先安装依赖。检查会打印两仓 HEAD SHA；本地未提交改动也参与执行，因此本地 SHA 只标识基线，CI 干净检出标识实际测试代码。

前端 PR 和生产部署工作流均调用该检查，失败会阻止前端部署。CI 在开始时检出后端 `main`，之后使用这一固定检出，不在测试期间跟随分支变化；可手动运行并指定后端提交。记录的 SHA 对可以用于复查结果，但不等于部署代理最终选取的 SHA 对。

`pnpm test:contracts` 本身属于跨仓接口契约检查，不包含 PostgreSQL 浏览器场景。后续已在同一 CI 任务加入 `pnpm test:e2e:fullstack`，使用实际后端与隔离数据库执行三条浏览器主流程，详见[全链路冒烟测试](./fullstack-smoke-tests.md)。后端完整事务回归仍由 `test:database` 负责；没有更改服务器代理或数据库结构。
