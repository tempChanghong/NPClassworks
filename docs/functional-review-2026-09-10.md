# 日常使用功能问题复查报告（2026-09-10）

本轮确认 **7 项新功能问题**。建议先处理考勤覆盖和教师编辑内容丢失，再处理学生选班与走班状态显示。其余涉及管理配置、噪声计划恢复和收藏同步。

## 1. 范围与验证口径

| 项目 | 本轮基线 |
| --- | --- |
| 前端 | `NPClassworks`：`c752ec443b3e9f182c7aa993be576163badec6a3` |
| 后端 | `NPClassworksKV`：`8ed7a6f27da2626e41dd722a6b2e23dcbd7043a2` |
| 检查重点 | 教师编辑与目标偏好；学生选班与各科状态；考勤和噪声工具；管理端快捷配置 |
| 工作方式 | 定向阅读调用链，执行当前源码函数、Vue 响应式逻辑和局部流程复现 |
| 验证边界 | API、存储、时钟或设备启动按场景使用替身；部分流程经过本机 HTTP fixture。未访问线上服务或真实数据库，未使用真实麦克风，未运行浏览器全链路、全量测试或构建 |
| 代码变更 | 仅新增本报告，未修复业务源码、推送或部署 |

按用户说明，[上一轮报告](D:/WebstormProjects/NPClassworks/docs/functional-review-2026-09-09.md)中的教师管理分页、删除学生后的旧考勤、空发布时间静默失败、噪声历史统计窗口问题全部视为已修复，**本轮未单独复测**。此前列出的通知确认、过期、弹窗、送达、feed 分页，以及旧草稿基线、跨标签协调、临时退出、日期导航和 PWA 刷新保护等问题也未重复列入。

下文的“已复现”指当前代码在受控条件下产生了相应状态或写入结果；页面可见效果由组件模板和执行状态共同确认，不代表进行了真实浏览器或生产环境测试。日期、周视图、打印和学生完成状态未获得额外足够确凿的新发现，本报告不将其解释为完整通过检查。

## 2. 问题总览

优先级用于安排功能修复，不是安全漏洞等级。P2 为需要正常排期处理的缺陷，P3 为影响较小、存在直接恢复办法的体验问题；同级按表格顺序建议处理。

| 编号 | 优先级 | 问题 | 主要后果 |
| --- | --- | --- | --- |
| F-01 | P2 | 考勤读取失败后仍可保存默认空草稿 | 已保存的缺勤等状态被清空 |
| F-02 | P2 | A 的保存完成回调清空后来打开的 B 编辑器 | B 的未保存输入丢失 |
| F-03 | P2 | 切换学校后取消选班，正式选择已被清空 | 学生作业板隐藏，需重新选择或刷新恢复 |
| F-04 | P2 | 学生各科录入状态遗漏走班科目 | 看不到走班的未录入、无作业及冲突状态 |
| F-05 | P2 | 旧学校的配置响应覆盖当前学校表单 | 后续保存可能覆盖另一所学校的快捷配置 |
| F-06 | P2 | 更换失效麦克风后，当前自动监测计划不恢复 | 设备已改好，监测仍停留在错误状态 |
| F-07 | P3 | 取消收藏同步失败后，旧收藏在重新载入时恢复 | 删除操作丢失，却显示已同步 |

## 3. 具体发现

### F-01：考勤读取失败后，空草稿可以覆盖已保存记录

**触发步骤：**同一页面会话内打开过课堂工具，名单有张三、李四；当日张三已标为缺勤并保存。关闭后重新打开，考勤读取接口暂时返回一次 503。进入考勤，再点击“保存今日考勤”，此时写接口可用。

**实际影响：**读取失败警告会显示，但考勤区显示到校 2、缺勤 0。保存后，原来的 `absent: [s1]` 变成 `absent: []`，警告也被清空。正常用户可能把这个页面理解成当前考勤，进而覆盖已有数据。

**原因与定位：**

- [首页挂载课堂工具](D:/WebstormProjects/NPClassworks/src/components/v2/ClassworksHome.vue:485)使用 `v-if`，重开会重新创建组件；[考勤草稿](D:/WebstormProjects/NPClassworks/src/components/v2/ClassroomToolsDialog.vue:285)默认是三个空数组。
- [加载流程](D:/WebstormProjects/NPClassworks/src/components/v2/ClassroomToolsDialog.vue:319)只在成功后填充草稿，失败仅保留警告。与此同时，[store 加载](D:/WebstormProjects/NPClassworks/src/stores/classworksV2/screenSessionActions.js:101)失败后保留上次加载的名单，所以仍能显示学生行。
- [保存按钮](D:/WebstormProjects/NPClassworks/src/components/v2/ClassroomToolsDialog.vue:127)没有绑定“当前考勤加载成功”条件；[保存函数](D:/WebstormProjects/NPClassworks/src/components/v2/ClassroomToolsDialog.vue:394)直接提交空草稿。
- [store 写入](D:/WebstormProjects/NPClassworks/src/stores/classworksV2/screenSessionActions.js:127)开始时清空错误；[后端更新](D:/WebstormProjects/NPClassworksKV/services/classroomToolsService.js:163)整体替换考勤，空数组本身是合法数据。

**复现结果：**执行真实 Vue setup/watch、Pinia、Axios 和本机 HTTP 路由；写路由调用实际后端 `saveClassAttendance`，仅数据库与绑定校验使用内存替身。

```text
读取失败后：服务端 absent=[s1]，store absent=[s1]，组件 draft absent=[]
显示统计：present=2，absent=0；错误提示存在
点击保存后：写入1次，服务端 absent=[]，错误提示清空
对照：读取成功后再保存，absent=[s1] 得以保留
```

**建议：**为考勤引入与日期、绑定关联的加载状态，读取成功前禁止保存；失败时展示明确的重试入口。保留旧快照时需标明来源日期并确认它适合当前编辑，不能将默认空数组当作有效读取结果。

**验收重点：**名单已缓存、考勤 GET 失败但 PUT 成功；名单或考勤仍在加载时尝试保存；正常加载后的原样保存。本例没有删除名单或跨日期操作，与上一轮考勤问题不同。

### F-02：保存 A 期间打开 B，A 成功后清空 B 的新输入

**触发步骤：**编辑作业 A 并保存，在请求尚未结束时，从发布管理打开 B，然后在 B 中输入新正文。等待 A 保存成功。

**实际影响：**B 的编辑对象被清空，正文被重置，新输入没有写入任何发布。A 本身正常保存，因此用户可能只看到成功反馈。最近发布目标还可能误记成 B 的班级。

**原因与定位：**[打开编辑器](D:/WebstormProjects/NPClassworks/src/components/v2/ClassworksHome.vue:1080)直接替换当前编辑对象；[发布管理的编辑入口](D:/WebstormProjects/NPClassworks/src/components/v2/TeacherPublicationManager.vue:209)未与提交状态联动。[提交完成处理](D:/WebstormProjects/NPClassworks/src/components/v2/PublicationComposer.vue:768)在 `await` 后读取当前目标组合，无条件 `reset()` 并发送成功事件；[父级成功处理](D:/WebstormProjects/NPClassworks/src/components/v2/ClassworksHome.vue:1193)也无条件清除当前编辑对象，没有确认它仍是 A。

**复现结果：**执行当前组件 setup、Vue watcher、`submit/reset` 和父级编辑/成功处理函数，仅挂起 store 的 A 写入。

```text
A 返回前：editingId=B，正文="B刚输入且尚未保存的正文"
A 返回后：editingId=null，正文=""
写入次数=1，写入对象=A，内容为A原本提交的正文
B 新输入没有写入
```

不切换编辑对象的对照正常。现有 PWA 刷新保护仅限制刷新，不能保护同页编辑切换；本例也不是把 A 的请求错误写入 B。

**建议：**为每次编辑建立会话标识，提交时捕获编辑对象、表单版本和目标组合；完成后只更新仍属于该次提交的编辑状态。也可以在保存期间限制切换，但应明确反馈，不能在用户继续输入后静默清空。

**同类补充：**[全校快捷配置保存](D:/WebstormProjects/NPClassworks/src/composables/admin/useSchoolHomeworkSettings.js:130)也会无条件用保存响应替换表单。[快捷词输入区](D:/WebstormProjects/NPClassworks/src/components/admin/AdminHomeworkQuickInputs.vue:42)在请求期间仍可编辑。轻量复现中，提交后继续输入的文本被旧响应覆盖，`dirty=false`，页面显示保存成功。修复时应一并保留请求发出后的新修改。

**验收重点：**保存 A → 打开 B → 输入 → A 返回；同一个表单保存期间继续输入；成功和失败响应都不得破坏之后的新编辑。

### F-03：跨学校选班取消后，原班级消失、整个作业板隐藏

**触发步骤：**实例有两所学校，学生已保存 A 校班级。在“修改选班”里切到 B 校，等待列表加载；不点击“保存并查看作业”，点击遮罩或按 Escape 关闭。

**实际影响：**当前选择只剩 B 校 ID，没有行政班或走班；班级名变为“尚未选择班级”，学生作业区隐藏。原本的 A 校选择仍在 localStorage 中，整页刷新可以恢复，属于未提交操作破坏了当前内存状态。

**原因与定位：**

- [切换学校处理](D:/WebstormProjects/NPClassworks/src/components/v2/ClassSelectionDialog.vue:225)直接调用 `store.loadSchool(value)`。
- [loadSchool](D:/WebstormProjects/NPClassworks/src/stores/classworksV2/boardActions.js:93)默认 `preserveSelection=false`，在目录加载后立即替换正式 `selection`，并非只修改弹窗草稿。
- [弹窗关闭](D:/WebstormProjects/NPClassworks/src/components/v2/ClassSelectionDialog.vue:3)直接转发事件，没有回滚。切校后关闭按钮虽消失，但弹窗未设 `persistent`；已安装组件实现仍允许遮罩或 Escape 关闭。
- [学生作业区](D:/WebstormProjects/NPClassworks/src/components/v2/ClassworksHome.vue:207)以 `selectedWorkspaceIds.length` 控制显示；[选择 watcher](D:/WebstormProjects/NPClassworks/src/components/v2/ClassworksHome.vue:856)不负责恢复空选择。

**复现结果：**执行实际学校切换、选择 getter 和弹窗遮罩关闭逻辑：

```text
selection={schoolId:"school-B", courseGroupIds:{}}
selectedWorkspaceIds=[]，selectionDialog=false
localStorage 仍为 school-A / class-A / group-A
```

页面表现依据执行状态与模板确认，未进行真实浏览器点击测试。

**建议：**将弹窗的学校目录、课程目录和草稿与正式选择分开；只有提交校验成功才替换正式选择。取消应保持原班级、课程与看板数据。

**验收重点：**跨校取消、跨校正式保存、目录加载失败后关闭；不能只验证单校首次选班。

### F-04：学生“各科录入状态”遗漏所有走班科目

**触发步骤：**行政班有语文随班课、数学走班；学生已成功选择数学教学班。查看首页“各科录入状态”。无论数学尚未录入，还是已经发布普通作业或明确的“今日无作业”，数学状态都不出现。

**实际影响：**该区域只能显示随行政班科目，走班的未录入、已布置、无作业及冲突提示均遗漏。若所有科目都走班，状态卡可能整体隐藏。作业正文卡片仍可显示，不能将此问题表述为走班作业全部丢失。

**原因与定位：**[后端课程目录构造](D:/WebstormProjects/NPClassworksKV/domain/academicCatalog.js:35)返回的 `courseGroups` 包含 `id/code/name/subjectId/isStudentSelectable`，不包含 `type`；[目录服务](D:/WebstormProjects/NPClassworksKV/services/academicCatalogService.js:102)直接使用该结果。[学生状态组件](D:/WebstormProjects/NPClassworks/src/components/v2/HomeworkSubjectStatus.vue:37)将它转换为 `{...group, subjectId}`，也未补类型；[状态计算](D:/WebstormProjects/NPClassworks/src/utils/noHomework.js:29)只有在 `type === "COURSE_GROUP"` 时按 `subjectId` 生成状态。缺少类型的对象走到空 `subjectRules` 分支，产生零行。

**复现结果：**串联实际后端目录构造函数、组件计算逻辑及 `dailyHomeworkStatuses()`：

```text
目录中的数学走班：id=math-A，subjectId=math，type=undefined
选择范围：[class-A, math-A]
无发布时：仅输出语文“尚未录入”
数学已有教师确认的“无作业”时：仍仅输出语文
内存对照只补 type=COURSE_GROUP：数学“无作业且已确认”正常出现
```

**建议：**在前端目录适配层显式补齐工作区类型，或统一状态计算所使用的数据契约。

**验收重点：**使用真实目录输出构造测试输入，覆盖走班的未录入、有作业、明确无作业、两者冲突四种状态，避免测试夹具预先补齐字段而掩盖接口衔接问题。

### F-05：旧学校的快捷配置响应覆盖当前学校，后续保存可能写错配置

**触发条件：**同一管理员有 A、B 两所学校的管理权限，切校时配置请求发生乱序。本问题不要求也不涉及未授权学校访问。

**触发步骤：**打开 A 校管理页面，在 A 配置加载完成前切到 B；B 的响应先完成，随后 A 的旧响应到达。此时学校选择器显示 B，配置表单却被替换为 A 的内容。点击“保存全校配置”。

**实际影响：**A 的快捷时间、快捷词被提交到 B 的保存接口，可能覆盖 B 原有配置，并影响 B 校教师和大屏之后加载的快捷选项。

**原因与定位：**[学校选择器](D:/WebstormProjects/NPClassworks/src/pages/classworks-admin.vue:507)没有在配置加载时禁用；[学校 watcher](D:/WebstormProjects/NPClassworks/src/pages/classworks-admin.vue:2007)每次切换都发起加载。[配置加载](D:/WebstormProjects/NPClassworks/src/composables/admin/useSchoolHomeworkSettings.js:51)等待返回后直接覆盖表单与已保存快照，没有校验请求学校或请求序号；[保存](D:/WebstormProjects/NPClassworks/src/composables/admin/useSchoolHomeworkSettings.js:130)则使用当前 `selectedSchoolId`。后端按[请求中的学校 ID](D:/WebstormProjects/NPClassworksKV/services/schoolHomeworkSettingsService.js:44)更新数据，无法识别前端表单来自旧学校。

**复现结果：**执行实际 composable 和配置规范化函数，用两个可控 Promise 模拟 A、B 响应。使用全科通用快捷词：

```text
B 响应后：selectedSchool=B，表单=B配置
A 迟到后：selectedSchool=B，表单=A配置
再次保存：API学校参数=B，提交文本=A配置，error=""
```

未对真实学校执行写入。页面的未保存提醒不能阻止此例：用户切校前没有编辑，旧响应还会把错误内容登记为干净快照。

**建议：**加载时捕获学校 ID 和请求序号，只接纳仍属于当前学校、当前请求的响应；表单保存时还应校验“表单所属学校”与当前选择一致。加载失败或尚未取得目标学校配置时，不允许把上一学校的表单直接保存。

**验收重点：**A 慢 B 快、A 快 B 慢、切校后加载失败，再执行保存；同时检查旧请求的 `finally` 不会提前解除新请求的加载状态。

### F-06：失效麦克风改为可用设备后，当前自动监测仍不重试

**触发步骤：**正处于自动监测时间段，原来指定的麦克风已不存在，计划启动失败。打开麦克风选择器，选另一台可用设备并“保存并使用”，随后等待自动检查或切回前台。

**实际影响：**设备偏好已更新，但当前计划保持错误状态，不尝试新设备。手动点击“开始监测”可以恢复；下一次新的计划窗口也可以再次尝试。

**原因与定位：**

- [设备选择器](D:/WebstormProjects/NPClassworks/src/components/v2/MicrophoneDevicePicker.vue:172)保存后调用 `setMicrophoneDevice(..., {restart:true})`。
- [设备切换逻辑](D:/WebstormProjects/NPClassworks/src/utils/noiseService.js:290)仅在 `active/initializing` 时重启，错误状态只更新偏好。
- [调度器监听](D:/WebstormProjects/NPClassworks/src/components/v2/NoiseScheduleManager.vue:55)没有对麦克风设置变化触发明确重试。
- [失败去重键](D:/WebstormProjects/NPClassworks/src/utils/noiseMonitoringController.js:52)不含设备 ID；普通周期检查即使读到新设备，也认为该计划已失败过，直接返回。

**复现结果：**挂载实际调度器、设备选择器和监测卡片，仅替换设备启动，模拟旧设备失败、新设备成功：

```text
首次自动尝试：startCalls=[missing-mic]
保存 good-mic，再触发5次 focus：
  preferredDevice=good-mic，status=error，startCalls仍只有missing-mic
手动开始对照：status=active，startCalls=[missing-mic, good-mic]
```

**建议：**设备选择变化应使针对旧设备的失败去重失效，并在当前确实需要监测时触发一次重试；保留对同一设备反复失败的限制即可。不要把它扩展成不受限制的持续重试。

**验收重点：**活动计划中更换失效设备、无活动计划时只保存偏好、同一坏设备反复失败。此项属于失败恢复衔接，未涉及或复测旧的噪声异步取消、资源释放和历史统计窗口问题。

### F-07：取消收藏同步失败后，重新进入工作台会恢复旧收藏

**触发步骤：**一个目标组合已经收藏并同步；取消收藏时网络失败。恢复网络后刷新或重新登录教师工作台。

**实际影响：**本地已取消的收藏重新出现，并被标记为同步成功。只影响目标偏好，不影响已经发布的作业；联网后再次取消可以恢复，因此列为 P3。

**原因与定位：**[取消收藏](D:/WebstormProjects/NPClassworks/src/utils/teacherTargetPreferences.js:118)只从本地数组移除，没有留下删除记录；[重新载入偏好](D:/WebstormProjects/NPClassworks/src/stores/classworksV2/teacherActions.js:109)发现本地有未同步修改时，采用[本地与远端并集合并](D:/WebstormProjects/NPClassworks/src/utils/teacherTargetPreferences.js:88)。远端旧收藏因此重新进入结果，随后被保存并清除未同步标志。

**复现结果：**执行实际偏好工具和 store 的取消、同步、重新载入函数；API 与 localStorage 使用内存替身：

```text
取消后：本地收藏=0，服务器收藏=1，dirty=true
重新载入后：本地收藏=1，服务器收藏=1，dirty=false
```

若网络恢复后先成功执行普通同步、再重新载入，就不会触发本例。

**建议：**同步协议需要表达删除，例如记录删除操作、删除标记或按条目的变更版本；不能仅通过集合并集恢复本地未同步修改。

**验收重点：**离线取消 → 重新载入；离线新增 → 重新载入；另一设备新增与本机删除同时存在，避免修复删除时又覆盖合法新增。

## 4. 这一轮暴露的工程共性

| 边界 | 本轮表现 | 应建立的约束 |
| --- | --- | --- |
| 加载状态 → 可编辑状态 | 考勤默认空值可被当成有效数据保存 | 未成功读取不等于“数据为空”，保存资格必须关联有效快照 |
| 异步请求 → 当前页面 | A 的结果清空 B 编辑器，旧学校响应覆盖新学校 | 响应归属于明确的对象、请求和编辑版本，不能无条件修改当前界面 |
| 编辑草稿 → 正式选择 | 选班尚未提交就改动全局选择 | 目录加载、草稿编辑、提交三个阶段分开，取消不应更改正式状态 |
| 后端目录 → 前端状态计算 | 走班 DTO 缺少状态计算依赖的类型 | 在接口适配边界统一结构，用真实接口形状验证功能 |
| 失败恢复 → 新输入 | 已更换设备仍沿用旧失败记录 | 重试状态必须随决定操作结果的输入变化而失效 |
| 离线修改 → 多端合并 | 收藏删除在并集合并中消失 | 删除也需要可同步的语义，不能仅传“剩余条目”再取并集 |

建议以报告中的具体场景补回归验证，先阻止错误写入和未保存内容丢失，再完善显示与恢复体验。相关修复不要求先拆分服务或进行大范围框架迁移。
