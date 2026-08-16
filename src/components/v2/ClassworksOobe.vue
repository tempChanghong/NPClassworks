<template>
  <section class="oobe-shell">
    <div class="oobe-heading text-center">
      <v-avatar
        color="primary"
        size="76"
        variant="tonal"
      >
        <v-icon
          icon="mdi-lightning-bolt-outline"
          size="44"
        />
      </v-avatar>
      <h1>欢迎使用 Classworks</h1>
      <p>请选择这台设备的使用方式。完成一次设置后，系统会自动记住。</p>
    </div>

    <v-alert
      v-if="schoolCount === 0"
      class="mb-5"
      type="warning"
      variant="tonal"
    >
      当前服务器尚未配置学校。请由学校管理员完成首次初始化。
    </v-alert>

    <div class="oobe-role-grid">
      <button
        class="oobe-role-card"
        type="button"
        @click="$emit('select', 'student')"
      >
        <v-avatar
          color="primary"
          size="58"
          variant="tonal"
        >
          <v-icon
            icon="mdi-book-open-page-variant-outline"
            size="32"
          />
        </v-avatar>
        <span class="oobe-role-card__title">学生看作业</span>
        <span class="oobe-role-card__description">选择行政班和自己的走班课程，不需要账号。</span>
        <span class="oobe-role-card__action">开始选班 <v-icon icon="mdi-arrow-right" /></span>
      </button>

      <button
        class="oobe-role-card"
        type="button"
        @click="$emit('select', 'teacher')"
      >
        <v-avatar
          color="success"
          size="58"
          variant="tonal"
        >
          <v-icon
            icon="mdi-account-tie-outline"
            size="32"
          />
        </v-avatar>
        <span class="oobe-role-card__title">教师工作台</span>
        <span class="oobe-role-card__description">登录一次，管理自己负责的全部行政班和走班。</span>
        <span class="oobe-role-card__action">教师登录 <v-icon icon="mdi-arrow-right" /></span>
      </button>

      <button
        class="oobe-role-card"
        type="button"
        @click="$emit('select', 'screen')"
      >
        <v-avatar
          color="info"
          size="58"
          variant="tonal"
        >
          <v-icon
            icon="mdi-monitor-dashboard"
            size="32"
          />
        </v-avatar>
        <span class="oobe-role-card__title">班级大屏</span>
        <span class="oobe-role-card__description">使用学校分配的大屏账号激活这台一体机。</span>
        <span class="oobe-role-card__action">激活大屏 <v-icon icon="mdi-arrow-right" /></span>
      </button>

      <button
        class="oobe-role-card oobe-role-card--admin"
        type="button"
        @click="$emit('admin')"
      >
        <v-avatar
          color="warning"
          size="58"
          variant="tonal"
        >
          <v-icon
            icon="mdi-shield-account-outline"
            size="32"
          />
        </v-avatar>
        <span class="oobe-role-card__title">学校管理员</span>
        <span class="oobe-role-card__description">初始化学校、配置班级、教师账号和大屏设备。</span>
        <span class="oobe-role-card__action">进入管理 <v-icon icon="mdi-open-in-new" /></span>
      </button>
    </div>

    <div class="text-caption text-medium-emphasis text-center mt-6">
      之后可以在页面顶部切换学生和教师模式；班级大屏需验证 PIN 后才能临时退出。
    </div>
  </section>
</template>

<script setup>
defineProps({schoolCount: {type: Number, default: 0}});
defineEmits(["select", "admin"]);
</script>

<style scoped>
.oobe-shell {
  margin: clamp(20px, 5vh, 64px) auto;
  max-width: 1160px;
}
.oobe-heading { margin-bottom: 32px; }
.oobe-heading h1 {
  font-size: clamp(2rem, 3vw, 3rem);
  line-height: 1.15;
  margin: 18px 0 10px;
}
.oobe-heading p {
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 1.1rem;
}
.oobe-role-grid {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.oobe-role-card {
  align-items: flex-start;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 22px;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  display: flex;
  flex-direction: column;
  min-height: 230px;
  padding: 26px;
  text-align: left;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}
.oobe-role-card:hover,
.oobe-role-card:focus-visible {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
  outline: none;
  transform: translateY(-3px);
}
.oobe-role-card__title { font-size: 1.35rem; font-weight: 800; margin-top: 18px; }
.oobe-role-card__description {
  color: rgba(var(--v-theme-on-surface), 0.68);
  flex: 1;
  line-height: 1.6;
  margin-top: 8px;
}
.oobe-role-card__action {
  align-items: center;
  color: rgb(var(--v-theme-primary));
  display: inline-flex;
  font-weight: 700;
  gap: 5px;
  margin-top: 18px;
}
.oobe-role-card--admin { background: rgba(var(--v-theme-warning), 0.045); }
@media (max-width: 760px) {
  .oobe-shell { margin-top: 14px; }
  .oobe-role-grid { grid-template-columns: 1fr; }
  .oobe-role-card { min-height: 190px; }
}
</style>
