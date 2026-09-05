# NPClassworks v1.0.0 · Nijika（伊地知虹夏）

NPClassworks v1.0.0 是面向学生、教师和班级大屏的首个正式前端版本，需配合 NPClassworksKV v1.0.0 使用。

## 主要变化

- 重新设计学生、教师和大屏三种界面，替换 Classworks 1 旧主页。
- 支持行政班、定科班和走班教学班；学生可自行选班并纠错。
- 教师一次登录即可管理负责的多个班级，支持多班发布、待处理中心和发布结果页。
- 作业与通知完全分离，支持优先级、教师确认、版本历史、重复检测和并发冲突对比。
- 大屏增加独立账号、快速录入、通知中心、离线队列、同步状态和本机诊断。
- 增加快捷词、快捷截止时间、草稿恢复和学生本地完成标记。
- 增加定时噪音监测、麦克风选择与测试、相对安静评分和历史摘要。
- 完善 1080P、2K、4K 大屏布局、移动端管理操作及全系统状态反馈。
- 增加 PWA 更新恢复、资源缓存修复、脱敏诊断包和前端性能基线。
- 移除考试看板、随机点名及不再使用的 Classworks 1 页面与生产配置。

## 使用说明

- 推荐与 NPClassworksKV `v1.0.0` 配套部署。
- 前端可以与 API 同源，也可以使用独立 API 域名；分离时需要正确配置后端地址与 CORS。
- 麦克风、系统通知和完整 PWA 功能需要 HTTPS 或浏览器认可的安全来源。
- 本版本不提供旧公共 Classworks 实例中 UUID 作业数据的自动迁移。

部署方法见[前后端部署文档](./deployment-guide.md)。

## FAQ

### NPClassworks 是 Classworks 的直接继承者吗？

不是。NPClassworks 是基于 Classworks、针对高中分班与走班、教师协作和班级大屏实际需求进行的独立改造，不代表 Classworks 原项目，也不继承其官方身份或公共服务。

### Novark Power 会提供公共实例吗？

目前及可预见的较长时期内不会。Novark Power 不计划像 Moonrend（斩月）与 Houlang Cloud（厚浪云）此前的 Classworks 服务一样，运营直接面向公众使用的官方实例。

使用 NPClassworks 需要自行部署前端、NPClassworksKV 和 PostgreSQL，或委托可信任的技术人员维护。

### 可以只部署前端吗？

不能完整使用。账号、班级、作业、通知、权限、大屏绑定和实时同步均依赖 NPClassworksKV。

## FullChangeLog

[查看前端完整变更：cf9352f...v1.0.0](https://github.com/tempChanghong/NPClassworks/compare/cf9352fc1f8ca4b3a410d77618111e6eac864e81...v1.0.0)

> Compare 链接会在仓库创建 `v1.0.0` 标签后生效。

## 致谢

感谢 Classworks、ClassworksKV、Immersive Clock 和 2school Immersive Clock 为本项目提供基础与参考。

NPClassworks 由[星火动力（NOVARK POWER）](https://novark.ink/)维护，遵循 GNU AGPL-3.0 许可证。
