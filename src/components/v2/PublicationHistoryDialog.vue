<template>
  <v-dialog
    :model-value="modelValue"
    :persistent="writeBusy"
    max-width="860"
    scrollable
    @update:model-value="requestVisibility"
  >
    <v-card class="history-dialog rounded-xl">
      <v-card-title class="history-dialog__header pa-5 pb-3">
        <div class="history-dialog__heading">
          <v-icon icon="mdi-history" />
          <div>
            <div>不可删除的版本历史</div>
            <div class="history-dialog__subtitle text-medium-emphasis">
              当前版本 {{ workingPublication?.revision || "—" }}<span v-if="!loading"> · 已加载 {{ revisions.length }} 个版本</span>
            </div>
          </div>
        </div>
        <v-btn
          v-if="canCertifyCurrent"
          class="history-dialog__certify"
          color="success"
          :loading="certifying"
          :disabled="writeBusy"
          prepend-icon="mdi-check-decagram-outline"
          variant="tonal"
          @click="certifyCurrent"
        >
          教师确认当前版本
        </v-btn>
      </v-card-title>
      <v-card-text class="history-dialog__body px-5">
        <div class="history-dialog__hint mb-4">
          <v-icon
            icon="mdi-information-outline"
            size="small"
          />
          恢复会生成新的当前版本，原有记录仍保留。
        </div>
        <v-skeleton-loader
          v-if="loading"
          type="list-item-three-line@3"
        />
        <ol
          v-else-if="revisions.length"
          class="history-list"
          aria-label="版本记录"
        >
          <li
            v-for="item in revisions"
            :key="item.id"
            class="history-entry"
          >
            <v-card
              class="history-entry__card"
              border
              variant="flat"
            >
              <v-card-text class="pa-4">
                <div class="history-entry__top">
                  <div class="history-entry__identity">
                    <strong>版本 {{ item.revision }}</strong>
                    <v-chip
                      v-if="item.revision === workingPublication?.revision"
                      color="primary"
                      size="small"
                      variant="tonal"
                    >
                      当前版本
                    </v-chip>
                    <v-chip
                      v-if="mode !== 'screen' || revisionState(item).key !== 'pending'"
                      :color="revisionState(item).color"
                      size="small"
                      variant="tonal"
                    >
                      {{ revisionState(item).label }}
                    </v-chip>
                    <v-chip
                      v-if="item.action === 'RESTORED'"
                      size="small"
                      variant="outlined"
                    >
                      恢复自版本 {{ item.restoredFromRevision }}
                    </v-chip>
                  </div>
                  <span class="history-entry__meta text-medium-emphasis">
                    {{ formatDateTime(item.createdAt) }} · {{ actorLabel(item) }}
                  </span>
                </div>
                <div
                  v-if="item.snapshot.title"
                  class="history-entry__title font-weight-bold"
                >
                  {{ item.snapshot.title }}
                </div>
                <div class="revision-content">
                  {{ item.purgedAt ? "该备份已按三天保留策略清理正文" : (requiredHomeworkContent(item.snapshot) || "（无正文）") }}
                </div>
                <SubmissionDetails
                  v-if="!item.purgedAt"
                  :publication="item.snapshot"
                />
                <p
                  v-if="!item.purgedAt && correctionOf(item.snapshot)"
                  class="revision-content"
                >
                  更正原因：{{ correctionOf(item.snapshot) }}
                </p>
                <PreparationDetails
                  v-if="!item.purgedAt"
                  :publication="item.snapshot"
                />
                <div class="history-entry__actions mt-3">
                  <v-btn
                    :disabled="writeBusy || item.revision === workingPublication?.revision || item.snapshot.status === 'WITHDRAWN' || Boolean(item.purgedAt)"
                    :loading="restoringRevision === item.revision"
                    prepend-icon="mdi-backup-restore"
                    size="small"
                    variant="tonal"
                    @click="restore(item)"
                  >
                    恢复此版本
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </li>
        </ol>
        <v-empty-state
          v-else-if="!error"
          headline="暂无版本记录"
          icon="mdi-history"
          text="此发布还没有可查看的历史版本"
        />
        <div class="d-flex justify-center mt-4">
          <v-btn
            v-if="nextBeforeRevision !== null && !loading"
            :loading="loadingMore"
            :disabled="writeBusy"
            variant="tonal"
            @click="loadMore"
          >
            加载更早版本
          </v-btn>
          <v-btn
            v-else-if="error && !loading && !revisions.length"
            variant="tonal"
            @click="load()"
          >
            重新加载
          </v-btn>
        </div>
      </v-card-text>
      <v-alert
        v-if="error"
        class="history-dialog__error mx-5 mb-2"
        role="alert"
        type="error"
        variant="tonal"
      >
        {{ error }}
      </v-alert>
      <v-card-actions class="history-dialog__footer px-5 pb-5">
        <v-spacer />
        <v-btn
          :disabled="writeBusy"
          @click="requestVisibility(false)"
        >
          关闭
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {correctionOf, requiredHomeworkContent} from "@/utils/homeworkInstructions";
import SubmissionDetails from "@/components/v2/SubmissionDetails.vue";
import PreparationDetails from "@/components/v2/PreparationDetails.vue";
import {computed, onBeforeUnmount, ref, watch} from "vue";
import {registerAppReloadBlocker} from "@/utils/appReloadProtection";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {isPublicationRevisionConflict} from "@/utils/publicationConflict";
import {publicationDisplayState} from "@/utils/publicationStatus";
import {publicationHistoryPage} from "@/utils/publicationHistoryPage";

const props = defineProps({
  modelValue: Boolean,
  publication: {type: Object, default: null},
  mode: {type: String, default: "teacher"},
});
const emit = defineEmits(["update:modelValue", "changed", "refreshed"]);
const store = useClassworksV2Store();
const workingPublication = ref(props.publication);
const revisions = ref([]);
const loading = ref(false);
const loadingMore = ref(false);
const nextBeforeRevision = ref(null);
let requestGeneration = 0;
let dialogGeneration = 0;
const certifying = ref(false);
const restoringRevision = ref(null);
const writeBusy = computed(() => certifying.value || restoringRevision.value !== null);
const canCertifyCurrent = computed(() => props.mode === "teacher"
  && workingPublication.value?.status === "PUBLISHED" && !workingPublication.value.isCertified);
const error = ref("");

function requestVisibility(open) {
  if (!open && writeBusy.value) return;
  emit("update:modelValue", open);
}

function revisionState(item) {
  return publicationDisplayState({...item.snapshot, isCertified: item.isCertified});
}

watch([() => props.modelValue, () => props.publication?.id, () => props.mode], ([open]) => {
  dialogGeneration++;
  requestGeneration++;
  loading.value = false;
  loadingMore.value = false;
  revisions.value = [];
  nextBeforeRevision.value = null;
  certifying.value = false;
  restoringRevision.value = null;
  error.value = "";
  if (open && props.publication) {
    workingPublication.value = props.publication;
    load();
  }
}, {immediate: true});
onBeforeUnmount(() => { requestGeneration++; dialogGeneration++; });

function currentDialog() {
  const generation = dialogGeneration;
  return () => props.modelValue && generation === dialogGeneration;
}

async function load({append = false} = {}) {
  if (!props.modelValue || !workingPublication.value) return;
  const generation = ++requestGeneration;
  const page = {limit: 20, ...(append ? {beforeRevision: nextBeforeRevision.value} : {})};
  if (append) loadingMore.value = true;
  else {
    loading.value = true;
    loadingMore.value = false;
    revisions.value = [];
    nextBeforeRevision.value = null;
  }
  error.value = "";
  try {
    const result = publicationHistoryPage(await store.publicationRevisions(workingPublication.value, props.mode, page), page);
    if (generation !== requestGeneration) return;
    revisions.value = append ? [...revisions.value, ...result.items] : result.items;
    nextBeforeRevision.value = result.nextBeforeRevision;
  } catch (loadError) {
    if (generation === requestGeneration) error.value = loadError.response?.data?.message || loadError.message || "加载历史失败";
  } finally {
    if (generation === requestGeneration) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

function loadMore() {
  if (writeBusy.value || loading.value || loadingMore.value || nextBeforeRevision.value === null) return;
  return load({append: true});
}

function actorLabel(item) {
  if (item.actorType === "CLASSROOM_SCREEN") return item.screenBinding?.name || "班级大屏";
  return item.editor?.name || "教师账号";
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function certifyCurrent() {
  if (writeBusy.value || !props.modelValue || !canCertifyCurrent.value) return;
  const isCurrent = currentDialog();
  certifying.value = true;
  const releaseReload = registerAppReloadBlocker(() => "正在确认作业版本，请等待操作完成后再刷新。");
  error.value = "";
  try {
    const changed = await store.certify(workingPublication.value);
    if (!isCurrent()) return;
    workingPublication.value = changed;
    emit("changed", changed);
    await load();
  } catch (caught) {
    if (!isCurrent()) return;
    if (isPublicationRevisionConflict(caught)) await refreshConflict("教师确认", isCurrent);
    else error.value = store.teacherError;
  } finally {
    releaseReload();
    if (isCurrent()) certifying.value = false;
  }
}

async function restore(item) {
  if (writeBusy.value || !props.modelValue || !workingPublication.value) return;
  const isCurrent = currentDialog();
  restoringRevision.value = item.revision;
  const releaseReload = registerAppReloadBlocker(() => "正在恢复作业历史版本，请等待操作完成后再刷新。");
  error.value = "";
  try {
    const changed = await store.restoreRevision(workingPublication.value, item.revision, props.mode);
    if (!isCurrent()) return;
    workingPublication.value = changed;
    emit("changed", changed);
    await load();
  } catch (caught) {
    if (!isCurrent()) return;
    if (isPublicationRevisionConflict(caught)) await refreshConflict("恢复", isCurrent);
    else error.value = props.mode === "screen" ? store.screenError : store.teacherError;
  } finally {
    releaseReload();
    if (isCurrent()) restoringRevision.value = null;
  }
}

async function refreshConflict(action, isCurrent) {
  try {
    const latest = await store.latestPublication(workingPublication.value.id, props.mode);
    if (!isCurrent()) return;
    workingPublication.value = latest;
    emit("refreshed", latest);
    await load();
    if (!isCurrent()) return;
    error.value = `${action}未执行：内容已被其他设备修改，已载入服务器最新版本，请重新检查后操作。`;
  } catch (caught) {
    if (isCurrent()) error.value = caught.response?.data?.message || caught.message || "载入最新版本失败";
  }
}
</script>

<style scoped>
.history-dialog { max-height: min(90dvh, 920px); }
.history-dialog__header { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; }
.history-dialog__heading { align-items: center; display: flex; font-size: 1.15rem; font-weight: 700; gap: 12px; min-width: 0; white-space: normal; }
.history-dialog__subtitle { font-size: .82rem; font-weight: 400; line-height: 1.4; margin-top: 2px; }
.history-dialog__body { min-height: 0; }
.history-dialog__hint { align-items: center; display: flex; font-size: .86rem; gap: 8px; line-height: 1.5; }
.history-list { border-left: 2px solid rgba(var(--v-theme-on-surface), .18); list-style: none; margin: 0 0 0 9px; padding: 0 0 0 20px; }
.history-entry { margin-bottom: 12px; position: relative; }
.history-entry::before {
  background: rgb(var(--v-theme-primary));
  border: 3px solid rgb(var(--v-theme-surface));
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
  content: '';
  height: 12px;
  left: -27px;
  position: absolute;
  top: 18px;
  width: 12px;
}
.history-entry__card { min-width: 0; }
.history-entry__top { align-items: flex-start; display: flex; flex-wrap: wrap; gap: 6px 16px; justify-content: space-between; }
.history-entry__identity { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.history-entry__meta { font-size: .82rem; overflow-wrap: anywhere; }
.history-entry__title { margin-top: 12px; overflow-wrap: anywhere; }
.history-entry__actions { display: flex; justify-content: flex-end; }
.history-dialog__error { flex-shrink: 0; }
.history-dialog__footer { border-top: 1px solid rgba(var(--v-theme-on-surface), .12); flex-shrink: 0; }
.revision-content {
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {
  .history-dialog__header { padding: 16px !important; }
  .history-dialog__certify { width: 100%; }
  .history-dialog__body { padding: 0 16px !important; }
  .history-list { border: 0; margin: 0; padding: 0; }
  .history-entry::before { display: none; }
  .history-entry__actions .v-btn { min-height: 44px; width: 100%; }
  .history-dialog__footer { padding: 12px 16px 16px !important; }
  .history-dialog__footer .v-btn { width: 100%; }
}
</style>
