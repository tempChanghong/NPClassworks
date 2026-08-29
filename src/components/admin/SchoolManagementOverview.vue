<template>
  <div>
    <v-card class="mb-5 rounded-xl">
      <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5 pb-2">
        <v-icon
          color="primary"
          icon="mdi-view-dashboard-outline"
        />
        管理总览
        <v-spacer />
        <v-chip
          v-if="overview"
          :color="overview.summary.healthy ? 'success' : 'warning'"
          variant="tonal"
        >
          {{ overview.summary.healthy ? "运行正常" : `${overview.summary.errors} 项错误 · ${overview.summary.warnings} 项提醒` }}
        </v-chip>
        <v-btn
          :loading="loading"
          icon="mdi-refresh"
          variant="text"
          @click="load"
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
        <v-skeleton-loader
          v-if="loading && !overview"
          type="heading, actions"
        />
        <template v-else-if="overview">
          <v-row dense>
            <v-col
              v-for="card in summaryCards"
              :key="card.label"
              cols="6"
              sm="4"
              lg="2"
            >
              <v-card
                class="summary-card"
                variant="tonal"
              >
                <v-card-text>
                  <v-icon
                    :color="card.color"
                    :icon="card.icon"
                    size="24"
                  />
                  <div class="text-h5 font-weight-bold mt-2">
                    {{ card.value }}
                  </div>
                  <div class="text-caption text-medium-emphasis">
                    {{ card.label }}
                  </div>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </template>
      </v-card-text>
    </v-card>

    <v-card class="mb-5 rounded-xl">
      <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5 pb-2">
        <v-icon
          color="primary"
          icon="mdi-clipboard-check-outline"
        />
        管理待办
        <v-chip
          v-if="overview"
          :color="priorityTasks.length ? 'warning' : 'success'"
          size="small"
          variant="tonal"
        >
          {{ priorityTasks.length ? `${overview.diagnostics.length} 项待处理` : "已完成" }}
        </v-chip>
      </v-card-title>
      <v-card-text class="px-5 pb-5">
        <v-alert
          v-if="overview && !priorityTasks.length"
          type="success"
          variant="tonal"
        >
          当前没有需要管理员处理的配置或运行问题。
        </v-alert>
        <v-list
          v-else
          class="task-list"
          lines="two"
        >
          <v-list-item
            v-for="(item, index) in priorityTasks"
            :key="`${item.code}-${index}`"
            :subtitle="`${diagnosticSourceName(item.source)} · ${item.code}`"
            :title="item.message"
          >
            <template #prepend>
              <v-avatar
                :color="item.severity === 'ERROR' ? 'error' : 'warning'"
                size="38"
                variant="tonal"
              >
                <v-icon :icon="item.severity === 'ERROR' ? 'mdi-alert-circle' : 'mdi-alert-outline'" />
              </v-avatar>
            </template>
            <template
              v-if="item.targetTab"
              #append
            >
              <v-btn
                color="primary"
                prepend-icon="mdi-arrow-right"
                size="small"
                variant="tonal"
                @click="$emit('navigate', item.targetTab)"
              >
                去处理
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
        <div
          v-if="overview?.diagnostics.length > priorityTasks.length"
          class="text-caption text-medium-emphasis mt-3"
        >
          优先展示 {{ priorityTasks.length }} 项，其余问题可在下方按类别展开查看。
        </div>
      </v-card-text>
    </v-card>

    <v-card class="rounded-xl">
      <v-card-title class="d-flex align-center pa-5 pb-2">
        <v-icon
          class="mr-2"
          color="warning"
          icon="mdi-stethoscope"
        />
        异常诊断
      </v-card-title>
      <v-card-text class="px-5 pb-5">
        <v-alert
          v-if="overview && !overview.diagnostics.length"
          type="success"
          variant="tonal"
        >
          当前学期没有发现配置异常。
        </v-alert>
        <v-expansion-panels
          v-else
          variant="accordion"
        >
          <v-expansion-panel
            v-for="group in diagnosticGroups"
            :key="group.source"
          >
            <v-expansion-panel-title>
              <div class="d-flex align-center ga-2">
                <v-icon :icon="group.icon" />
                {{ group.label }}
                <v-chip
                  size="x-small"
                  variant="tonal"
                >
                  {{ group.items.length }}
                </v-chip>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <v-list
                density="compact"
                lines="two"
              >
                <v-list-item
                  v-for="(item, index) in group.items"
                  :key="`${item.code}-${index}`"
                >
                  <template #prepend>
                    <v-icon
                      :color="item.severity === 'ERROR' ? 'error' : item.severity === 'WARNING' ? 'warning' : 'info'"
                      :icon="item.severity === 'ERROR' ? 'mdi-alert-circle' : 'mdi-alert-outline'"
                    />
                  </template>
                  <v-list-item-title>{{ item.message }}</v-list-item-title>
                  <v-list-item-subtitle>{{ item.code }}</v-list-item-subtitle>
                  <template
                    v-if="item.targetTab"
                    #append
                  >
                    <v-btn
                      size="small"
                      variant="text"
                      @click="$emit('navigate', item.targetTab)"
                    >
                      去处理
                    </v-btn>
                  </template>
                </v-list-item>
              </v-list>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
        <div
          v-if="overview"
          class="text-caption text-medium-emphasis mt-4"
        >
          最近检查：{{ new Date(overview.generatedAt).toLocaleString("zh-CN") }}
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import {classworksV2Api, describeApiError} from "@/utils/classworksV2Client.js";

const props = defineProps({
  schoolId: {type: String, required: true},
  termId: {type: String, required: true},
});
defineEmits(["navigate"]);

const loading = ref(false);
const error = ref("");
const overview = ref(null);

const summaryCards = computed(() => {
  const summary = overview.value?.summary || {};
  return [
    {label: "年级", value: summary.grades || 0, icon: "mdi-school-outline", color: "primary"},
    {label: "行政班", value: summary.administrativeClasses || 0, icon: "mdi-account-group-outline", color: "primary"},
    {label: "走班教学班", value: summary.courseGroups || 0, icon: "mdi-transit-connection-variant", color: "primary"},
    {label: "任课教师", value: summary.teachers || 0, icon: "mdi-human-male-board", color: "success"},
    {label: "在线大屏", value: `${summary.onlineScreens || 0}/${summary.screens || 0}`, icon: "mdi-monitor-dashboard", color: "info"},
    {label: "待处理", value: (summary.errors || 0) + (summary.warnings || 0), icon: "mdi-alert-outline", color: "warning"},
  ];
});

const groupDefinitions = {
  TEACHING: {label: "任课关系", icon: "mdi-human-male-board"},
  RESPONSIBILITY: {label: "岗位职责", icon: "mdi-account-tie-outline"},
  SCREEN: {label: "大屏设备", icon: "mdi-monitor-dashboard"},
  ACCOUNT: {label: "教师账号", icon: "mdi-account-key-outline"},
  TERM: {label: "学期结构", icon: "mdi-calendar-alert"},
};
const diagnosticGroups = computed(() => Object.entries(groupDefinitions).map(([source, definition]) => ({
  source,
  ...definition,
  items: (overview.value?.diagnostics || []).filter((item) => item.source === source),
})).filter((group) => group.items.length));
const priorityTasks = computed(() => (overview.value?.diagnostics || []).slice(0, 6));

function diagnosticSourceName(source) {
  return groupDefinitions[source]?.label || "学校配置";
}

async function load() {
  if (!props.schoolId || !props.termId) return;
  loading.value = true;
  error.value = "";
  try {
    overview.value = await classworksV2Api.managementOverview(props.schoolId, props.termId);
  } catch (requestError) {
    error.value = describeApiError(requestError, "读取管理总览失败");
  } finally {
    loading.value = false;
  }
}

watch(() => [props.schoolId, props.termId], load, {immediate: true});
</script>

<style scoped>
.summary-card {
  height: 100%;
}
.task-list {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 16px;
}
</style>
