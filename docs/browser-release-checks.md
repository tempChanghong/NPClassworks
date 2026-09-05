# 浏览器发布检查

生产工作流 `.github/workflows/production-deploy.yml` 在推送 main 或手动运行时，要求 `verify` 和 `browser` 两个任务全部成功，才调用部署代理。浏览器任务运行 Chromium E2E，失败时保留 7 天的截图和 trace。PR 工作流继续执行同一套测试。

本地运行：

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

测试只使用本机隔离 API。默认网页端口为 4180，API 端口为 4181。若 Windows 保留了这些端口，可以在 PowerShell 中指定：

```powershell
$env:E2E_WEB_PORT = '14180'
$env:E2E_API_PORT = '14181'
pnpm test:e2e
```

`scripts/serve-e2e.js` 在 `dist-e2e/previous` 和 `dist-e2e/next` 中生成两份生产构建。测试专用插件给 HTML 和应用入口添加不同版本标记，使入口资源哈希、HTML 预缓存修订和 Service Worker 内容真正发生变化。切换测试服务器提供的版本后，浏览器通过原有注册、安装、激活和更新提示完成升级。

升级测试覆盖：

1. 旧构建受 Service Worker 控制后，断网并通过录入按钮创建待上传作业。
2. 前端恢复联网并提供新构建，模拟独立部署的上传 API 暂时返回 503；确认作业仍未上传。
3. 等待新 Service Worker 接管，再断网，通过“立即刷新”按钮进入新版；同时检查新版 HTML 和 JavaScript 标记，确认原队列、请求 ID 和大屏凭据保留。
4. API 恢复后补传，再刷新检查：队列清空，作业只创建一次，成功上传只发生一次。

测试不会主动清缓存、注销 Service Worker 或重新注入队列。两份构建均来自当前源码，验证的是跨构建更新生命周期与现有队列格式的兼容性，不等同于任意历史版本的数据迁移测试。以后如修改队列格式，还应保留旧格式样本并增加对应迁移用例。

这些变更不修改生产 PWA 配置、部署代理或服务器配置。
