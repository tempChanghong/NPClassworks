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
            <div class="notification-center__heading">
              大屏通知中心
            </div>
            <div class="notification-center__subtitle text-medium-emphasis font-weight-regular">
              当前有效通知与确认记录
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

      <v-card-text class="notification-center__body px-5 pb-5">
        <div class="notification-center__toolbar mb-4">
          <div
            class="notification-center__summary"
            aria-label="通知数量"
          >
            <div class="notification-center__stat">
              <v-icon
                icon="mdi-bell-outline"
                size="small"
              />
              当前 <strong>{{ summary.total }}</strong> 条
            </div>
            <div
              class="notification-center__stat"
              :class="{'notification-center__stat--pending': summary.pending}"
            >
              <v-icon
                icon="mdi-message-alert-outline"
                size="small"
              />
              待确认 <strong>{{ summary.pending }}</strong> 条
            </div>
            <div
              v-if="summary.urgent"
              class="notification-center__stat notification-center__stat--urgent"
            >
              <v-icon
                icon="mdi-alert-decagram"
                size="small"
              />
              紧急 <strong>{{ summary.urgent }}</strong> 条
            </div>
          </div>
          <v-btn
            v-if="summary.pending > 1"
            class="notification-center__bulk-action"
            :loading="hasPendingConfirmation"
            :disabled="hasPendingConfirmation"
            prepend-icon="mdi-check-all"
            variant="tonal"
            @click="acknowledgeAll"
          >
            {{ hasPendingConfirmation ? "正在确认" : "全部确认" }}
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
            :class="[
              `notification-center__item--${notice.priority?.toLowerCase() || 'normal'}`,
              {'notification-center__item--acknowledged': notice.acknowledged},
            ]"
            variant="flat"
          >
            <v-card-text class="notification-center__item-body">
              <div class="notification-center__badges">
                <v-chip
                  :color="priorityColor(notice.priority)"
                  :prepend-icon="priorityIcon(notice.priority)"
                  size="small"
                  variant="tonal"
                >
                  {{ priorityLabel(notice.priority) }}通知
                </v-chip>
                <v-chip
                  :color="notice.acknowledged ? 'success' : 'warning'"
                  :prepend-icon="notice.acknowledged ? 'mdi-check-circle' : 'mdi-circle-outline'"
                  size="small"
                  variant="tonal"
                >
                  {{ notice.acknowledged ? "已确认" : "待确认" }}
                </v-chip>
              </div>
              <h3
                v-if="notice.title"
                class="notification-center__title"
              >
                {{ notice.title }}
              </h3>
              <v-alert
                v-if="confirmationErrors.get(notificationAlertKey(notice))"
                class="mb-3"
                type="warning"
                variant="tonal"
                role="alert"
              >
                {{ confirmationErrors.get(notificationAlertKey(notice)) }}
              </v-alert>
              <div class="notification-center__content">
                {{ notice.content }}
              </div>
              <div class="notification-center__metadata text-medium-emphasis mt-4">
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
              class="notification-center__item-actions px-4 pb-4 pt-0"
            >
              <v-btn
                color="primary"
                :loading="pendingKeys.has(notificationAlertKey(notice))"
                :disabled="pendingKeys.has(notificationAlertKey(notice))"
                prepend-icon="mdi-check-bold"
                variant="flat"
                @click="acknowledge(notice)"
              >
                {{ pendingKeys.has(notificationAlertKey(notice)) ? "正在确认" : "知道了" }}
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
import {computed} from "vue";
import {notificationAlertKey} from "@/utils/notificationAlerts";
import {
  screenNotificationCenterItems,
  screenNotificationCenterSummary,
} from "@/utils/screenNotificationCenter";

const props = defineProps({
  modelValue: Boolean,
  notices: {type: Array, default: () => []},
  acknowledgedKeys: {type: Set, default: () => new Set()},
  pendingKeys: {type: Set, default: () => new Set()},
  confirmationErrors: {type: Map, default: () => new Map()},
});
const emit = defineEmits(["update:modelValue", "acknowledge", "acknowledge-all"]);

const dialogOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});
const items = computed(() => screenNotificationCenterItems(props.notices, props.acknowledgedKeys));
const summary = computed(() => screenNotificationCenterSummary(items.value));
const hasPendingConfirmation = computed(() => items.value.some(notice => props.pendingKeys.has(notificationAlertKey(notice))));

function acknowledge(notice) {
  emit("acknowledge", notice);
}

function acknowledgeAll() {
  const pending = items.value.filter((notice) => !notice.acknowledged);
  emit("acknowledge-all", pending);
}

function priorityColor(priority) {
  return {URGENT: "error", IMPORTANT: "warning", NORMAL: "primary", MINOR: "secondary"}[priority] || "primary";
}

function priorityIcon(priority) {
  return priority === "URGENT" ? "mdi-alert-decagram" : "mdi-bullhorn-outline";
}

function priorityLabel(priority) {
  return {URGENT: "紧急", IMPORTANT: "重要", NORMAL: "普通", MINOR: "次要"}[priority] || "普通";
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
.notification-center__heading { font-size: 1.2rem; font-weight: 700; line-height: 1.35; }
.notification-center__subtitle { font-size: .82rem; line-height: 1.4; white-space: normal; }
.notification-center__toolbar { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
.notification-center__summary { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }
.notification-center__stat {
  align-items: center;
  background: rgba(var(--v-theme-on-surface), .055);
  border-radius: 10px;
  display: inline-flex;
  font-size: .88rem;
  gap: 5px;
  padding: 7px 11px;
  white-space: nowrap;
}
.notification-center__stat strong { font-size: 1.03rem; }
.notification-center__stat--pending { background: rgba(var(--v-theme-warning), .15); }
.notification-center__stat--urgent { background: rgba(var(--v-theme-error), .12); }
.notification-center__bulk-action { flex-shrink: 0; }
.notification-center__grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
}
.notification-center__item {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), .16);
  border-inline-start: 4px solid rgb(var(--v-theme-primary));
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.notification-center__item--urgent { border-inline-start-color: rgb(var(--v-theme-error)); }
.notification-center__item--important { border-inline-start-color: rgb(var(--v-theme-warning)); }
.notification-center__item--minor { border-inline-start-color: rgb(var(--v-theme-secondary)); }
.notification-center__item--acknowledged { background: rgba(var(--v-theme-on-surface), .035); }
.notification-center__item-body { padding: 18px; }
.notification-center__badges { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; }
.notification-center__title { font-size: 1.12rem; line-height: 1.4; margin-top: 14px; overflow-wrap: anywhere; }
.notification-center__content {
  font-size: 1.08rem;
  line-height: 1.65;
  margin-top: 14px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.notification-center__title + .notification-center__content { margin-top: 8px; }
.notification-center__metadata {
  display: flex;
  font-size: .84rem;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.notification-center__metadata span { overflow-wrap: anywhere; }
.notification-center__item-actions { justify-content: flex-end; margin-top: auto; }
.min-width-0 { min-width: 0; }

@media (max-width: 600px) {
  .notification-center__header { padding: 16px !important; }
  .notification-center__body { padding: 0 16px 16px !important; }
  .notification-center__toolbar { align-items: stretch; flex-direction: column; }
  .notification-center__bulk-action { width: 100%; }
  .notification-center__grid { grid-template-columns: 1fr; }
  .notification-center__item-actions .v-btn { width: 100%; }
}
</style>
