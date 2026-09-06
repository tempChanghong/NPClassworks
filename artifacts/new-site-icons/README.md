# NPClassworks 新网站图标

由 `images/Logo.svg` 确定性生成，保留原稿颜色和路径；没有改动项目现用图标或部署配置。

## 文件对应关系

`public/` 和 `src/` 按项目目标路径组织，供后续替换使用。

| 文件 | 用途 |
| --- | --- |
| public/favicon.ico | 浏览器图标，包含 16、32、48、256 像素帧 |
| public/pwa/image/favicon.ico | PWA 目录中的同内容兼容副本 |
| public/pwa/image/pwa-64x64.png | PWA 小图标和快捷方式 |
| public/pwa/image/pwa-192x192.png | PWA 应用图标 |
| public/pwa/image/pwa-512x512.png | PWA 高清应用图标 |
| public/pwa/image/maskable-icon-512x512.png | 带安全留白的自适应应用图标 |
| public/pwa/image/apple-touch-icon-180x180.png | Apple 主屏幕图标，不透明背景 |
| public/pwa/image/logo.svg | 移除编辑器标记、内联颜色并压缩标签空白后的彩色矢量版 |
| public/pwa/image/safari-pinned-tab.svg | 透明背景的纯黑单路径版本，viewBox 为 0 0 16 16 |
| src/assets/logo.svg | 页面内标志，供现有 404 页面等引用 |
| src/assets/cslogo.png | 256 像素源资源兼容副本 |
| src/assets/favicon.ico | 源资源目录中的兼容副本 |
| extras/favicon-16x16.png 等 | 小尺寸独立 PNG，方便检查或其他平台使用 |
| extras/maskable-icon.svg | 带安全留白的自适应矢量版 |
| preview.png | 小尺寸、圆形裁剪、圆角裁剪和单色预览 |
| validation.json | 生成时的验证结果 |

## 适配说明

- 普通图标保留原始构图，直接从 SVG 缩放，不经过有损压缩。
- 自适应图标采用原稿背景色 `#ff4400`。去掉原稿背景形状后，按主体实际像素轮廓计算缩放，所有可见主体像素均在中心半径为边长 40% 的安全圆内，并预留抗锯齿余量。缩放系数见 `validation.json`。
- Safari 单色版提取原稿深棕色路径，保留旋涡和星形镂空。它是针对单色显示的适配版，与彩色版的轮廓有所不同。预览中的白色仅用于演示深色背景，实际文件为纯黑透明 SVG。
- 16 像素图标细节会自然减少；当前版本保留原稿，未另行重新设计。

## 后续接入

1. 将本包的 `public/` 和 `src/` 对应文件复制到项目同路径。
2. 将 `index.html` 现有 `rel="mask-icon"` 的地址改为 `/pwa/image/safari-pinned-tab.svg`，建议 `color="#4c2107"`。
3. 现有 PWA manifest 的图标文件名、尺寸和 purpose 可以沿用。构建后检查 manifest、预缓存和图标可访问性。
4. 网站关于页的星火动力组织标志、`src/assets/logo.png` 的 Vuetify 标志不是本次替换对象。

本包仅准备资源。尚未修改在线网站，也未执行接入后的构建或浏览器更新验证。已安装 PWA 的图标更新时机由浏览器和系统管理，发布后应检查实际设备。

## 重新生成

在已安装项目依赖的仓库根目录执行：

```powershell
node artifacts/new-site-icons/generate.mjs
```

使用项目已有 `@vite-pwa/assets-generator` 依赖提供的 Sharp 和 ICO 编码器，无需安装新依赖。脚本会验证 PNG 尺寸与不透明背景、ICO 四个尺寸帧、自适应安全圆和单色 SVG 渲染结果。重新生成后需重新打包 ZIP。
