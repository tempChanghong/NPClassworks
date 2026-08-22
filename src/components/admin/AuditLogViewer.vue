<template>
  <v-card class="rounded-xl">
    <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5 pb-2">
      <v-icon
        color="primary"
        icon="mdi-text-box-search-outline"
      />
      审计记录
      <v-spacer />
      <v-select
        v-model="actorType"
        :items="actorOptions"
        density="compact"
        hide-details
        label="操作来源"
        style="max-width: 180px"
        variant="outlined"
        @update:model-value="load(true)"
      />
      <v-btn
        :loading="loading"
        icon="mdi-refresh"
        variant="text"
        @click="load(true)"
      />
    </v-card-title>
    <v-card-text class="px-5 pb-5">
      <v-alert
        v-if="error"
        class="mb-4"
        type="error"
        variant="tonal"
      >
        {{ error }}
      </v-alert>
      <v-list lines="three">
        <template
          v-for="item in items"
          :key="item.id"
        >
          <v-list-item>
            <template #prepend>
              <v-avatar
                :color="item.success ? 'primary' : 'error'"
                variant="tonal"
              >
                <v-icon :icon="item.actorType === 'CLASSROOM_SCREEN' ? 'mdi-monitor' : 'mdi-account-cog-outline'" />
              </v-avatar>
            </template>
            <v-list-item-title>{{ actionName(item.action) }}</v-list-item-title>
            <v-list-item-subtitle>
              {{ actorName(item) }} · {{ new Date(item.createdAt).toLocaleString("zh-CN") }}
              <br>
              {{ item.requestMethod }} {{ item.requestPath }} · HTTP {{ item.statusCode }}
            </v-list-item-subtitle>
            <template #append>
              <v-chip
                :color="item.success ? 'success' : 'error'"
                size="small"
                variant="tonal"
              >
                {{ item.success ? "成功" : "失败" }}
              </v-chip>
            </template>
          </v-list-item>
          <v-divider />
        </template>
      </v-list>
      <v-empty-state
        v-if="!items.length && !loading"
        icon="mdi-text-box-outline"
        text="暂无审计记录"
      />
      <v-btn
        v-if="nextCursor"
        block
        class="mt-4"
        :loading="loading"
        variant="tonal"
        @click="load(false)"
      >
        加载更多
      </v-btn>
    </v-card-text>
  </v-card>
</template>

<script setup>
import {ref, watch} from "vue";
import {classworksV2Api, describeApiError} from "@/utils/classworksV2Client.js";

const props = defineProps({schoolId: {type: String, required: true}});
const actorType = ref("");
const items = ref([]);
const nextCursor = ref(null);
const loading = ref(false);
const error = ref("");
const actorOptions = [
  {title: "全部来源", value: ""},
  {title: "管理员与教师", value: "ACCOUNT"},
  {title: "班级大屏", value: "CLASSROOM_SCREEN"},
];

const actionNames = {
  ORGANIZATION_IMPORT: "导入学校组织",
  TERM_ACTIVATED: "切换启用学期",
  TERM_DRAFT_CREATED: "建立学期草稿",
  TERM_STATUS_CHANGED: "修改学期状态",
  SCREEN_COMMAND_ISSUED: "下发大屏值守指令",
  SCREEN_DEVICE_RESET: "重置大屏设备",
  SCREEN_ACCOUNT_CREATED: "创建大屏账号",
  SCREEN_ACCOUNT_UPDATED: "修改大屏账号",
  TEACHING_ASSIGNMENT_CHANGED: "修改任课关系",
  GRADE_LEADERSHIP_CHANGED: "修改年级组长职责",
  CLASS_LEADERSHIP_CHANGED: "修改班主任职责",
  LOCAL_ACCOUNT_CHANGED: "修改本地账号",
  SUBJECT_RULES_CHANGED: "修改授课规则",
  COURSE_GROUP_CHANGED: "修改走班教学班",
  SCREEN_ROSTER_CHANGED: "大屏修改学生名单",
  SCREEN_ATTENDANCE_CHANGED: "大屏修改考勤",
  SCREEN_PUBLICATION_CREATED: "大屏录入作业",
  SCREEN_PUBLICATION_UPDATED: "大屏修改作业",
  SCREEN_PUBLICATION_RESTORED: "大屏恢复作业版本",
};

function actionName(action) {
  return actionNames[action] || action;
}

function actorName(item) {
  if (item.actorScreen) return item.actorScreen.name;
  return item.actorAccount?.name || item.actorAccount?.localUsername || item.actorAccount?.email || "未知操作者";
}

async function load(reset) {
  if (!props.schoolId || loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const result = await classworksV2Api.auditLogs(props.schoolId, {
      actorType: actorType.value || undefined,
      cursor: reset ? undefined : nextCursor.value,
      limit: 50,
    });
    items.value = reset ? result.items : [...items.value, ...result.items];
    nextCursor.value = result.nextCursor;
  } catch (requestError) {
    error.value = describeApiError(requestError, "读取审计记录失败");
  } finally {
    loading.value = false;
  }
}

watch(() => props.schoolId, () => load(true), {immediate: true});
</script>
