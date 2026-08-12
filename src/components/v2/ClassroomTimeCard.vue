<template>
  <button
    v-if="inline"
    class="classroom-time-inline"
    type="button"
    title="打开全屏时钟"
    @click="fullscreen = true"
  >
    <v-icon
      class="classroom-time-inline__icon"
      icon="mdi-clock-outline"
    />
    <span class="classroom-time-inline__main">
      <span class="time-line font-weight-bold">
        {{ hoursMinutes }}<span class="seconds">{{ seconds }}</span>
      </span>
      <span class="classroom-time-inline__date">{{ dateLine }}</span>
    </span>
  </button>
  <v-card
    v-else
    class="classroom-time-card rounded-xl"
    :class="{'classroom-time-card--compact': compact}"
    color="primary"
    variant="tonal"
    @click="fullscreen = true"
  >
    <v-card-text class="classroom-time-card__content">
      <v-avatar
        class="classroom-time-card__avatar"
        color="primary"
        size="48"
        variant="flat"
      >
        <v-icon icon="mdi-clock-outline" />
      </v-avatar>
      <div class="classroom-time-card__copy">
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

defineProps({compact: Boolean, inline: Boolean});

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

function scheduleClock() {
  window.clearTimeout(timer);
  if (document.hidden) return;
  timer = window.setTimeout(() => {
    now.value = new Date();
    scheduleClock();
  }, 1000 - (Date.now() % 1000) + 10);
}

function handleVisibilityChange() {
  if (!document.hidden) now.value = new Date();
  scheduleClock();
}

onMounted(() => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  scheduleClock();
});

onUnmounted(() => {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.clearTimeout(timer);
});
</script>

<style scoped>
.classroom-time-card {
  cursor: pointer;
  min-height: 132px;
}

.classroom-time-card--compact {
  min-height: 108px;
}

.classroom-time-card__content {
  align-items: center;
  display: flex;
  gap: 14px;
  height: 100%;
  min-height: inherit;
  padding: 18px 20px;
}

.classroom-time-card__avatar {
  flex: 0 0 auto;
}

.classroom-time-card__copy {
  min-width: 0;
}

.classroom-time-card--compact .time-line {
  font-size: clamp(2.15rem, 2.25vw, 2.8rem);
}

.classroom-time-inline {
  align-items: center;
  background: rgba(var(--v-theme-primary), 0.08);
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 14px;
  color: inherit;
  cursor: pointer;
  display: flex;
  gap: 10px;
  min-height: 56px;
  padding: 6px 14px;
  text-align: left;
}

.classroom-time-inline__icon {
  color: rgb(var(--v-theme-primary));
  font-size: 1.5rem;
}

.classroom-time-inline__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.classroom-time-inline .time-line {
  font-size: clamp(1.55rem, 1.25vw + 0.35rem, 2.25rem);
  white-space: nowrap;
}

.classroom-time-inline__date {
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: clamp(0.72rem, 0.16vw + 0.6rem, 0.95rem);
  line-height: 1.2;
  white-space: nowrap;
}

.time-line {
  font-size: clamp(2rem, 4vw, 3.25rem);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.025em;
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

@media (prefers-reduced-motion: reduce) {
  .classroom-time-inline { transition: none; }
}
</style>
