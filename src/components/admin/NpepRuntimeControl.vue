<template>
  <v-card class="rounded-xl">
    <v-card-title>远程考试模式</v-card-title>
    <v-card-subtitle>{{ schoolName }} · {{ deviceName }} · {{ bindingName }}</v-card-subtitle>
    <v-card-text>
      <v-alert
        type="info"
        variant="tonal"
        class="mb-4"
      >
        关闭 ClassIsland 管理员登录自启动、开启 ExamAware2 登录自启动，保存考试模式并暂停后续自动录课。
        立即准备 ExamAware2，确认就绪后正常退出 ClassIsland；正在录制时先正常保存，通知窗口暂时收起。已满足的步骤会跳过，失败后可重试补完。
        “结束考试／返回日常”会恢复日常自启动，正常退出 ExamAware2、启动 ClassIsland；全部核实成功后解除远程录课暂停。已有放映请先结束，编辑器未保存等退出阻碍需现场处理。
      </v-alert>
      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        class="mb-3"
      >
        {{ error }}
      </v-alert>
      <v-alert
        v-if="message"
        type="info"
        variant="tonal"
        class="mb-3"
      >
        {{ message }}
      </v-alert>
      <p>配对授权：{{ snapshot?.policy?.enabled ? '已生效' : '未生效／未知' }}</p>
      <p>最近观测的运行环境：{{ runtimeModeName(snapshot?.status?.runtimeMode) }}</p>
      <p v-if="snapshot?.status?.remoteExamPause">
        自动录课已暂停。远程返回日常成功后自动解除本次暂停；也可在大屏本地返回日常并核实解除。
      </p>
      <p v-if="snapshot?.status?.reasonCode">
        当前检查：{{ reason(snapshot.status.reasonCode) }}（{{ snapshot.status.reasonCode }}）
      </p>
      <p v-if="snapshot?.status?.runtimePhase === 'SWITCHING'">
        正在切换：{{ runtimeStepName(snapshot.status.step) }}
      </p>
      <p>最近上报：{{ time(snapshot?.receivedAt) }}</p>
      <p
        v-if="blocked"
        class="my-3"
      >
        {{ blocked }}
      </p>
      <v-checkbox
        v-model="confirmed"
        :disabled="busy || !!blocked || !!pending"
        label="已核对学校、班级与设备，同意所选模式的软件切换及登录自启动设置"
        hide-details
      />
      <div class="d-flex flex-wrap ga-2 my-3">
        <v-btn
          color="primary"
          :disabled="busy || (!!pending && pending.body.target !== 'EXAM') || (!pending && (!confirmed || !!blocked))"
          @click="create('EXAM')"
        >
          {{ pending?.body.target === 'EXAM' ? '重试提交同一请求' : '切入／重试考试模式' }}
        </v-btn>
        <v-btn
          color="secondary"
          :disabled="busy || (!!pending && pending.body.target !== 'DAILY') || (!pending && (!confirmed || !!dailyBlocked))"
          @click="create('DAILY')"
        >
          {{ pending?.body.target === 'DAILY' ? '重试返回日常请求' : '结束考试／返回日常' }}
        </v-btn>
        <v-btn
          variant="text"
          :disabled="busy"
          @click="refresh"
        >
          刷新状态
        </v-btn>
      </div>
      <p
        v-if="dailyBlocked && !blocked"
        class="text-caption"
      >
        {{ dailyBlocked }}
      </p>
      <p
        v-if="pending"
        class="text-caption"
      >
        提交结果尚待核实。重试沿用同一请求，不会创建第二个任务。
      </p>
      <h3 class="text-subtitle-1 mt-5 mb-2">
        最近 20 项操作
      </h3>
      <p v-if="!operations.length">
        暂无操作记录。
      </p>
      <v-card
        v-for="operation in operations"
        :key="operation.operationId"
        variant="outlined"
        class="mb-2"
      >
        <v-card-text>
          <strong>{{ operation.target === 'DAILY' ? '返回日常' : '进入考试' }} · {{ runtimeStateName(operation.state, operation.target) }}</strong>
          <p v-if="operation.step">
            最后执行步骤：{{ runtimeStepName(operation.step) }}
          </p>
          <p>{{ time(operation.createdAt) }} · {{ operation.initiator.displayName }}</p>
          <p class="text-caption">
            {{ operation.operationId }}
          </p>
          <p v-if="operation.reasonCode">
            原因：{{ reason(operation.reasonCode) }}（{{ operation.reasonCode }}）
          </p>
          <p v-if="!operation.resolvedAt && operation.freshness !== 'CURRENT'">
            没有近期进度回执，当前显示历史结果；不代表软件已经退出。
          </p>
          <div
            v-if="operation.evidence"
            class="mt-2"
          >
            <p class="text-caption">
              完成／中断时的设备回执（不代表此刻运行状态）：
            </p>
            <p
              v-for="line in runtimeEvidence(operation.evidence)"
              :key="line"
            >
              {{ line }}
            </p>
          </div>
          <p v-if="operation.localEndedAt">
            现场已结束 N3 暂停：{{ time(operation.localEndedAt) }}
          </p>
          <v-btn
            v-if="!operation.grant && !operation.resolvedAt"
            variant="text"
            :disabled="busy"
            @click="cancel(operation)"
          >
            取消尚未开始的任务
          </v-btn>
        </v-card-text>
      </v-card>
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
