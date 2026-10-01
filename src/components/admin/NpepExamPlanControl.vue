<template>
  <v-card class="rounded-xl plan-control">
    <v-card-title>考试方案 · {{ deviceName }}</v-card-title>
    <v-card-text>
      <p class="mb-3">
        {{ schoolName }} · {{ bindingName }}
      </p>
      <p class="mb-3">
        先切入考试模式，再投递 ExamAware JSON。校验通过后核对摘要，手动确认开始放映。已有放映不会被替换。
      </p>
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        class="mb-3"
      >
        {{ error }}
      </v-alert>
      <v-alert
        v-if="blocked"
        type="info"
        variant="tonal"
        class="mb-3"
      >
        {{ blocked }}
      </v-alert>
      <v-file-input
        label="选择考试方案（UTF-8 JSON，最多 24 KiB）"
        accept=".json,.ea2,application/json"
        :disabled="busy || !!pending"
        @update:model-value="choose"
      />
      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-btn
          color="primary"
          :disabled="!canSend"
          @click="create"
        >
          投递并校验
        </v-btn>
        <v-btn
          :disabled="busy"
          variant="text"
          @click="refresh"
        >
          刷新状态
        </v-btn>
        <v-btn
          v-if="pending"
          :disabled="busy"
          @click="retry"
        >
          核对并重试原请求
        </v-btn>
      </div>
      <p
        v-if="pending"
        class="mb-3"
      >
        上次请求结果未确认。重试使用同一个请求编号，不会新建另一任务。
      </p>
      <v-card
        v-for="op in view?.items || []"
        :key="op.operationId"
        variant="outlined"
        class="mb-3"
      >
        <v-card-text>
          <h3 class="text-subtitle-1">
            {{ op.fileName }} · {{ planStateName(op.state) }}
          </h3>
          <p class="text-caption">
            任务 {{ op.operationId }} · {{ time(op.createdAt) }}
          </p>
          <p
            v-if="op.reasonCode"
            class="my-2"
          >
            {{ planReason(op.reasonCode) }}
          </p>
          <template v-if="op.summary">
            <h4 class="mt-3">
              {{ op.summary.examName }}
            </h4>
            <p class="plan-message">
              {{ op.summary.message }}
            </p>
            <v-table
              density="compact"
              class="my-3"
            >
              <thead><tr><th>科目</th><th>开始</th><th>结束</th><th>结束前提醒</th></tr></thead>
              <tbody>
                <tr
                  v-for="(exam, index) in op.summary.exams"
                  :key="index"
                >
                  <td>{{ exam.name }}</td><td>{{ exam.start }}</td><td>{{ exam.end }}</td><td>{{ exam.alertTime > 0 ? `${exam.alertTime} 分钟` : '不提醒' }}</td>
                </tr>
              </tbody>
            </v-table>
            <p class="text-caption">
              SHA-256：{{ op.sha256 }}
            </p>
          </template>
          <p class="my-3">
            实际放映：{{ planPlayback(view, op, now) }}
          </p>
          <p
            v-if="op.state === 'STARTED'"
            class="text-caption mb-2"
          >
            “启动已受理”表示创建了会话，是否成功显示请看上面的实际放映状态。
          </p>
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
        </v-card-text>
      </v-card>
      <p v-if="view && !view.items.length">
        尚未投递考试方案。
      </p>
      <p class="text-caption">
        每 10 秒查询一次。关闭此页不会结束已启动的放映；结束放映请在 ExamAware 中操作。
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
        title="确认在这台设备开始放映"
      >
        <v-card-text>
          <p>{{ schoolName }} · {{ bindingName }} · {{ deviceName }}</p><p class="mt-3">
            {{ confirming.summary.examName }}（{{ confirming.summary.exams.length }} 场）
          </p><p class="mt-3">
            将使用刚才校验的方案开始放映，请确认目标设备和考试时间。
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
const time = value => new Date(value).toLocaleString('zh-CN');
function confirmStart() { const op = confirming.value; confirming.value = null; if (op) void start(op); }
</script>
<style scoped>
.plan-control { overflow-wrap: anywhere; }
.plan-control p { line-height: 1.7; }
.plan-message { white-space: pre-wrap; }
</style>
