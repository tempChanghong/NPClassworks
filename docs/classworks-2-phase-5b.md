# Classworks 2.0 第五阶段 B：前端生产容器

前端新增两阶段 Docker 镜像：Node/pnpm 负责构建 PWA，最终镜像仅包含 Nginx 与 `dist` 静态文件。

生产构建将 `VITE_DEFAULT_KV_SERVER` 和 `VITE_DEFAULT_AUTH_SERVER` 都设置为 `https://cs.newfires.top`。新版 API、旧 UUID/KV、OAuth 与 Socket.IO 因此默认使用同域地址，避免教师在不同浏览器中额外配置服务器。

Nginx 缓存策略：

- 带内容哈希的 `/assets/` 缓存一年并标记 `immutable`；
- `index.html`、`sw.js`、`registerSW.js`、`sw-cache-manager.js` 不长期缓存；
- 未匹配的页面路径回退到 `index.html`，支持 Vue Router 直接访问 `/classworks-2`。

公网 TLS 和后端路径分流由相邻 NPClassworksKV 仓库中的 Caddy/Compose 负责，前端容器自身不对公网暴露端口。完整步骤见后端 `docs/classworks-2-phase-5b.md`。
