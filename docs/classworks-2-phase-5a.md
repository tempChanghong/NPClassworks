# Classworks 2.0 第五阶段 A：前端上线前加固

## PWA API 缓存边界

同域部署后，以下路径固定使用 `NetworkOnly`，不得进入 PWA Cache Storage：

- `/api/`
- `/accounts/`
- `/kv/`
- `/apps/`
- `/devices/`
- `/auth/`
- `/auto-auth/`
- `/socket.io/`
- `/metrics` 与 `/check`

这避免一体机切换教师账户时命中上一个账户的认证接口缓存。

## 学生选班恢复

浏览器恢复本地选择后，会根据当前行政班的 `course-options` 重新校验每个走班 ID。已经删除、停用或不再属于该行政班的教学班会被移除，并提示学生重新确认。

## 定时刷新

学生 feed 根据后端的 `nextTransitionAt` 在计划发布时间或失效时间到达后自动刷新，并每五分钟执行一次前台可见状态下的兜底刷新。Socket.IO 仍负责教师即时创建、修改与撤回事件。

## 旧授权兼容

新授权请求统一回调 `/authorize`；同时保留 `/authorizecallback` 路由，将旧版本已经发出的回调参数转交给 `/authorize`。
