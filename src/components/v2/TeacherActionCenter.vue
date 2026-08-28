<template>
  <v-card
    class="teacher-action-center mb-6 rounded-xl"
    :color="summary.total ? undefined : 'success'"
    :variant="summary.total ? 'flat' : 'tonal'"
  >
    <v-card-title class="action-center-header d-flex align-center flex-wrap ga-2 pa-5 pb-3">
      <v-avatar
        :color="summary.total ? 'warning' : 'success'"
        size="40"
        variant="tonal"
      >
        <v-icon :icon="summary.total ? 'mdi-inbox-arrow-down-outline' : 'mdi-check-all'" />
      </v-avatar>
      <div>
        <div class="d-flex align-center ga-2">
          <span>待处理中心</span>
          <v-chip
            v-if="summary.total"
            color="warning"
            size="small"
            variant="tonal"
          >
            {{ summary.total }} 项
          </v-chip>
        </div>
        <div class="text-caption text-medium-emphasis font-weight-regular">
          {{ summary.total ? "集中检查大屏录入和教师确认后发生的修改" : "目前没有需要教师确认的内容" }}
        </div>
      </div>
      <v-spacer />
      <v-btn
        :loading="loading"
        icon="mdi-refresh"
        title="刷新待处理事项"
        variant="text"
        @click="$emit('refresh')"
      />
    </v-card-title>

    <template v-if="summary.total">
      <v-card-text class="px-5 pt-1 pb-4">
        <div class="d-flex flex-wrap ga-2">
          <v-chip
            v-for="filter in filters"
            :key="filter.value || 'all'"
            :color="activeReason === filter.value ? filter.color : undefined"
            :prepend-icon="filter.icon"
            :variant="activeReason === filter.value ? 'flat' : 'tonal'"
            @click="activeReason = filter.value"
          >
            {{ filter.title }} {{ filter.count }}
          </v-chip>
        </div>
      </v-card-text>
      <v-divider />
      <v-card-text class="pa-5">
        <div class="action-center-grid">
          <v-card
            v-for="item in filteredItems"
            :key="item.id"
            border
            class="action-item rounded-lg"
            :class="`action-item--${item.severity.toLowerCase()}`"
            variant="flat"
          >
            <v-card-text class="pa-4">
              <div class="d-flex align-start ga-3">
                <v-icon
                  :color="reasonMeta(item).color"
                  :icon="reasonMeta(item).icon"
                  size="24"
                />
                <div class="min-width-0 flex-grow-1">
                  <div class="d-flex align-center flex-wrap ga-2 mb-1">
                    <strong>{{ reasonMeta(item).label }}</strong>
                    <v-chip
                      v-if="item.overdue"
                      color="error"
                      size="x-small"
                      variant="tonal"
                    >
                      已截止
                    </v-chip>
                    <v-chip
                      v-else-if="item.dueSoon"
                      color="warning"
                      size="x-small"
                      variant="tonal"
                    >
                      临近截止
                    </v-chip>
                  </div>
                  <div class="text-caption text-medium-emphasis">
                    {{ sourceLabel(item.publication) }} · {{ relativeTime(item.publication.updatedAt) }}
                  </div>
                </div>
              </div>

              <div class="d-flex align-center flex-wrap ga-2 mt-4 mb-2">
                <v-chip
                  size="small"
                  variant="tonal"
                >
                  {{ item.publication.subject?.name || (item.publication.type === "NOTICE" ? "通知" : "未指定科目") }}
                </v-chip>
                <v-chip
                  v-if="item.publication.dueAt"
                  prepend-icon="mdi-calendar-clock-outline"
                  size="small"
                  variant="tonal"
                >
                  截止 {{ formatDateTime(item.publication.dueAt) }}
                </v-chip>
                <span class="text-body-2 text-medium-emphasis">
                  {{ targetNames(item.publication) }}
                </span>
              </div>
              <div
                v-if="item.publication.title"
                class="font-weight-bold mb-1"
              >
                {{ item.publication.title }}
              </div>
              <div class="action-content">
                {{ item.publication.content || "（无正文）" }}
              </div>

              <div
                v-if="item.changedFields?.length"
                class="change-summary mt-3 pa-3 rounded-lg"
              >
                <div class="text-caption font-weight-bold mb-1">
                  教师确认版本 #{{ item.lastCertifiedRevision.revision }} → 当前版本 #{{ item.publication.revision }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  发生变化：{{ item.changedFields.map((change) => change.label).join("、") }}
                </div>
                <div
                  v-if="contentChange(item)"
                  class="change-content mt-2"
                >
                  <div class="change-content__before">
                    − {{ shortValue(contentChange(item).before) }}
                  </div>
                  <div class="change-content__after">
                    ＋ {{ shortValue(contentChange(item).after) }}
                  </div>
                </div>
              </div>

              <div class="d-flex align-center flex-wrap ga-2 mt-4">
                <v-btn
                  color="success"
                  :loading="busyId === item.id"
                  prepend-icon="mdi-check-decagram-outline"
                  size="small"
                  variant="flat"
                  @click="$emit('certify', item)"
                >
                  确认此版本
                </v-btn>
                <v-btn
                  prepend-icon="mdi-pencil-check-outline"
                  size="small"
                  variant="tonal"
                  @click="$emit('edit', item.publication)"
                >
                  修改并确认
                </v-btn>
                <v-menu>
                  <template #activator="{props: menuProps}">
                    <v-btn
                      v-bind="menuProps"
                      icon="mdi-dots-horizontal"
                      size="small"
                      title="更多处理方式"
                      variant="text"
                    />
                  </template>
                  <v-list>
                    <v-list-item
                      v-if="item.lastCertifiedRevision"
                      prepend-icon="mdi-backup-restore"
                      title="恢复最近教师确认版本"
                      @click="$emit('restore', item)"
                    />
                    <v-list-item
                      prepend-icon="mdi-history"
                      title="查看完整版本历史"
                      @click="$emit('history', item.publication)"
                    />
                  </v-list>
                </v-menu>
              </div>
            </v-card-text>
          </v-card>
        </div>
        <v-empty-state
          v-if="!filteredItems.length"
          headline="这个分类已经处理完了"
          icon="mdi-check-all"
          text="可以切换到其他待处理分类"
        />
      </v-card-text>
    </template>
  </v-card>
</template>

<script setup>
import {computed, ref} from "vue";
import {PUBLICATION_STATUS} from "@/utils/publicationStatus";

const props = defineProps({
  center: {type: Object, required: true},
  loading: Boolean,
  busyId: {type: String, default: ""},
});
defineEmits(["refresh", "certify", "edit", "restore", "history"]);

const activeReason = ref("");
const summary = computed(() => props.center?.summary || {});
const filters = computed(() => [
  {title: "全部", value: "", count: summary.value.total || 0, color: "primary", icon: "mdi-format-list-bulleted"},
  {title: "确认后被修改", value: "CHANGED_AFTER_CERTIFICATION", count: summary.value.changedAfterCertified || 0,
    color: "warning", icon: "mdi-alert-decagram-outline"},
  {title: "大屏新录入", value: "CREATED_BY_SCREEN", count: summary.value.createdByScreen || 0,
    color: "info", icon: "mdi-monitor-edit"},
  {title: "其他待教师确认", value: "OTHER_UNCERTIFIED", count: summary.value.other || 0,
    color: "grey", icon: "mdi-help-circle-outline"},
]);
const filteredItems = computed(() => (props.center?.items || []).filter(
  (item) => !activeReason.value || item.reason === activeReason.value,
));

const REASON_META = {
  CHANGED_AFTER_CERTIFICATION: PUBLICATION_STATUS.CHANGED_AFTER_CERTIFICATION,
  CREATED_BY_SCREEN: {...PUBLICATION_STATUS.PENDING_CERTIFICATION, label: "大屏新录入"},
  OTHER_UNCERTIFIED: PUBLICATION_STATUS.PENDING_CERTIFICATION,
};

function reasonMeta(item) {
  return REASON_META[item.reason] || REASON_META.OTHER_UNCERTIFIED;
}

function sourceLabel(publication) {
  if (publication.latestActorType === "CLASSROOM_SCREEN") {
    return publication.latestScreenBinding?.name || "班级大屏";
  }
  return publication.author?.name || "未知来源";
}

function targetNames(publication) {
  return publication.targets?.map((target) => target.workspace?.name).filter(Boolean).join("、") || "无发布目标";
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function contentChange(item) {
  return item.changedFields?.find((change) => change.field === "content") || null;
}

function shortValue(value) {
  const text = String(value ?? "（空）").replace(/\s+/g, " ").trim();
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}
</script>

<style scoped>
.teacher-action-center { overflow: hidden; }
.action-center-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.action-item { border-left: 4px solid rgb(var(--v-theme-info)); }
.action-item--high { border-left-color: rgb(var(--v-theme-warning)); }
.action-item--medium { border-left-color: rgb(var(--v-theme-warning)); }
.action-content { line-height: 1.65; overflow-wrap: anywhere; white-space: pre-wrap; }
.change-summary { background: rgba(var(--v-theme-warning), 0.09); }
.change-content { display: grid; gap: 4px; overflow-wrap: anywhere; }
.change-content__before { color: rgb(var(--v-theme-error)); }
.change-content__after { color: rgb(var(--v-theme-success)); }
.min-width-0 { min-width: 0; }
@media (max-width: 959px) {
  .action-center-grid { grid-template-columns: 1fr; }
}
</style>
