<template>
  <v-alert
    :type="report.valid ? 'success' : 'error'"
    variant="tonal"
  >
    <div class="font-weight-bold mb-2">
      {{ report.valid ? '校验通过' : '校验未通过' }}
    </div>
    <div
      v-if="report.summary"
      class="text-body-2 mb-2"
    >
      <span
        v-for="(value, key) in report.summary"
        :key="key"
        class="mr-4"
      >
        {{ summaryLabel(key) }}：{{ value }}
      </span>
    </div>
    <ul
      v-if="report.errors?.length"
      class="pl-5"
    >
      <li
        v-for="item in report.errors"
        :key="`${item.path}-${item.code}-${item.message}`"
      >
        {{ item.path }}：{{ item.message }}
      </li>
    </ul>
    <div
      v-if="report.warnings?.length"
      class="mt-3"
    >
      <div class="font-weight-medium">
        提醒
      </div>
      <ul class="pl-5">
        <li
          v-for="item in report.warnings"
          :key="`${item.path}-${item.code}-${item.message}`"
        >
          {{ item.message }}
        </li>
      </ul>
    </div>
  </v-alert>
</template>

<script setup>
defineProps({
  report: {
    type: Object,
    required: true,
  },
});

function summaryLabel(key) {
  return {
    subjects: "科目",
    administrativeClasses: "行政班",
    courseGroups: "走班教学班",
    subjectRules: "授课规则",
    sourceRelations: "来源关系",
    teachers: "教师",
    memberships: "分配关系",
    resolvedTeachers: "已登录教师",
    pendingTeachers: "待首次登录",
  }[key] || key;
}
</script>
