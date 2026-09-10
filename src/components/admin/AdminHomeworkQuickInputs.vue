<template>
  <v-card class="mb-5 rounded-xl">
    <v-card-title class="d-flex align-center pa-5 pb-2">
      <v-icon
        class="mr-3"
        color="primary"
        icon="mdi-lightning-bolt-outline"
      />
      作业快捷输入
    </v-card-title>
    <v-progress-linear
      v-if="homeworkSettingsBusy && !homeworkSettingsReady"
      indeterminate
    />
    <v-alert
      v-if="!homeworkSettingsReady && !homeworkSettingsBusy"
      class="ma-5"
      type="info"
      variant="tonal"
    >
      请先成功读取当前学校的配置，再编辑或保存。
      <v-btn
        variant="text"
        @click="loadSchoolHomeworkSettings"
      >
        重新读取配置
      </v-btn>
    </v-alert>
    <v-card-text
      v-if="homeworkSettingsReady"
      class="px-5 pb-5"
    >
      <p class="text-body-2 text-medium-emphasis mb-4">
        教师端和班级大屏共用。未选择学科时表示全科通用；限定学科的词只在对应科目下出现，排列顺序与此处一致。
      </p>
      <v-row
        v-for="(item, index) in homeworkQuickInputs"
        :key="index"
        align="center"
        dense
      >
        <v-col
          cols="12"
          sm="3"
          md="2"
        >
          <v-text-field
            v-model.trim="item.label"
            density="comfortable"
            hide-details="auto"
            label="按钮名称"
            maxlength="16"
            variant="outlined"
          />
        </v-col>
        <v-col
          cols="12"
          sm="5"
          md="3"
        >
          <v-text-field
            v-model="item.text"
            :disabled="item.insertMode === 'NEW_LINE'"
            density="comfortable"
            hide-details="auto"
            label="插入内容"
            maxlength="120"
            variant="outlined"
          />
        </v-col>
        <v-col
          cols="6"
          sm="4"
          md="2"
        >
          <v-text-field
            v-model.trim="item.group"
            density="comfortable"
            hide-details="auto"
            label="分组"
            maxlength="16"
            variant="outlined"
          />
        </v-col>
        <v-col
          cols="6"
          sm="4"
          md="2"
        >
          <v-select
            v-model="item.insertMode"
            density="comfortable"
            hide-details="auto"
            :items="quickInputModeOptions"
            item-title="title"
            item-value="value"
            label="操作"
            variant="outlined"
          />
        </v-col>
        <v-col
          cols="10"
          sm="7"
          md="2"
        >
          <v-select
            v-model="item.subjectIds"
            chips
            closable-chips
            density="comfortable"
            hide-details="auto"
            :items="homeworkQuickInputSubjects"
            item-title="name"
            item-value="id"
            label="适用学科（空为全科）"
            multiple
            variant="outlined"
          />
        </v-col>
        <v-col
          class="d-flex justify-end"
          cols="2"
          sm="1"
        >
          <v-btn
            icon="mdi-delete-outline"
            title="删除此快捷词"
            variant="text"
            @click="homeworkQuickInputs.splice(index, 1)"
          />
        </v-col>
      </v-row>
      <v-alert
        v-if="!homeworkQuickInputs.length"
        class="mb-3"
        type="info"
        variant="tonal"
      >
        当前已关闭快捷输入；保存后教师端和大屏将不显示快捷词。
      </v-alert>
      <div class="d-flex flex-wrap ga-2 mt-4">
        <v-btn
          :disabled="homeworkQuickInputs.length >= 64"
          prepend-icon="mdi-plus"
          variant="tonal"
          @click="addHomeworkQuickInput"
        >
          添加快捷词
        </v-btn>
        <v-btn
          prepend-icon="mdi-restore"
          variant="text"
          @click="resetHomeworkQuickInputs"
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
  homeworkSettingsReady,
  loadSchoolHomeworkSettings,
  homeworkQuickInputs,
  homeworkQuickInputSubjects,
  quickInputModeOptions,
  addHomeworkQuickInput,
  resetHomeworkQuickInputs,
  saveSchoolHomeworkSettings,
} = props.manager;
</script>
