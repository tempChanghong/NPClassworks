<template>
  <section class="settings-panel">
    <div class="settings-panel__heading">
      <div class="settings-panel__icon">
        <v-icon :icon="icon" />
      </div>
      <div>
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
    </div>
    <div class="settings-panel__body">
      <slot />
    </div>
  </section>
</template>

<script setup>
defineProps({
  title: {type: String, required: true},
  description: {type: String, default: ""},
  icon: {type: String, default: "mdi-cog-outline"},
});
</script>
