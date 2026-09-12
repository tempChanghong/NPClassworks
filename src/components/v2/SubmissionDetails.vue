<template>
  <p
    v-if="text"
    class="submission-details"
  >
    <strong>提交说明：</strong>{{ text }}
  </p>
</template>
<script setup>
import {computed} from "vue";
import {submissionOf} from "@/utils/homeworkInstructions";
const props = defineProps({publication: {type: Object, default: null}});
const text = computed(() => submissionOf(props.publication));
</script>
<style scoped>
.submission-details { white-space: pre-wrap; overflow-wrap: anywhere; margin: 8px 0; }
</style>
