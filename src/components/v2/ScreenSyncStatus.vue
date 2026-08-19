<template>
  <v-chip
    class="screen-sync-chip"
    :color="status.color"
    :prepend-icon="status.icon"
    size="small"
    :variant="status.variant"
    @click="openQueue"
  >
    {{ status.label }}
  </v-chip>

  <v-dialog
    v-model="dialog"
    max-width="720"
  >
    <v-card class="rounded-xl">
      <v-card-title class="d-flex align-center pa-5 pb-2">
        <v-icon
          class="mr-3"
          icon="mdi-cloud-sync-outline"
        />
        大屏同步队列
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          @click="dialog = false"
        />
      </v-card-title>
      <v-card-text class="px-5">
        <v-alert
          class="mb-4"
          :color="status.color"
          :icon="status.icon"
          variant="tonal"
        >
          {{ statusDetail }}
        </v-alert>

        <v-list
          v-if="store.screenPendingUploads.length"
          lines="three"
        >
          <v-list-item
            v-for="item in store.screenPendingUploads"
            :key="item.id"
            class="queued-publication mb-2 rounded-lg"
          >
            <template #prepend>
              <v-avatar
                :color="item.status === 'needs_review' ? 'warning' : 'info'"
                variant="tonal"
              >
                <v-icon :icon="item.status === 'needs_review' ? 'mdi-alert-outline' : 'mdi-cloud-upload-outline'" />
              </v-avatar>
            </template>
            <v-list-item-title class="font-weight-bold">
              {{ item.context.subjectName || "作业" }} · {{ item.context.targetName || "目标班级" }}
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ item.input.title || item.input.content || "未命名作业" }}
            </v-list-item-subtitle>
            <v-list-item-subtitle>
              {{ queuedAtLabel(item.queuedAt) }} ·
              {{ item.status === "needs_review" ? (item.error?.message || "需要人工处理") : "等待自动提交" }}
            </v-list-item-subtitle>
            <template #append>
              <div class="d-flex flex-wrap justify-end ga-1 queued-actions">
                <v-btn
                  v-if="store.screenNetworkOnline"
                  :disabled="store.screenSyncing"
                  size="small"
                  variant="tonal"
                  @click="retry(item)"
                >
                  重试
                </v-btn>
                <v-btn
                  v-if="item.error?.code === 'DUPLICATE_ASSIGNMENT_SUSPECTED' && store.screenNetworkOnline"
                  color="warning"
                  :disabled="store.screenSyncing"
                  size="small"
                  variant="tonal"
                  @click="retry(item, true)"
                >
                  确认仍然提交
                </v-btn>
                <v-btn
                  color="error"
                  icon="mdi-delete-outline"
                  size="small"
                  title="移除本机待提交作业"
                  variant="text"
                  @click="remove(item)"
                />
              </div>
            </template>
          </v-list-item>
        </v-list>
        <v-empty-state
          v-else
          headline="没有待提交作业"
          icon="mdi-cloud-check-outline"
          text="当前大屏上的作业已经与服务器同步"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {computed, onMounted, onUnmounted, ref} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";

const store = useClassworksV2Store();
const dialog = ref(false);

const status = computed(() => {
  const count = store.screenPendingUploads.length;
  const states = {
    offline: {label: count ? `离线 · ${count} 项待提交` : "离线", color: "error", icon: "mdi-cloud-off-outline", variant: "tonal"},
    syncing: {label: `正在同步${count ? ` · ${count} 项` : ""}`, color: "info", icon: "mdi-cloud-sync-outline", variant: "tonal"},
    pending: {label: `${count} 项待处理`, color: "warning", icon: "mdi-cloud-alert-outline", variant: "tonal"},
    reconnecting: {label: "正在重连", color: "warning", icon: "mdi-lan-pending", variant: "tonal"},
    synced: {label: "实时同步", color: "success", icon: "mdi-cloud-check-outline", variant: "tonal"},
  };
  return states[store.screenSyncState];
});
const statusDetail = computed(() => {
  if (!store.screenNetworkOnline) return "网络已断开。新录入的作业会保存在这台大屏，联网后自动提交。";
  if (store.screenPendingReviewCount) return `有 ${store.screenPendingReviewCount} 项作业需要核对后再提交。`;
  if (store.screenPendingUploads.length) return "正在等待或尝试将本机作业提交到服务器。";
  if (!store.screenRealtimeConnected) return "网页可以继续使用，实时连接恢复后会自动刷新作业。";
  return "实时连接正常，当前没有待提交内容。";
});

function openQueue() {
  if (store.screenPendingUploads.length || store.screenSyncState !== "synced") dialog.value = true;
}

function queuedAtLabel(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function retry(item, allowDuplicate = false) {
  await store.retryScreenQueuedPublication(item.id, {allowDuplicate});
}

function remove(item) {
  if (!window.confirm("确定移除这项仅保存在本机、尚未提交的作业吗？移除后无法恢复。")) return;
  store.removeScreenQueuedPublication(item.id);
}

onMounted(() => store.initializeScreenSync());
onUnmounted(() => store.stopScreenSync());
</script>

<style scoped>
.screen-sync-chip { cursor: pointer; }
.queued-publication { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.queued-actions { max-width: 260px; }
@media (max-width: 700px) {
  .queued-actions { max-width: 150px; }
}
</style>
