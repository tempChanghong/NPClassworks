<template>
  <v-dialog
    v-model="dialogOpen"
    max-width="1120"
    scrollable
  >
    <v-card class="notification-center rounded-xl">
      <v-card-title class="notification-center__header pa-5 pb-3">
        <div class="d-flex align-center ga-3 min-width-0">
          <v-avatar
            color="primary"
            size="44"
            variant="tonal"
          >
            <v-icon icon="mdi-bell-outline" />
          </v-avatar>
          <div class="min-width-0">
            <div>大屏通知中心</div>
            <div class="text-body-2 text-medium-emphasis font-weight-regular">
              横幅确认后仍可在这里重新查看当前有效通知
            </div>
          </div>
        </div>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          title="关闭通知中心"
          variant="text"
          @click="dialogOpen = false"
        />
      </v-card-title>

      <v-card-text class="px-5 pb-5">
        <div class="d-flex align-center flex-wrap ga-2 mb-4">
          <v-chip
            prepend-icon="mdi-bell-outline"
            variant="tonal"
          >
            当前 {{ summary.total }} 条
          </v-chip>
          <v-chip
            :color="summary.pending ? 'warning' : 'success'"
            prepend-icon="mdi-message-alert-outline"
            variant="tonal"
          >
            待确认 {{ summary.pending }} 条
          </v-chip>
          <v-chip
            v-if="summary.urgent"
            color="error"
            prepend-icon="mdi-alert-decagram"
            variant="tonal"
          >
            紧急 {{ summary.urgent }} 条
          </v-chip>
          <v-spacer />
          <v-btn
            v-if="summary.pending > 1"
            prepend-icon="mdi-check-all"
            variant="tonal"
            @click="acknowledgeAll"
          >
            全部确认
          </v-btn>
        </div>

        <div
          v-if="items.length"
          class="notification-center__grid"
        >
          <v-card
            v-for="notice in items"
            :key="`${notice.id}:${notice.revision}`"
            class="notification-center__item rounded-xl"
            :class="{'notification-center__item--acknowledged': notice.acknowledged}"
            :color="priorityColor(notice.priority)"
            variant="tonal"
          >
            <v-card-title class="d-flex align-center flex-wrap ga-2 pb-1">
              <v-icon :icon="priorityIcon(notice.priority)" />
              <span class="notification-center__title">
                {{ notice.title || priorityLabel(notice.priority) + "通知" }}
              </span>
              <v-spacer />
              <v-chip
                :color="notice.acknowledged ? 'success' : 'warning'"
                :prepend-icon="notice.acknowledged ? 'mdi-check-circle' : 'mdi-circle-outline'"
                size="small"
                variant="tonal"
              >
                {{ notice.acknowledged ? "已确认" : "待确认" }}
              </v-chip>
            </v-card-title>
            <v-card-text>
              <div class="notification-center__content">
                {{ notice.content }}
              </div>
              <div class="notification-center__metadata text-medium-emphasis mt-3">
                <span>
                  <v-icon
                    icon="mdi-clock-outline"
                    size="small"
                  />
                  {{ formatDateTime(notice.publishAt) }}
                </span>
                <span v-if="targetNames(notice)">
                  <v-icon
                    icon="mdi-account-multiple-outline"
                    size="small"
                  />
                  {{ targetNames(notice) }}
                </span>
                <span v-if="notice.expiresAt">
                  <v-icon
                    icon="mdi-timer-sand"
                    size="small"
                  />
                  显示至 {{ formatDateTime(notice.expiresAt) }}
                </span>
              </div>
            </v-card-text>
            <v-card-actions
              v-if="!notice.acknowledged"
              class="px-4 pb-4 pt-0"
            >
              <v-spacer />
              <v-btn
                color="primary"
                prepend-icon="mdi-check-bold"
                variant="flat"
                @click="acknowledge(notice)"
              >
                知道了
              </v-btn>
            </v-card-actions>
          </v-card>
        </div>

        <v-empty-state
          v-else
          headline="当前没有通知"
          icon="mdi-bell-sleep-outline"
          text="教师发布的当前有效通知会集中显示在这里"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import {
  readAcknowledgedNotificationKeys,
  rememberAcknowledgedNotification,
} from "@/utils/notificationAlerts";
import {
  screenNotificationCenterItems,
  screenNotificationCenterSummary,
} from "@/utils/screenNotificationCenter";

const props = defineProps({
  modelValue: Boolean,
  bindingId: {type: String, default: "unbound"},
  notices: {type: Array, default: () => []},
});
const emit = defineEmits(["update:modelValue", "acknowledge", "acknowledge-all"]);

const acknowledgedKeys = ref(readAcknowledgedNotificationKeys(props.bindingId));
const dialogOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
const items = computed(() => screenNotificationCenterItems(props.notices, acknowledgedKeys.value));
const summary = computed(() => screenNotificationCenterSummary(items.value));

watch(() => [props.bindingId, props.modelValue], ([bindingId, open]) => {
  if (open) acknowledgedKeys.value = readAcknowledgedNotificationKeys(bindingId);
});

function acknowledge(notice) {
  acknowledgedKeys.value = rememberAcknowledgedNotification(notice, props.bindingId);
  emit("acknowledge", notice);
}

function acknowledgeAll() {
  const pending = items.value.filter((notice) => !notice.acknowledged);
  for (const notice of pending) {
    acknowledgedKeys.value = rememberAcknowledgedNotification(notice, props.bindingId);
  }
  emit("acknowledge-all", pending);
}

function priorityColor(priority) {
  return {URGENT: "error", IMPORTANT: "warning", NORMAL: "primary"}[priority] || "primary";
}

function priorityIcon(priority) {
  return priority === "URGENT" ? "mdi-alert-decagram" : "mdi-bullhorn-outline";
}

function priorityLabel(priority) {
  return {URGENT: "紧急", IMPORTANT: "重要", NORMAL: "普通"}[priority] || "普通";
}

function targetNames(notice) {
  return (notice.targets || [])
    .map((target) => target.workspace?.name || target.name)
    .filter(Boolean)
    .join("、");
}

function formatDateTime(value) {
  if (!value) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
</script>

<style scoped>
.notification-center { max-height: min(86vh, 920px); }
.notification-center__header { align-items: center; display: flex; }
.notification-center__grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
}
.notification-center__item { min-width: 0; }
.notification-center__item--acknowledged { opacity: 0.78; }
.notification-center__title { overflow-wrap: anywhere; }
.notification-center__content {
  font-size: 1.08rem;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.notification-center__metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.min-width-0 { min-width: 0; }

@media (max-width: 600px) {
  .notification-center__grid { grid-template-columns: 1fr; }
}
</style>
