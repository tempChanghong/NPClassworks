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
            <v-list-item-title class="font-weight-medium">
              {{ item.summary || actionName(item.action) }}
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ actorName(item) }} · {{ new Date(item.createdAt).toLocaleString("zh-CN") }}
              <br>
              {{ actionName(item.action) }}{{ entityLabel(item) }}
            </v-list-item-subtitle>
            <template #append>
              <v-chip
                :color="item.success ? 'success' : 'error'"
                size="small"
                :title="`${item.requestMethod} ${item.requestPath} · HTTP ${item.statusCode}`"
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
  SCHOOL_PROFILE_UPDATED: "学校设置",
  SUBJECT_CREATED: "创建学科",
  SUBJECT_UPDATED: "修改学科",
  GRADE_CREATED: "创建年级",
  GRADE_UPDATED: "修改年级",
  ADMIN_CLASS_CREATED: "创建行政班",
  ADMIN_CLASSES_BATCH_CREATED: "批量创建行政班",
  ADMIN_CLASS_UPDATED: "修改行政班",
  ORGANIZATION_IMPORT: "导入学校组织",
  TERM_TRANSITION_PREVIEW: "预览学期切换",
  TERM_ACTIVATION_PREVIEW: "检查学期启用条件",
  TERM_ACTIVATED: "切换启用学期",
  TERM_DRAFT_CREATED: "建立学期草稿",
  TERM_STATUS_CHANGED: "修改学期状态",
  SCREEN_COMMAND_ISSUED: "下发大屏值守指令",
  SCREEN_DEVICE_RESET: "重置大屏设备",
  SCREEN_BOUND: "绑定班级大屏",
  SCREEN_ACCOUNT_CREATED: "创建大屏账号",
  SCREEN_ACCOUNT_UPDATED: "修改大屏账号",
  TEACHING_ASSIGNMENT_CHANGED: "修改任课关系",
  GRADE_LEADERSHIP_CHANGED: "修改年级组长职责",
  CLASS_LEADERSHIP_CHANGED: "修改班主任职责",
  LOCAL_ACCOUNT_CHANGED: "修改本地账号",
  LOCAL_ACCOUNT_PROVISIONED: "批量创建本地账号",
  WORKSPACE_MEMBERSHIP_CHANGED: "修改教学空间成员",
  HOMEWORK_SETTINGS_CHANGED: "修改作业设置",
  SUBJECT_RULES_CHANGED: "修改授课规则",
  COURSE_GROUP_CREATED: "创建走班教学班",
  COURSE_GROUP_UPDATED: "修改走班教学班",
  COURSE_GROUP_CHANGED: "修改走班教学班",
  SCREEN_ROSTER_CHANGED: "大屏修改学生名单",
  SCREEN_ATTENDANCE_CHANGED: "大屏修改考勤",
  SCREEN_PUBLICATION_CREATED: "大屏录入作业",
  SCREEN_PUBLICATION_UPDATED: "大屏修改作业",
  SCREEN_PUBLICATION_RESTORED: "大屏恢复作业版本",
  SCREEN_BOARD_COPIED: "复制大屏作业板",
};

function actionName(action) {
  const genericNames = {
    POST_ADMIN_OPERATION: "新增管理数据",
    PUT_ADMIN_OPERATION: "保存管理数据",
    PATCH_ADMIN_OPERATION: "修改管理数据",
    DELETE_ADMIN_OPERATION: "删除管理数据",
  };
  return actionNames[action] || genericNames[action] || action;
}

function actorName(item) {
  if (item.actorScreen) return item.actorScreen.name;
  return item.actorAccount?.name || item.actorAccount?.localUsername || item.actorAccount?.email || "未知操作者";
}

function entityLabel(item) {
  if (!item.entityType || !item.entityId) return "";
  const names = {
    SCHOOL: "学校",
    SUBJECT: "学科",
    GRADE: "年级",
    WORKSPACE: "班级或教学班",
    ACCOUNT: "账号",
    SCREEN: "班级大屏",
    TERM: "学期",
    PUBLICATION: "作业或通知",
  };
  return ` · ${names[item.entityType] || item.entityType} ${item.entityId.slice(0, 8)}`;
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
