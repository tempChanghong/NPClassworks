<template>
  <v-dialog
    :model-value="modelValue"
    max-width="680"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card class="rounded-xl">
      <v-card-title class="d-flex align-center pa-5 pb-2">
        <v-icon
          class="mr-3"
          color="primary"
          icon="mdi-monitor-eye"
        />
        大屏送达状态
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          @click="$emit('update:modelValue', false)"
        />
      </v-card-title>
      <v-card-subtitle class="px-5 text-wrap">
        {{ publication?.title || publication?.content || "通知" }}
      </v-card-subtitle>
      <v-card-text class="px-5 pt-4">
        <v-progress-linear
          v-if="loading"
          indeterminate
          rounded
        />
        <v-alert
          v-else-if="error"
          type="error"
          variant="tonal"
        >
          {{ error }}
        </v-alert>
        <v-list v-else-if="result?.screens?.length">
          <v-list-item
            v-for="item in result.screens"
            :key="item.binding.id"
            :prepend-icon="deliveryState(item).icon"
          >
            <v-list-item-title>
              {{ item.binding.administrativeClass?.name || item.binding.name }}
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ deliveryState(item).label }}
              <template v-if="deliveryTime(item)">
                · {{ formatDateTime(deliveryTime(item)) }}
              </template>
            </v-list-item-subtitle>
            <template #append>
              <v-chip
                :color="deliveryState(item).color"
                size="small"
                variant="tonal"
              >
                {{ onlineLabel(item.binding.lastUsedAt) }}
              </v-chip>
            </template>
          </v-list-item>
        </v-list>
        <v-empty-state
          v-else
          headline="没有目标班级大屏"
          icon="mdi-monitor-off"
          text="目标行政班尚未绑定大屏，或通知只发给了没有来源行政班的教学空间。"
        />
      </v-card-text>
      <v-card-actions class="px-5 pb-5">
        <v-spacer />
        <v-btn
          prepend-icon="mdi-refresh"
          variant="tonal"
          @click="load"
        >
          刷新
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {ref, watch} from "vue";
import {classworksV2Api, describeApiError} from "@/utils/classworksV2Client";

const props = defineProps({
  modelValue: Boolean,
  publication: {type: Object, default: null},
});
defineEmits(["update:modelValue"]);
const loading = ref(false);
const error = ref("");
const result = ref(null);

watch([() => props.modelValue, () => props.publication?.id], ([open]) => {
  if (open) load();
});

async function load() {
  if (!props.publication?.id) return;
  loading.value = true;
  error.value = "";
  try {
    result.value = await classworksV2Api.notificationScreenDeliveries(props.publication.id);
  } catch (caught) {
    error.value = describeApiError(caught, "加载大屏送达状态失败");
  } finally {
    loading.value = false;
  }
}

function deliveryState(item) {
  if (item.delivery?.revision === result.value?.revision && item.delivery?.acknowledgedAt) {
    return {label: "当前版本已由大屏确认", icon: "mdi-check-decagram", color: "success"};
  }
  if (item.delivery?.revision === result.value?.revision && item.delivery?.displayedAt) {
    return {label: "当前版本已展示，等待大屏确认收到", icon: "mdi-eye-check", color: "info"};
  }
  if (item.delivery?.revision === result.value?.revision) {
    return {label: "当前版本已收到", icon: "mdi-check", color: "info"};
  }
  if (item.delivery) return {label: "只收到过较早版本", icon: "mdi-history", color: "warning"};
  return {label: "尚未收到当前通知", icon: "mdi-clock-outline", color: "grey"};
}

function deliveryTime(item) {
  return item.delivery?.acknowledgedAt || item.delivery?.displayedAt || item.delivery?.receivedAt;
}

function onlineLabel(value) {
  if (!value) return "从未在线";
  return Date.now() - new Date(value).getTime() < 10 * 60 * 1000 ? "最近在线" : "当前可能离线";
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
