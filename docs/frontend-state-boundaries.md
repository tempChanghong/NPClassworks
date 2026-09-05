# 前端状态与学校结构编辑

`src/stores/classworksV2.js` 保留 `classworks-v2` 这个 Pinia Store 的全部 state、getter 和公开 action。组件仍通过 `useClassworksV2Store()` 使用它，不需要改调用方式。

内部方法按职责放在 `src/stores/classworksV2/`，通过 action 对象展开组合：

- `boardActions.js`：学生选择、作业列表、日期切换、Socket.IO 订阅及刷新定时器。
- `teacherActions.js`：教师会话、目标偏好、发布与修订操作。共用的修订入口仍按当前身份选择 API。
- `screenSessionActions.js`：大屏登录、缓存会话、名单考勤和作业保存入口。
- `screenSyncActions.js`：网络状态、心跳指令、离线队列补传及人工处理。
- `studentSelection.js`、`screenRequestError.js`：这些模块共用的选择存储和临时网络错误判断。

这些 action 使用普通方法和 `this` 访问原 Store，由 Pinia 统一绑定。模块之间通过 Store action 调用，不相互导入。不要直接调用导出的 action 对象，也不要将方法改为箭头函数。原有订阅清理、定时器和请求序号仍在所属模块中维护；本次拆分没有改变它们的共享范围。

`AcademicStructureManager.vue` 负责模板和样式，`src/composables/admin/useAcademicStructureManager.js` 负责编辑状态、组织 API、版本冲突、影响确认和停用撤销。组合函数在组件 setup 内调用一次，接收完整的响应式 props；内部 ref 和 watch 归属于该组件实例，返回模板所需的 ref、computed 和操作函数。保持 props 响应式，避免复制 schoolId/termId 后导致切换失效。

修改这些边界时，运行 `pnpm test`、`pnpm run lint:check`、`pnpm run build` 和 `pnpm run test:e2e`。其中：

- `tests/publicationFlows.test.js` 覆盖 Store 与 API、离线队列及发布交互。
- `tests/academicManagerFlows.test.js` 挂载实际管理组件的 setup，验证学校/学期切换、保存失败、版本冲突、实例隔离、停用确认、撤销及卸载清理。
- `tests/e2e/publication.spec.js` 使用生产构建、真实浏览器、Socket.IO 和 Service Worker 验证发布、大屏更新、离线恢复及冲突保存。

此结构调整不涉及 API 协议、存储键、数据库迁移或部署代理。
