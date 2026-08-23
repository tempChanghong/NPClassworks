# Classworks 正式主页切换

Classworks 2 的统一作业流已经成为正式根主页：

- `/` 渲染 `components/v2/ClassworksHome.vue`。
- `/classworks-2` 仅保留兼容跳转到 `/`。
- `/classworks-admin` 返回 `/`。
- 教师 OAuth 默认回跳 `/`。
- 用户界面统一显示“Classworks 作业板”，不再提供 Classworks 1 入口。

旧 `pages/index.vue` 综合作业桌面已经移除。考勤和噪声监测集中到已绑定班级大屏的“课堂工具”入口；个人学生浏览器没有课堂工具写入权限。随机点名与考试看板已从 Classworks 2 移除。

旧首页、UUID/KV 页面、旧设备授权、旧列表、旧设置卡片和对应数据提供器已经物理删除。C2 继续使用的账号、workspace 实时同步、噪声监测和数据库历史迁移不属于删除范围。
