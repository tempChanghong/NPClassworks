<template>
  <div
    v-if="visibleItems.length"
    class="homework-quick-input"
    :class="`homework-quick-input--${density}`"
  >
    <div class="homework-quick-input__label">
      <v-icon icon="mdi-lightning-bolt-outline" size="small" />
      快捷输入
      <span v-if="!subjectId" class="text-medium-emphasis">（选择科目后显示对应词）</span>
    </div>
    <div
      v-for="group in groups"
      :key="group.name"
      class="homework-quick-input__group"
    >
      <span v-if="groups.length > 1" class="homework-quick-input__group-name">{{ group.name }}</span>
      <div class="homework-quick-input__buttons">
        <v-btn
          v-for="(item, index) in group.items"
          :key="`${item.label}-${index}`"
          :class="density === 'screen' ? 'screen-quick-input-button' : undefined"
          :prepend-icon="item.insertMode === 'NEW_LINE' ? 'mdi-keyboard-return' : undefined"
          :size="density === 'screen' ? 'large' : 'small'"
          variant="tonal"
          @mousedown.prevent
          @click="$emit('insert', item)"
        >
          {{ item.label }}
        </v-btn>
      </div>
    </div>
  </div>
</template>

<script setup>
import {computed} from "vue";
import {filterHomeworkQuickInputs} from "@/utils/homeworkQuickInputs";

const props = defineProps({
  items: {type: Array, default: () => []},
  subjectId: {type: String, default: ""},
  density: {type: String, default: "teacher"},
});
defineEmits(["insert"]);

const visibleItems = computed(() => filterHomeworkQuickInputs(props.items, props.subjectId));
const groups = computed(() => {
  const result = [];
  for (const item of visibleItems.value) {
    const name = item.group || "常用";
    let group = result.find((entry) => entry.name === name);
    if (!group) {
      group = {name, items: []};
      result.push(group);
    }
    group.items.push(item);
  }
  return result;
});
</script>

<style scoped>
.homework-quick-input { margin: -4px 0 20px; }
.homework-quick-input__label { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: .82rem; font-weight: 600; }
.homework-quick-input__group { display: flex; align-items: flex-start; gap: 10px; margin-top: 8px; }
.homework-quick-input__group-name { flex: 0 0 3em; padding-top: 7px; color: rgb(var(--v-theme-on-surface-variant)); font-size: .75rem; }
.homework-quick-input__buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.homework-quick-input--screen { margin-top: 12px; }
.homework-quick-input--screen .homework-quick-input__label { font-size: 1rem; }
.homework-quick-input--screen .homework-quick-input__group-name { padding-top: 12px; font-size: .9rem; }
.screen-quick-input-button { min-height: 48px; min-width: 88px; font-size: 1rem; }
@media (max-width: 700px) {
  .homework-quick-input__group { display: block; }
  .homework-quick-input__group-name { display: block; padding: 0 0 5px; }
}
</style>
