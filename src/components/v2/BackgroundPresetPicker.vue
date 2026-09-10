<template>
  <div class="background-preset-picker">
    <v-btn-toggle
      v-model="tab"
      mandatory
      color="primary"
      class="mb-4"
    >
      <v-btn value="preset">
        预设
      </v-btn>
      <v-btn value="url">
        图片网址
      </v-btn>
    </v-btn-toggle>
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      class="mb-3"
    >
      {{ error }}
    </v-alert>
    <v-alert
      v-if="message"
      type="info"
      variant="tonal"
      class="mb-3"
    >
      {{ message }}
    </v-alert>
    <template v-if="tab === 'preset'">
      <v-select
        v-model="category"
        :items="categories"
        label="背景分类"
        aria-label="背景分类"
        variant="outlined"
      />
      <div class="preset-grid">
        <button
          v-for="preset in visiblePresets"
          :key="preset.id"
          type="button"
          class="preset-card"
          :class="{'preset-card-selected': selectedId === preset.id}"
          :aria-label="`使用背景：${preset.category} · ${preset.title}`"
          :aria-pressed="selectedId === preset.id"
          :disabled="busy"
          @click="choose(preset)"
        >
          <img
            :src="backgroundAssetUrl(preset.thumbnail)"
            loading="lazy"
            :alt="`${preset.category} · ${preset.title}`"
            width="240"
            height="150"
          >
          <span>{{ preset.title }}</span>
          <small>{{ selectedId === preset.id ? '正在使用' : preset.category }}</small>
        </button>
      </div>
      <v-progress-linear
        v-if="busy"
        indeterminate
        class="mt-3"
      />
      <p class="text-caption mt-3">
        选择后才下载大图。成功缓存的背景可离线使用；浏览器清理站点数据后需重新下载。
      </p>
    </template>
    <template v-else>
      <v-text-field
        v-model="url"
        label="背景图片网址"
        placeholder="https://example.com/background.jpg"
        variant="outlined"
        :disabled="busy"
      />
      <v-btn
        color="primary"
        :disabled="busy"
        @click="saveUrl"
      >
        使用此网址
      </v-btn>
    </template>
  </div>
</template>

<script setup>
import {computed, onUnmounted, ref} from "vue";
import {getSetting, setSetting, watchSettings} from "@/utils/settings";
import {backgroundPresets, backgroundAssetUrl, loadPresetBackground, pruneBackgroundCache} from "@/utils/backgroundPresets";

const selection = ref(getSetting("background.selection"));
const tab = ref(selection.value?.kind === "url" ? "url" : "preset");
const category = ref("全部");
const categories = ["全部", ...new Set(backgroundPresets.map(preset => preset.category))];
const visiblePresets = computed(() => backgroundPresets.filter(preset => category.value === "全部" || preset.category === category.value));
const selectedId = computed(() => selection.value?.kind === "preset" ? selection.value.id : "");
const url = ref(selection.value?.kind === "url" ? selection.value.url : getSetting("background.url"));
const error = ref(""), message = ref(""), busy = ref(false);
let disposed = false;
const unwatch = watchSettings(() => { selection.value = getSetting("background.selection"); });
onUnmounted(() => { disposed = true; unwatch(); });

function saveSelection(value) {
  if (!setSetting("background.selection", value, {requirePersistence: true})) throw new Error("背景设置未能保存，原背景已保留。请检查浏览器存储空间后重试。");
}
async function choose(preset) {
  if (busy.value) return;
  busy.value = true; error.value = ""; message.value = "";
  let result;
  try {
    result = await loadPresetBackground(preset);
    if (disposed) return;
    saveSelection({kind: "preset", id: preset.id});
    await pruneBackgroundCache(preset.id);
    message.value = result.cached ? `已使用“${preset.title}”，并缓存供离线使用。` : `已使用“${preset.title}”，但离线缓存未成功，下次加载需要联网。`;
  } catch (e) { if (!disposed) error.value = e.message || "加载背景失败，请重试"; }
  finally {
    if (result) URL.revokeObjectURL(result.objectUrl);
    await pruneBackgroundCache(getSetting("background.selection")?.id);
    busy.value = false;
  }
}
function saveUrl() {
  error.value = ""; message.value = "";
  try {
    const value = url.value.trim();
    if (value && !["http:", "https:"].includes(new URL(value).protocol)) throw new Error("请填写 HTTP 或 HTTPS 图片网址");
    saveSelection({kind: "url", url: value});
    message.value = "图片网址已保存到当前设备。";
  } catch (e) { error.value = e.message; }
}
</script>

<style scoped>
.preset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.preset-card { border: 2px solid transparent; border-radius: 12px; overflow: hidden; text-align: left; background: rgba(var(--v-theme-on-surface), .05); color: inherit; }
.preset-card:focus-visible, .preset-card-selected { border-color: rgb(var(--v-theme-primary)); outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.preset-card:disabled { opacity: .6; cursor: wait; }
.preset-card img { display: block; width: 100%; height: 130px; object-fit: cover; }
.preset-card span, .preset-card small { display: block; padding: 5px 10px; }
.preset-card small { opacity: .7; padding-top: 0; padding-bottom: 10px; }
</style>
