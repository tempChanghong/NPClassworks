<template>
  <v-dialog
    :model-value="modelValue"
    max-width="720"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card class="rounded-xl">
      <v-card-title class="d-flex align-center ga-3 pa-5 pb-2">
        <v-avatar
          :color="receipt.status.color"
          size="42"
          variant="tonal"
        >
          <v-icon :icon="receipt.status.icon" />
        </v-avatar>
        <div>
          <div>{{ publication.type === "NOTICE" ? "通知" : "作业" }}发布结果</div>
          <div class="text-caption text-medium-emphasis font-weight-regular">
            {{ receipt.targetCount }} 个发布目标 · {{ receipt.status.label }}
          </div>
        </div>
      </v-card-title>
      <v-card-text class="px-5">
        <v-alert
          class="mb-4"
          color="success"
          icon="mdi-check-all"
          variant="tonal"
        >
          本次发布已作为一个整体事务写入；以下目标均已保存，不会出现部分班级写入、部分班级遗漏。
        </v-alert>
        <v-list
          border
          class="rounded-lg"
          lines="two"
        >
          <v-list-item
            v-for="target in receipt.targets"
            :key="target.id"
            :prepend-icon="target.type === 'ADMIN_CLASS' ? 'mdi-home-group' : 'mdi-account-group-outline'"
            :subtitle="target.label"
            :title="target.name"
          >
            <template #append>
              <v-chip
                :color="target.state === 'scheduled' ? 'purple' : 'success'"
                size="small"
                variant="tonal"
              >
                {{ target.state === "scheduled" ? "等待显示" : "写入成功" }}
              </v-chip>
            </template>
          </v-list-item>
        </v-list>
        <div
          v-if="publication.type === 'NOTICE'"
          class="text-caption text-medium-emphasis mt-3"
        >
          “写入成功”表示通知已经保存在服务器；大屏是否已经展示，需要查看大屏送达状态。
        </div>
      </v-card-text>
      <v-card-actions class="px-5 pb-5 flex-wrap ga-2">
        <v-btn
          v-if="receipt.canInspectDelivery"
          prepend-icon="mdi-monitor-eye"
          variant="tonal"
          @click="$emit('inspect-delivery', publication)"
        >
          查看大屏送达状态
        </v-btn>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          @click="$emit('update:modelValue', false)"
        >
          完成
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {computed} from "vue";
import {buildPublicationReceipt} from "@/utils/publicationReceipt";

const props = defineProps({
  modelValue: Boolean,
  publication: {type: Object, default: () => ({})},
});
defineEmits(["update:modelValue", "inspect-delivery"]);

const receipt = computed(() => buildPublicationReceipt(props.publication));
</script>
