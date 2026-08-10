<template>
  <v-container class="fill-height">
    <v-row justify="center">
      <v-col cols="auto">
        <v-progress-circular
          color="primary"
          indeterminate
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import {onMounted} from "vue";
import {useRoute, useRouter} from "vue-router";

const route = useRoute();
const router = useRouter();

// 兼容旧版本已经发出的授权回调地址。
onMounted(() => router.replace({path: "/authorize", query: route.query}));
</script>
