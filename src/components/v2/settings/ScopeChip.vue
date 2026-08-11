<template>
  <span :class="['scope-chip', `scope-chip--${scope.color}`]">
    <v-icon
      :icon="scope.icon"
      size="x-small"
    />
    {{ scope.label }}
  </span>
</template>

<script setup>
import {computed} from "vue";

const props = defineProps({type: {type: String, default: "device"}});
const definitions = {
  device: {label: "仅本设备", color: "grey", icon: "mdi-laptop"},
  screen: {label: "当前大屏", color: "primary", icon: "mdi-monitor"},
  account: {label: "教师账号", color: "success", icon: "mdi-account"},
  admin: {label: "管理员", color: "warning", icon: "mdi-shield-account"},
};
const scope = computed(() => definitions[props.type] || definitions.device);
</script>
