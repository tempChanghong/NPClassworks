<template>
  <section class="study-photos">
    <h3>自习照片</h3>
    <p>仅 OWNER 与第二管理员可查看。照片按拍摄时的班级保存，不在学生展示页显示。</p>
    <v-alert
      type="warning"
      variant="tonal"
      class="my-3"
    >
      在线照片默认保留 30 天，最多 180 天。备份副本的保留期限尚未确认，到期删除不代表备份中已同步清除。
    </v-alert>
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="my-3"
    >
      {{ error }}
    </v-alert>
    <v-select
      v-model="classId"
      :items="classes"
      item-title="name"
      item-value="id"
      label="查看班级"
      variant="outlined"
      :disabled="busy"
    />
    <v-btn
      :disabled="!classId || busy"
      :loading="busy"
      prepend-icon="mdi-refresh"
      @click="load()"
    >
      查询照片
    </v-btn>
    <p
      v-if="loaded && !items.length"
      class="mt-3"
    >
      当前班级没有可查看的照片。
    </p>
    <v-list
      v-if="items.length"
      class="my-3"
    >
      <v-list-item
        v-for="photo in items"
        :key="photo.eventId"
        :title="time(photo.capturedAt)"
        :subtitle="description(photo)"
      >
        <template #append>
          <v-btn
            variant="text"
            :disabled="busy"
            @click="view(photo)"
          >
            查看
          </v-btn>
          <v-btn
            variant="text"
            color="error"
            :disabled="busy"
            @click="remove(photo)"
          >
            删除
          </v-btn>
        </template>
      </v-list-item>
    </v-list>
    <v-btn
      v-if="cursor"
      :disabled="busy"
      variant="tonal"
      @click="load(cursor)"
    >
      下一页
    </v-btn>
    <v-dialog
      :model-value="!!preview"
      max-width="1000"
      @update:model-value="value => { if (!value) closePreview(); }"
    >
      <v-card v-if="preview">
        <v-card-title>{{ preview.photo.isExitRecord ? preview.photo.reason === 'ProcessRecovery' ? '异常恢复记录关联画面' : '退出验证记录关联画面' : '自习照片' }} · {{ time(preview.photo.isExitRecord ? preview.photo.createdAt : preview.photo.capturedAt) }}</v-card-title>
        <v-card-text>
          <img
            :src="preview.url"
            alt="当前选定班级的自习照片"
            class="photo-image"
          >
          <p>{{ description(preview.photo) }}</p>
        </v-card-text>
        <v-card-actions>
          <v-btn
            :disabled="busy"
            @click="download(preview.photo)"
          >
            下载
          </v-btn>
          <v-btn @click="closePreview()">
            关闭
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <h4 class="mt-6">
      退出验证未通过记录
    </h4>
    <p>分别显示验证结果与关联画面的存储状态；没有画面也会记录验证未通过。记录时间以服务器收到时为准。</p>
    <v-btn
      :disabled="!classId || busy"
      variant="tonal"
      @click="loadExits()"
    >
      查询退出验证记录
    </v-btn>
    <p v-if="exitLoaded && !exitItems.length">
      当前班级没有可查看的退出验证记录。
    </p>
    <v-list v-if="exitItems.length">
      <v-list-item
        v-for="event in exitItems"
        :key="event.eventId"
        :title="`${event.reason === 'ProcessRecovery' ? '定时自习异常恢复' : event.reason === 'Timeout' ? '管理验证超时' : '管理密码未通过'} · ${time(event.createdAt)}`"
        :subtitle="event.photoState === 'Stored' ? '关联画面已存储，可查看' : '没有当前可查看的关联画面'"
      >
        <template #append>
          <v-btn
            v-if="event.photoState === 'Stored' && event.photoEventId"
            :disabled="busy"
            variant="text"
            @click="viewExit(event)"
          >
            查看关联画面
          </v-btn>
        </template>
      </v-list-item>
    </v-list>
    <v-btn
      v-if="exitCursor"
      :disabled="busy"
      variant="tonal"
      @click="loadExits(exitCursor)"
    >
      下一页记录
    </v-btn>
  </section>
</template>
<script setup>
import {onUnmounted, ref, watch} from 'vue';
import {npepSeatingApi, npepStudyPhotosApi} from '@/utils/classworksV2Client';
import {confirmAction} from '@/utils/actionDialog';
const props = defineProps({schoolId: {type: String, required: true}, termId: {type: String, default: ''}});
const classes = ref([]), classId = ref(null), term = ref(null), items = ref([]), cursor = ref(null);
const exitItems = ref([]), exitCursor = ref(null), exitLoaded = ref(false);
const error = ref(''), busy = ref(false), loaded = ref(false), preview = ref(null);
let generation = 0, controller;
function closePreview() { if (preview.value) URL.revokeObjectURL(preview.value.url); preview.value = null; }
function reset() {
  generation++; controller?.abort(); closePreview(); items.value = []; cursor.value = null; loaded.value = false; busy.value = false; error.value = '';
  exitItems.value = []; exitCursor.value = null; exitLoaded.value = false;
}
const time = value => new Date(value).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'});
const description = p => p.isExitRecord ? `${p.reason === 'ProcessRecovery' ? '定时自习异常恢复' : '退出验证未通过'}记录关联的画面；此处时间为服务器收到记录的时间。` : `${p.sessionKind === 'Manual' ? '手动自习 · ' : ''}${p.reason === 'Noise' ? '连续超限' : p.reason === 'ProcessRecovery' ? '异常恢复后捕获' : '点击退出后台'} · ${p.level == null ? '无电平读数' : p.level.toFixed(1) + (p.unit === 'EstimatedDbA' ? ' 估算 dB(A)' : ' dBFS')} · 到期 ${time(p.expiresAt)}`;
function problem(e) { if (e.code !== 'ERR_CANCELED') error.value = '照片请求未完成；请核对权限、服务器照片功能及当前班级后重试。'; }
watch(() => [props.schoolId, props.termId], async () => {
  reset(); classes.value = []; classId.value = null; term.value = null;
  const n = generation; controller = new AbortController(); busy.value = true;
  try {
    const result = await npepSeatingApi.catalog(props.schoolId, props.termId, {signal: controller.signal});
    if (n === generation) { classes.value = result.data.classes; term.value = result.data.termId; }
  } catch (e) { if (n === generation) problem(e); }
  finally { if (n === generation) busy.value = false; }
}, {immediate: true});
watch(classId, reset, {flush: 'sync'});
async function load(next = null) {
  if (!classId.value || busy.value) return;
  const n = generation; controller?.abort(); controller = new AbortController(); busy.value = true; error.value = '';
  closePreview(); items.value = []; loaded.value = false; cursor.value = null;
  try {
    const result = await npepStudyPhotosApi.list(props.schoolId, {termId: term.value, classId: classId.value, ...(next ? {cursor: next} : {})}, {signal: controller.signal});
    if (n === generation) { items.value = result.data.items; cursor.value = result.data.cursor; loaded.value = true; }
  } catch (e) { if (n === generation) problem(e); }
  finally { if (n === generation) busy.value = false; }
}
async function image(photo, downloading) {
  const n = generation; controller?.abort(); controller = new AbortController(); busy.value = true; error.value = '';
  try {
    const blob = await npepStudyPhotosApi.image(props.schoolId, photo.eventId, {signal: controller.signal, download: downloading});
    if (n !== generation) return;
    const url = URL.createObjectURL(blob);
    if (downloading) {
      const link = document.createElement('a'); link.href = url; link.download = `study-${photo.eventId}.jpg`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else { closePreview(); preview.value = {photo, url}; }
  } catch (e) { if (n === generation) { closePreview(); problem(e); } }
  finally { if (n === generation) busy.value = false; }
}
const view = photo => image(photo, false), download = photo => image(photo, true);
const viewExit = event => image({...event, eventId: event.photoEventId, isExitRecord: true}, false);
async function loadExits(next = null) {
  if (!classId.value || busy.value) return;
  const n = generation; controller?.abort(); controller = new AbortController(); busy.value = true; error.value = '';
  closePreview(); exitItems.value = []; exitCursor.value = null; exitLoaded.value = false;
  try {
    const result = await npepStudyPhotosApi.exitEvents(props.schoolId, {termId: term.value, classId: classId.value, ...(next ? {cursor: next} : {})}, {signal: controller.signal});
    if (n === generation) { exitItems.value = result.data.items; exitCursor.value = result.data.cursor; exitLoaded.value = true; }
  } catch (e) { if (n === generation) problem(e); }
  finally { if (n === generation) busy.value = false; }
}
async function remove(photo) {
  if (busy.value) return;
  const n = generation;
  if (!await confirmAction({title: '删除这张自习照片？', message: '在线照片将删除，设备重试不能恢复此照片。备份删除边界尚未确认。', confirmText: '删除', color: 'error'}) || n !== generation) return;
  busy.value = true; error.value = ''; controller?.abort(); controller = new AbortController();
  try { await npepStudyPhotosApi.remove(props.schoolId, photo.eventId, {signal: controller.signal}); if (n === generation) closePreview(); }
  catch (e) { if (n === generation) problem(e); return; }
  finally { if (n === generation) busy.value = false; }
  if (n === generation) await load();
}
onUnmounted(reset);
</script>
<style scoped>
.study-photos { margin-top: 24px; padding-top: 24px; border-top: 1px solid rgba(var(--v-border-color), .2); }
.study-photos p { line-height: 1.7; color: rgba(var(--v-theme-on-surface), .7); }
.photo-image { display: block; max-width: 100%; max-height: 70vh; object-fit: contain; margin: auto; }
</style>
