<template>
  <v-dialog
    :model-value="modelValue"
    max-width="560"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card class="rounded-xl">
      <v-card-title class="d-flex align-center pa-5 pb-2">
        <v-icon
          class="mr-2"
          icon="mdi-monitor-eye"
        />
        大屏显示设置
      </v-card-title>
      <v-card-text class="px-5">
        <div class="d-flex align-center mb-1">
          <div class="font-weight-bold">
            作业正文字号
          </div>
          <v-spacer />
          <v-chip
            color="primary"
            variant="tonal"
          >
            {{ draft.fontScale }}%
          </v-chip>
        </div>
        <v-slider
          v-model="draft.fontScale"
          color="primary"
          hide-details
          :max="200"
          :min="90"
          :step="10"
          thumb-label
        />
        <div class="text-caption text-medium-emphasis mb-5">
          可在大屏页面使用 Ctrl + 加号/减号快速调整。
        </div>

        <div class="font-weight-bold mb-2">
          空间密度
        </div>
        <v-btn-toggle
          v-model="draft.density"
          class="mb-5"
          color="primary"
          mandatory
          variant="outlined"
        >
          <v-btn value="compact">
            紧凑
          </v-btn>
          <v-btn value="comfortable">
            舒适
          </v-btn>
        </v-btn-toggle>

        <div class="font-weight-bold mb-2">
          卡片列数
        </div>
        <v-btn-toggle
          v-model="draft.columns"
          class="mb-5"
          color="primary"
          mandatory
          variant="outlined"
        >
          <v-btn value="auto">
            自动
          </v-btn>
          <v-btn value="1">
            1 列
          </v-btn>
          <v-btn value="2">
            2 列
          </v-btn>
          <v-btn value="3">
            3 列
          </v-btn>
        </v-btn-toggle>

        <v-switch
          v-model="draft.showSecondaryMetadata"
          color="primary"
          hide-details
          label="显示发布来源和发布时间"
        />
        <v-switch
          v-model="draft.urgentNoticeSound"
          color="error"
          hide-details
          label="新紧急通知播放提示音"
        />
        <v-switch
          v-model="draft.antiBurnInShift"
          color="primary"
          hide-details
          label="防烧屏轻微位移（每 5 分钟移动 1～2 像素）"
        />
      </v-card-text>
      <v-card-actions class="px-5 pb-5">
        <v-btn
          prepend-icon="mdi-restore"
          variant="text"
          @click="resetSettings"
        >
          恢复默认
        </v-btn>
        <v-spacer />
        <v-btn @click="$emit('update:modelValue', false)">
          取消
        </v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          @click="save"
        >
          应用
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {reactive, watch} from "vue";
import {SCREEN_DISPLAY_DEFAULTS, sanitizeScreenDisplaySettings} from "@/utils/screenDisplaySettings";

const props = defineProps({
  modelValue: Boolean,
  settings: {type: Object, required: true},
});
const emit = defineEmits(["update:modelValue", "save"]);
const draft = reactive({...SCREEN_DISPLAY_DEFAULTS});

watch(() => props.modelValue, (open) => {
  if (open) Object.assign(draft, sanitizeScreenDisplaySettings(props.settings));
}, {immediate: true});

function resetSettings() {
  Object.assign(draft, SCREEN_DISPLAY_DEFAULTS);
}

function save() {
  emit("save", sanitizeScreenDisplaySettings(draft));
  emit("update:modelValue", false);
}
</script>
