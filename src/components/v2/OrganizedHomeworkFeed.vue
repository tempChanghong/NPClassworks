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
        @edit="$emit('edit', $event)"
        @history="$emit('history', $event)"
      />
    </section>

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
        @edit="$emit('edit', $event)"
        @history="$emit('history', $event)"
      />
    </section>

    <v-empty-state
      v-if="showEmptyState"
      class="rounded-xl"
      headline="没有符合条件的作业"
      icon="mdi-filter-off-outline"
      text="可以清除筛选条件查看当前日期的全部内容"
    >
      <template #actions>
        <v-btn
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
import {computed, ref, watch} from "vue";
import HomeworkFeedGrid from "@/components/v2/HomeworkFeedGrid.vue";
import {SCREEN_DISPLAY_DEFAULTS} from "@/utils/screenDisplaySettings";
import {organizePublicationFeed, publicationFilterOptions} from "@/utils/publicationFeed";

const props = defineProps({
  publications: {type: Array, default: () => []},
  screenMode: Boolean,
  settings: {type: Object, default: () => ({...SCREEN_DISPLAY_DEFAULTS})},
  canEdit: {type: Function, default: () => false},
  excludeUrgentNotices: Boolean,
});
defineEmits(["edit", "history"]);

const subjectId = ref("");
const workspaceId = ref("");
const sortMode = ref("smart");
const sortOptions = [
  {title: "智能排序", value: "smart"},
  {title: "截止时间", value: "due"},
  {title: "最新发布", value: "recent"},
];
const options = computed(() => publicationFilterOptions(props.publications));
const organized = computed(() => organizePublicationFeed(props.publications, {
  subjectId: subjectId.value,
  workspaceId: workspaceId.value,
  sortMode: sortMode.value,
  excludeUrgentNotices: props.excludeUrgentNotices,
}));
const showControls = computed(() => options.value.subjects.length > 1 || options.value.workspaces.length > 1);
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

function resetFilters() {
  subjectId.value = "";
  workspaceId.value = "";
  sortMode.value = "smart";
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
