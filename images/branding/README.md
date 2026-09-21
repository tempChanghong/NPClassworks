# NPClassworks / KV 暖橙图标

2026-09-21。沿用 NPEduTools 抽象 n／书页标志的贝塞尔几何与小尺寸结构，仅换为暖橙。NPEduTools 青绿母版和程序资源均未修改。参考 `C:/Users/Changhong/Downloads/download.png` 已查看：1254×1254 RGBA，存在边缘杂色与碎点；没有描摹或嵌入参考位图。

## 文件与颜色

| 文件 | 用途 |
| --- | --- |
| `npclassworks-logo.ai` | Illustrator 2026 原生可编辑母版，4 个画板，11 条路径、90 个锚点；无栅格或置入对象 |
| `npclassworks-logo.svg` | 透明标准版，4 条路径、28 个锚点 |
| `npclassworks-logo-small.svg` | 透明简化版，3 条路径、22 个锚点；用于 16–64 px |
| `npclassworks-logo-mono.svg` / `npclassworks-logo-mono-light.svg` | 深／浅单色，2 条路径；透明留白，浅版的白色只填充标志本身 |
| `npclassworks-logo-maskable.svg` | 可编辑安装图标，有不透明底色及安全边距，不能代替普通透明标志 |
| `safari-pinned-tab.svg` | 全黑透明矢量模板，由网页 `mask-icon` 的暖橙颜色着色 |
| `npclassworks.ico` | 16、24、32、48、64、256 六帧；16–64 使用简化版，256 使用标准版 |
| `png/npclassworks-{尺寸}.png` | 标准版 180、192、256、512、1024；简化版 16、24、32、48、64，均为透明 RGBA |
| `png/npclassworks-{small,mono,mono-light}-*.png` | 简化结构对照及深浅单色 PNG |
| `png/apple-touch-icon-180x180.png` | 独立不透明 Apple touch 图标 |
| `png/maskable-icon-*x*.png` | 独立不透明 maskable：192、512、1024；网站实际声明 512 和 1024 |
| `png/social-icon-512x512.png` | 社交分享预览图标，独立不透明底色 |
| `npep-family-preview.png` | 青绿／暖橙并排、深浅背景小尺寸及安装图标裁切预览；由实际 PNG 合成 |
| `source/` | 控制点、制作脚本、Illustrator 导出、核验 JSON 和浏览器截图 |

最终颜色：主色 `#D97732`、深折面 `#A94E24`、浅书页 `#F2B56B`；单色 `#202E35` / `#FFFFFF`；安装与分享图标底色 `#FFF7ED`。SVG 和 PNG 实际纯色像素均核对过。没有改变应用主题色。

## 实际接入

- 替换 `src/assets/{logo.svg,logo.png,cslogo.png,favicon.ico}`、`public/favicon.ico`、原有 `public/pwa/image` 标志、PWA 64/192/512、Apple touch、maskable、Safari 图标。
- `index.html` 使用简化 SVG favicon，保留多尺寸 ICO 回退；Safari 着色更新为主色；分享图片切换为对应 512 图标。
- `ClassworksOobe.vue` 欢迎标志和 `settings/AboutNpClassworks.vue` 产品标志使用标准 SVG；关于页增加 `object-fit: contain` 防止拉伸。404 页已有引用自动采用新图。
- `notificationAlerts.js` 保留普通通知图标路径，badge 改为透明单色图标；`vite.config.mjs` 新增 1024 maskable 声明，既有 manifest 身份、启动路径、主题及业务配置保持原值。
- KV 的 `views/index.ejs`、`public/auth-success.html`、`public/auth-error.html` 使用同一简化 favicon 和 ICO。KV 没有独立 PWA、Apple touch 或 maskable 入口，未添加无关界面或 manifest。
- 组织的“星火动力”标志、README 组织署名、历史 `artifacts/{original-site-icons,new-site-icons}` 和 `images/Logo.*` 保留。它们不是本次产品运行图标；旧 banner 保留原文件，当前分享元数据已不再引用它。

完整运行资源复制映射见 `source/integration-map.json`；KV 资产与前端相应母版字节一致。

## 验证结果

- 保存的 AI 已关闭并重新打开；四个 SVG 重新导入 Illustrator，256 px 渲染与母版导出的相应 PNG 逐像素一致。
- 四种 SVG 的路径数据与青绿版本完全相同，无嵌入位图；中央及外侧为透明留白。标准／简化色面分别为 4／3 条路径。
- ICO 六帧重新解码后，与对应 PNG 的 RGBA 字节完全一致；小尺寸透明开口已检查。深浅背景预览无参考图杂色碎点或白色遮挡。
- Maskable 标志缩放为普通画布的 68%。512 px 前景最远半径为 200.61 px，小于 204.8 px 安全半径；1024 px 为 401.17 px，小于 409.6 px。独立检查了透明前景与不透明背景。依据 [W3C 安全区规范](https://www.w3.org/TR/appmanifest/#icon-masks)；Safari 模板参照 [Apple 文档](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/pinnedTabs/pinnedTabs.html)。
- `pnpm run build`、`pnpm run pwa:validate` 通过；修改的 Vue/JS/Vite 文件定向 ESLint 通过；`notificationAlerts` 和 `pwaApiCachePolicy` 现有测试 21/21 通过。
- 本地 Edge 浏览器验证欢迎页／关于页、图标加载、manifest 尺寸、激活的 service worker，以及实际“安装”入口。CDP `Page.getInstallabilityErrors` 为空；16 个前端/KV公开资源逐 URL 返回 200 且与源资产 SHA-256 一致，前端资源已进入新构建 precache。
- KV 使用隔离的 Express 静态资源／EJS 模板夹具验证三张现有网页的图标引用与资源响应，不启动数据库或生产业务服务。KV 没有前端构建步骤。

## 已知限制与发布状态

浏览器 manifest 检查仍报告既有 `cs://` 协议不属于 Chromium 网页允许列表，该协议处理条目被忽略（2 条非关键诊断）；未因换图标改变原有协议契约。安装资格检查通过。构建亦有现存浏览器兼容数据过期提示，无图标构建错误。

未实际安装 PWA，未在实体 Apple/Android 设备上核验；已验证安装入口、规范安全区和裁切预览。KV 未运行需要数据库的完整业务回归，因为变更仅为静态图标与页面 head 引用。

图标制作任务最初保留未提交改动；随后发布准备复核将结果整理为 `codex/npep-n1-admin-ui` 与 `codex/npep-n1-server` 的本地功能分支提交，未推送、合并、Release 或部署，未启用 NPEP。后续发布审批仍由主管任务负责。

发布准备补充验证：完整 `pnpm lint:check` 发现并修正制作工具纳入检查的问题——只排除两份使用 Adobe `#target` 指令的 ExtendScript，校验脚本显式导入 Node Buffer 并通过 globalThis 使用浏览器 API。完整 Lint 现已通过；17 组运行文件与母版映射、16 份已做 HTTP 验证资源的当前 SHA-256、现有构建副本及 KV 三页引用再次核对一致。因此沿用上述构建、PWA 和浏览器验收，不重复生成资产或启动数据库。新的最终提交组合仍需 GitHub 托管 CI；此前 N1 托管结果对应换图标前的提交。

`.gitattributes` 将本目录 `.ai` 明确标记为二进制，避免 Git 换行转换破坏 Illustrator/PDF 内部字节偏移；暂存对象与原文件无过滤哈希一致。仅清理两份制作脚本的末尾空行，母版与导出资产未重新生成。

## 重建

`build_vectors.py` → Illustrator 执行 `build-illustrator.jsx` → `package_assets.py`。几何源保存在当前目录的脚本和 JSON 中；打包时只读相邻 NPEduTools 仓库作一致性对照。运行文件复制按 `integration-map.json` 完成。重建会覆盖本套生成资产，人工修改母版前请另存版本。

`verify-illustrator.jsx` 应在单独打开保存的 AI 后执行；避免在同一 Illustrator 脚本里关闭最后文档并立即重开（30.7 曾出现宿主崩溃）。
