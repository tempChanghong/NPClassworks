# Classworks 2.0 第四阶段：前端双轨接入

第四阶段新增独立路由 `/classworks-2`，把前三阶段的教学目录、统一发布、学生 feed 和实时事件接入 Vue PWA。原首页及 UUID/KV 数据流不修改，首页右上角“新版”按钮用于进入新链路。

## 学生流程

1. 选择学校和行政班。
2. 系统列出所有随行政班课程；这些课程不需要再次选择。
3. 对标记为走班的科目，学生按实际情况选择具体教学班，也可以留空未选的小科。
4. 行政班与所选教学班 ID 保存在当前浏览器的 `localStorage`。
5. 页面从公开 `/api/v2/publications/feed` 合并读取作业和通知，同一条多目标发布只显示一次。

高二1班、2班的物化生在组织配置中为 `ADMIN_CLASS`，前端显示为“随行政班”，不会出现走班选择器。其他班的 `COURSE_GROUP` 小科才显示物理A1、化学A2等选项。

学生不需要账户。清除浏览器数据或更换设备后需要重新选班。

## 教师流程

- 使用现有 OAuth 提供者登录，访问令牌与刷新令牌由独立 v2 客户端维护。
- `/api/v2/me/workspaces` 一次返回教师负责的所有行政班和走班教学班。
- 发布作业时先选科目，前端按授课模式过滤合法目标：
  - 一、二班的小科行政班会保留；
  - 采用走班模式的行政班会被排除；
  - 只保留科目匹配的走班教学班。
- 通知可以跨多个合法教学空间投递。
- 支持保存草稿、正式发布、编辑、撤回和复制为草稿。
- 编辑使用后端 `revision` 与 `If-Match`，发生并发修改时不会覆盖别人的新版本。

教师账户 JWT 和旧设备 KV Token 使用不同的本地存储键和 Axios 实例，二者不会互相覆盖。

## 实时刷新

页面向 Socket.IO 发送 `join-workspaces`，订阅当前学生选择的教学空间。收到创建、修改或撤回事件后延迟 250ms 合并刷新公开 feed；重新连接时会自动重新加入房间。

## 主要文件

- `src/pages/classworks-2.vue`：学生/教师统一入口。
- `src/components/v2/ClassSelectionDialog.vue`：学生行政班与走班选择。
- `src/components/v2/PublicationComposer.vue`：教师多目标发布与编辑。
- `src/stores/classworksV2.js`：选班、feed、教师工作台和实时状态。
- `src/utils/classworksV2Client.js`：v2 API、OAuth 回调、JWT 自动刷新和并发版本头。

## 联合部署

必须先部署包含第三阶段迁移与 API 的 NPClassworksKV，再部署本前端；否则新版学生页会明确显示 `/api/v2` 不存在，但旧作业板仍可正常使用。

建议顺序：

1. PostgreSQL 备份并执行后端 `pnpm exec prisma migrate deploy`。
2. 部署 NPClassworksKV，确认 `/api/v2/catalog/schools` 可访问。
3. 导入学校组织配置，分配教师工作空间。
4. 部署 NPClassworks 前端。
5. 先由教师创建测试草稿和测试发布，再让少量学生完成选班。
6. 验证实时刷新、编辑冲突和撤回后，再逐班扩大使用。

旧首页仍是默认入口。本阶段不自动搬迁旧 UUID/KV 作业，也不强制全校切换。
