<template>
  <v-card class="npep-runtime-card rounded-xl">
    <v-card-title class="npep-runtime-header">
      <span class="npep-runtime-eyebrow">设备控制 · NPEP</span>
      <h2>远程考试模式</h2>
      <p>{{ schoolName }} · {{ deviceName }} · {{ bindingName }}</p>
    </v-card-title>
    <v-card-text class="npep-runtime-content">
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        class="mb-4"
      >
        {{ error }}
      </v-alert>
      <v-alert
        v-if="message"
        type="info"
        variant="tonal"
        class="mb-4"
      >
        {{ message }}
      </v-alert>

      <section
        class="npep-runtime-section"
        aria-labelledby="npep-runtime-status-title"
      >
        <div class="npep-runtime-section-heading">
          <div>
            <h3 id="npep-runtime-status-title">
              当前观测
            </h3>
            <p>这里是设备最近一次上报，不等于新请求已经执行。</p>
          </div>
          <v-btn
            variant="tonal"
            :disabled="busy"
            prepend-icon="mdi-refresh"
            @click="refresh"
          >
            刷新状态
          </v-btn>
        </div>
        <div class="npep-runtime-metrics">
          <div><span>最近观测的运行环境</span><strong>{{ runtimeModeName(snapshot?.status?.runtimeMode) }}</strong></div>
          <div><span>配对授权</span><strong>{{ snapshot?.policy?.enabled ? '已生效' : '未生效／未知' }}</strong></div>
          <div><span>最近上报</span><strong>{{ time(snapshot?.receivedAt) }}</strong></div>
        </div>
        <v-alert
          v-if="snapshot?.status?.remoteExamPause"
          type="warning"
          variant="tonal"
          class="mt-4"
        >
          自动录课已暂停。远程返回日常成功后自动解除本次暂停；也可在大屏本地返回日常并核实解除。
        </v-alert>
        <p
          v-if="snapshot?.status?.reasonCode"
          class="npep-runtime-status-line"
        >
          当前检查：{{ reason(snapshot.status.reasonCode) }}（{{ snapshot.status.reasonCode }}）
        </p>
        <p
          v-if="snapshot?.status?.runtimePhase === 'SWITCHING'"
          class="npep-runtime-status-line"
        >
          正在切换：{{ runtimeStepName(snapshot.status.step) }}
        </p>
      </section>

      <section
        class="npep-runtime-section"
        aria-labelledby="npep-runtime-action-title"
      >
        <div class="npep-runtime-section-heading">
          <div>
            <h3 id="npep-runtime-action-title">
              选择设备动作
            </h3>
            <p>核对学校、班级和设备后再提交；实际结果以设备回执为准。</p>
          </div>
        </div>
        <v-alert
          v-if="blocked"
          type="warning"
          variant="tonal"
          class="mb-4"
        >
          {{ blocked }}
        </v-alert>
        <v-checkbox
          v-model="confirmed"
          :disabled="busy || !!blocked || !!pending"
          label="已核对学校、班级与设备，同意所选模式的软件切换及登录自启动设置"
          hide-details
          class="mb-4"
        />
        <div class="npep-runtime-actions">
          <div>
            <strong>进入考试模式</strong>
            <p>调整 ClassIsland／ExamAware2 登录自启动，准备考试环境，并暂停后续自动录课。</p>
            <v-btn
              color="primary"
              :disabled="busy || (!!pending && pending.body.target !== 'EXAM') || (!pending && (!confirmed || !!blocked))"
              @click="create('EXAM')"
            >
              {{ pending?.body.target === 'EXAM' ? '重试提交同一请求' : '切入／重试考试模式' }}
            </v-btn>
          </div>
          <div>
            <strong>返回日常模式</strong>
            <p>恢复日常自启动；确认设备完成切换后解除本次远程录课暂停。</p>
            <v-btn
              color="secondary"
              :disabled="busy || (!!pending && pending.body.target !== 'DAILY') || (!pending && (!confirmed || !!dailyBlocked))"
              @click="create('DAILY')"
            >
              {{ pending?.body.target === 'DAILY' ? '重试返回日常请求' : '结束考试／返回日常' }}
            </v-btn>
          </div>
        </div>
        <p
          v-if="dailyBlocked && !blocked"
          class="npep-runtime-note"
        >
          {{ dailyBlocked }}
        </p>
        <p
          v-if="pending"
          class="npep-runtime-note"
        >
          提交结果尚待核实。重试沿用同一请求，不会创建第二个任务。
        </p>
        <details class="npep-runtime-help">
          <summary>执行步骤与现场注意事项</summary>
          <p>进入考试时会关闭 ClassIsland 管理员登录自启动、开启 ExamAware2 登录自启动，并保存考试模式。设备会先准备 ExamAware2，再正常退出 ClassIsland；正在录制时先保存，通知窗口暂时收起。已满足的步骤会跳过，失败后可重试补完。</p>
          <p>返回日常时会恢复日常自启动，正常退出 ExamAware2、启动 ClassIsland。已有放映请先结束；编辑器未保存等退出阻碍需现场处理。全部核实成功后解除远程录课暂停。</p>
        </details>
      </section>

      <section
        class="npep-runtime-section"
        aria-labelledby="npep-runtime-history-title"
      >
        <div class="npep-runtime-section-heading">
          <div>
            <h3 id="npep-runtime-history-title">
              最近 20 项操作
            </h3>
            <p>历史结果记录当时的回执，不代表设备此刻的运行状态。</p>
          </div>
        </div>
        <p v-if="!operations.length">
          暂无操作记录。
        </p>
        <v-card
          v-for="operation in operations"
          :key="operation.operationId"
          variant="outlined"
          class="npep-runtime-operation mb-3"
        >
          <v-card-text>
            <strong>{{ operation.target === 'DAILY' ? '返回日常' : '进入考试' }} · {{ runtimeStateName(operation.state, operation.target) }}</strong>
            <p class="npep-runtime-note">
              {{ time(operation.createdAt) }} · {{ operation.initiator.displayName }}
            </p>
            <p v-if="operation.step">
              最后执行步骤：{{ runtimeStepName(operation.step) }}
            </p>
            <p v-if="operation.reasonCode">
              原因：{{ reason(operation.reasonCode) }}（{{ operation.reasonCode }}）
            </p>
            <p v-if="!operation.resolvedAt && operation.freshness !== 'CURRENT'">
              没有近期进度回执，当前显示历史结果；不代表软件已经退出。
            </p>
            <p v-if="operation.localEndedAt">
              现场已结束 N3 暂停：{{ time(operation.localEndedAt) }}
            </p>
            <details class="npep-runtime-evidence">
              <summary>查看设备回执与诊断编号</summary>
              <p class="npep-runtime-note">
                操作编号：{{ operation.operationId }}
              </p>
              <template v-if="operation.evidence">
                <p class="npep-runtime-note">
                  完成／中断时的设备回执（不代表此刻运行状态）：
                </p>
                <p
                  v-for="line in runtimeEvidence(operation.evidence)"
                  :key="line"
                >
                  {{ line }}
                </p>
              </template>
              <p v-else>
                暂无设备回执。
              </p>
            </details>
            <v-btn
              v-if="!operation.grant && !operation.resolvedAt"
              variant="text"
              :disabled="busy"
              class="mt-2"
              @click="cancel(operation)"
            >
              取消尚未开始的任务
            </v-btn>
          </v-card-text>
        </v-card>
      </section>
    </v-card-text>
    <v-card-actions>
      <v-spacer /><v-btn @click="$emit('close')">
        关闭
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import {toRef} from 'vue';
import {useNpepRuntimeControl} from '@/composables/admin/useNpepRuntimeControl';
import {runtimeStateName, runtimeModeName, runtimeStepName, runtimeEvidence} from '@/utils/npepRuntimePresentation';
import {npepErrorMessage} from '@/utils/npepPresentation';
const props = defineProps({schoolId: {type: String, required: true}, deviceId: {type: String, required: true},
  schoolName: {type: String, default: ''}, deviceName: {type: String, default: ''}, bindingName: {type: String, default: ''}});
defineEmits(['close']);
const {snapshot, operations, busy, error, message, confirmed, pending, blocked, dailyBlocked, refresh, create, cancel} =
  useNpepRuntimeControl(toRef(props, 'schoolId'), toRef(props, 'deviceId'));
const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : '尚未上报';
const reason = code => npepErrorMessage({response: {data: {error: {code}}}});
</script>

<style scoped>
.npep-runtime-card { color: rgb(var(--v-theme-on-surface)); }
.npep-runtime-header { display: grid; gap: 5px; padding: 26px 28px 18px; white-space: normal; }
.npep-runtime-eyebrow { color: rgb(var(--v-theme-primary)); font-size: 12px; font-weight: 800; letter-spacing: .08em; }
.npep-runtime-header h2 { color: rgb(var(--v-theme-on-surface)); font-size: clamp(24px, 2vw, 30px); font-weight: 750; }
.npep-runtime-header p { color: rgba(var(--v-theme-on-surface), .7); font-size: 14px; }
.npep-runtime-content { display: grid; gap: 18px; padding: 0 28px 24px !important; }
.npep-runtime-section { padding: 22px; border: 1px solid rgba(var(--v-border-color), .2); border-radius: 16px; }
.npep-runtime-section-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.npep-runtime-section-heading h3 { color: rgb(var(--v-theme-on-surface)); font-size: 20px; font-weight: 750; }
.npep-runtime-section-heading p { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
.npep-runtime-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.npep-runtime-metrics > div { display: grid; align-content: center; gap: 6px; min-width: 0; padding: 14px; border-radius: 12px; background: rgba(var(--v-theme-on-surface), .045); }
.npep-runtime-metrics span { color: rgba(var(--v-theme-on-surface), .65); font-size: 12px; }
.npep-runtime-metrics strong { font-size: 15px; overflow-wrap: anywhere; }
.npep-runtime-status-line { margin-top: 12px; }
.npep-runtime-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.npep-runtime-actions > div { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; min-width: 0; padding: 18px; border: 1px solid rgba(var(--v-border-color), .18); border-radius: 14px; }
.npep-runtime-actions strong { font-size: 17px; }
.npep-runtime-actions p { flex: 1; color: rgba(var(--v-theme-on-surface), .72); font-size: 13px; }
.npep-runtime-actions :deep(.v-btn) { max-width: 100%; }
.npep-runtime-note { color: rgba(var(--v-theme-on-surface), .7); font-size: 13px; }
.npep-runtime-help, .npep-runtime-evidence { margin-top: 14px; }
.npep-runtime-help summary, .npep-runtime-evidence summary { color: rgb(var(--v-theme-primary)); cursor: pointer; font-weight: 700; }
.npep-runtime-help p, .npep-runtime-evidence p { margin-top: 10px; line-height: 1.65; }
.npep-runtime-operation { border-color: rgba(var(--v-border-color), .2) !important; }
.npep-runtime-operation strong { font-size: 16px; }
.npep-runtime-operation p { line-height: 1.6; }
@media (max-width: 600px) {
  .npep-runtime-header { padding: 20px 18px 16px; }
  .npep-runtime-content { padding: 0 18px 18px !important; }
  .npep-runtime-section { padding: 16px; }
  .npep-runtime-metrics, .npep-runtime-actions { grid-template-columns: 1fr; }
}
</style>
