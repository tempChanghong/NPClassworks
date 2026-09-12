<template>
  <v-row v-if="accountsVisible">
    <v-col
      cols="12"
      lg="4"
    >
      <v-card class="rounded-xl">
        <v-card-title class="pa-5 pb-2">
          创建大屏账号
        </v-card-title>
        <v-card-text class="px-5 pb-5">
          <v-text-field
            v-model.trim="newScreenName"
            label="设备名称"
            placeholder="例如：高二1班一体机"
            variant="outlined"
          />
          <v-text-field
            v-model.trim="newScreenLoginCode"
            hint="3～32位字母、数字、点、横线或下划线"
            label="大屏短账号"
            persistent-hint
            variant="outlined"
          />
          <v-text-field
            v-model="newScreenPin"
            hint="4～8位数字；请交给班主任或管理员保管"
            label="大屏 PIN"
            persistent-hint
            type="password"
            variant="outlined"
          />
          <v-select
            v-model="newScreenAdministrativeClassId"
            :items="administrativeClassOptions"
            item-title="title"
            item-value="value"
            label="绑定行政班"
            variant="outlined"
          />
          <v-btn
            block
            color="primary"
            :loading="screenBusy"
            prepend-icon="mdi-monitor-plus"
            @click="createScreenAccount"
          >
            创建账号
          </v-btn>
        </v-card-text>
      </v-card>
    </v-col>
    <v-col
      cols="12"
      lg="8"
    >
      <v-card class="rounded-xl">
        <v-card-title class="d-flex align-center pa-5">
          已分配大屏
          <v-spacer />
          <v-btn
            :loading="screenLoading"
            aria-label="刷新大屏列表"
            icon="mdi-refresh"
            variant="text"
            @click="loadScreenAccounts"
          />
        </v-card-title>
        <div class="px-5 screen-list-status">
          <v-alert
            v-if="screenLoadError"
            :type="screenLoadedAt ? 'warning' : 'error'"
            variant="tonal"
            class="mb-2"
          >
            {{ screenLoadError }}{{ screenLoadedAt ? '；保留上次成功的列表，设备状态可能已变化。' : '' }}
          </v-alert>
          <p
            v-if="screenLoadedAt"
            class="text-caption mb-2"
          >
            上次成功刷新：{{ screenLoadedAt }}
          </p>
        </div>
        <v-card-text class="account-filter-bar px-5 pb-2 pt-0">
          <v-text-field
            v-model.trim="screenSearch"
            clearable
            hide-details
            label="搜索设备、账号或班级"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
          />
          <v-select
            v-model="screenStatusFilter"
            hide-details
            :items="screenStatusOptions"
            item-title="title"
            item-value="value"
            label="值守状态"
            variant="outlined"
          />
        </v-card-text>
        <v-list
          class="admin-entity-list"
          lines="three"
        >
          <template
            v-for="screen in filteredScreenAccounts"
            :key="screen.id"
          >
            <v-list-item
              :subtitle="screenAccountSummary(screen)"
              :title="screen.name"
            >
              <template #prepend>
                <v-avatar :color="screenDutyColor(screen.dutyState)">
                  <v-icon icon="mdi-monitor-dashboard" />
                </v-avatar>
              </template>
              <template #append>
                <div class="admin-row-actions admin-row-actions--desktop">
                  <v-chip
                    :color="screenDutyColor(screen.dutyState)"
                    size="small"
                    variant="tonal"
                  >
                    {{ screenDutyName(screen.dutyState) }}
                  </v-chip>
                  <v-btn
                    :disabled="!['ONLINE', 'DEGRADED'].includes(screen.dutyState)"
                    size="small"
                    variant="text"
                    @click="issueScreenCommand(screen, 'REFRESH_DATA')"
                  >
                    刷新数据
                  </v-btn>
                  <v-btn
                    :disabled="!['ONLINE', 'DEGRADED'].includes(screen.dutyState)"
                    size="small"
                    variant="text"
                    @click="issueScreenCommand(screen, 'RELOAD_APP')"
                  >
                    重载页面
                  </v-btn>
                  <v-btn
                    size="small"
                    variant="text"
                    @click="openScreenEdit(screen)"
                  >
                    编辑
                  </v-btn>
                  <v-btn
                    color="warning"
                    size="small"
                    variant="text"
                    @click="resetScreenDevice(screen)"
                  >
                    重置设备
                  </v-btn>
                  <v-btn
                    :color="screen.isActive ? 'error' : 'success'"
                    size="small"
                    variant="text"
                    @click="setScreenActive(screen, !screen.isActive)"
                  >
                    {{ screen.isActive ? "停用" : "启用" }}
                  </v-btn>
                </div>
                <div class="admin-row-actions admin-row-actions--mobile">
                  <v-chip
                    :color="screenDutyColor(screen.dutyState)"
                    size="small"
                    variant="tonal"
                  >
                    {{ screenDutyName(screen.dutyState) }}
                  </v-chip>
                  <v-menu>
                    <template #activator="{ props: menuProps }">
                      <v-btn
                        v-bind="menuProps"
                        icon="mdi-dots-vertical"
                        title="大屏操作"
                        variant="text"
                      />
                    </template>
                    <v-list density="comfortable">
                      <v-list-item
                        :disabled="!['ONLINE', 'DEGRADED'].includes(screen.dutyState)"
                        prepend-icon="mdi-refresh"
                        title="刷新数据"
                        @click="issueScreenCommand(screen, 'REFRESH_DATA')"
                      />
                      <v-list-item
                        :disabled="!['ONLINE', 'DEGRADED'].includes(screen.dutyState)"
                        prepend-icon="mdi-reload"
                        title="重载页面"
                        @click="issueScreenCommand(screen, 'RELOAD_APP')"
                      />
                      <v-list-item
                        prepend-icon="mdi-pencil-outline"
                        title="编辑账号"
                        @click="openScreenEdit(screen)"
                      />
                      <v-list-item
                        class="text-warning"
                        prepend-icon="mdi-monitor-off"
                        title="重置设备绑定"
                        @click="resetScreenDevice(screen)"
                      />
                      <v-list-item
                        :class="screen.isActive ? 'text-error' : 'text-success'"
                        :prepend-icon="screen.isActive ? 'mdi-cancel' : 'mdi-check-circle-outline'"
                        :title="screen.isActive ? '停用账号' : '启用账号'"
                        @click="setScreenActive(screen, !screen.isActive)"
                      />
                    </v-list>
                  </v-menu>
                </div>
              </template>
            </v-list-item>
            <v-divider />
          </template>
        </v-list>
        <v-empty-state
          v-if="!filteredScreenAccounts.length && !screenBusy && !screenLoadError && screenLoadedAt"
          icon="mdi-monitor-off"
          :text="screenSearch || screenStatusFilter !== 'ALL' ? '没有符合筛选条件的大屏' : '当前学校还没有大屏账号'"
        />
      </v-card>
    </v-col>
  </v-row>

  <v-dialog
    v-model="screenEditDialog"
    max-width="560"
  >
    <v-card class="rounded-xl">
      <v-card-title class="pa-5 pb-2">
        编辑大屏账号
      </v-card-title>
      <v-card-text class="px-5">
        <v-text-field
          v-model.trim="screenEdit.name"
          label="设备名称"
          variant="outlined"
        />
        <v-text-field
          v-model.trim="screenEdit.loginCode"
          label="大屏短账号"
          variant="outlined"
        />
        <v-select
          v-model="screenEdit.administrativeClassId"
          :items="administrativeClassOptions"
          item-title="title"
          item-value="value"
          label="绑定行政班"
          variant="outlined"
        />
        <v-text-field
          v-model="screenEdit.pin"
          hint="留空则保留当前 PIN"
          label="新 PIN（可选）"
          persistent-hint
          type="password"
          variant="outlined"
        />
      </v-card-text>
      <v-card-actions class="px-5 pb-5">
        <v-spacer />
        <v-btn @click="screenEditDialog = false">
          取消
        </v-btn>
        <v-btn
          color="primary"
          :loading="screenBusy"
          @click="saveScreenAccount"
        >
          保存
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
const props = defineProps({
  accountsVisible: Boolean,
  administrativeClassOptions: {type: Array, default: () => []},
  manager: {type: Object, required: true},
});

// The page creates this stable manager once, so refs survive lazy tab mounting.
const {
  screenBusy,
  screenLoading,
  screenLoadError,
  screenLoadedAt,
  screenSearch,
  screenStatusFilter,
  newScreenName,
  newScreenLoginCode,
  newScreenPin,
  newScreenAdministrativeClassId,
  screenEditDialog,
  screenEdit,
  screenStatusOptions,
  filteredScreenAccounts,
  loadScreenAccounts,
  createScreenAccount,
  openScreenEdit,
  saveScreenAccount,
  resetScreenDevice,
  setScreenActive,
  screenAccountSummary,
  screenDutyName,
  screenDutyColor,
  issueScreenCommand,
} = props.manager;
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
