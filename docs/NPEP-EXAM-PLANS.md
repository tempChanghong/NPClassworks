# 考试方案投递

学校管理 → 大屏 → NPEP 设备互联 → **考试方案**。这是独立于“考试模式”的入口：上传 JSON 只校验，核对摘要后另行确认放映。

需要配套 NPClassworksKV 的 `20260927000000_npep_exam_plans` 迁移、NPEduTools 新版 Host 和 ExamAware 桥接 0.4.0。本机须在学校互联开启方案放映许可，并先完成考试模式切换。

完整的一页流程、操作步骤和跨端测试入口见同级 NPEduTools 仓库的 [远程考试方案](../../NPEduTools/docs/npep/EXAMAWARE-PLAN-REMOTE.md)。本次仅本地开发，未部署。

网页隔离验收：`node scripts/test-npep-exam-plans-browser.mjs`。真实组件/API 客户端配合测试接口，不访问学校服务；截图在 `.artifacts/npep-exam-plans/`。
