<template>
  <v-dialog
    :model-value="Boolean(currentNotice)"
    max-width="1100"
    persistent
    scrollable
    aria-label="大屏通知提示"
  >
    <v-card
      v-if="currentNotice"
      :key="`${currentNotice.id}:${currentNotice.revision}`"
      class="screen-notice-popup rounded-xl"
    >
      <v-card-title
        class="d-flex align-center flex-wrap ga-3 pa-5"
        :class="`bg-${priority.color}`"
      >
        <v-icon :icon="priority.icon" />
        <span>{{ priority.label }}通知</span>
        <v-spacer />
        <span
          v-if="pending.length > 1"
          class="text-body-1"
        >还有 {{ pending.length - 1 }} 条待确认</span>
      </v-card-title>
      <v-card-text class="notice-popup-scroll pa-6">
        <div
          v-if="currentNotice.title"
          class="notice-popup-title mb-4"
        >
          {{ currentNotice.title }}
        </div>
        <div class="notice-popup-content">
          {{ currentNotice.content }}
        </div>
        <div class="text-body-1 text-medium-emphasis mt-5">
          发布人：{{ currentNotice.author?.name || "教师" }}
        </div>
      </v-card-text>
      <v-card-actions class="pa-4">
        <span class="text-body-2 text-medium-emphasis">确认后可在通知中心重新查看</span>
        <v-spacer />
        <v-btn
          :color="priority.color"
          size="large"
          variant="flat"
          prepend-icon="mdi-check-bold"
          @click="$emit('acknowledge', currentNotice)"
        >
          知道了
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {computed} from "vue";
import {screenNotificationPopupEnabled} from "@/utils/notificationAlerts";
import {screenNotificationCenterItems} from "@/utils/screenNotificationCenter";
import {publicationPriorityMeta} from "@/utils/publicationStatus";

const props = defineProps({
  notices: {type: Array, default: () => []},
  acknowledgedKeys: {type: Set, default: () => new Set()},
});
defineEmits(["acknowledge"]);
const pending = computed(() => screenNotificationCenterItems(props.notices, props.acknowledgedKeys)
  .filter(notice => !notice.acknowledged && screenNotificationPopupEnabled(notice)));
const currentNotice = computed(() => pending.value[0] || null);
const priority = computed(() => publicationPriorityMeta(currentNotice.value?.priority));
</script>

<style scoped>
.screen-notice-popup { max-height: 90dvh; }
.notice-popup-title { font-size: clamp(24px, 3vw, 40px); font-weight: 700; overflow-wrap: anywhere; }
.notice-popup-content { font-size: clamp(24px, 2.6vw, 36px); line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.notice-popup-scroll { min-height: 0; }
</style>
