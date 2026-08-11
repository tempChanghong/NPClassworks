<template>
  <v-card
    class="board-date-navigator rounded-xl"
    variant="tonal"
  >
    <v-card-text class="d-flex align-center flex-wrap ga-2 py-3 px-4">
      <v-btn
        icon="mdi-chevron-left"
        size="small"
        title="前一天"
        variant="text"
        @click="changeBy(-1)"
      />
      <div class="board-date-title">
        <div class="font-weight-bold">
          {{ relativeLabel }}
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ formattedDate }}
        </div>
      </div>
      <v-btn
        icon="mdi-chevron-right"
        size="small"
        title="后一天"
        variant="text"
        @click="changeBy(1)"
      />
      <v-btn
        v-if="safeDate !== today"
        prepend-icon="mdi-calendar-today"
        size="small"
        variant="tonal"
        @click="$emit('change', today)"
      >
        回到今天
      </v-btn>
      <v-spacer />
      <v-text-field
        class="board-date-input"
        density="compact"
        hide-details
        label="选择日期"
        :model-value="safeDate"
        type="date"
        variant="outlined"
        @update:model-value="$emit('change', $event)"
      />
      <v-btn
        v-if="canCopyToToday && safeDate !== today"
        :loading="copying"
        prepend-icon="mdi-content-copy"
        size="small"
        variant="tonal"
        @click="$emit('copy-to-today')"
      >
        复制到今天
      </v-btn>
    </v-card-text>
  </v-card>
</template>

<script setup>
import {computed} from "vue";
import {
  boardDateRelativeLabel,
  shiftBoardDate,
  todayBoardDate,
} from "@/utils/boardDate";

const props = defineProps({
  date: {type: String, default: todayBoardDate},
  canCopyToToday: Boolean,
  copying: Boolean,
});
const emit = defineEmits(["change", "copy-to-today"]);
const today = todayBoardDate();
const safeDate = computed(() => props.date || today);
const relativeLabel = computed(() => boardDateRelativeLabel(safeDate.value, today));
const formattedDate = computed(() => new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(new Date(`${safeDate.value}T12:00:00`)));

function changeBy(days) {
  emit("change", shiftBoardDate(safeDate.value, days));
}
</script>

<style scoped>
.board-date-navigator {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.board-date-title { min-width: 7.5rem; }
.board-date-input { max-width: 12rem; }
</style>
