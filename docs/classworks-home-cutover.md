# Classworks 正式主页切换

Classworks 2 的统一作业流已经成为正式根主页：

- `/` 渲染 `components/v2/ClassworksHome.vue`。
- `/classworks-2` 仅保留兼容跳转到 `/`。
- `/classworks-admin` 返回 `/`。
- 教师 OAuth 默认回跳 `/`。
- 用户界面统一显示“Classworks 作业板”，不再提供 Classworks 1 入口。

旧 `pages/index.vue` 综合作业桌面已经移除。考勤和噪声监测集中到已绑定班级大屏的“课堂工具”入口；个人学生浏览器没有课堂工具写入权限。随机点名与考试看板已从 Classworks 2 移除。

原有考试、设置等独立页面及其仍在使用的旧 KV 工具暂时保留。后续删除旧代码时，应先确认这些独立页面已经迁移，避免将考试配置和设置页一并破坏。
