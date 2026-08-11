<template>
  <v-card
    class="teacher-publication-manager rounded-xl"
    variant="flat"
  >
    <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5 pb-3">
      <v-icon
        color="primary"
        icon="mdi-text-box-multiple-outline"
      />
      发布管理
      <v-chip
        size="small"
        variant="tonal"
      >
        {{ filteredPublications.length }} / {{ stats.all }}
      </v-chip>
      <v-spacer />
      <v-btn
        :loading="loading"
        icon="mdi-refresh"
        title="刷新发布记录"
        variant="text"
        @click="$emit('refresh')"
      />
    </v-card-title>

    <v-card-text class="px-5 pb-3">
      <div class="publication-state-filters d-flex flex-wrap ga-2 mb-4">
        <v-chip
          v-for="item in stateOptions"
          :key="item.value || 'all'"
          :color="stateFilter === item.value ? item.color : undefined"
          :prepend-icon="item.icon"
          :variant="stateFilter === item.value ? 'flat' : 'tonal'"
          @click="stateFilter = stateFilter === item.value ? '' : item.value"
        >
          {{ item.title }} {{ stats[item.value || 'all'] }}
        </v-chip>
      </div>

      <v-text-field
        v-model="query"
        clearable
        density="compact"
        hide-details
        label="搜索标题、正文、科目或班级"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
      />
      <v-row
        class="mt-1"
        dense
      >
        <v-col cols="6">
          <v-select
            v-model="typeFilter"
            clearable
            density="compact"
            hide-details
            :items="typeOptions"
            label="类型"
            variant="outlined"
          />
        </v-col>
        <v-col cols="6">
          <v-select
            v-model="subjectFilter"
            clearable
            density="compact"
            hide-details
            :items="options.subjects"
            label="科目"
            variant="outlined"
          />
        </v-col>
        <v-col cols="12">
          <v-select
            v-model="workspaceFilter"
            clearable
            density="compact"
            hide-details
            :items="options.workspaces"
            label="行政班或走班教学班"
            variant="outlined"
          />
        </v-col>
        <v-col cols="12">
          <v-text-field
            v-model="boardDateFilter"
            clearable
            density="compact"
            hide-details
            label="作业板日期"
            type="date"
            variant="outlined"
          />
        </v-col>
      </v-row>
      <div
        v-if="hasFilters"
        class="d-flex justify-end mt-2"
      >
        <v-btn
          prepend-icon="mdi-filter-remove-outline"
          size="small"
          variant="text"
          @click="resetFilters"
        >
          清除筛选
        </v-btn>
      </div>
    </v-card-text>

    <v-divider />
    <v-list
      v-if="filteredPublications.length"
      class="publication-list"
      lines="three"
    >
      <template
        v-for="publication in filteredPublications"
        :key="publication.id"
      >
        <v-list-item class="publication-list-item py-3">
          <template #prepend>
            <v-avatar
              :color="state(publication).color"
              variant="tonal"
            >
              <v-icon :icon="publication.type === 'NOTICE' ? 'mdi-bullhorn-outline' : 'mdi-book-outline'" />
            </v-avatar>
          </template>

          <v-list-item-title class="font-weight-bold text-wrap">
            {{ publication.title || publication.content || "未命名草稿" }}
          </v-list-item-title>
          <v-list-item-subtitle class="publication-list-subtitle mt-1">
            <div class="d-flex align-center flex-wrap ga-1 mb-1">
              <v-chip
                :color="state(publication).color"
                size="x-small"
                variant="tonal"
              >
                {{ state(publication).label }}
              </v-chip>
              <v-chip
                size="x-small"
                variant="tonal"
              >
                {{ publication.subject?.name || "通知" }}
              </v-chip>
              <v-chip
                v-if="publication.type === 'ASSIGNMENT' && publication.boardDate"
                prepend-icon="mdi-calendar-outline"
                size="x-small"
                variant="tonal"
              >
                {{ String(publication.boardDate).slice(0, 10) }}
              </v-chip>
            </div>
            <div>{{ targetNames(publication) }}</div>
            <div>版本 {{ publication.revision }} · 更新于 {{ formatDateTime(publication.updatedAt) }}</div>
          </v-list-item-subtitle>

          <template #append>
            <div class="d-flex align-center">
              <v-btn
                icon="mdi-content-copy"
                size="small"
                :title="publication.type === 'ASSIGNMENT' ? '复制到今天为草稿' : '复制为草稿'"
                variant="text"
                @click="$emit('clone', publication)"
              />
              <v-menu>
                <template #activator="{props: menuProps}">
                  <v-btn
                    v-bind="menuProps"
                    icon="mdi-dots-vertical"
                    size="small"
                    variant="text"
                  />
                </template>
                <v-list>
                  <v-list-item
                    v-if="state(publication).key === 'pending'"
                    class="text-success"
                    prepend-icon="mdi-check-decagram-outline"
                    title="认证当前版本"
                    @click="$emit('certify', publication)"
                  />
                  <v-list-item
                    prepend-icon="mdi-history"
                    title="版本历史与恢复"
                    @click="$emit('history', publication)"
                  />
                  <v-list-item
                    v-if="publication.type === 'NOTICE' && publication.status === 'PUBLISHED'"
                    prepend-icon="mdi-monitor-eye"
                    title="查看大屏送达状态"
                    @click="$emit('delivery', publication)"
                  />
                  <v-list-item
                    v-if="publication.status !== 'WITHDRAWN'"
                    prepend-icon="mdi-pencil-outline"
                    title="编辑"
                    @click="$emit('edit', publication)"
                  />
                  <v-list-item
                    v-if="publication.status !== 'WITHDRAWN'"
                    class="text-error"
                    prepend-icon="mdi-undo-variant"
                    title="撤回"
                    @click="$emit('withdraw', publication)"
                  />
                </v-list>
              </v-menu>
            </div>
          </template>
        </v-list-item>
        <v-divider />
      </template>
    </v-list>

    <v-empty-state
      v-else
      :headline="hasFilters ? '没有符合条件的发布' : '还没有发布记录'"
      icon="mdi-text-box-search-outline"
      :text="hasFilters ? '清除部分筛选条件后再试' : '在左侧新建第一项作业或通知'"
    >
      <template
        v-if="hasFilters"
        #actions
      >
        <v-btn
          color="primary"
          variant="tonal"
          @click="resetFilters"
        >
          清除筛选
        </v-btn>
      </template>
    </v-empty-state>
  </v-card>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import {
  filterTeacherPublications,
  teacherPublicationFilterOptions,
  teacherPublicationState,
  teacherPublicationStats,
} from "@/utils/teacherPublications";

const props = defineProps({
  publications: {type: Array, default: () => []},
  loading: Boolean,
});
defineEmits(["refresh", "certify", "history", "edit", "clone", "withdraw", "delivery"]);

const query = ref("");
const stateFilter = ref("");
const typeFilter = ref("");
const subjectFilter = ref("");
const workspaceFilter = ref("");
const boardDateFilter = ref("");
const typeOptions = [
  {title: "作业", value: "ASSIGNMENT"},
  {title: "通知", value: "NOTICE"},
];
const stateOptions = [
  {title: "全部", value: "", color: "primary", icon: "mdi-format-list-bulleted"},
  {title: "待确认", value: "pending", color: "warning", icon: "mdi-alert-circle-outline"},
  {title: "草稿", value: "draft", color: "warning", icon: "mdi-file-edit-outline"},
  {title: "已发布", value: "published", color: "success", icon: "mdi-check-decagram-outline"},
  {title: "已撤回", value: "withdrawn", color: "grey", icon: "mdi-undo-variant"},
];

const stats = computed(() => teacherPublicationStats(props.publications));
const options = computed(() => teacherPublicationFilterOptions(props.publications));
const filteredPublications = computed(() => filterTeacherPublications(props.publications, {
  query: query.value,
  state: stateFilter.value,
  type: typeFilter.value,
  subjectId: subjectFilter.value,
  workspaceId: workspaceFilter.value,
  boardDate: boardDateFilter.value,
}));
const hasFilters = computed(() => Boolean(
  query.value || stateFilter.value || typeFilter.value || subjectFilter.value
  || workspaceFilter.value || boardDateFilter.value,
));

watch(options, (value) => {
  if (subjectFilter.value && !value.subjects.some((item) => item.value === subjectFilter.value)) {
    subjectFilter.value = "";
  }
  if (workspaceFilter.value && !value.workspaces.some((item) => item.value === workspaceFilter.value)) {
    workspaceFilter.value = "";
  }
});

function state(publication) {
  return teacherPublicationState(publication);
}

function targetNames(publication) {
  return publication.targets?.map((target) => target.workspace?.name).filter(Boolean).join("、") || "无发布目标";
}

function formatDateTime(value) {
  if (!value) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function resetFilters() {
  query.value = "";
  stateFilter.value = "";
  typeFilter.value = "";
  subjectFilter.value = "";
  workspaceFilter.value = "";
  boardDateFilter.value = "";
}
</script>

<style scoped>
.teacher-publication-manager { overflow: hidden; }
.publication-list { max-height: 780px; overflow-y: auto; }
.publication-list-item { min-width: 0; }
.publication-list-subtitle { -webkit-line-clamp: unset; white-space: normal; }
</style>
