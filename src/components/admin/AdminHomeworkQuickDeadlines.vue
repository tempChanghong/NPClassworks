<template>
  <v-card class="mb-5 rounded-xl">
    <v-card-title class="d-flex align-center pa-5 pb-2">
      <v-icon
        class="mr-3"
        color="primary"
        icon="mdi-calendar-clock-outline"
      />
      作业快捷截止时间
    </v-card-title>
    <v-card-text class="px-5 pb-5">
      <p class="text-body-2 text-medium-emphasis mb-4">
        全校班级大屏共用；支持按操作当天向后计算，也支持自动选择下一个指定星期。
      </p>
      <div
        v-for="(preset, index) in homeworkQuickDeadlines"
        :key="index"
        class="quick-deadline-row"
      >
        <v-text-field
          v-model.trim="preset.label"
          class="quick-deadline-row__label"
          density="comfortable"
          hide-details="auto"
          label="按钮名称"
          maxlength="16"
          variant="outlined"
        />
        <v-select
          :model-value="quickDeadlineDateValue(preset)"
          class="quick-deadline-row__date"
          density="comfortable"
          hide-details="auto"
          :items="quickDeadlineDayOptions"
          item-title="title"
          item-value="value"
          label="截止日期"
          variant="outlined"
          @update:model-value="updateQuickDeadlineDateRule(preset, $event)"
        />
        <v-text-field
          v-model="preset.time"
          class="quick-deadline-row__time"
          density="comfortable"
          hide-details="auto"
          label="时间"
          type="time"
          variant="outlined"
        />
        <v-btn
          class="quick-deadline-row__delete"
          :disabled="homeworkQuickDeadlines.length <= 1"
          icon="mdi-delete-outline"
          title="删除此快捷时间"
          variant="text"
          @click="homeworkQuickDeadlines.splice(index, 1)"
        />
      </div>
      <div class="d-flex flex-wrap ga-2 mt-4">
        <v-btn
          :disabled="homeworkQuickDeadlines.length >= 8"
          prepend-icon="mdi-plus"
          variant="tonal"
          @click="addHomeworkQuickDeadline"
        >
          添加时间
        </v-btn>
        <v-btn
          prepend-icon="mdi-restore"
          variant="text"
          @click="resetHomeworkQuickDeadlines"
        >
          恢复默认
        </v-btn>
        <v-spacer />
        <v-btn
          color="primary"
          :loading="homeworkSettingsBusy"
          prepend-icon="mdi-content-save-outline"
          @click="saveSchoolHomeworkSettings"
        >
          保存全校配置
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup>
const props = defineProps({manager: {type: Object, required: true}});

// Share refs with the other panel and the page leave guard.
const {
  homeworkSettingsBusy,
  homeworkQuickDeadlines,
  quickDeadlineDayOptions,
  quickDeadlineDateValue,
  updateQuickDeadlineDateRule,
  addHomeworkQuickDeadline,
  resetHomeworkQuickDeadlines,
  saveSchoolHomeworkSettings,
} = props.manager;
</script>

<style scoped>
.quick-deadline-row {
  align-items: start;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 5fr) minmax(170px, 3fr) minmax(130px, 3fr) 48px;
  margin-bottom: 12px;
}
.quick-deadline-row__delete { justify-self: end; }
@media (max-width: 600px) {
  .quick-deadline-row {
    gap: 8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    position: relative;
  }
  .quick-deadline-row__label {
    grid-column: 1 / -1;
    margin-right: 52px;
  }
  .quick-deadline-row__delete {
    position: absolute;
    right: 0;
    top: 0;
  }
}
</style>
