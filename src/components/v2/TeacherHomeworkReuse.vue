<template>
  <v-dialog
    :model-value="true"
    persistent
    scrollable
    max-width="900"
  >
    <v-card class="homework-reuse-dialog rounded-xl">
      <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5">
        复用历史作业
        <v-spacer />
        <v-btn
          :disabled="Boolean(composer?.requestBusy)"
          icon="mdi-close"
          title="关闭历史复用"
          variant="text"
          @click="close"
        />
      </v-card-title>
      <v-card-text>
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          class="mb-4"
        >
          {{ error }}
        </v-alert>
        <template v-if="!queue.length">
          <p class="mb-4">
            选择某天已发布或已撤回的作业，最多 {{ HOMEWORK_REUSE_LIMIT }} 项。带入最新内容后，逐项选择班级、核对日期并发布；也可以保存为草稿。
          </p>
          <v-row>
            <v-col
              cols="12"
              sm="6"
            >
              <v-text-field
                v-model="sourceDate"
                :disabled="preparing"
                label="历史作业日期"
                type="date"
              />
            </v-col>
            <v-col
              cols="12"
              sm="6"
            >
              <v-text-field
                v-model="targetDate"
                :disabled="preparing"
                label="新作业板日期"
                type="date"
              />
            </v-col>
          </v-row>
          <v-alert
            v-if="store.teacherError"
            type="warning"
            variant="tonal"
            class="mb-3"
          >
            {{ store.teacherError }}
          </v-alert>
          <v-btn
            :disabled="preparing"
            :loading="store.teacherPublicationsLoading"
            variant="text"
            @click="store.refreshTeacherPublications()"
          >
            刷新历史记录
          </v-btn>
          <div
            v-if="!candidates.length"
            class="pa-5 text-medium-emphasis"
          >
            所选日期没有可复用的作业。
          </div>
          <v-checkbox
            v-for="item in candidates"
            :key="item.id"
            v-model="selected"
            :value="item.id"
            :disabled="preparing || !eligible(item) || (selected.length >= HOMEWORK_REUSE_LIMIT && !selected.includes(item.id))"
            :label="`${item.subject?.name || '未指定科目'} · ${sourceTitle(item)}`"
            :hint="`${targetNames(item)}${item.status === 'WITHDRAWN' ? ' · 已撤回' : ''}${item.isCertified ? '' : ' · 待教师确认'}${eligible(item) ? '' : ' · 当前无可发布班级'}`"
            persistent-hint
            class="reuse-source mb-3"
          />
          <v-btn
            :disabled="!selected.length || store.teacherPublicationsLoading"
            :loading="preparing"
            color="primary"
            class="mt-4"
            @click="prepare"
          >
            核对所选 {{ selected.length }} 项作业
          </v-btn>
        </template>
        <template v-else>
          <p class="mb-3">
            第 {{ index + 1 }} / {{ queue.length }} 项 · {{ current.title || '未命名作业' }}
          </p>
          <p class="text-caption mb-4">
            已保存 {{ results.filter(item => item.id).length }} 项，跳过 {{ results.filter(item => !item.id).length }} 项。每项单独保存，不会自动发布下一项。
          </p>
          <v-alert
            v-if="currentResult"
            type="success"
            variant="tonal"
            class="mb-4"
          >
            {{ currentResult.id ? currentResult.status === 'DRAFT' ? '本项已保存为草稿。' : '本项已发布（定时作业将在设定时间显示）。' : '本项已跳过。' }}
          </v-alert>
          <PublicationComposer
            v-else
            ref="composer"
            :key="index"
            :reuse-draft="current.draft"
            @published="saved"
          />
          <div class="d-flex flex-wrap justify-end ga-2 mt-4">
            <v-btn
              v-if="!currentResult"
              :disabled="busy"
              variant="text"
              @click="skip"
            >
              跳过本项
            </v-btn>
            <v-btn
              v-if="currentResult && index < queue.length - 1"
              color="primary"
              @click="index++"
            >
              核对下一项
            </v-btn>
            <v-btn
              v-if="currentResult && index === queue.length - 1"
              color="primary"
              @click="close"
            >
              完成复用
            </v-btn>
          </div>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {computed, defineAsyncComponent, onUnmounted, ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {todayBoardDate} from "@/utils/boardDate";
import {canReuseHomework, homeworkReuseDraft, HOMEWORK_REUSE_LIMIT} from "@/utils/homeworkReuse";
import {validPreparationDate} from "@/utils/homeworkPreparation";
import {confirmAction} from "@/utils/actionDialog";
import {describeApiError} from "@/utils/classworksV2Client";
import {registerAppReloadBlocker} from "@/utils/appReloadProtection";

const emit = defineEmits(["close"]);
const store = useClassworksV2Store();
const PublicationComposer = defineAsyncComponent(() => import("@/components/v2/PublicationComposer.vue"));
const sources = computed(() => store.teacherPublications.filter(item => canReuseHomework(item)));
const sourceDate = ref(sources.value.map(item => String(item.boardDate || '').slice(0, 10)).filter(validPreparationDate).sort().at(-1) || todayBoardDate());
const targetDate = ref(todayBoardDate()), selected = ref([]), queue = ref([]), results = ref([]), index = ref(0);
const preparing = ref(false), error = ref(""), composer = ref(null);
const busy = computed(() => preparing.value || Boolean(composer.value?.requestBusy));
const candidates = computed(() => sources.value.filter(item => String(item.boardDate).slice(0, 10) === sourceDate.value));
const current = computed(() => queue.value[index.value]);
const currentResult = computed(() => results.value[index.value]);
const pending = computed(() => preparing.value || queue.value.length > results.value.length);
let mounted = true, generation = 0;
const alive = (version, session, account) => mounted && version === generation && session === store.teacherSessionVersion && account === store.account?.id;
const releaseBlocker = registerAppReloadBlocker(() => pending.value ? "历史作业复用尚未完成，请先保存或关闭复用窗口。" : "");
onUnmounted(() => { mounted = false; generation++; releaseBlocker(); });
watch([() => store.teacherSessionVersion, () => store.account?.id], () => {
  generation++; queue.value = []; selected.value = []; results.value = []; emit("close");
}, {flush: "sync"});
watch(sourceDate, () => { selected.value = []; });
function eligible(item) {
  return store.teacherSubjects.some(subject => subject.id === item.subjectId)
    && store.eligibleTeacherWorkspaces("ASSIGNMENT", item.subjectId).length > 0;
}
function targetNames(item) { return item.targets?.map(target => target.workspace?.name).filter(Boolean).join("、") || "历史班级"; }
function sourceTitle(item) {
  const text = item.title || item.content || "无正文";
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}
async function prepare() {
  if (busy.value || !selected.value.length) return;
  error.value = "";
  if (!validPreparationDate(targetDate.value)) { error.value = "请选择有效的新作业板日期。"; return; }
  const ids = [...selected.value], date = targetDate.value;
  if (ids.length > HOMEWORK_REUSE_LIMIT) return;
  const version = ++generation, session = store.teacherSessionVersion, account = store.account?.id;
  preparing.value = true;
  try {
    const next = [];
    for (const id of ids) {
      const item = await store.latestPublication(id);
      if (!alive(version, session, account)) return;
      if (!eligible(item)) throw new Error("部分历史作业的科目或发布权限已变化，请刷新后重新选择。");
      next.push({title: sourceTitle(item), draft: homeworkReuseDraft(item, date)});
    }
    queue.value = next;
  } catch (failure) {
    if (alive(version, session, account)) error.value = describeApiError(failure, "读取历史作业失败，请重试。");
  } finally { if (alive(version, session, account)) preparing.value = false; }
}
function saved(publication) {
  if (!mounted || currentResult.value) return;
  results.value.push({id: publication.id, status: publication.status});
}
async function skip() {
  if (busy.value) return;
  const version = generation, position = index.value;
  if (await confirmAction({title: "跳过这项作业？", message: "本项尚未保存的输入将丢弃，其他已保存的作业不受影响。", confirmText: "跳过本项"})
    && mounted && version === generation && position === index.value && !busy.value && !currentResult.value) results.value.push({id: null});
}
async function close() {
  if (composer.value?.requestBusy) return;
  const version = generation;
  if (pending.value && !await confirmAction({title: "结束本次复用？", message: "未保存的复用内容将丢弃；已发布或已保存的草稿将保留。", confirmText: "结束复用"})) return;
  if (mounted && version === generation && !composer.value?.requestBusy) {
    generation++;
    emit("close");
  }
}
</script>

<style scoped>
.reuse-source :deep(.v-label) { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
