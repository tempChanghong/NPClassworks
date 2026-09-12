<template>
  <p
    v-if="value"
    class="preparation-details"
  >
    {{ value.date }} 需带：{{ value.text }}
  </p>
</template>
<script setup>
import {computed} from "vue";
import {preparationOf} from "@/utils/homeworkPreparation";
const props = defineProps({publication: {type: Object, default: null}});
const value = computed(() => preparationOf(props.publication));
</script>
<style scoped>
.preparation-details { white-space: pre-wrap; overflow-wrap: anywhere; margin: 12px 0; }
</style>
