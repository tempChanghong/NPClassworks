<template>
  <v-dialog
    v-model="actionDialogState.open"
    max-width="560"
    persistent
  >
    <v-card class="rounded-xl">
      <v-card-title class="d-flex align-center ga-3 pa-5 pb-2">
        <v-icon
          :color="actionDialogState.color"
          :icon="actionDialogState.color === 'error' ? 'mdi-alert-outline' : 'mdi-help-circle-outline'"
        />
        {{ actionDialogState.title }}
      </v-card-title>
      <v-card-text class="px-5 pb-2">
        <div
          v-if="actionDialogState.message"
          class="action-dialog-message text-body-1"
        >
          {{ actionDialogState.message }}
        </div>
        <v-list
          v-if="actionDialogState.details.length"
          class="mt-3 rounded-lg"
          density="compact"
          variant="tonal"
        >
          <v-list-item
            v-for="detail in actionDialogState.details"
            :key="detail"
            prepend-icon="mdi-circle-small"
            :title="detail"
          />
        </v-list>
        <v-text-field
          v-if="actionDialogState.mode === 'prompt'"
          v-model="actionDialogState.value"
          autofocus
          class="mt-4"
          :label="actionDialogState.label"
          :rules="actionDialogState.rules"
          :type="actionDialogState.secret && !showSecret ? 'password' : 'text'"
          :append-inner-icon="actionDialogState.secret ? showSecret ? 'mdi-eye-off-outline' : 'mdi-eye-outline' : undefined"
          variant="outlined"
          @click:append-inner="showSecret = !showSecret"
          @keyup.enter="confirm"
        />
      </v-card-text>
      <v-card-actions class="px-5 pb-5">
        <v-spacer />
        <v-btn @click="settleActionDialog(false)">
          {{ actionDialogState.cancelText }}
        </v-btn>
        <v-btn
          :color="actionDialogState.color"
          :disabled="actionDialogState.mode === 'prompt' && !inputValid"
          variant="flat"
          @click="confirm"
        >
          {{ actionDialogState.confirmText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import {computed, ref, watch} from "vue";
import {actionDialogState, settleActionDialog} from "@/utils/actionDialog";

const showSecret = ref(false);
const inputValid = computed(() => actionDialogState.rules.every((rule) => rule(actionDialogState.value) === true));

function confirm() {
  if (actionDialogState.mode === "prompt" && !inputValid.value) return;
  settleActionDialog(true);
}

watch(() => actionDialogState.open, (open) => {
  if (open) showSecret.value = false;
});
</script>

<style scoped>
.action-dialog-message {
  white-space: pre-line;
}
</style>
