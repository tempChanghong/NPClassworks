<template>
  <v-card
    class="classroom-time-card fill-height rounded-xl"
    :class="{'classroom-time-card--compact': compact}"
    color="primary"
    variant="tonal"
    @click="fullscreen = true"
  >
    <v-card-text class="d-flex align-center pa-5 h-100">
      <v-avatar
        class="mr-4"
        color="primary"
        size="48"
        variant="flat"
      >
        <v-icon icon="mdi-clock-outline" />
      </v-avatar>
      <div>
        <div class="time-line font-weight-bold">
          {{ hoursMinutes }}<span class="seconds">{{ seconds }}</span>
        </div>
        <div class="text-body-2 text-medium-emphasis">
          {{ dateLine }}
        </div>
      </div>
      <v-spacer />
      <v-icon
        icon="mdi-fullscreen"
        size="small"
      />
    </v-card-text>
  </v-card>

  <v-dialog
    v-model="fullscreen"
    fullscreen
    :scrim="false"
    transition="dialog-bottom-transition"
  >
    <v-card class="d-flex align-center justify-center position-relative">
      <v-btn
        class="close-button"
        icon="mdi-close"
        size="large"
        title="退出全屏时钟"
        variant="tonal"
        @click="fullscreen = false"
      />
      <div class="text-center">
        <div class="fullscreen-time-row">
          <div class="fullscreen-time font-weight-bold">
            {{ hoursMinutes }}
          </div>
          <div class="fullscreen-seconds font-weight-bold">
            {{ seconds }}
          </div>
        </div>
        <div class="fullscreen-date text-medium-emphasis mt-5">
          {{ dateLine }}
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {computed, onMounted, onUnmounted, ref} from "vue";

defineProps({compact: Boolean});

const now = ref(new Date());
const fullscreen = ref(false);
let timer = null;

const hoursMinutes = computed(() => now.value.toLocaleTimeString("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}));
const seconds = computed(() => `:${String(now.value.getSeconds()).padStart(2, "0")}`);
const dateLine = computed(() => now.value.toLocaleDateString("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
}));

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date();
  }, 1000);
});

onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<style scoped>
.classroom-time-card {
  cursor: pointer;
  min-height: 132px;
}

.classroom-time-card--compact {
  min-height: 96px;
}

.classroom-time-card--compact :deep(.v-card-text) {
  padding-bottom: 12px !important;
  padding-top: 12px !important;
}

.classroom-time-card--compact .time-line {
  font-size: clamp(2rem, 3vw, 2.75rem);
}

.time-line {
  font-size: clamp(2rem, 4vw, 3.25rem);
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
}

.seconds {
  font-size: 0.55em;
  opacity: 0.72;
}

.close-button {
  position: absolute;
  right: 24px;
  top: 24px;
}

.fullscreen-time-row {
  align-items: baseline;
  display: flex;
  justify-content: center;
  padding: 0 5vw;
}

.fullscreen-time {
  font-size: clamp(5rem, 17vw, 14rem);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  line-height: 1;
}

.fullscreen-seconds {
  font-size: clamp(2.2rem, 5vw, 5rem);
  font-variant-numeric: tabular-nums;
  margin-left: 0.2em;
  min-width: 3ch;
  opacity: 0.65;
}

.fullscreen-date {
  font-size: clamp(1.4rem, 3vw, 2.6rem);
}
</style>
