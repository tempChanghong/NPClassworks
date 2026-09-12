<template>
  <v-dialog
    :model-value="true"
    max-width="1200"
    scrollable
    aria-label="发布前大屏预览"
    @update:model-value="!$event && $emit('close')"
  >
    <v-card class="publication-screen-preview rounded-xl">
      <v-card-title>大屏效果预览 · 尚未发布</v-card-title>
      <v-card-text>
        <v-alert
          type="info"
          variant="tonal"
          class="mb-4"
        >
          仅预览本次输入，不会保存或发送到大屏。实际字号、列数由各大屏设置决定，确认状态以服务器保存结果为准。
        </v-alert>
        <v-select
          v-model="targetId"
          :items="targets"
          item-title="name"
          item-value="id"
          label="预览班级"
        />
        <p class="mb-3">
          {{ publication.boardDate }} 作业板 · {{ timing }}
        </p>
        <HomeworkFeedGrid
          :publications="[visiblePublication]"
          screen-mode
          preview-mode
          :settings="{columns: 1, fontScale: 100}"
        />
        <p
          v-if="publication.correctionReason"
          class="preview-reason mt-4"
        >
          本次更正原因：{{ publication.correctionReason }}
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer /><v-btn @click="$emit('close')">
          返回编辑
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
<script setup>
import {computed, ref} from "vue";
import HomeworkFeedGrid from "@/components/v2/HomeworkFeedGrid.vue";
const props = defineProps({publication: {type: Object, required: true}, targets: {type: Array, required: true}, timing: {type: String, default: ""}});
defineEmits(["close"]);
const targetId = ref(props.targets[0]?.id);
const visiblePublication = computed(() => ({...props.publication,
  targets: props.targets.filter(item => item.id === targetId.value).map(workspace => ({workspaceId: workspace.id, workspace})),
}));
</script>
<style scoped>
.preview-reason { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
