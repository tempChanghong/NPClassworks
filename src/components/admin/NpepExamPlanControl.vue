<template>
  <v-card class="plan-control rounded-xl">
    <v-card-title class="plan-header">
      <span class="plan-eyebrow">设备控制 · NPEP</span>
      <h2>考试方案</h2>
      <p>{{ schoolName }} · {{ deviceName }} · {{ bindingName }}</p>
    </v-card-title>
    <v-card-text class="plan-content">
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
      >
        {{ error }}
      </v-alert>
      <v-alert
        v-if="blocked"
        type="info"
        variant="tonal"
      >
        {{ blocked }}
      </v-alert>

      <section
        class="plan-section"
        aria-labelledby="plan-upload-title"
      >
        <div class="plan-section-heading">
          <div>
            <h3 id="plan-upload-title">
              投递考试方案
            </h3>
            <p>先在“考试模式”完成环境切换。投递后由设备校验，再由管理员核对并开始放映。</p>
          </div>
          <v-btn
            :disabled="busy"
            variant="tonal"
            prepend-icon="mdi-refresh"
            @click="refresh"
          >
            刷新状态
          </v-btn>
        </div>
        <v-file-input
          label="选择考试方案"
          accept=".json,.ea2,application/json"
          :disabled="busy || !!pending"
          @update:model-value="choose"
        />
        <p class="plan-note mb-3">
          支持 UTF-8 JSON（.json／.ea2），不超过 24 KiB。
        </p>
        <div class="plan-upload-actions">
          <v-btn
            color="primary"
            :disabled="!canSend"
            @click="create"
          >
            投递并校验
          </v-btn>
          <v-btn
            v-if="pending"
            :disabled="busy"
            variant="tonal"
            @click="retry"
          >
            核对并重试原请求
          </v-btn>
        </div>
        <p
          v-if="pending"
          class="plan-note mt-3"
        >
          上次请求结果未确认。重试使用同一个请求编号，不会新建另一任务。
        </p>
      </section>

      <section
        class="plan-section"
        aria-labelledby="plan-results-title"
      >
        <div class="plan-section-heading">
          <div>
            <h3 id="plan-results-title">
              方案与放映状态
            </h3>
            <p>校验通过不等于已开始放映；最终显示情况以设备最近观测为准。</p>
          </div>
        </div>
        <v-card
          v-for="op in view?.items || []"
          :key="op.operationId"
          variant="outlined"
          class="plan-result mb-3"
        >
          <v-card-text>
            <div class="plan-result-heading">
              <h4>{{ op.fileName }} · {{ planStateName(op.state) }}</h4>
              <p class="plan-note">
                投递于 {{ time(op.createdAt) }}
              </p>
            </div>
            <v-alert
              v-if="op.reasonCode"
              type="warning"
              variant="tonal"
              class="mt-4"
            >
              {{ planReason(op.reasonCode) }}
            </v-alert>
            <div
              v-if="op.summary"
              class="plan-summary"
            >
              <h5>{{ op.summary.examName }}</h5>
              <p class="plan-note">
                {{ op.summary.exams.length }} 场考试 · 请逐项核对时间
              </p>
              <p
                v-if="op.summary.message"
                class="plan-message"
              >
                {{ op.summary.message }}
              </p>
              <div class="plan-exams">
                <div
                  v-for="(exam, index) in op.summary.exams"
                  :key="index"
                  class="plan-exam"
                >
                  <strong>{{ exam.name }}</strong>
                  <div class="plan-exam-times">
                    <span>开始 {{ time(exam.start) }}</span>
                    <span>结束 {{ time(exam.end) }}</span>
                  </div>
                  <small>结束前提醒：{{ exam.alertTime > 0 ? exam.alertTime + ' 分钟' : '不提醒' }}</small>
                </div>
              </div>
            </div>
            <div class="plan-playback">
              <span>实际放映</span>
              <strong>{{ planPlayback(view, op, now) }}</strong>
            </div>
            <p
              v-if="op.state === 'STARTED'"
              class="plan-note mt-3"
            >
              “启动已受理”表示创建了会话，是否成功显示请看上面的实际放映状态。
            </p>
            <div class="plan-result-actions">
              <v-btn
                v-if="op.state === 'PREPARED'"
                color="primary"
                :disabled="!canStart(op)"
                @click="confirming = op"
              >
                核对并开始放映
              </v-btn>
              <v-btn
                v-if="!planTerminal(op) && !op.grant"
                variant="text"
                :disabled="busy || !!pending"
                @click="cancel(op)"
              >
                取消本次方案
              </v-btn>
            </div>
            <details class="plan-diagnostics">
              <summary>查看校验与诊断信息</summary>
              <p>任务编号：{{ op.operationId }}</p>
              <p v-if="op.sha256">
                SHA-256：{{ op.sha256 }}
              </p>
            </details>
          </v-card-text>
        </v-card>
        <p
          v-if="view && !view.items.length"
          class="plan-empty"
        >
          尚未投递考试方案。
        </p>
      </section>
      <p class="plan-note">
        每 10 秒查询一次。关闭此页不会结束已启动的放映；结束放映请在 ExamAware 中操作。已有放映不会被新方案替换。
      </p>
    </v-card-text>
    <v-card-actions>
      <v-spacer /><v-btn @click="$emit('close')">
        关闭
      </v-btn>
    </v-card-actions>
    <v-dialog
      :model-value="!!confirming"
      max-width="560"
      @update:model-value="value => { if (!value) confirming = null; }"
    >
      <v-card
        v-if="confirming"
        class="plan-confirm"
        title="确认在这台设备开始放映"
      >
        <v-card-text>
          <p>{{ schoolName }} · {{ bindingName }} · {{ deviceName }}</p>
          <h3 class="mt-4">
            {{ confirming.summary.examName }}
          </h3>
          <p class="plan-note">
            共 {{ confirming.summary.exams.length }} 场；请再次核对时间与目标设备。
          </p>
          <div class="plan-exams mt-3">
            <div
              v-for="(exam, index) in confirming.summary.exams"
              :key="index"
              class="plan-exam"
            >
              <strong>{{ exam.name }}</strong>
              <div class="plan-exam-times">
                <span>开始 {{ time(exam.start) }}</span>
                <span>结束 {{ time(exam.end) }}</span>
              </div>
            </div>
          </div>
          <p class="plan-note mt-3">
            将使用刚才校验的方案开始放映。已有放映不会被替换。
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer /><v-btn @click="confirming = null">
            返回核对
          </v-btn><v-btn
            color="primary"
            :disabled="!canStart(confirming)"
            @click="confirmStart"
          >
            开始放映
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>
<script setup>
import {ref, toRef} from 'vue';
import {useNpepExamPlans} from '@/composables/admin/useNpepExamPlans';
import {planPlayback, planReason, planStateName, planTerminal} from '@/utils/npepExamPlans';
const props = defineProps({schoolId: {type: String, required: true}, deviceId: {type: String, required: true},
  schoolName: {type: String, default: ''}, deviceName: {type: String, default: ''}, bindingName: {type: String, default: ''}});
defineEmits(['close']);
const {view, busy, error, pending, now, blocked, canSend, canStart, refresh, choose, create, start, cancel, retry} = useNpepExamPlans(toRef(props, 'schoolId'), toRef(props, 'deviceId'));
const confirming = ref(null);
const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN') : '时间未知';
function confirmStart() { const op = confirming.value; confirming.value = null; if (op) void start(op); }
</script>
<style scoped>
.plan-control { overflow-wrap: anywhere; }
.plan-control p { line-height: 1.6; }
.plan-header { display: grid; gap: 5px; padding: 26px 28px 18px; white-space: normal; }
.plan-eyebrow { color: rgb(var(--v-theme-primary)); font-size: 12px; font-weight: 800; letter-spacing: .08em; }
.plan-header h2 { font-size: clamp(24px, 2vw, 30px); font-weight: 750; }
.plan-header p, .plan-note { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
.plan-content { display: grid; gap: 18px; padding: 0 28px 24px !important; }
.plan-section { padding: 22px; border: 1px solid rgba(var(--v-border-color), .2); border-radius: 16px; }
.plan-section-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.plan-section-heading h3 { font-size: 20px; font-weight: 750; }
.plan-section-heading p { color: rgba(var(--v-theme-on-surface), .68); font-size: 13px; }
.plan-upload-actions, .plan-result-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.plan-result { border-color: rgba(var(--v-border-color), .2) !important; }
.plan-result-heading h4 { font-size: 17px; font-weight: 750; }
.plan-summary { margin-top: 18px; }
.plan-summary h5 { font-size: 18px; font-weight: 750; }
.plan-message { margin: 12px 0; white-space: pre-wrap; }
.plan-exams { display: grid; gap: 8px; margin-top: 12px; }
.plan-exam { display: grid; grid-template-columns: minmax(85px, .6fr) minmax(0, 2fr) minmax(105px, .8fr); gap: 8px 16px; padding: 12px 14px; border-radius: 12px; background: rgba(var(--v-theme-on-surface), .045); }
.plan-exam-times { display: flex; flex-wrap: wrap; gap: 4px 16px; }
.plan-exam span, .plan-exam small { color: rgba(var(--v-theme-on-surface), .75); }
.plan-playback { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 12px; margin-top: 18px; padding: 12px 14px; border-radius: 12px; background: rgba(var(--v-theme-primary), .09); }
.plan-playback span { color: rgba(var(--v-theme-on-surface), .7); font-size: 13px; }
.plan-playback strong { font-size: 16px; }
.plan-result-actions { margin-top: 16px; }
.plan-diagnostics { margin-top: 16px; }
.plan-diagnostics summary { color: rgb(var(--v-theme-primary)); cursor: pointer; font-weight: 700; }
.plan-diagnostics p { margin-top: 10px; overflow-wrap: anywhere; }
.plan-empty { padding: 20px; border: 1px dashed rgba(var(--v-border-color), .28); border-radius: 12px; }
.plan-confirm .plan-exam { grid-template-columns: minmax(80px, .6fr) minmax(0, 2fr); }
@media (max-width: 600px) {
  .plan-header { padding: 20px 18px 16px; }
  .plan-content { padding: 0 18px 18px !important; }
  .plan-section { padding: 16px; }
  .plan-exam { grid-template-columns: 1fr; }
}
</style>
