<template>
  <v-card class="admin-navigation rounded-xl">
    <v-card-text class="pa-4">
      <div class="text-overline text-medium-emphasis mb-2">
        当前管理范围
      </div>
      <v-select
        :items="schoolOptions"
        item-title="title"
        item-value="value"
        label="学校"
        :model-value="schoolId"
        variant="outlined"
        @update:model-value="$emit('update:schoolId', $event)"
      />
      <v-select
        :disabled="!schoolId"
        hide-details
        :items="termOptions"
        item-title="title"
        item-value="value"
        label="学期"
        :model-value="termId"
        variant="outlined"
        @update:model-value="$emit('update:termId', $event)"
      />
    </v-card-text>

    <v-divider />

    <v-list
      class="admin-navigation__desktop pa-2"
      density="comfortable"
      nav
    >
      <template
        v-for="group in groups"
        :key="group.label"
      >
        <v-list-subheader>{{ group.label }}</v-list-subheader>
        <v-list-item
          v-for="item in group.items"
          :key="item.value"
          :active="modelValue === item.value"
          :prepend-icon="item.icon"
          rounded="lg"
          :title="item.title"
          @click="$emit('update:modelValue', item.value)"
        />
      </template>
    </v-list>

    <v-card-text class="admin-navigation__mobile pt-0">
      <v-select
        hide-details
        :items="flatItems"
        item-title="title"
        item-value="value"
        label="管理页面"
        :model-value="modelValue"
        variant="outlined"
        @update:model-value="$emit('update:modelValue', $event)"
      />
    </v-card-text>
  </v-card>
</template>

<script setup>
import {computed} from "vue";

const props = defineProps({
  modelValue: {type: String, required: true},
  schoolId: {type: String, default: ""},
  termId: {type: String, default: ""},
  schoolOptions: {type: Array, default: () => []},
  termOptions: {type: Array, default: () => []},
  groups: {type: Array, default: () => []},
});
defineEmits(["update:modelValue", "update:schoolId", "update:termId"]);

const flatItems = computed(() => props.groups.flatMap((group) => group.items.map((item) => ({
  ...item,
  title: `${group.label} · ${item.title}`,
}))));
</script>

<style scoped>
.admin-navigation {
  position: sticky;
  top: 82px;
}
.admin-navigation__mobile { display: none; }

@media (max-width: 959px) {
  .admin-navigation { position: static; }
  .admin-navigation__desktop { display: none; }
  .admin-navigation__mobile { display: block; }
}
</style>
