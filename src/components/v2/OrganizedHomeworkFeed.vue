<template>
  <section class="organized-homework-feed">
    <v-card
      v-if="showControls"
      class="feed-controls rounded-xl mb-4"
      variant="tonal"
    >
      <v-card-text class="d-flex align-center flex-wrap ga-2 py-3 px-4">
        <v-icon icon="mdi-filter-variant" />
        <span class="font-weight-bold mr-1">筛选作业</span>
        <v-select
          v-if="options.subjects.length > 1"
          v-model="subjectId"
          class="feed-control-select"
          clearable
          density="compact"
          hide-details
          :items="options.subjects"
          label="科目"
          variant="outlined"
        />
        <v-select
          v-if="options.workspaces.length > 1"
          v-model="workspaceId"
          class="feed-control-select feed-control-select--workspace"
          clearable
          density="compact"
          hide-details
          :items="options.workspaces"
          label="班级"
          variant="outlined"
        />
        <v-select
          v-model="sortMode"
          class="feed-control-select"
          density="compact"
          hide-details
          :items="sortOptions"
          label="排序"
          variant="outlined"
        />
        <v-spacer />
        <template v-if="completionEnabled && completionStats.total">
          <v-chip
            color="success"
            prepend-icon="mdi-check-circle-outline"
            size="small"
            title="完成状态仅保存在这台设备"
            variant="tonal"
          >
            本机已完成 {{ completionStats.completed }}/{{ completionStats.total }}
          </v-chip>
          <v-btn
            v-if="completionStats.completed"
            :prepend-icon="hideCompleted ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
            size="small"
            variant="text"
            @click="hideCompleted = !hideCompleted"
          >
            {{ hideCompleted ? "显示已完成" : "隐藏已完成" }}
          </v-btn>
        </template>
        <v-chip
          size="small"
          variant="tonal"
        >
          {{ organized.visibleCount }} 项
        </v-chip>
        <v-btn
          v-if="hasFilters"
          prepend-icon="mdi-filter-remove-outline"
          size="small"
          variant="text"
          @click="resetFilters"
        >
          清除
        </v-btn>
      </v-card-text>
    </v-card>

    <section
      v-if="organized.notices.length"
      class="feed-section mb-5"
    >
      <div class="feed-section-heading">
        <v-icon
          color="primary"
          icon="mdi-bullhorn-outline"
        />
        <span>通知</span>
        <v-chip
          size="x-small"
          variant="tonal"
        >
          {{ organized.notices.length }}
        </v-chip>
      </div>
      <HomeworkFeedGrid
        :can-edit="canEdit"
        :publications="organized.notices"
        :screen-mode="screenMode"
        :settings="settings"
        :current-time="now"
        :completion-enabled="completionEnabled"
        :completion-records="completionRecords"
        @edit="$emit('edit', $event)"
        @history="$emit('history', $event)"
        @toggle-complete="toggleCompletion"
      />
    </section>

    <section
      v-if="screenMode && screenAssignments.length"
      class="feed-section mb-5"
    >
      <div class="feed-section-heading">
        <v-icon
          color="primary"
          icon="mdi-book-open-page-variant"
        />
        <span>作业</span>
        <v-chip
          size="x-small"
          variant="tonal"
        >
          {{ screenAssignments.length }}
        </v-chip>
      </div>
      <HomeworkFeedGrid
        :can-edit="canEdit"
        :publications="screenAssignments"
        :screen-mode="screenMode"
        :settings="settings"
        :current-time="now"
        :completion-enabled="completionEnabled"
        :completion-records="completionRecords"
        @edit="$emit('edit', $event)"
        @history="$emit('history', $event)"
        @toggle-complete="toggleCompletion"
      />
    </section>

    <template v-else>
      <section
        v-for="group in organized.assignmentGroups"
        :key="group.id"
        class="feed-section mb-5"
      >
        <div class="feed-section-heading">
          <v-icon
            color="primary"
            icon="mdi-book-open-page-variant"
          />
          <span>{{ group.name }}</span>
          <v-chip
            size="x-small"
            variant="tonal"
          >
            {{ group.publications.length }}
          </v-chip>
        </div>
        <HomeworkFeedGrid
          :can-edit="canEdit"
          :publications="group.publications"
          :screen-mode="screenMode"
          :settings="settings"
          :current-time="now"
          :completion-enabled="completionEnabled"
          :completion-records="completionRecords"
          @edit="$emit('edit', $event)"
          @history="$emit('history', $event)"
          @toggle-complete="toggleCompletion"
        />
      </section>
    </template>

    <v-empty-state
      v-if="showEmptyState"
      class="rounded-xl"
      :headline="hideCompleted ? '已完成作业已隐藏' : '没有符合条件的作业'"
      :icon="hideCompleted ? 'mdi-check-circle-outline' : 'mdi-filter-off-outline'"
      :text="hideCompleted ? '完成状态仅保存在这台设备，可以随时重新显示' : '可以清除筛选条件查看当前日期的全部内容'"
    >
      <template #actions>
        <v-btn
          v-if="hideCompleted"
          color="success"
          variant="tonal"
          @click="hideCompleted = false"
        >
          显示已完成
        </v-btn>
        <v-btn
          v-else
          color="primary"
          variant="tonal"
          @click="resetFilters"
        >
          清除筛选
        </v-btn>
      </template>
    </v-empty-state>
  </section>
</template>

<script setup>
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import HomeworkFeedGrid from "@/components/v2/HomeworkFeedGrid.vue";
import {SCREEN_DISPLAY_DEFAULTS} from "@/utils/screenDisplaySettings";
import {organizePublicationFeed, publicationFilterOptions} from "@/utils/publicationFeed";
import {
  isStudentHomeworkCompleted,
  loadStudentHomeworkCompletions,
  setStudentHomeworkCompleted,
  studentHomeworkCompletionStats,
} from "@/utils/studentHomeworkCompletion";

const props = defineProps({
  publications: {type: Array, default: () => []},
  screenMode: Boolean,
  settings: {type: Object, default: () => ({...SCREEN_DISPLAY_DEFAULTS})},
  canEdit: {type: Function, default: () => false},
  excludeUrgentNotices: Boolean,
  completionEnabled: Boolean,
});
defineEmits(["edit", "history"]);

const subjectId = ref("");
const workspaceId = ref("");
const sortMode = ref("smart");
const completionRecords = ref(props.completionEnabled ? loadStudentHomeworkCompletions() : {});
const hideCompleted = ref(false);
const now = ref(new Date());
let minuteTimer;
const sortOptions = [
  {title: "智能排序", value: "smart"},
  {title: "截止时间", value: "due"},
  {title: "最新发布", value: "recent"},
];
const options = computed(() => publicationFilterOptions(props.publications));
const visiblePublications = computed(() => hideCompleted.value
  ? props.publications.filter((publication) => !isStudentHomeworkCompleted(publication, completionRecords.value))
  : props.publications);
const organized = computed(() => organizePublicationFeed(visiblePublications.value, {
  subjectId: subjectId.value,
  workspaceId: workspaceId.value,
  sortMode: sortMode.value,
  excludeUrgentNotices: props.excludeUrgentNotices,
}));
const screenAssignments = computed(() => organized.value.assignmentGroups
  .flatMap((group) => group.publications));
const completionStats = computed(() => studentHomeworkCompletionStats(props.publications, completionRecords.value));
const showControls = computed(() => props.completionEnabled
  || options.value.subjects.length > 1
  || options.value.workspaces.length > 1);
const hasFilters = computed(() => Boolean(subjectId.value || workspaceId.value || sortMode.value !== "smart"));
const showEmptyState = computed(() => {
  if (organized.value.visibleCount) return false;
  if (hasFilters.value || !props.excludeUrgentNotices) return true;
  return props.publications.some((publication) => (
    publication.type !== "NOTICE" || publication.priority !== "URGENT"
  ));
});

watch(options, (value) => {
  if (subjectId.value && !value.subjects.some((item) => item.value === subjectId.value)) subjectId.value = "";
  if (workspaceId.value && !value.workspaces.some((item) => item.value === workspaceId.value)) workspaceId.value = "";
});

function scheduleMinuteTick() {
  window.clearTimeout(minuteTimer);
  if (document.hidden) return;
  const delay = 60_000 - (Date.now() % 60_000) + 20;
  minuteTimer = window.setTimeout(() => {
    now.value = new Date();
    scheduleMinuteTick();
  }, delay);
}

function handleVisibilityChange() {
  if (!document.hidden) now.value = new Date();
  scheduleMinuteTick();
}

onMounted(() => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  scheduleMinuteTick();
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.clearTimeout(minuteTimer);
});

function resetFilters() {
  subjectId.value = "";
  workspaceId.value = "";
  sortMode.value = "smart";
}

function toggleCompletion(publication) {
  if (!props.completionEnabled) return;
  completionRecords.value = setStudentHomeworkCompleted(
    publication,
    !isStudentHomeworkCompleted(publication, completionRecords.value),
  );
}
</script>

<style scoped>
.feed-controls {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.feed-control-select { flex: 0 1 180px; min-width: 150px; }
.feed-control-select--workspace { flex-basis: 230px; }
.feed-section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0 4px 10px;
}
@media (max-width: 700px) {
  .feed-control-select,
  .feed-control-select--workspace { flex: 1 1 100%; }
}
</style>
