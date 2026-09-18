<template>
  <v-card
    v-if="items.length"
    class="preparation-board rounded-xl"
    :class="compact ? 'preparation-board--compact' : 'my-4'"
    variant="tonal"
    color="primary"
  >
    <component
      :is="compact ? 'details' : 'div'"
      :open="expanded"
      @toggle="expanded = $event.target.open"
    >
      <summary
        v-if="compact"
        class="preparation-summary"
      >
        需带物品 · {{ items.length }} 项 · {{ items[0].date }}
        · {{ items[0].text.length > 36 ? `${items[0].text.slice(0, 36)}…` : items[0].text }}
        <span v-if="store.feedUsingCache || store.feedLoadError"> · 已加载内容，请核对</span>
      </summary>
      <v-card-title v-else>
        需带物品
      </v-card-title>
      <v-card-text>
        <p
          v-if="store.feedUsingCache || store.feedLoadError"
          class="mb-2"
        >
          当前为已加载内容，可能不是最新事项，请核对。
        </p>
        <div
          v-for="item in items"
          :key="item.id"
          class="preparation-board__item"
        >
          <strong>{{ item.date === today ? '今日需带' : item.date === tomorrow ? '明日需带' : '需带' }} · {{ item.date }}</strong>
          <span> · {{ item.subject }} · {{ item.targets }}{{ item.certified ? ' · 教师已确认' : '' }}</span>
          <p>{{ item.text }}</p>
        </div>
      </v-card-text>
    </component>
  </v-card>
</template>
<script setup>
import {computed, ref} from "vue";
import {useNow} from "@vueuse/core";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {shiftBoardDate} from "@/utils/boardDate";
import {preparationList, preparationToday} from "@/utils/homeworkPreparation";
defineProps({compact: Boolean});
const expanded = ref(false);
const store = useClassworksV2Store(), now = useNow({interval: 1000});
const today = computed(() => preparationToday(now.value));
const tomorrow = computed(() => shiftBoardDate(today.value, 1));
const items = computed(() => preparationList(store.feedPreparations, store.activeWorkspaceIds,
  [today.value, store.boardDate].sort().at(-1)));
</script>
<style scoped>
.preparation-board--compact { min-width: 0; }
.preparation-summary { padding: 12px 16px; cursor: pointer; font-size: 1rem; overflow-wrap: anywhere; }
.preparation-summary:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
.preparation-board__item { padding: 12px 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: clamp(1rem, 1.6vw, 1.5rem); }
.preparation-board__item + .preparation-board__item { border-top: 1px solid currentColor; }
</style>
