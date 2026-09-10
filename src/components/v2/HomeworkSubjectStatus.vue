<template>
  <v-card
    v-if="rows.length && !store.feedLoading && (!store.feedLoadError || store.feedUsingCache)"
    class="my-3 rounded-xl"
    variant="tonal"
  >
    <v-card-text>
      <div class="font-weight-bold mb-2">
        各科录入状态
      </div>
      <div class="d-flex flex-wrap ga-2">
        <v-chip
          v-for="row in rows"
          :key="row.key"
          :color="row.state === 'conflict' ? 'error' : row.state === 'none' ? 'success' : undefined"
          variant="outlined"
        >
          {{ row.subject }} · {{ row.workspace }}：{{ label(row) }}
        </v-chip>
      </div>
      <p class="text-caption mt-2">
        按当前已加载内容判断；“尚未录入”不代表无作业。{{ store.feedUsingCache ? '当前为离线缓存，请核对。' : '' }}
      </p>
    </v-card-text>
  </v-card>
</template>
<script setup>
import {computed} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {dailyHomeworkStatuses} from "@/utils/noHomework";
const store = useClassworksV2Store();
const rows = computed(() => {
  const allowed = new Set(store.activeWorkspaceIds);
  const workspaces = store.feedAudience === "screen" ? store.screenWorkspaces : [
    ...store.administrativeClasses.map(item => ({...item, subjectRules: item.id === store.courseOptions?.administrativeClass?.id
      ? store.courseOptions.subjects.map(option => ({subjectId: option.subject.id, deliveryMode: option.deliveryMode})) : item.subjectRules})),
    ...(store.courseOptions?.subjects || []).flatMap(item => (item.courseGroups || []).map(group => ({...group, type: "COURSE_GROUP", subjectId: item.subject.id}))),
  ];
  const subjects = store.feedAudience === "screen" ? store.screenSession?.subjects || [] : store.studentSubjects;
  return dailyHomeworkStatuses(store.feed, workspaces.filter(item => allowed.has(item.id)), subjects, store.boardDate);
});
function label(row) {
  if (row.state === "conflict") return "作业与无作业标记并存，请核对";
  if (row.state === "assigned") return `${row.count} 项作业`;
  if (row.state === "none") return row.confirmed ? "今日无作业" : "已标记无作业（待教师确认）";
  return "尚未录入";
}
</script>
