<template>
  <div class="text-input-extension">
    <component
      :is="editorComponent"
      v-if="editorComponent"
      ref="editor"
      :target="target"
      :field="field"
      :label="label"
    />
    <div
      v-else
      class="handwriting-launcher"
      :data-field="field"
    >
      <v-btn
        :disabled="target.disabled || loading"
        :loading="loading"
        prepend-icon="mdi-draw"
        variant="tonal"
        @pointerdown.prevent
        @click="activate"
      >
        手写输入{{ field === 'content' ? '必做正文' : '选做正文' }}
      </v-btn>
      <v-btn
        v-if="loading"
        variant="text"
        @click="cancelActivation"
      >
        取消打开
      </v-btn>
    </div>
    <span
      v-if="notice"
      role="status"
      class="text-medium-emphasis"
    >{{ notice }}</span>
  </div>
</template>

<script setup>
import {nextTick, onBeforeUnmount, ref, shallowRef, watch} from 'vue';
import {beginTextInputActivation} from '@/utils/textInputActivation';

// A text-field extension boundary. It does not import an OCR engine, know
// credentials, persist input, or submit a publication. The caller supplies it.
const props = defineProps({
  target: {type: Object, required: true},
  field: {type: String, required: true},
  label: {type: String, default: ''},
  loadEditor: {type: Function, required: true},
});
const editorComponent = shallowRef(null), editor = ref(null), loading = ref(false), notice = ref('');
let generation = 0, mounted = true, activation;
watch([() => props.target, () => props.target.scope, () => props.target.value, () => props.target.disabled], () => {
  if (!loading.value) return;
  generation++; loading.value = false; activation?.release();
  notice.value = '编辑范围已变化，本次未打开手写输入，请在当前正文重新操作。';
}, {flush: 'sync'});
onBeforeUnmount(() => { mounted = false; generation++; activation?.release(); });
function cancelActivation() {
  generation++; activation?.release(); loading.value = false;
  notice.value = '已取消打开，正文保留，可重试或继续键盘录入。';
}
async function activate() {
  if (loading.value || props.target.disabled) return;
  const target = props.target;
  let snapshot;
  try { snapshot = target.capture(); }
  catch { notice.value = '当前编辑器不可录入，请完成当前操作后重试。'; return; }
  const ticket = ++generation, scope = snapshot.scope, value = snapshot.value;
  const request = activation = beginTextInputActivation();
  const current = () => mounted && request.current() && ticket === generation && props.target === target &&
    !target.disabled && target.scope === scope && target.value === value;
  loading.value = true; notice.value = '';
  try {
    const module = await request.wait(props.loadEditor());
    if (!current()) return;
    editorComponent.value = module.default;
    await nextTick();
    if (current()) { loading.value = false; await editor.value.open(snapshot); }
  } catch (error) {
    if (current()) notice.value = error?.requiresReload
      ? '本次页面的手写组件无法载入。请先保存正文，再刷新重试；可以继续键盘录入。'
      : error?.loadTimedOut
        ? '手写组件加载超时，正文保留。请检查网络后重试，也可继续键盘录入。'
      : '手写输入暂不可用，正文保留。请检查网络后重试，也可继续键盘录入。';
  } finally { request.release(); if (mounted && ticket === generation) loading.value = false; }
}
</script>

<style scoped>
.handwriting-launcher { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 16px; }
.handwriting-launcher :deep(button) { min-height: 48px; }
</style>
