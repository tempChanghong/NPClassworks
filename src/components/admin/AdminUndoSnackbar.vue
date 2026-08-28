<template>
  <v-snackbar
    location="bottom center"
    :model-value="Boolean(offer)"
    :timeout="-1"
  >
    <div class="d-flex align-center ga-3">
      <v-icon icon="mdi-backup-restore" />
      <div class="flex-grow-1">
        <div>{{ offer?.message }}</div>
        <div class="text-caption text-medium-emphasis">
          {{ remainingSeconds }} 秒内可撤销
        </div>
      </div>
      <v-btn
        color="primary"
        :loading="busy"
        variant="tonal"
        @click="$emit('undo')"
      >
        撤销
      </v-btn>
      <v-btn
        :disabled="busy"
        icon="mdi-close"
        size="small"
        title="关闭"
        variant="text"
        @click="$emit('dismiss')"
      />
    </div>
    <v-progress-linear
      class="mt-2"
      color="primary"
      :model-value="Math.min(100, remainingSeconds * 10)"
      rounded
    />
  </v-snackbar>
</template>

<script setup>
defineProps({
  offer: {type: Object, default: null},
  busy: Boolean,
  remainingSeconds: {type: Number, default: 0},
});
defineEmits(["undo", "dismiss"]);
</script>
