<template>
  <v-container class="fill-height d-flex align-center justify-center">
    <v-progress-circular
      color="primary"
      indeterminate
      size="48"
    />
  </v-container>
</template>

<script setup>
import {onBeforeMount} from "vue";
import {useRouter} from "vue-router";

const router = useRouter();

onBeforeMount(() => router.replace("/"));
</script>
