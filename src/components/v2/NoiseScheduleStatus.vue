<template>
  <section class="my-4 pa-4 rounded-lg bg-surface-variant">
    <h4 class="mb-2">
      学校自动监测
    </h4>
    <p
      v-if="error"
      class="text-warning"
    >
      {{ error }}
    </p>
    <p v-if="!value?.supported">
      {{ value ? '当前设备尚未上报排程能力，请更新 NPEduTools。' : '正在核对排程接口…' }}
    </p>
    <template v-else>
      <p>规则来源：{{ sources[value.policy?.source] || '未知' }} · {{ value.applied ? '桌面已应用当前规则' : '规则待桌面确认' }}</p>
      <p v-if="!value.online">
        设备离线／状态陈旧；下列内容为上次回传，不代表当前执行状态。
      </p>
      <p>{{ value.online ? '执行状态' : '上次执行状态' }}：{{ reasons[value.status?.reason] || value.status?.reason || '等待回传' }}</p>
      <p v-if="value.status?.owner === 'Manual'">
        当前为手动会话；自动排程不会接管或停止它。
      </p>
      <p>学校时间：{{ calendar(value.status?.schoolNow) }} · {{ value.status?.clockReady ? '已校验' : '等待校验' }}</p>
      <p v-if="value.status?.window">
        本次时段：{{ range(value.status.window) }}
      </p>
      <p v-if="value.status?.next">
        下次时段：{{ range(value.status.next) }}
      </p>
      <p
        v-if="value.status?.leaseRemainingSeconds > 0"
        class="text-caption"
      >
        当前规则确认有效期剩余约 {{ Math.ceil(value.status.leaseRemainingSeconds / 60) }} 分钟；后台重启需联网重新确认。
      </p>
      <v-btn
        v-if="allowResume && resumable"
        class="mt-3"
        :disabled="busy || !value.online || !value.applied || pending"
        @click="$emit('resume')"
      >
        {{ value.status?.dateNeedsReview ? '核对学校日期后恢复本次监测' : '恢复本次自动监测' }}
      </v-btn>
      <p
        v-if="pending"
        class="text-caption mt-2"
      >
        恢复请求等待桌面处理。
      </p>
    </template>
  </section>
</template>
<script setup>
import {computed} from 'vue';
const props=defineProps({value:{type:Object,default:null},error:{type:String,default:''},allowResume:Boolean,busy:Boolean});
defineEmits(['resume']);
const sources={None:'未配置',Disabled:'已关闭',Grade:'年级排程',Class:'班级覆盖'};
const reasons={NOT_ELIGIBLE:'互联未启用',POLICY_EXPIRED:'等待联网确认规则',DISABLED:'自动监测已关闭',EXAM_PAUSED:'考试期间暂停',
  SCHOOL_CLOCK_UNAVAILABLE:'等待 ClassIsland 学校时间校验',OUTSIDE_WINDOW:'等待下次时段',WINDOW_SKIPPED:'本次已手动停止',
  WINDOW_FAILED:'本次采集失败，等待修复或重试',MICROPHONE_NOT_CONFIGURED:'请在 NPEduTools 保存麦克风',CAPTURE_BUSY:'等待释放麦克风',
  WINDOW_ACTIVE:'正在按排程监测',CAPTURE_STARTING:'正在打开排程麦克风，尚未确认采样',MANUAL_ACTIVE:'手动监测进行中',SCHEDULE_STORE_UNAVAILABLE:'本机排程记录无法保存，请检查磁盘',STATISTICS_STORE_UNAVAILABLE:'本机统计存储异常，自动监测已暂停'};
const calendar=v=>v?v.replace('T',' ').slice(0,19):'暂无可靠学校时间';
const range=w=>`${calendar(w.start)} → ${calendar(w.end)}`;
const resumable=computed(()=>!!props.value?.status?.window && (['WINDOW_SKIPPED','WINDOW_FAILED'].includes(props.value.status.reason)||props.value.status.dateNeedsReview));
const pending=computed(()=>props.value?.commands?.some(c=>!c.receipt));
</script>
