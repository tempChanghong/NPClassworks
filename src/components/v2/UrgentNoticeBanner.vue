<template>
  <v-alert
    v-if="currentNotice"
    border="start"
    class="urgent-notice-banner rounded-xl"
    color="error"
    icon="mdi-alert-decagram"
    prominent
    variant="elevated"
  >
    <template #title>
      <div class="d-flex align-center flex-wrap ga-2">
        <span>紧急通知</span>
        <v-chip
          v-if="visibleNotices.length > 1"
          color="white"
          size="small"
          variant="tonal"
        >
          另有 {{ visibleNotices.length - 1 }} 条
        </v-chip>
      </div>
    </template>

    <div
      v-if="currentNotice.title"
      class="font-weight-bold urgent-notice-title"
    >
      {{ currentNotice.title }}
    </div>
    <div class="urgent-notice-content">
      {{ currentNotice.content }}
    </div>
    <div
      v-if="currentNotice.expiresAt"
      class="text-caption mt-2"
    >
      显示至 {{ formatDateTime(currentNotice.expiresAt) }}
    </div>

    <div class="urgent-notice-actions mt-3">
      <v-btn
        v-if="visibleNotices.length > 1"
        :disabled="currentIndex === 0"
        icon="mdi-chevron-left"
        size="small"
        title="上一条紧急通知"
        variant="tonal"
        @click="currentIndex -= 1"
      />
      <span
        v-if="visibleNotices.length > 1"
        class="text-caption font-weight-medium"
      >
        {{ currentIndex + 1 }} / {{ visibleNotices.length }}
      </span>
      <v-btn
        v-if="visibleNotices.length > 1"
        :disabled="currentIndex >= visibleNotices.length - 1"
        icon="mdi-chevron-right"
        size="small"
        title="下一条紧急通知"
        variant="tonal"
        @click="currentIndex += 1"
      />
      <v-spacer />
      <v-btn
        v-if="soundEnabled"
        icon="mdi-volume-high"
        size="small"
        title="播放提示音"
        variant="tonal"
        @click="playAlertSound"
      />
      <v-btn
        prepend-icon="mdi-check-bold"
        size="small"
        variant="elevated"
        @click="acknowledgeCurrent"
      >
        知道了
      </v-btn>
    </div>
  </v-alert>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import {getSetting} from "@/utils/settings";
import {playSound} from "@/utils/soundList";
import {
  createNotificationAlertController,
  readAcknowledgedNotificationKeys,
  rememberAcknowledgedNotification,
} from "@/utils/notificationAlerts";

const props = defineProps({
  notices: {type: Array, default: () => []},
  soundEnabled: Boolean,
  systemNotificationEnabled: Boolean,
  bindingId: {type: String, default: "unbound"},
});
const emit = defineEmits(["acknowledge"]);

const currentIndex = ref(0);
const acknowledgedKeys = ref(readAcknowledgedNotificationKeys(props.bindingId));
const visibleNotices = computed(() => props.notices.filter((notice) =>
  !acknowledgedKeys.value.has(`${notice.id}:${notice.revision}`),
));
const currentNotice = computed(() => visibleNotices.value[currentIndex.value] || null);
const alertKeys = computed(() => props.notices.map((notice) => `${notice.id}:${notice.revision}`));
let alertController = createNotificationAlertController({scopeId: props.bindingId});

function rememberAcknowledgedKey(notice) {
  acknowledgedKeys.value = rememberAcknowledgedNotification(notice, props.bindingId);
}

function playAlertSound() {
  playSound(getSetting("notification.urgentSound"));
}

watch(() => props.bindingId, (bindingId) => {
  alertController = createNotificationAlertController({scopeId: bindingId});
  acknowledgedKeys.value = readAcknowledgedNotificationKeys(bindingId);
  currentIndex.value = 0;
});

watch(() => visibleNotices.value.length, (length) => {
  currentIndex.value = Math.max(0, Math.min(currentIndex.value, length - 1));
});

watch(alertKeys, () => {
  alertController.alert(props.notices, {
    soundEnabled: props.soundEnabled,
    soundFile: getSetting("notification.urgentSound"),
    systemNotificationEnabled: props.systemNotificationEnabled,
  });
}, {immediate: true});

function acknowledgeCurrent() {
  if (!currentNotice.value) return;
  const notice = currentNotice.value;
  rememberAcknowledgedKey(notice);
  emit("acknowledge", notice);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
</script>

<style scoped>
.urgent-notice-banner { margin-top: 16px; }
.urgent-notice-title { font-size: 1.05rem; }
.urgent-notice-content {
  font-size: 1.2rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.urgent-notice-actions {
  align-items: center;
  display: flex;
  gap: 8px;
}
</style>
