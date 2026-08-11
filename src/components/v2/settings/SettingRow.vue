<template>
  <div class="setting-row">
    <div class="setting-row__copy">
      <div class="setting-row__title">
        <span>{{ title }}</span>
        <slot name="scope" />
      </div>
      <div class="setting-row__description">
        {{ description }}
      </div>
    </div>
    <div class="setting-row__control">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: {type: String, required: true},
  description: {type: String, default: ""},
});
</script>
