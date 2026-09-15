<template>
  <v-btn
    v-if="!hideButton"
    :disabled="!store.activeWorkspaceIds.length"
    prepend-icon="mdi-text-box-check-outline"
    variant="tonal"
    @click="open"
  >
    查看今日更正
  </v-btn>
  <v-dialog
    v-model="opened"
    max-width="950"
    scrollable
  >
    <v-card class="homework-corrections-dialog rounded-xl">
      <v-card-title>今日作业更正 · {{ className }}</v-card-title>
      <v-card-text>
        <p>北京时间 {{ date }}，当前作业板日期 {{ store.boardDate }}。仅比较当前可见作业中连续两个已发布版本；不含草稿、发布前修改、已撤回或已清理正文。首次新增不计为更正。</p>
        <v-btn
          class="my-3"
          :loading="loading"
          @click="reload"
        >
          刷新更正
        </v-btn>
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
        >
          {{ error }}
        </v-alert>
        <p v-else-if="!loading && !items.length">
          当前范围今日暂无可展示的更正记录。
        </p>
        <article
          v-for="item in items"
          :key="`${item.id}:${item.revision}`"
          class="correction-entry py-4"
        >
          <h3>{{ item.subject }} · 版本 {{ item.revision }}</h3>
          <p>{{ formatDate(item.changedAt) }}</p>
          <p
            v-if="item.after.correctionReason"
            class="correction-text"
          >
            更正原因：{{ item.after.correctionReason }}
          </p>
          <div
            v-for="field in fields(item)"
            :key="field.key"
            class="my-3"
          >
            <strong>{{ field.label }}</strong>
            <p class="correction-text">
              原来：{{ display(field) }}
            </p>
            <p class="correction-text">
              现在：{{ display(field, true) }}
            </p>
          </div>
        </article>
      </v-card-text>
      <v-card-actions>
        <v-spacer /><v-btn @click="opened = false">
          关闭
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
<script setup>
import {computed, onUnmounted, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {classworksV2Api, getClassroomScreenToken} from "@/utils/classworksV2Client";
import {deadlineBoardDate} from "@/utils/homeworkWeek";
import {homeworkChangedFields} from "@/utils/homeworkChanges";
const props = defineProps({hideButton: Boolean, className: {type: String, default: ""}});
const store = useClassworksV2Store();
const opened = ref(false), loading = ref(false), error = ref(""), items = ref([]), date = ref("");
const scope = computed(() => JSON.stringify([store.feedAudience, store.activeWorkspaceIds, store.boardDate, store.screenSession?.binding?.id, props.className]));
const feedVersion = computed(() => JSON.stringify([
  store.feedLoadError, store.feedUsingCache,
  store.feed.map(item => [item.id, item.revision, item.status]),
]));
let controller, generation = 0, reviewedFeed = null;
function cancel() { generation++; reviewedFeed = null; controller?.abort(); loading.value = false; items.value = []; }
function open() { opened.value = true; void reload(); }
const formatDate = value => new Date(value).toLocaleString("zh-CN", {timeZone: "Asia/Shanghai"});
const fields = item => homeworkChangedFields(item.before, item.after);
const display = (field, after = false) => { const value = field[after ? "after" : "before"]; return !value ? "（未设置）" : field.key === "dueAt" ? formatDate(value) : value; };
async function reload() {
  cancel(); error.value = "";
  if (!opened.value) return;
  date.value = deadlineBoardDate(new Date());
  const current = generation, token = getClassroomScreenToken();
  controller = new AbortController(); const signal = controller.signal;
  loading.value = true;
  try {
    await store.loadActiveFeed();
    if (current !== generation || token !== getClassroomScreenToken()) return;
    if (store.feedLoading) throw new Error("作业正在更新，请稍后刷新更正回顾。");
    if (!store.feedGeneratedAt || store.feedLoadError || store.feedUsingCache) throw new Error("无法读取最新作业，请联网后重试更正回顾。");
    reviewedFeed = feedVersion.value;
    const result = [];
    for (const publication of store.feed.filter(item => item.type === "ASSIGNMENT" && item.status === "PUBLISHED" && item.revision > 1)) {
      let beforeRevision;
      for (let page = 0; page < 100; page++) {
        const response = await classworksV2Api.homeworkCorrections(publication.id, store.activeWorkspaceIds, {date: date.value, beforeRevision}, {screen: store.feedAudience === "screen", signal});
        if (current !== generation || token !== getClassroomScreenToken()) return;
        if (!Array.isArray(response.items) || !Object.hasOwn(response, "nextBeforeRevision")) throw new Error("更正回顾不可用，请确认后端已更新。");
        result.push(...response.items.map(item => ({...item, id: publication.id, subject: publication.subject?.name || "未指定科目"})));
        if (response.nextBeforeRevision === null) break;
        if (!Number.isInteger(response.nextBeforeRevision) || response.nextBeforeRevision < 1 || (beforeRevision && response.nextBeforeRevision >= beforeRevision) || page === 99) throw new Error("更正记录读取不完整，请重试。");
        beforeRevision = response.nextBeforeRevision;
      }
    }
    if (current === generation) items.value = result.sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt));
  } catch (failure) { if (current === generation && !signal.aborted) error.value = failure.response?.data?.message || failure.message || "更正回顾加载失败。"; }
  finally { if (current === generation) loading.value = false; }
}
watch(opened, value => { if (!value) cancel(); });
watch(scope, () => { opened.value = false; cancel(); }, {flush: "sync"});
watch(feedVersion, value => {
  if (opened.value && reviewedFeed !== null && value !== reviewedFeed) {
    cancel();
    error.value = "作业已变化，请刷新更正回顾后重新核对。";
  }
}, {flush: "sync"});
onUnmounted(cancel);
defineExpose({open});
</script>
<style scoped>
.correction-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.correction-entry { border-top: 1px solid #8885; }
</style>
