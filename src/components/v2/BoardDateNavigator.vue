<template>
  <v-card
    class="board-date-navigator rounded-xl"
    :class="{'board-date-navigator--compact': compact}"
    variant="tonal"
  >
    <v-card-text class="d-flex align-center flex-wrap ga-2 py-3 px-4">
      <div class="board-date-stepper">
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
      </div>
      <v-btn
        v-if="safeDate !== today"
        class="board-date-today"
        aria-label="回到今天"
        prepend-icon="mdi-calendar-today"
        size="small"
        variant="tonal"
        @click="$emit('change', today)"
      >
        <span class="board-date-today__long">回到今天</span>
        <span class="board-date-today__short">今天</span>
      </v-btn>
      <v-spacer />
      <v-text-field
        class="board-date-input"
        :class="{'board-date-input--wide': safeDate === today}"
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
        class="board-date-copy"
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
import {useCurrentBoardDate} from "@/composables/useCurrentBoardDate";
import {
  boardDateRelativeLabel,
  shiftBoardDate,
  todayBoardDate,
} from "@/utils/boardDate";

const props = defineProps({
  date: {type: String, default: todayBoardDate},
  compact: Boolean,
  canCopyToToday: Boolean,
  copying: Boolean,
});
const emit = defineEmits(["change", "copy-to-today"]);
const today = useCurrentBoardDate();
const safeDate = computed(() => props.date || today.value);
const relativeLabel = computed(() => boardDateRelativeLabel(safeDate.value, today.value));
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
.board-date-stepper { align-items: center; display: flex; }
.board-date-title { min-width: 7.5rem; }
.board-date-input { max-width: 12rem; }
.board-date-today__short { display: none; }
.board-date-navigator--compact :deep(.v-card-text) { padding: 6px 10px !important; }
.board-date-navigator--compact .board-date-title { min-width: 5rem; }
.board-date-navigator--compact .board-date-input { max-width: 10rem; }
@media (max-width: 680px) {
  .board-date-navigator--compact :deep(.v-card-text) {
    display: grid !important;
    gap: 8px !important;
    grid-template-columns: auto minmax(0, 1fr);
    padding: 10px 12px !important;
  }
  .board-date-navigator--compact .board-date-stepper {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: 40px minmax(0, 1fr) 40px;
    width: 100%;
  }
  .board-date-navigator--compact .board-date-title {
    min-width: 0;
    text-align: center;
    white-space: nowrap;
  }
  .board-date-navigator--compact .board-date-title .text-caption { display: none; }
  .board-date-navigator--compact .board-date-today { grid-column: 1; }
  .board-date-navigator--compact .board-date-today__long { display: none; }
  .board-date-navigator--compact .board-date-today__short { display: inline; }
  .board-date-navigator--compact .board-date-input {
    grid-column: 2;
    max-width: none;
    min-width: 0;
    width: 100%;
  }
  .board-date-navigator--compact .board-date-input--wide { grid-column: 1 / -1; }
  .board-date-navigator--compact .board-date-copy { grid-column: 1 / -1; justify-self: start; }
  .board-date-navigator--compact :deep(.v-spacer) { display: none; }
}
</style>
