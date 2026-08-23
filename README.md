<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./images/官网用星火动力反色.svg">
    <img src="./images/星火动力0702.svg" width="112" alt="星火动力 NOVARK POWER">
  </picture>
</p>

<h1 align="center">NPClassworks</h1>

<p align="center">
  面向班级大屏、教师和学生的统一作业板<br>
  由 <strong>星火动力（NOVARK POWER）</strong> 维护
</p>

![License](https://img.shields.io/github/license/tempChanghong/NPClassworks?style=flat-square)
![Vue](https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vuedotjs&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-ready-5a0fc8?style=flat-square&logo=pwa&logoColor=white)

NPClassworks 基于 [Classworks](https://github.com/Moonrend/Classworks) 深度改造，针对高中行政班、选科定班和走班教学并存的实际场景设计。前端是一套 Vue 3 + Vuetify 3 PWA，需要与 [NPClassworksKV](https://github.com/tempChanghong/NPClassworksKV) 后端配合使用。

当前版本：**v1.0.0 · Nijika（伊地知虹夏）**。

## 主要能力

- 学生、教师、班级大屏三种界面和首次使用引导
- 行政班、走班教学班和特殊定班规则统一建模
- 作业与通知实时同步，支持教师认证、修订历史和不可删除备份
- 大屏快速录入、学校级快捷词与快捷截止时间
- 教师一次登录管理多个行政班和走班教学班
- 大屏独立账号、设备绑定、显示设置和课堂工具
- 通知提示音、系统通知、噪声监测和麦克风选择
- 适配 1080P、2K、4K 班级一体机

## 技术栈

- Vue 3、Vuetify 3、Pinia、Vue Router
- Vite 5、PWA / Workbox
- Socket.IO 实时同步
- HTTP API、PostgreSQL 服务端数据与大屏离线队列

## 本地开发

环境要求：Node.js 22+、pnpm 10+。完整联调还需要本地运行 NPClassworksKV。

```bash
git clone https://github.com/tempChanghong/NPClassworks.git
cd NPClassworks
pnpm install
pnpm run dev
```

开发服务器默认监听 `http://localhost:3031`。

```bash
pnpm test
pnpm run build
pnpm run lint
```

## 部署

生产环境建议让前后端保持同源，由反向代理统一提供 HTTPS，并将 `/api`、`/accounts`、`/socket.io`、健康检查和指标路径转发至 NPClassworksKV。部署前请先阅读后端仓库的生产配置说明并执行数据库迁移。

联合生产栈由同级的 NPClassworksKV 仓库统一启动，必须显式加载生产环境文件：

```bash
cd ../NPClassworksKV
docker compose --env-file deploy/.env.production up -d --build
```

## 项目关系与致谢

NPClassworks 是 Classworks 的衍生项目，不是 Classworks 官方版本。感谢 Classworks 原作者和所有上游贡献者；本项目保留上游版权与许可证声明。

项目维护与部署支持：**星火动力（NOVARK POWER）**。

品牌素材位于 [`images`](./images)；反色版本用于深色背景，请勿改变图形比例。

## 开源协议

本项目遵循 [GNU AGPL-3.0](./LICENSE)。分发或部署修改版本时，请同时遵守上游项目和本项目的许可证要求。
