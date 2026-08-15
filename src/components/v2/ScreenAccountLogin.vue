<template>
  <v-card
    class="screen-login-card mx-auto rounded-xl"
    max-width="680"
  >
    <v-card-text class="pa-8">
      <v-avatar
        class="d-block mx-auto mb-4"
        color="primary"
        size="72"
        variant="tonal"
      >
        <v-icon
          class="screen-login-icon"
          icon="mdi-monitor-lock"
          size="40"
        />
      </v-avatar>
      <div class="text-h5 font-weight-bold mb-2 text-center">
        登录班级大屏
      </div>
      <div class="text-body-1 text-medium-emphasis mb-6 text-center">
        首次登录后，本机将自动保持班级大屏身份，无需输入管理员账号。
      </div>
      <v-select
        v-model="schoolId"
        :items="schools"
        item-title="name"
        item-value="id"
        label="学校"
        prepend-inner-icon="mdi-domain"
        variant="outlined"
      />
      <v-text-field
        v-model="loginCode"
        autocomplete="username"
        label="大屏账号"
        prepend-inner-icon="mdi-monitor-account"
        variant="outlined"
        @keyup.enter="submit"
      />
      <v-text-field
        v-model="pin"
        autocomplete="current-password"
        label="大屏 PIN"
        maxlength="8"
        prepend-inner-icon="mdi-dialpad"
        type="password"
        variant="outlined"
        @keyup.enter="submit"
      />
      <v-alert
        v-if="error"
        class="mb-4"
        type="error"
        variant="tonal"
      >
        {{ error }}
      </v-alert>
      <v-btn
        block
        color="primary"
        :disabled="!canSubmit"
        :loading="loading"
        prepend-icon="mdi-login"
        size="large"
        variant="elevated"
        @click="submit"
      >
        登录并进入大屏
      </v-btn>
    </v-card-text>
  </v-card>
</template>

<script setup>
import {computed, ref, watch} from "vue";

const props = defineProps({
  schools: {type: Array, default: () => []},
  loading: Boolean,
  error: {type: String, default: ""},
});
const emit = defineEmits(["login"]);
const schoolId = ref("");
const loginCode = ref("");
const pin = ref("");
const canSubmit = computed(() => Boolean(
  schoolId.value && loginCode.value.trim() && /^\d{4,8}$/.test(pin.value),
));

watch(() => props.schools, (schools) => {
  if (!schoolId.value && schools.length) schoolId.value = schools[0].id;
}, {deep: true, immediate: true});

function submit() {
  if (!canSubmit.value || props.loading) return;
  emit("login", {
    schoolId: schoolId.value,
    loginCode: loginCode.value.trim().toUpperCase(),
    pin: pin.value,
  });
  pin.value = "";
}
</script>

<style scoped>
.screen-login-icon {
  top: 15px;
}
</style>
