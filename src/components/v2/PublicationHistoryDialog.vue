<template>
  <v-dialog
    :model-value="modelValue"
    max-width="820"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card class="rounded-xl">
      <v-card-title class="d-flex align-center pa-5 pb-2">
        <v-icon
          class="mr-3"
          icon="mdi-history"
        />
        不可删除的版本历史
        <v-spacer />
        <v-btn
          v-if="mode === 'teacher' && workingPublication && !workingPublication.isCertified"
          color="success"
          :loading="certifying"
          prepend-icon="mdi-check-decagram-outline"
          variant="tonal"
          @click="certifyCurrent"
        >
          教师确认当前版本
        </v-btn>
      </v-card-title>
      <v-card-text class="px-5">
        <v-alert
          class="mb-4"
          type="info"
          variant="tonal"
        >
          恢复后，所选内容将成为新的当前版本。
        </v-alert>
        <v-skeleton-loader
          v-if="loading"
          type="list-item-three-line@3"
        />
        <v-timeline
          v-else
          align="start"
          density="compact"
          side="end"
        >
          <v-timeline-item
            v-for="item in revisions"
            :key="item.id"
            :dot-color="revisionState(item).color"
            size="small"
          >
            <v-card
              border
              variant="flat"
            >
              <v-card-text>
                <div class="d-flex align-center flex-wrap ga-2 mb-2">
                  <strong>版本 {{ item.revision }}</strong>
                  <v-chip
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
                  <span class="text-caption text-medium-emphasis">
                    {{ formatDateTime(item.createdAt) }} · {{ actorLabel(item) }}
                  </span>
                </div>
                <div
                  v-if="item.snapshot.title"
                  class="font-weight-bold mb-1"
                >
                  {{ item.snapshot.title }}
                </div>
                <div class="revision-content">
                  {{ item.purgedAt ? "该待教师确认备份已按三天保留策略清理正文" : (item.snapshot.content || "（无正文）") }}
                </div>
                <div class="d-flex justify-end mt-3">
                  <v-btn
                    :disabled="item.revision === workingPublication?.revision || item.snapshot.status === 'WITHDRAWN' || Boolean(item.purgedAt)"
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
          </v-timeline-item>
        </v-timeline>
        <v-alert
          v-if="error"
          class="mt-4"
          type="error"
          variant="tonal"
        >
          {{ error }}
        </v-alert>
      </v-card-text>
      <v-card-actions class="px-5 pb-5">
        <v-spacer />
        <v-btn @click="$emit('update:modelValue', false)">
          关闭
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {ref, watch} from "vue";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {isPublicationRevisionConflict} from "@/utils/publicationConflict";
import {publicationDisplayState} from "@/utils/publicationStatus";

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
const certifying = ref(false);
const restoringRevision = ref(null);
const error = ref("");

function revisionState(item) {
  return publicationDisplayState({...item.snapshot, isCertified: item.isCertified});
}

watch(() => props.modelValue, (open) => {
  if (open && props.publication) {
    workingPublication.value = props.publication;
    load();
  }
}, {immediate: true});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    revisions.value = await store.publicationRevisions(workingPublication.value, props.mode);
  } catch (loadError) {
    error.value = loadError.response?.data?.message || loadError.message || "加载历史失败";
  } finally {
    loading.value = false;
  }
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
  certifying.value = true;
  error.value = "";
  try {
    const changed = await store.certify(workingPublication.value);
    workingPublication.value = changed;
    emit("changed", changed);
    await load();
  } catch (caught) {
    if (isPublicationRevisionConflict(caught)) await refreshConflict("教师确认");
    else error.value = store.teacherError;
  } finally {
    certifying.value = false;
  }
}

async function restore(item) {
  restoringRevision.value = item.revision;
  error.value = "";
  try {
    const changed = await store.restoreRevision(workingPublication.value, item.revision, props.mode);
    workingPublication.value = changed;
    emit("changed", changed);
    await load();
  } catch (caught) {
    if (isPublicationRevisionConflict(caught)) await refreshConflict("恢复");
    else error.value = props.mode === "screen" ? store.screenError : store.teacherError;
  } finally {
    restoringRevision.value = null;
  }
}

async function refreshConflict(action) {
  try {
    const latest = await store.latestPublication(workingPublication.value.id, props.mode);
    workingPublication.value = latest;
    emit("refreshed", latest);
    await load();
    error.value = `${action}未执行：内容已被其他设备修改，已载入服务器最新版本，请重新检查后操作。`;
  } catch (caught) {
    error.value = caught.response?.data?.message || caught.message || "载入最新版本失败";
  }
}
</script>

<style scoped>
.revision-content {
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
