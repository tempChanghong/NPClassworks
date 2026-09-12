<template>
  <v-card
    v-if="items.length"
    class="preparation-board my-4 rounded-xl"
    variant="tonal"
    color="primary"
  >
    <v-card-title>需带物品</v-card-title>
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
        <span> · {{ item.subject }} · {{ item.targets }} · {{ item.certified ? '教师已确认' : '待教师确认' }}</span>
        <p>{{ item.text }}</p>
      </div>
    </v-card-text>
  </v-card>
</template>
<script setup>
import {computed} from "vue";
import {useNow} from "@vueuse/core";
import {useClassworksV2Store} from "@/stores/classworksV2";
import {shiftBoardDate} from "@/utils/boardDate";
import {preparationList, preparationToday} from "@/utils/homeworkPreparation";
const store = useClassworksV2Store(), now = useNow({interval: 1000});
const today = computed(() => preparationToday(now.value));
const tomorrow = computed(() => shiftBoardDate(today.value, 1));
const items = computed(() => preparationList(store.feedPreparations, store.activeWorkspaceIds,
  [today.value, store.boardDate].sort().at(-1)));
</script>
<style scoped>
.preparation-board__item { padding: 12px 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: clamp(1rem, 1.6vw, 1.5rem); }
.preparation-board__item + .preparation-board__item { border-top: 1px solid currentColor; }
</style>
