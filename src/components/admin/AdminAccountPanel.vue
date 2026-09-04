<template>
  <v-alert
    v-if="adminMembershipsStatus === 'loaded' && !hasManagerMembership"
    type="warning"
    variant="tonal"
  >
    请先完成学校初始化或取得 OWNER/ADMIN 权限。
  </v-alert>
  <template v-else>
    <v-card class="mb-5 rounded-xl">
      <v-card-text class="pa-5 d-flex align-center flex-wrap ga-3">
        <v-select
          v-model="schoolId"
          :items="schoolOptions"
          class="flex-grow-1"
          item-title="title"
          item-value="value"
          label="学校"
          max-width="520"
          variant="outlined"
        />
        <v-btn
          prepend-icon="mdi-download-outline"
          variant="tonal"
          @click="$emit('download-roster')"
        >
          导出账号名册
        </v-btn>
        <v-btn
          v-if="hasRecentCredentials"
          prepend-icon="mdi-key-outline"
          variant="tonal"
          @click="$emit('download-credentials')"
        >
          下载本次初始凭据
        </v-btn>
      </v-card-text>
    </v-card>

    <v-row>
      <v-col
        cols="12"
        lg="4"
      >
        <v-card class="rounded-xl">
          <v-card-title class="pa-5 pb-2">
            创建第二管理员
          </v-card-title>
          <v-card-text class="px-5 pb-5">
            <v-text-field
              v-model.trim="adminUsername"
              label="管理员短账号"
              variant="outlined"
            />
            <v-text-field
              v-model.trim="adminName"
              label="管理员姓名"
              variant="outlined"
            />
            <v-text-field
              v-model="adminPin"
              hint="4～8位数字"
              label="初始 PIN"
              persistent-hint
              type="password"
              variant="outlined"
            />
            <v-select
              v-model="adminRole"
              :items="adminRoleOptions"
              item-title="title"
              item-value="value"
              label="学校角色"
              variant="outlined"
            />
            <v-btn
              block
              color="primary"
              :loading="busy"
              @click="$emit('create-administrator')"
            >
              创建管理员
            </v-btn>
            <v-alert
              class="mt-4"
              type="info"
              variant="tonal"
            >
              建议至少保留两个 OWNER/ADMIN，并将 PIN 分别交由不同负责人保管。
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col
        cols="12"
        lg="8"
      >
        <v-card class="rounded-xl">
          <v-card-title class="d-flex align-center pa-5">
            本地账号
            <v-spacer />
            <v-btn
              :loading="busy"
              icon="mdi-refresh"
              variant="text"
              @click="$emit('refresh')"
            />
          </v-card-title>
          <v-card-text class="account-filter-bar px-5 pb-2 pt-0">
            <v-text-field
              v-model.trim="search"
              clearable
              hide-details
              label="搜索姓名或账号"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
            />
            <v-select
              v-model="statusFilter"
              hide-details
              :items="statusOptions"
              item-title="title"
              item-value="value"
              label="账号状态"
              variant="outlined"
            />
          </v-card-text>
          <v-list
            class="admin-entity-list"
            lines="three"
          >
            <template
              v-for="account in accounts"
              :key="account.id"
            >
              <v-list-item
                :subtitle="accountSummary(account)"
                :title="`${account.name || '未命名'} · @${account.username}`"
              >
                <template #prepend>
                  <v-avatar :color="account.disabled ? 'grey' : account.schoolRole ? 'primary' : 'success'">
                    <v-icon :icon="account.schoolRole ? 'mdi-shield-account-outline' : 'mdi-human-male-board'" />
                  </v-avatar>
                </template>
                <template #append>
                  <div class="admin-row-actions admin-row-actions--desktop">
                    <v-btn
                      v-if="account.id !== profileId"
                      size="small"
                      variant="text"
                      @click="$emit('reset-pin', account)"
                    >
                      重置 PIN
                    </v-btn>
                    <v-btn
                      v-if="account.disabled"
                      color="success"
                      size="small"
                      variant="text"
                      @click="$emit('set-disabled', account, false)"
                    >
                      启用
                    </v-btn>
                    <v-btn
                      v-else-if="account.id !== profileId"
                      color="warning"
                      size="small"
                      variant="text"
                      @click="$emit('set-disabled', account, true)"
                    >
                      停用
                    </v-btn>
                    <v-btn
                      v-if="account.id !== profileId"
                      color="error"
                      size="small"
                      variant="text"
                      @click="$emit('deactivate', account)"
                    >
                      注销权限
                    </v-btn>
                  </div>
                  <v-menu v-if="account.id !== profileId || account.disabled">
                    <template #activator="{props: menuProps}">
                      <v-btn
                        v-bind="menuProps"
                        class="admin-row-actions--mobile"
                        icon="mdi-dots-vertical"
                        title="账号操作"
                        variant="text"
                      />
                    </template>
                    <v-list density="comfortable">
                      <v-list-item
                        v-if="account.id !== profileId"
                        prepend-icon="mdi-lock-reset"
                        title="重置 PIN"
                        @click="$emit('reset-pin', account)"
                      />
                      <v-list-item
                        v-if="account.disabled"
                        class="text-success"
                        prepend-icon="mdi-account-check-outline"
                        title="启用账号"
                        @click="$emit('set-disabled', account, false)"
                      />
                      <v-list-item
                        v-else-if="account.id !== profileId"
                        class="text-warning"
                        prepend-icon="mdi-account-off-outline"
                        title="停用账号"
                        @click="$emit('set-disabled', account, true)"
                      />
                      <v-list-item
                        v-if="account.id !== profileId"
                        class="text-error"
                        prepend-icon="mdi-account-remove-outline"
                        title="注销全部权限"
                        @click="$emit('deactivate', account)"
                      />
                    </v-list>
                  </v-menu>
                </template>
              </v-list-item>
              <v-divider />
            </template>
          </v-list>
          <v-empty-state
            v-if="!accounts.length && !busy"
            icon="mdi-account-off-outline"
            :text="search || statusFilter !== 'ALL' ? '没有符合筛选条件的账号' : '当前没有本地账号'"
          />
        </v-card>
      </v-col>
    </v-row>
  </template>
</template>

<script setup>
defineProps({
  accounts: {type: Array, default: () => []},
  accountSummary: {type: Function, required: true},
  adminMembershipsStatus: {type: String, required: true},
  adminRoleOptions: {type: Array, default: () => []},
  busy: Boolean,
  hasManagerMembership: Boolean,
  hasRecentCredentials: Boolean,
  profileId: {type: String, default: ""},
  schoolOptions: {type: Array, default: () => []},
  statusOptions: {type: Array, default: () => []},
});

defineEmits([
  "create-administrator", "deactivate", "download-credentials", "download-roster",
  "refresh", "reset-pin", "set-disabled",
]);

const schoolId = defineModel("schoolId", {type: String, default: ""});
const search = defineModel("search", {type: String, default: ""});
const statusFilter = defineModel("statusFilter", {type: String, default: "ALL"});
const adminUsername = defineModel("adminUsername", {type: String, default: ""});
const adminName = defineModel("adminName", {type: String, default: ""});
const adminPin = defineModel("adminPin", {type: String, default: ""});
const adminRole = defineModel("adminRole", {type: String, default: "ADMIN"});
</script>

<style scoped>
.account-filter-bar { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) minmax(160px, 220px); }
.admin-row-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
.admin-row-actions--mobile { display: none; }
@media (max-width: 959px) {
  .admin-row-actions--desktop { display: none; }
  .admin-row-actions--mobile { align-items: center; display: inline-flex; flex-wrap: nowrap; }
}
@media (max-width: 600px) {
  .account-filter-bar { grid-template-columns: 1fr; }
  .admin-entity-list :deep(.v-list-item) { align-items: flex-start; padding-inline: 12px; }
}
</style>
