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
          v-if="notices.length > 1"
          color="white"
          size="small"
          variant="tonal"
        >
          另有 {{ notices.length - 1 }} 条
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

    <template
      v-if="soundEnabled"
      #append
    >
      <v-btn
        icon="mdi-volume-high"
        title="播放提示音"
        variant="tonal"
        @click="playAlertSound"
      />
    </template>
  </v-alert>
</template>

<script setup>
import {computed, watch} from "vue";
import {defaultSingleSound, playSound} from "@/utils/soundList";

const props = defineProps({
  notices: {type: Array, default: () => []},
  soundEnabled: Boolean,
  bindingId: {type: String, default: "unbound"},
});

const currentNotice = computed(() => props.notices[0] || null);
const alertKeys = computed(() => props.notices.map((notice) => `${notice.id}:${notice.revision}`));
const storageKey = computed(() => `classworks-v2-urgent-notices-seen:${props.bindingId}`);

function readSeenKeys() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey.value));
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function rememberSeenKeys(keys) {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify([...keys].slice(-100)));
  } catch {
    // The banner still works when browser storage is unavailable.
  }
}

function playAlertSound() {
  playSound(defaultSingleSound);
}

watch(alertKeys, (keys) => {
  const seen = readSeenKeys();
  const hasNewNotice = keys.some((key) => !seen.has(key));
  keys.forEach((key) => seen.add(key));
  rememberSeenKeys(seen);
  if (hasNewNotice && props.soundEnabled) playAlertSound();
}, {immediate: true});

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
</style>
