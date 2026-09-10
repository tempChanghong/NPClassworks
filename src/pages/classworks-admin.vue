<template>
  <v-app-bar
    color="surface"
    flat
  >
    <v-btn
      icon="mdi-arrow-left"
      title="返回教师工作台"
      @click="$router.push('/')"
    />
    <v-app-bar-title>
      <div class="font-weight-bold">
        学校与教师配置
      </div>
      <div class="text-caption text-medium-emphasis">
        组织导入、走班规则和教师教学空间分配
      </div>
    </v-app-bar-title>
  </v-app-bar>

  <v-container class="admin-page py-6">
    <v-alert
      v-if="errorMessage"
      class="mb-5"
      closable
      type="error"
      variant="tonal"
      @click:close="errorMessage = ''"
    >
      {{ errorMessage }}
    </v-alert>
    <v-alert
      v-if="successMessage"
      class="mb-5"
      closable
      type="success"
      variant="tonal"
      @click:close="successMessage = ''"
    >
      {{ successMessage }}
    </v-alert>

    <div
      v-if="!signedIn"
      class="mx-auto"
      style="max-width: 680px"
    >
      <v-card class="rounded-xl">
        <v-card-text class="pa-8">
          <v-icon
            class="d-block mx-auto mb-4"
            color="primary"
            icon="mdi-shield-account-outline"
            size="56"
          />
          <div class="text-h5 font-weight-bold mb-2 text-center">
            管理员登录
          </div>
          <div class="text-body-1 text-medium-emphasis mb-6 text-center">
            使用学校代码、管理员短账号和个人 PIN 登录。
          </div>
          <v-select
            v-model="loginSchoolCode"
            :items="publicSchoolOptions"
            item-title="title"
            item-value="value"
            label="学校"
            variant="outlined"
          />
          <v-text-field
            v-model.trim="loginUsername"
            autocomplete="username"
            label="管理员短账号"
            variant="outlined"
          />
          <v-text-field
            v-model="loginPassword"
            autocomplete="current-password"
            label="个人 PIN"
            type="password"
            variant="outlined"
            @keyup.enter="loginAdministrator"
          />
          <v-btn
            block
            color="primary"
            :loading="loginBusy"
            size="large"
            @click="loginAdministrator"
          >
            登录
          </v-btn>
          <template v-if="providers.length">
            <v-divider class="my-6" />
            <div class="d-flex justify-center flex-wrap ga-3">
              <v-btn
                v-for="provider in providers"
                :key="provider.id"
                :color="provider.brandColor || provider.color || 'primary'"
                variant="tonal"
                @click="startOAuthLogin(provider.id, '/classworks-admin')"
              >
                使用 {{ provider.displayName || provider.name }} 登录
              </v-btn>
            </div>
          </template>
        </v-card-text>
      </v-card>

      <v-card
        v-if="localAuthStatus.bootstrapRequired"
        class="mt-5 rounded-xl"
        color="warning"
        variant="tonal"
      >
        <v-card-title class="pa-5 pb-2">
          首次部署：创建首位管理员
        </v-card-title>
        <v-card-text class="px-5 pb-5">
          <v-alert
            v-if="!localAuthStatus.bootstrapAvailable"
            class="mb-4"
            type="warning"
            variant="tonal"
          >
            后端未设置 BOOTSTRAP_SETUP_KEY，或首位管理员已创建。
          </v-alert>
          <v-text-field
            v-model.trim="setupSchoolCode"
            label="学校代码（之后不可随意修改）"
            placeholder="NEWFIRES-SCHOOL"
            variant="outlined"
          />
          <v-text-field
            v-model.trim="setupName"
            label="管理员姓名"
            variant="outlined"
          />
          <v-text-field
            v-model.trim="setupUsername"
            label="管理员短账号"
            placeholder="admin"
            variant="outlined"
          />
          <v-text-field
            v-model="setupPin"
            label="管理员 PIN（4～8位数字）"
            type="password"
            variant="outlined"
          />
          <v-text-field
            v-model="setupKey"
            label="服务器一次性初始化密钥"
            type="password"
            variant="outlined"
          />
          <v-btn
            :disabled="!localAuthStatus.bootstrapAvailable"
            :loading="loginBusy"
            color="warning"
            @click="createFirstAdministrator"
          >
            创建并登录
          </v-btn>
        </v-card-text>
      </v-card>
      <v-expansion-panels
        v-if="publicSchools.length && !localAuthStatus.bootstrapRequired"
        class="mt-5"
      >
        <v-expansion-panel>
          <v-expansion-panel-title>
            忘记 OWNER PIN？使用服务器恢复密钥
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-alert
              class="mb-4"
              type="warning"
              variant="tonal"
            >
              使用恢复密钥重设 OWNER PIN。重设后，该账号需要重新登录。
            </v-alert>
            <v-text-field
              v-model.trim="recoveryUsername"
              label="OWNER 短账号"
              variant="outlined"
            />
            <v-text-field
              v-model="recoveryPin"
              label="新 PIN"
              type="password"
              variant="outlined"
            />
            <v-text-field
              v-model="recoveryKey"
              label="服务器 BOOTSTRAP_SETUP_KEY"
              type="password"
              variant="outlined"
            />
            <v-btn
              :loading="loginBusy"
              color="warning"
              @click="recoverOwnerPin"
            >
              恢复 OWNER PIN
            </v-btn>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>

    <template v-else>
      <v-card
        class="mb-5 rounded-xl"
        variant="tonal"
      >
        <v-card-text class="d-flex align-center ga-3">
          <v-avatar
            :image="profile?.avatarUrl"
            color="primary"
          />
          <div>
            <div class="font-weight-bold">
              {{ profile?.name || profile?.email }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ adminAccessSummary }}
            </div>
          </div>
          <v-spacer />
          <v-btn
            prepend-icon="mdi-refresh"
            variant="text"
            @click="bootstrap"
          >
            刷新
          </v-btn>
        </v-card-text>
      </v-card>

      <AdminNavigationPanel
        v-model="guardedTab"
        v-model:school-id="guardedSchoolId"
        v-model:term-id="guardedTermId"
        class="admin-navigation-panel"
        :groups="adminNavigationGroups"
        :school-options="schoolOptions"
        :term-options="termOptions"
      />

      <v-card class="admin-mobile-page-switcher mb-5 rounded-xl">
        <v-select
          v-model="guardedTab"
          density="comfortable"
          hide-details
          :items="adminNavigationItems"
          item-title="title"
          item-value="value"
          label="管理页面"
          prepend-inner-icon="mdi-view-dashboard-outline"
          variant="outlined"
        />
      </v-card>

      <v-window
        v-model="guardedTab"
        class="admin-content-with-navigation"
        :touch="false"
      >
        <v-window-item value="overview">
          <v-alert
            v-if="adminMembershipsStatus === 'loaded' && !managerMemberships.length"
            type="warning"
            variant="tonal"
          >
            请先完成学校初始化或取得 OWNER/ADMIN 权限。
          </v-alert>
          <template v-else>
            <v-card class="mb-5 rounded-xl">
              <v-card-text class="pa-5">
                <v-row>
                  <v-col
                    cols="12"
                    md="6"
                  >
                    <v-select
                      v-model="guardedSchoolId"
                      :items="schoolOptions"
                      item-title="title"
                      item-value="value"
                      label="学校"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col
                    cols="12"
                    md="6"
                  >
                    <v-select
                      v-model="guardedTermId"
                      :items="termOptions"
                      item-title="title"
                      item-value="value"
                      label="诊断学期"
                      variant="outlined"
                    />
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>
            <SchoolManagementOverview
              v-if="selectedSchoolId && selectedTermId"
              :school-id="selectedSchoolId"
              :term-id="selectedTermId"
              @navigate="navigateAdminTab"
            />
          </template>
        </v-window-item>
        <v-window-item value="organization">
          <v-card class="rounded-xl">
            <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5">
              高级组织批量导入
              <v-spacer />
              <v-btn
                prepend-icon="mdi-file-document-outline"
                variant="tonal"
                @click="loadTemplate"
              >
                载入七班制模板
              </v-btn>
            </v-card-title>
            <v-card-text class="px-5 pb-5">
              <v-alert
                class="mb-4"
                type="info"
                variant="tonal"
              >
                批量导入年级、行政班和走班教学班。同代码数据会被更新；导入班级的授课规则和走班来源以文件内容为准。
              </v-alert>
              <v-alert
                class="mb-4"
                type="warning"
                variant="tonal"
              >
                七班制模板暂用“五班化学、六班生物、七班地理”表达每班各定一科且合计二理一文；这三个班的具体对应仍可能变化，正式导入前请按最终名单核对。
              </v-alert>
              <v-row>
                <v-col
                  cols="12"
                  md="6"
                >
                  <v-select
                    v-model="organizationAuthMode"
                    :items="authModeOptions"
                    item-title="title"
                    item-value="value"
                    label="教师登录方式"
                    variant="outlined"
                  />
                </v-col>
                <v-col
                  cols="12"
                  md="6"
                >
                  <v-switch
                    v-model="organizationAllowOAuth"
                    color="primary"
                    label="同时保留 OAuth 备用登录"
                  />
                </v-col>
              </v-row>
              <v-text-field
                v-if="organizationAuthMode === 'SHARED_PASSWORD'"
                v-model="organizationSharedPassword"
                class="mb-2"
                hint="至少 8 个字符；之后留空可保持现有密码"
                label="学校通用教师口令"
                persistent-hint
                type="password"
                variant="outlined"
              />
              <v-alert
                class="mb-4"
                :type="organizationAuthMode === 'SHARED_PASSWORD' ? 'warning' : 'success'"
                variant="tonal"
              >
                {{ authModeDescription }}
              </v-alert>
              <v-file-input
                accept="application/json,.json"
                class="mb-3"
                clearable
                label="从 JSON 文件载入"
                prepend-icon="mdi-upload-outline"
                variant="outlined"
                @update:model-value="loadOrganizationFile"
              />
              <v-textarea
                v-model="organizationText"
                auto-grow
                label="组织配置 JSON"
                max-rows="28"
                min-rows="14"
                spellcheck="false"
                variant="outlined"
              />
              <div class="d-flex flex-wrap ga-3 mt-3">
                <v-btn
                  :loading="organizationBusy"
                  prepend-icon="mdi-check-decagram-outline"
                  variant="tonal"
                  @click="validateOrganization"
                >
                  预检
                </v-btn>
                <v-btn
                  :disabled="!organizationReport?.valid"
                  :loading="organizationBusy"
                  color="primary"
                  prepend-icon="mdi-database-import-outline"
                  @click="commitOrganization"
                >
                  正式导入
                </v-btn>
              </div>

              <validation-report
                v-if="organizationReport"
                class="mt-5"
                :report="organizationReport"
              />
            </v-card-text>
          </v-card>
        </v-window-item>

        <v-window-item value="structure">
          <v-alert
            v-if="adminMembershipsStatus === 'loaded' && !managerMemberships.length"
            type="warning"
            variant="tonal"
          >
            请先完成学校初始化或取得 OWNER/ADMIN 权限。
          </v-alert>
          <template v-else>
            <v-card class="mb-5 rounded-xl">
              <v-card-text class="pa-5">
                <v-row>
                  <v-col
                    cols="12"
                    md="6"
                  >
                    <v-select
                      v-model="guardedSchoolId"
                      :items="schoolOptions"
                      item-title="title"
                      item-value="value"
                      label="学校"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col
                    cols="12"
                    md="6"
                  >
                    <v-select
                      v-model="guardedTermId"
                      :items="termOptions"
                      item-title="title"
                      item-value="value"
                      label="学期"
                      variant="outlined"
                    />
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>
            <AcademicStructureManager
              v-if="selectedSchoolId && selectedTermId"
              :school-id="selectedSchoolId"
              :term-id="selectedTermId"
            />
            <TeachingRelationshipOverview
              v-if="selectedSchoolId && selectedTermId"
              class="mt-5"
              :school-id="selectedSchoolId"
              :term-id="selectedTermId"
            />
          </template>
        </v-window-item>

        <v-window-item value="teachers">
          <v-alert
            v-if="adminMembershipsStatus === 'loaded' && !managerMemberships.length"
            type="warning"
            variant="tonal"
          >
            请先完成实例首次配置或联系现有 OWNER/ADMIN 授权；教师分配不要求再次导入学校 JSON。
          </v-alert>
          <template v-else>
            <v-card class="mb-5 rounded-xl">
              <v-card-text class="pa-5">
                <v-row>
                  <v-col
                    cols="12"
                    md="6"
                  >
                    <v-select
                      v-model="guardedSchoolId"
                      :items="schoolOptions"
                      item-title="title"
                      item-value="value"
                      label="学校"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col
                    cols="12"
                    md="6"
                  >
                    <v-select
                      v-model="guardedTermId"
                      :items="termOptions"
                      item-title="title"
                      item-value="value"
                      label="学期"
                      variant="outlined"
                    />
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>

            <StaffResponsibilityManager
              v-if="selectedSchoolId && selectedTermId"
              :school-id="selectedSchoolId"
              :term-id="selectedTermId"
            />

            <AdminHomeworkQuickInputs :manager="homeworkSettingsManager" />

            <v-row>
              <v-col
                cols="12"
                lg="5"
              >
                <v-card class="rounded-xl">
                  <v-card-title class="pa-5">
                    分配教师
                  </v-card-title>
                  <v-card-text class="px-5 pb-5">
                    <v-switch
                      v-model="batchMode"
                      color="primary"
                      label="批量 JSON 模式"
                    />
                    <template v-if="batchMode">
                      <v-textarea
                        v-model="assignmentBatchText"
                        auto-grow
                        label="教师分配 JSON"
                        min-rows="10"
                        spellcheck="false"
                        variant="outlined"
                      />
                      <v-btn
                        class="mb-4"
                        size="small"
                        variant="text"
                        @click="fillAssignmentExample"
                      >
                        填入示例
                      </v-btn>
                    </template>
                    <template v-else>
                      <template v-if="selectedTeacherAuthMode === 'OAUTH_EMAIL'">
                        <v-text-field
                          v-model.trim="teacherEmail"
                          label="教师 OAuth 邮箱"
                          type="email"
                          variant="outlined"
                        />
                      </template>
                      <template v-else>
                        <v-text-field
                          v-model.trim="teacherUsername"
                          label="教师短账号"
                          placeholder="例如 wangls"
                          variant="outlined"
                        />
                        <v-text-field
                          v-model.trim="teacherName"
                          label="教师姓名"
                          placeholder="例如 王老师"
                          variant="outlined"
                        />
                        <v-text-field
                          v-if="selectedTeacherAuthMode === 'LOCAL_PIN'"
                          v-model="teacherPin"
                          hint="4～8位数字；再次导入同一短账号可重置 PIN"
                          label="个人 PIN"
                          persistent-hint
                          type="password"
                          variant="outlined"
                        />
                      </template>
                      <v-select
                        v-model="teacherRole"
                        :items="roleOptions"
                        item-title="title"
                        item-value="value"
                        label="角色"
                        variant="outlined"
                      />
                      <v-select
                        v-model="selectedWorkspaceCodes"
                        :items="workspaceOptions"
                        chips
                        closable-chips
                        item-title="title"
                        item-value="value"
                        label="行政班或走班教学班"
                        multiple
                        variant="outlined"
                      />
                    </template>
                    <v-alert
                      class="mb-4"
                      type="info"
                      variant="tonal"
                    >
                      {{ teacherAssignmentHelp }}
                    </v-alert>
                    <div class="d-flex ga-3">
                      <v-btn
                        :loading="assignmentBusy"
                        variant="tonal"
                        @click="previewAssignment"
                      >
                        预检
                      </v-btn>
                      <v-btn
                        :disabled="!assignmentReport?.valid"
                        :loading="assignmentBusy"
                        color="primary"
                        @click="commitAssignment"
                      >
                        确认分配
                      </v-btn>
                      <v-btn
                        v-if="recentCredentials.length"
                        prepend-icon="mdi-download-outline"
                        variant="text"
                        @click="downloadRecentCredentials"
                      >
                        下载本次凭据
                      </v-btn>
                    </div>
                    <validation-report
                      v-if="assignmentReport"
                      class="mt-4"
                      :report="assignmentReport"
                    />
                  </v-card-text>
                </v-card>
              </v-col>

              <v-col
                cols="12"
                lg="7"
              >
                <v-card class="rounded-xl">
                  <v-card-title class="d-flex align-center pa-5">
                    当前教师名册
                    <v-spacer />
                    <v-btn
                      :loading="rosterBusy"
                      icon="mdi-refresh"
                      variant="text"
                      @click="loadRoster"
                    />
                  </v-card-title>
                  <v-card-text class="px-5 pb-2 pt-0">
                    <v-text-field
                      v-model.trim="rosterSearch"
                      clearable
                      hide-details
                      label="搜索班级、科目或教师"
                      prepend-inner-icon="mdi-magnify"
                      variant="outlined"
                    />
                  </v-card-text>
                  <v-list lines="three">
                    <template
                      v-for="workspace in filteredRosterWorkspaces"
                      :key="workspace.id"
                    >
                      <v-list-item
                        :subtitle="workspace.subject?.name || (workspace.type === 'ADMIN_CLASS' ? '行政班' : '走班教学班')"
                        :title="`${workspace.name} · ${workspace.code}`"
                      >
                        <div class="d-flex flex-wrap ga-2 mt-2">
                          <v-chip
                            v-for="member in workspace.members"
                            :key="member.accountId"
                            closable
                            color="success"
                            size="small"
                            variant="tonal"
                            @click:close="removeMember(workspace, member)"
                          >
                            {{ teacherAccountLabel(member.account) }} · {{ roleName(member.role) }}
                          </v-chip>
                          <v-chip
                            v-for="invite in workspace.pendingInvitations"
                            :key="invite.id"
                            closable
                            color="warning"
                            size="small"
                            variant="tonal"
                            @click:close="removeInvitation(workspace, invite)"
                          >
                            {{ invite.email }} · {{ roleName(invite.role) }} · 待首次登录
                          </v-chip>
                          <span
                            v-if="!workspace.members.length && !workspace.pendingInvitations.length"
                            class="text-caption text-medium-emphasis"
                          >尚未分配教师</span>
                        </div>
                      </v-list-item>
                      <v-divider />
                    </template>
                  </v-list>
                  <v-empty-state
                    v-if="!filteredRosterWorkspaces.length && !rosterBusy"
                    icon="mdi-account-search-outline"
                    :text="rosterSearch ? '没有符合搜索条件的教学空间或教师' : '当前学期还没有教师名册数据'"
                  />
                </v-card>
              </v-col>
            </v-row>
          </template>
        </v-window-item>

        <v-window-item value="accounts">
          <AdminAccountPanel
            v-model:admin-name="newAdminName"
            v-model:admin-pin="newAdminPin"
            v-model:admin-role="newAdminRole"
            v-model:admin-username="newAdminUsername"
            v-model:school-id="guardedSchoolId"
            v-model:search="accountSearch"
            v-model:status-filter="accountStatusFilter"
            :accounts="filteredLocalAccounts"
            :account-summary="accountSummary"
            :admin-memberships-status="adminMembershipsStatus"
            :admin-role-options="adminRoleOptions"
            :busy="accountBusy"
            :has-manager-membership="Boolean(managerMemberships.length)"
            :has-recent-credentials="Boolean(recentCredentials.length)"
            :profile-id="profile?.id"
            :school-options="schoolOptions"
            :status-options="accountStatusOptions"
            @create-administrator="createAdministrator"
            @deactivate="deactivateAccount"
            @download-credentials="downloadRecentCredentials"
            @download-roster="downloadAccountRoster"
            @refresh="loadLocalAccounts"
            @reset-pin="resetAccountPin"
            @set-disabled="setAccountDisabled"
          />
        </v-window-item>

        <v-window-item value="screens">
          <v-alert
            v-if="adminMembershipsStatus === 'loaded' && !managerMemberships.length"
            type="warning"
            variant="tonal"
          >
            请先完成学校初始化或取得 OWNER/ADMIN 权限。
          </v-alert>
          <template v-else>
            <v-card class="mb-5 rounded-xl">
              <v-card-text class="pa-5">
                <v-row>
                  <v-col
                    cols="12"
                    md="6"
                  >
                    <v-select
                      v-model="guardedSchoolId"
                      :items="schoolOptions"
                      item-title="title"
                      item-value="value"
                      label="学校"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col
                    cols="12"
                    md="6"
                  >
                    <v-select
                      v-model="guardedTermId"
                      :items="termOptions"
                      item-title="title"
                      item-value="value"
                      label="学期"
                      variant="outlined"
                    />
                  </v-col>
                </v-row>
                <v-alert
                  type="info"
                  variant="tonal"
                >
                  每台一体机使用独立大屏账号首次登录，之后凭设备令牌自动进入。PIN 同时用于临时退出大屏界面；重置设备会立即让原浏览器失效。
                </v-alert>
              </v-card-text>
            </v-card>

            <AdminHomeworkQuickDeadlines :manager="homeworkSettingsManager" />
          </template>

          <AdminScreenAccountPanel
            :accounts-visible="!(adminMembershipsStatus === 'loaded' && !managerMemberships.length)"
            :administrative-class-options="administrativeClassOptions"
            :manager="screenManager"
          />
        </v-window-item>

        <v-window-item value="migration">
          <template v-if="managerMemberships.length">
            <v-card class="mb-5 rounded-xl">
              <v-card-text class="pa-5">
                <v-select
                  v-model="guardedSchoolId"
                  :items="schoolOptions"
                  item-title="title"
                  item-value="value"
                  label="需要迁出的学校"
                  variant="outlined"
                />
              </v-card-text>
            </v-card>
            <SchoolMigrationPanel
              v-if="selectedSchoolId"
              :school-id="selectedSchoolId"
            />
          </template>
        </v-window-item>

        <v-window-item value="audit">
          <template v-if="managerMemberships.length">
            <v-card class="mb-5 rounded-xl">
              <v-card-text class="pa-5">
                <v-select
                  v-model="guardedSchoolId"
                  :items="schoolOptions"
                  item-title="title"
                  item-value="value"
                  label="学校"
                  variant="outlined"
                />
              </v-card-text>
            </v-card>
            <AuditLogViewer
              v-if="selectedSchoolId"
              :school-id="selectedSchoolId"
            />
          </template>
        </v-window-item>

        <v-window-item value="terms">
          <template v-if="managerMemberships.length">
            <v-card class="mb-5 rounded-xl">
              <v-card-text class="pa-5">
                <v-select
                  v-model="guardedSchoolId"
                  :items="schoolOptions"
                  item-title="title"
                  item-value="value"
                  label="学校"
                  variant="outlined"
                />
              </v-card-text>
            </v-card>
            <v-row>
              <v-col
                cols="12"
                lg="5"
              >
                <v-card class="rounded-xl">
                  <v-card-title class="pa-5 pb-2">
                    建立下一学期
                  </v-card-title>
                  <v-card-text class="px-5 pb-5">
                    <v-select
                      v-model="cloneSourceTermId"
                      :items="termOptions"
                      item-title="title"
                      item-value="value"
                      label="源学期"
                      variant="outlined"
                    />
                    <v-text-field
                      v-model.trim="cloneTermName"
                      label="新学期名称"
                      variant="outlined"
                    />
                    <v-row>
                      <v-col cols="6">
                        <v-text-field
                          v-model.number="cloneAcademicYear"
                          label="学年"
                          type="number"
                          variant="outlined"
                        />
                      </v-col>
                      <v-col cols="6">
                        <v-select
                          v-model="cloneSemester"
                          :items="[1, 2, 3]"
                          label="学期序号"
                          variant="outlined"
                        />
                      </v-col>
                    </v-row>
                    <v-row>
                      <v-col cols="6">
                        <v-text-field
                          v-model="cloneStartsAt"
                          label="开始日期"
                          type="date"
                          variant="outlined"
                        />
                      </v-col>
                      <v-col cols="6">
                        <v-text-field
                          v-model="cloneEndsAt"
                          label="结束日期"
                          type="date"
                          variant="outlined"
                        />
                      </v-col>
                    </v-row>
                    <div class="text-subtitle-2 mb-2">
                      继承内容
                    </div>
                    <v-switch
                      v-model="carryWorkspaceMembers"
                      color="primary"
                      density="compact"
                      hide-details
                      label="教师访问权限"
                    />
                    <v-switch
                      v-model="carryTeachingAssignments"
                      color="primary"
                      density="compact"
                      hide-details
                      label="任课关系"
                    />
                    <v-switch
                      v-model="carryLeaderships"
                      color="primary"
                      density="compact"
                      hide-details
                      label="年级组长与班主任职责"
                    />
                    <v-switch
                      v-model="carryPendingInvitations"
                      color="primary"
                      density="compact"
                      hide-details
                      label="未认领的 OAuth 邀请"
                    />
                    <v-alert
                      v-if="termTransitionPreview"
                      class="my-4"
                      type="info"
                      variant="tonal"
                    >
                      将复制 {{ termTransitionPreview.counts.grades }} 个年级、
                      {{ termTransitionPreview.counts.workspaces }} 个教学空间、
                      {{ termTransitionPreview.counts.teachingAssignments }} 条任课关系和
                      {{ termTransitionPreview.counts.gradeLeaderships + termTransitionPreview.counts.classLeaderships }} 条管理职责。
                      <div
                        v-for="warning in termTransitionPreview.warnings"
                        :key="warning"
                        class="mt-2"
                      >
                        {{ warning }}
                      </div>
                    </v-alert>
                    <v-btn
                      block
                      class="mb-2"
                      :loading="termBusy"
                      variant="tonal"
                      @click="previewTermTransition"
                    >
                      预检迁移内容
                    </v-btn>
                    <v-btn
                      block
                      color="primary"
                      :loading="termBusy"
                      @click="cloneTerm"
                    >
                      建立草稿学期
                    </v-btn>
                    <v-alert
                      class="mt-4"
                      type="info"
                      variant="tonal"
                    >
                      新学期先以草稿创建。确认班级和教师分配后再启用；启用时旧学期会自动归档。
                    </v-alert>
                  </v-card-text>
                </v-card>
              </v-col>
              <v-col
                cols="12"
                lg="7"
              >
                <v-card class="rounded-xl">
                  <v-card-title class="pa-5">
                    全部学期
                  </v-card-title>
                  <v-list lines="three">
                    <template
                      v-for="term in selectedSchoolTerms"
                      :key="term.id"
                    >
                      <v-list-item
                        :subtitle="`${term.academicYear} 学年 · 第 ${term.semester} 学期${term.startsAt ? ` · ${term.startsAt.slice(0, 10)}` : ''}`"
                        :title="term.name"
                      >
                        <template #prepend>
                          <v-chip
                            :color="termStatusColor(term.status)"
                            size="small"
                            variant="tonal"
                          >
                            {{ termStatusName(term.status) }}
                          </v-chip>
                        </template>
                        <template #append>
                          <div class="d-flex ga-1">
                            <v-btn
                              v-if="term.status !== 'ACTIVE'"
                              color="success"
                              size="small"
                              variant="text"
                              @click="prepareTermActivation(term)"
                            >
                              启用
                            </v-btn>
                            <v-btn
                              v-if="term.status !== 'DRAFT'"
                              size="small"
                              variant="text"
                              @click="changeTermStatus(term, 'DRAFT')"
                            >
                              转为草稿
                            </v-btn>
                            <v-btn
                              v-if="term.status !== 'ARCHIVED'"
                              color="warning"
                              size="small"
                              variant="text"
                              @click="changeTermStatus(term, 'ARCHIVED')"
                            >
                              归档
                            </v-btn>
                          </div>
                        </template>
                      </v-list-item>
                      <v-divider />
                    </template>
                  </v-list>
                </v-card>
              </v-col>
            </v-row>
            <v-dialog
              v-model="termActivationDialog"
              max-width="760"
            >
              <v-card class="rounded-xl">
                <v-card-title class="pa-5 pb-2">
                  启用 {{ activationReadiness?.term?.name || "学期" }}
                </v-card-title>
                <v-card-text class="px-5 pb-2">
                  <v-alert
                    :type="activationReadiness?.ready ? 'success' : 'warning'"
                    variant="tonal"
                  >
                    <template v-if="activationReadiness?.ready">
                      启用前检查已通过。当前启用学期将归档，学生端将立即切换。
                    </template>
                    <template v-else>
                      发现 {{ activationReadiness?.blockingDiagnostics?.length || 0 }} 个阻断项。建议先修复；确需切换时可勾选强制启用。
                    </template>
                  </v-alert>
                  <v-list
                    v-if="activationReadiness?.blockingDiagnostics?.length"
                    class="my-3"
                    density="compact"
                  >
                    <v-list-item
                      v-for="(item, index) in activationReadiness.blockingDiagnostics"
                      :key="`${item.code}-${index}`"
                      prepend-icon="mdi-alert-circle"
                      :subtitle="item.code"
                      :title="item.message"
                    />
                  </v-list>
                  <v-divider class="my-4" />
                  <div class="text-body-2">
                    大屏迁移：可匹配 {{ activationReadiness?.mappedScreens || 0 }} 台，
                    无法匹配 {{ activationReadiness?.unmappedScreens?.length || 0 }} 台。
                  </div>
                  <v-switch
                    v-model="activationRebindScreens"
                    color="primary"
                    label="按行政班代码迁移大屏绑定"
                  />
                  <v-switch
                    v-if="activationReadiness && !activationReadiness.ready"
                    v-model="activationForce"
                    color="warning"
                    label="我已了解风险，强制启用"
                  />
                </v-card-text>
                <v-card-actions class="px-5 pb-5">
                  <v-spacer />
                  <v-btn
                    variant="text"
                    @click="termActivationDialog = false"
                  >
                    取消
                  </v-btn>
                  <v-btn
                    color="success"
                    :disabled="!activationReadiness?.ready && !activationForce"
                    :loading="termBusy"
                    @click="activateTerm"
                  >
                    确认切换学期
                  </v-btn>
                </v-card-actions>
              </v-card>
            </v-dialog>
          </template>
        </v-window-item>
      </v-window>
    </template>
    <AdminUndoSnackbar
      :busy="undoBusy"
      :offer="undoOffer"
      :remaining-seconds="remainingSeconds"
      @dismiss="clearUndo"
      @undo="undoAdminOperation"
    />
  </v-container>
</template>

<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from "vue";
import {registerAppReloadBlocker} from "@/utils/appReloadProtection";
import {onBeforeRouteLeave, useRoute, useRouter} from "vue-router";
import {screenAccountAccessAllowed} from "@/utils/screenTemporaryExit";
import ValidationReport from "@/components/v2/ValidationReport.vue";
import AdminUndoSnackbar from "@/components/admin/AdminUndoSnackbar.vue";
import AdminNavigationPanel from "@/components/admin/AdminNavigationPanel.vue";
import AdminScreenAccountPanel from "@/components/admin/AdminScreenAccountPanel.vue";
import {useScreenAccountManager} from "@/composables/admin/useScreenAccountManager";
import AdminHomeworkQuickInputs from "@/components/admin/AdminHomeworkQuickInputs.vue";
import AdminHomeworkQuickDeadlines from "@/components/admin/AdminHomeworkQuickDeadlines.vue";
import {useSchoolHomeworkSettings} from "@/composables/admin/useSchoolHomeworkSettings";
import {useAdminAccounts} from "@/composables/admin/useAdminAccounts";
import AdminAccountPanel from "@/components/admin/AdminAccountPanel.vue";
import AcademicStructureManager from "@/components/admin/AcademicStructureManager.vue";
import TeachingRelationshipOverview from "@/components/admin/TeachingRelationshipOverview.vue";
import StaffResponsibilityManager from "@/components/admin/StaffResponsibilityManager.vue";
import SchoolManagementOverview from "@/components/admin/SchoolManagementOverview.vue";
import AuditLogViewer from "@/components/admin/AuditLogViewer.vue";
import SchoolMigrationPanel from "@/components/admin/SchoolMigrationPanel.vue";
import {useTimedUndo} from "@/composables/useTimedUndo";
import {confirmAction} from "@/utils/actionDialog";
import {
  bootstrapSchoolAdministrator,
  classworksV2Api,
  describeApiError,
  getAccountTokens,
  getLocalAuthStatus,
  getOAuthProviders,
  loginWithSchoolAccount,
  recoverSchoolOwner,
  startOAuthLogin,
} from "@/utils/classworksV2Client";
const ADMIN_CONTEXT_KEY = "npclassworks-admin-context:v1";
const ADMIN_TABS = new Set(["overview", "structure", "organization", "teachers", "accounts", "screens", "migration", "audit", "terms"]);

function loadAdminContext() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_CONTEXT_KEY)) || {};
  } catch {
    return {};
  }
}

const route = useRoute();
const router = useRouter();
const savedAdminContext = loadAdminContext();
const requestedSchoolId = String(route.query.school || savedAdminContext.schoolId || "");
let requestedTermId = String(route.query.term || savedAdminContext.termId || "");

const signedIn = ref(Boolean(getAccountTokens().accessToken));
const providers = ref([]);
const publicSchools = ref([]);
const localAuthStatus = ref({bootstrapRequired: false, bootstrapAvailable: false});
const profile = ref(null);
const schoolMemberships = ref([]);
const adminMembershipsStatus = ref("idle");
const tab = ref(ADMIN_TABS.has(String(route.query.section || savedAdminContext.tab))
  ? String(route.query.section || savedAdminContext.tab)
  : "overview");
const errorMessage = ref("");
const successMessage = ref("");
const loginBusy = ref(false);
const loginSchoolCode = ref("");
const loginUsername = ref("");
const loginPassword = ref("");
const setupSchoolCode = ref("NEWFIRES-SCHOOL");
const setupName = ref("");
const setupUsername = ref("admin");
const setupPin = ref("");
const setupKey = ref("");
const recoveryUsername = ref("");
const recoveryPin = ref("");
const recoveryKey = ref("");

const organizationText = ref("");
const organizationTextSnapshot = ref("");
const organizationReport = ref(null);
const organizationBusy = ref(false);
const organizationAuthMode = ref("LOCAL_PIN");
const organizationAllowOAuth = ref(false);
const organizationSharedPassword = ref("");

const selectedSchoolId = ref("");
const selectedTermId = ref("");
const roster = ref(null);
const rosterBusy = ref(false);
const rosterSearch = ref("");
const teacherEmail = ref("");
const teacherUsername = ref("");
const teacherName = ref("");
const teacherPin = ref("");
const teacherRole = ref("TEACHER");
const selectedWorkspaceCodes = ref([]);
const batchMode = ref(false);
const assignmentBatchText = ref("");
const assignmentReport = ref(null);
const assignmentBusy = ref(false);
const recentCredentials = ref([]);

const homeworkSettingsManager = useSchoolHomeworkSettings({selectedSchoolId, errorMessage, successMessage});
const {loadSchoolHomeworkSettings, homeworkSettingsSnapshot, homeworkSettingsValue} = homeworkSettingsManager;
const {undoOffer, undoBusy, remainingSeconds, offerUndo, executeUndo, clearUndo} = useTimedUndo();
const screenManager = useScreenAccountManager({selectedSchoolId, errorMessage, successMessage, offerUndo});
const {loadScreenAccounts, hasUnsavedChanges: screenHasUnsavedChanges, startDutyPolling, stopDutyPolling} = screenManager;

const adminNavigationGroups = [
  {
    label: "日常管理",
    items: [
      {title: "管理总览", value: "overview", icon: "mdi-view-dashboard-outline"},
      {title: "组织与班级", value: "structure", icon: "mdi-school-outline"},
      {title: "教师分配", value: "teachers", icon: "mdi-human-male-board"},
      {title: "大屏设备", value: "screens", icon: "mdi-monitor-dashboard"},
    ],
  },
  {
    label: "学校配置",
    items: [
      {title: "账号与管理员", value: "accounts", icon: "mdi-account-key-outline"},
      {title: "高级批量导入", value: "organization", icon: "mdi-file-import-outline"},
    ],
  },
  {
    label: "运维与安全",
    items: [
      {title: "服务器迁移", value: "migration", icon: "mdi-server-network"},
      {title: "审计记录", value: "audit", icon: "mdi-text-box-search-outline"},
      {title: "学期运维", value: "terms", icon: "mdi-calendar-sync-outline"},
    ],
  },
];
const adminNavigationItems = adminNavigationGroups.flatMap((group) => group.items.map((item) => ({
  ...item,
  title: `${group.label} · ${item.title}`,
})));
const termBusy = ref(false);
const cloneSourceTermId = ref("");
const cloneTermName = ref("");
const cloneAcademicYear = ref(new Date().getFullYear());
const cloneSemester = ref(1);
const cloneStartsAt = ref("");
const cloneEndsAt = ref("");
const carryWorkspaceMembers = ref(true);
const carryTeachingAssignments = ref(true);
const carryLeaderships = ref(true);
const carryPendingInvitations = ref(false);
const termTransitionPreview = ref(null);
const termActivationDialog = ref(false);
const activationReadiness = ref(null);
const activationForce = ref(false);
const activationRebindScreens = ref(true);

const roleOptions = [
  {title: "教师", value: "TEACHER"},
  {title: "助教", value: "ASSISTANT"},
  {title: "只读查看", value: "VIEWER"},
];
const authModeOptions = [
  {title: "教师个人 PIN（推荐）", value: "LOCAL_PIN"},
  {title: "学校通用教师口令（极简）", value: "SHARED_PASSWORD"},
  {title: "OAuth 邮箱", value: "OAUTH_EMAIL"},
];
const publicSchoolOptions = computed(() => publicSchools.value.map((school) => ({
  title: school.name,
  value: school.code,
})));

const managerMemberships = computed(() => schoolMemberships.value.filter(
  (membership) => ["OWNER", "ADMIN"].includes(String(membership.role || "").toUpperCase()),
));
const adminAccessSummary = computed(() => {
  if (adminMembershipsStatus.value === "loading") return "正在核验学校管理权限";
  if (adminMembershipsStatus.value === "error") return "管理权限核验失败，请重试";
  return managerMemberships.value.length
    ? `管理 ${managerMemberships.value.length} 所学校`
    : "尚无学校管理员权限";
});
const schoolOptions = computed(() => managerMemberships.value.map((membership) => ({
  title: `${membership.school.name} · ${roleName(membership.role)}`,
  value: membership.school.id,
})));
const selectedSchool = computed(() => managerMemberships.value.find(
  (membership) => membership.school.id === selectedSchoolId.value,
));
const selectedTeacherAuthMode = computed(() => selectedSchool.value?.school.teacherAuthMode || "LOCAL_PIN");
const selectedSchoolTerms = computed(() => selectedSchool.value?.school.terms || []);
const {
  localAccounts,
  accountBusy,
  accountSearch,
  accountStatusFilter,
  newAdminUsername,
  newAdminName,
  newAdminPin,
  newAdminRole,
  accountStatusOptions,
  adminRoleOptions,
  filteredLocalAccounts,
  loadLocalAccounts,
  createAdministrator,
  resetAccountPin,
  setAccountDisabled,
  deactivateAccount,
  accountSummary,
} = useAdminAccounts({selectedSchoolId, selectedSchool, errorMessage, successMessage,
  recentCredentials, roleName, offerUndo, bootstrap, loadRoster});
const authModeDescription = computed(() => ({
  LOCAL_PIN: "每位教师使用短账号和个人 PIN。",
  SHARED_PASSWORD: "极简方案：每位教师仍有短账号，但全校共用一个口令。口令泄露后可冒用任意教师，请定期更换。",
  OAUTH_EMAIL: "使用邮箱预分配与 OAuth 登录，适合已有统一身份系统的学校。",
}[organizationAuthMode.value]));
const teacherAssignmentHelp = computed(() => selectedTeacherAuthMode.value === "OAUTH_EMAIL"
  ? "教师尚未登录也可以分配；其首次使用相同邮箱 OAuth 登录后会自动获得这些班级。"
  : selectedTeacherAuthMode.value === "SHARED_PASSWORD"
    ? "系统会立即创建教师短账号；教师使用学校通用口令登录。"
    : "系统会立即创建教师短账号；教师使用各自 PIN 登录，登录一次后默认可保持180天。");
const termOptions = computed(() => (selectedSchool.value?.school.terms || []).map((term) => ({
  title: `${term.name} · ${termStatusName(term.status)}`,
  value: term.id,
})));
const workspaceOptions = computed(() => (roster.value?.workspaces || []).map((workspace) => ({
  title: `${workspace.name} · ${workspace.code}${workspace.subject ? ` · ${workspace.subject.name}` : ""}`,
  value: workspace.code,
})));
const administrativeClassOptions = computed(() => (roster.value?.workspaces || [])
  .filter((workspace) => workspace.type === "ADMIN_CLASS")
  .map((workspace) => ({title: `${workspace.name} · ${workspace.code}`, value: workspace.id})));
const filteredRosterWorkspaces = computed(() => {
  const keyword = rosterSearch.value.toLowerCase();
  return (roster.value?.workspaces || []).filter((workspace) => !keyword || [
    workspace.name,
    workspace.code,
    workspace.subject?.name,
    ...workspace.members.flatMap((member) => [
      member.account?.name,
      member.account?.localUsername,
      member.account?.email,
    ]),
    ...workspace.pendingInvitations.map((invitation) => invitation.email),
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword)));
});
const currentSectionHasUnsavedChanges = computed(() => {
  // Quick settings are shared by the screen and teacher panels, and stay editable during saving.
  if (homeworkSettingsSnapshot.value && homeworkSettingsValue() !== homeworkSettingsSnapshot.value) return true;
  if (tab.value === "organization") return organizationText.value !== organizationTextSnapshot.value;
  if (tab.value === "teachers") {
    return Boolean(
      teacherEmail.value || teacherUsername.value || teacherName.value || teacherPin.value ||
      selectedWorkspaceCodes.value.length || assignmentBatchText.value.trim()
    );
  }
  if (tab.value === "accounts") {
    return Boolean(newAdminUsername.value || newAdminName.value || newAdminPin.value);
  }
  if (tab.value === "screens") return screenHasUnsavedChanges.value;
  return false;
});

async function confirmDiscardCurrentSection() {
  return !currentSectionHasUnsavedChanges.value || await confirmAction({
    title: "放弃未保存的修改？",
    message: "当前页面有尚未保存的内容。离开后，这些修改不会保留。",
    confirmText: "放弃并离开",
    color: "warning",
  });
}
const releaseReloadProtection = registerAppReloadBlocker(() => currentSectionHasUnsavedChanges.value
  && "学校管理页面有未保存的更改，请先保存或取消编辑，再刷新。");
onUnmounted(releaseReloadProtection);

async function navigateAdminTab(value) {
  if (!ADMIN_TABS.has(String(value)) || value === tab.value) return true;
  if (!await confirmDiscardCurrentSection()) return false;
  tab.value = value;
  return true;
}

const guardedTab = computed({
  get: () => tab.value,
  set: (value) => void navigateAdminTab(value),
});
const guardedSchoolId = computed({
  get: () => selectedSchoolId.value,
  set: async (value) => {
    if (value === selectedSchoolId.value || !await confirmDiscardCurrentSection()) return;
    selectedSchoolId.value = value;
  },
});
const guardedTermId = computed({
  get: () => selectedTermId.value,
  set: async (value) => {
    if (value === selectedTermId.value || !await confirmDiscardCurrentSection()) return;
    selectedTermId.value = value;
  },
});
function roleName(role) {
  return {OWNER: "所有者", ADMIN: "管理员", MANAGER: "管理", TEACHER: "教师", ASSISTANT: "助教", VIEWER: "只读"}[role] || role;
}

function teacherAccountLabel(account) {
  const name = account?.name || account?.email || account?.localUsername || "未命名教师";
  return account?.localUsername && account.localUsername !== name
    ? `${name} · @${account.localUsername}`
    : name;
}

function validationFromError(error) {
  return error?.response?.data?.data || null;
}

function parseOrganization() {
  try {
    const organization = JSON.parse(organizationText.value);
    organization.school = organization.school || {};
    organization.school.teacherAuth = {
      mode: organizationAuthMode.value,
      allowOAuthFallback: organizationAllowOAuth.value,
      ...(organizationSharedPassword.value
        ? {sharedPassword: organizationSharedPassword.value}
        : {}),
    };
    return organization;
  } catch (error) {
    throw new Error(`JSON 格式错误：${error.message}`);
  }
}

async function bootstrap() {
  errorMessage.value = "";
  try {
    [providers.value, publicSchools.value, localAuthStatus.value] = await Promise.all([
      getOAuthProviders(),
      classworksV2Api.schools(),
      getLocalAuthStatus(),
    ]);
    if (!loginSchoolCode.value && publicSchools.value.length) {
      loginSchoolCode.value = publicSchools.value[0].code;
    }
    if (!signedIn.value) return;
    adminMembershipsStatus.value = "loading";
    [profile.value, schoolMemberships.value] = await Promise.all([
      classworksV2Api.profile(),
      classworksV2Api.mySchools(),
    ]);
    adminMembershipsStatus.value = "loaded";
    if (!selectedSchoolId.value && managerMemberships.value.length) {
      selectedSchoolId.value = managerMemberships.value.some(
        (membership) => membership.school.id === requestedSchoolId,
      ) ? requestedSchoolId : managerMemberships.value[0].school.id;
    }
  } catch (error) {
    if (signedIn.value) adminMembershipsStatus.value = "error";
    errorMessage.value = describeApiError(error, "加载学校管理信息失败");
  }
}

async function loginAdministrator() {
  loginBusy.value = true;
  errorMessage.value = "";
  try {
    await loginWithSchoolAccount({
      schoolCode: loginSchoolCode.value,
      username: loginUsername.value,
      password: loginPassword.value,
    });
    signedIn.value = true;
    loginPassword.value = "";
    await bootstrap();
  } catch (error) {
    errorMessage.value = describeApiError(error, "管理员登录失败");
  } finally {
    loginBusy.value = false;
  }
}

async function createFirstAdministrator() {
  loginBusy.value = true;
  errorMessage.value = "";
  try {
    await bootstrapSchoolAdministrator({
      setupKey: setupKey.value,
      schoolCode: setupSchoolCode.value,
      username: setupUsername.value,
      name: setupName.value,
      pin: setupPin.value,
    });
    signedIn.value = true;
    setupKey.value = "";
    setupPin.value = "";
    successMessage.value = "首位管理员已创建；现在请载入模板并使用相同学校代码导入学校。";
    await bootstrap();
  } catch (error) {
    errorMessage.value = describeApiError(error, "创建首位管理员失败");
  } finally {
    loginBusy.value = false;
  }
}

async function recoverOwnerPin() {
  loginBusy.value = true;
  errorMessage.value = "";
  try {
    await recoverSchoolOwner({
      setupKey: recoveryKey.value,
      schoolCode: loginSchoolCode.value,
      username: recoveryUsername.value,
      newPin: recoveryPin.value,
    });
    recoveryKey.value = "";
    recoveryPin.value = "";
    successMessage.value = "OWNER PIN 已恢复，请使用新 PIN 登录。";
  } catch (error) {
    errorMessage.value = describeApiError(error, "恢复 OWNER PIN 失败");
  } finally {
    loginBusy.value = false;
  }
}

async function loadTemplate() {
  try {
    const template = await classworksV2Api.organizationTemplate();
    syncOrganizationAuth(template);
    organizationText.value = JSON.stringify(template, null, 2);
    organizationReport.value = null;
  } catch (error) {
    errorMessage.value = describeApiError(error, "载入模板失败");
  }
}

async function loadOrganizationFile(value) {
  const file = Array.isArray(value) ? value[0] : value;
  if (!file) return;
  const text = await file.text();
  try {
    const organization = JSON.parse(text);
    syncOrganizationAuth(organization);
    if (organization?.school?.teacherAuth) {
      delete organization.school.teacherAuth.sharedPassword;
    }
    organizationText.value = JSON.stringify(organization, null, 2);
  } catch {
    // JSON 语法错误会在“预检”时给出更明确的位置。
    organizationText.value = text;
  }
  organizationReport.value = null;
}

function syncOrganizationAuth(organization) {
  organizationAuthMode.value = organization?.school?.teacherAuth?.mode ||
    organization?.school?.teacherAuthMode ||
    "LOCAL_PIN";
  organizationAllowOAuth.value = organization?.school?.teacherAuth?.allowOAuthFallback === true ||
    organization?.school?.allowOAuthTeacherLogin === true;
  organizationSharedPassword.value = organization?.school?.teacherAuth?.sharedPassword || "";
}

async function validateOrganization() {
  organizationBusy.value = true;
  errorMessage.value = "";
  try {
    organizationReport.value = await classworksV2Api.importOrganization(parseOrganization(), true);
  } catch (error) {
    organizationReport.value = validationFromError(error);
    if (!organizationReport.value) errorMessage.value = describeApiError(error, "组织配置预检失败");
  } finally {
    organizationBusy.value = false;
  }
}

async function commitOrganization() {
  if (!await confirmAction({
    title: "导入组织配置？",
    message: "正式导入会更新代码相同的学校、学期和班级配置。",
    details: ["建议先查看预检结果", "现有同代码项目会按导入内容更新"],
    confirmText: "确认导入",
    color: "warning",
  })) return;
  organizationBusy.value = true;
  try {
    organizationReport.value = await classworksV2Api.importOrganization(parseOrganization(), false);
    organizationTextSnapshot.value = organizationText.value;
    organizationSharedPassword.value = "";
    successMessage.value = "学校组织配置导入成功";
    await bootstrap();
  } catch (error) {
    organizationReport.value = validationFromError(error);
    errorMessage.value = describeApiError(error, "正式导入失败");
  } finally {
    organizationBusy.value = false;
  }
}

function assignmentPayload() {
  if (batchMode.value) {
    let parsed;
    try {
      parsed = JSON.parse(assignmentBatchText.value);
    } catch (error) {
      throw new Error(`教师分配 JSON 格式错误：${error.message}`);
    }
    return {
      schoolId: selectedSchoolId.value,
      termId: selectedTermId.value,
      assignments: Array.isArray(parsed) ? parsed : parsed.assignments,
    };
  }
  return {
    schoolId: selectedSchoolId.value,
    termId: selectedTermId.value,
    assignments: [{
      ...(selectedTeacherAuthMode.value === "OAUTH_EMAIL"
        ? {email: teacherEmail.value}
        : {
            username: teacherUsername.value,
            name: teacherName.value,
            ...(selectedTeacherAuthMode.value === "LOCAL_PIN" ? {pin: teacherPin.value} : {}),
          }),
      role: teacherRole.value,
      workspaceCodes: selectedWorkspaceCodes.value,
    }],
  };
}

function fillAssignmentExample() {
  const codes = workspaceOptions.value.slice(0, 2).map((item) => item.value);
  const assignments = selectedTeacherAuthMode.value === "OAUTH_EMAIL"
    ? [
        {email: "teacher1@example.com", role: "TEACHER", workspaceCodes: codes},
        {email: "teacher2@example.com", role: "TEACHER", workspaceCodes: codes.slice(0, 1)},
      ]
    : [
        {
          username: "wangls",
          name: "王老师",
          ...(selectedTeacherAuthMode.value === "LOCAL_PIN" ? {pin: "260101"} : {}),
          role: "TEACHER",
          workspaceCodes: codes,
        },
        {
          username: "lils",
          name: "李老师",
          ...(selectedTeacherAuthMode.value === "LOCAL_PIN" ? {pin: "260102"} : {}),
          role: "TEACHER",
          workspaceCodes: codes.slice(0, 1),
        },
      ];
  assignmentBatchText.value = JSON.stringify({
    assignments,
  }, null, 2);
}

function importTeacherAssignments(payload, dryRun) {
  return selectedTeacherAuthMode.value === "OAUTH_EMAIL"
    ? classworksV2Api.importWorkspaceMemberships(payload, dryRun)
    : classworksV2Api.importLocalTeachers(payload, dryRun);
}

async function previewAssignment() {
  assignmentBusy.value = true;
  errorMessage.value = "";
  try {
    assignmentReport.value = await importTeacherAssignments(assignmentPayload(), true);
  } catch (error) {
    assignmentReport.value = validationFromError(error);
    if (!assignmentReport.value) errorMessage.value = describeApiError(error, "教师分配预检失败");
  } finally {
    assignmentBusy.value = false;
  }
}

async function commitAssignment() {
  assignmentBusy.value = true;
  try {
    const payload = assignmentPayload();
    assignmentReport.value = await importTeacherAssignments(payload, false);
    recentCredentials.value = selectedTeacherAuthMode.value === "OAUTH_EMAIL"
      ? []
      : payload.assignments.map((assignment) => ({
          school: selectedSchool.value?.school.name || "",
          name: assignment.name,
          username: assignment.username,
          pin: assignment.pin || "使用学校通用教师口令",
          workspaces: assignment.workspaceCodes.join("、"),
        }));
    successMessage.value = "教师教学空间分配成功";
    selectedWorkspaceCodes.value = [];
    teacherPin.value = "";
    if (batchMode.value) assignmentBatchText.value = "";
    await loadRoster();
  } catch (error) {
    assignmentReport.value = validationFromError(error);
    errorMessage.value = describeApiError(error, "教师分配失败");
  } finally {
    assignmentBusy.value = false;
  }
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  const blob = new window.Blob(["\uFEFF", csv], {type: "text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadRecentCredentials() {
  downloadCsv(
    "教师初始凭据.csv",
    ["学校", "姓名", "短账号", "初始PIN/登录说明", "教学空间代码"],
    recentCredentials.value.map((item) => [
      item.school,
      item.name,
      item.username,
      item.pin,
      item.workspaces,
    ]),
  );
}

async function loadRoster() {
  if (!selectedSchoolId.value || !selectedTermId.value) {
    roster.value = null;
    return;
  }
  rosterBusy.value = true;
  try {
    roster.value = await classworksV2Api.workspaceMemberships(
      selectedSchoolId.value,
      selectedTermId.value,
    );
  } catch (error) {
    roster.value = null;
    errorMessage.value = describeApiError(error, "加载教师名册失败");
  } finally {
    rosterBusy.value = false;
  }
}

async function removeMember(workspace, member) {
  if (!await confirmAction({
    title: "移除任课关系？",
    message: `将 ${teacherAccountLabel(member.account)} 从 ${workspace.name} 移除。`,
    confirmText: "确认移除",
    color: "warning",
  })) return;
  try {
    await classworksV2Api.removeWorkspaceMember(workspace.id, member.accountId);
    successMessage.value = "教师教学空间已移除";
    await loadRoster();
  } catch (error) {
    errorMessage.value = describeApiError(error, "移除教师失败");
  }
}

async function removeInvitation(workspace, invitation) {
  if (!await confirmAction({
    title: "取消待认领分配？",
    message: `${invitation.email} 将不再能认领 ${workspace.name}。`,
    confirmText: "确认取消",
    color: "warning",
  })) return;
  try {
    await classworksV2Api.removeWorkspaceInvitation(workspace.id, invitation.id);
    successMessage.value = "待认领分配已取消";
    await loadRoster();
  } catch (error) {
    errorMessage.value = describeApiError(error, "取消待认领分配失败");
  }
}

async function undoAdminOperation() {
  errorMessage.value = "";
  try {
    await executeUndo();
  } catch (error) {
    clearUndo();
    errorMessage.value = describeApiError(error, "撤销失败，数据可能已被其他管理员修改");
  }
}

function downloadAccountRoster() {
  downloadCsv(
    `${selectedSchool.value?.school.name || "学校"}-账号名册.csv`,
    ["姓名", "短账号", "学校角色", "状态", "最后登录", "当前教学空间"],
    localAccounts.value.map((account) => [
      account.name,
      account.username,
      account.schoolRole ? roleName(account.schoolRole) : "教师",
      account.disabled ? "停用" : "启用",
      account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString("zh-CN") : "从未登录",
      account.workspaces
        .filter((workspace) => workspace.term.status === "ACTIVE")
        .map((workspace) => workspace.name)
        .join("、"),
    ]),
  );
}

function termStatusName(status) {
  return {DRAFT: "草稿", ACTIVE: "启用", ARCHIVED: "已归档"}[status] || status;
}

function termStatusColor(status) {
  return {DRAFT: "warning", ACTIVE: "success", ARCHIVED: "grey"}[status] || "primary";
}

async function changeTermStatus(term, status) {
  const warning = status === "ACTIVE"
    ? "启用该学期会自动归档当前启用学期，学生端将立即切换。"
    : status === "ARCHIVED"
      ? "归档后学生端不再显示该学期。"
      : "转为草稿后学生端不再显示该学期。";
  if (!await confirmAction({
    title: `将学期设为${termStatusName(status)}？`,
    message: `将“${term.name}”设为${termStatusName(status)}。`,
    details: [warning],
    confirmText: `设为${termStatusName(status)}`,
    color: status === "ACTIVE" ? "success" : "warning",
  })) return;
  termBusy.value = true;
  try {
    await classworksV2Api.setTermStatus(term.id, status);
    successMessage.value = `学期已设为${termStatusName(status)}`;
    await bootstrap();
  } catch (error) {
    errorMessage.value = describeApiError(error, "更新学期状态失败");
  } finally {
    termBusy.value = false;
  }
}

function termTransitionInput() {
  return {
    name: cloneTermName.value,
    academicYear: cloneAcademicYear.value,
    semester: cloneSemester.value,
    startsAt: cloneStartsAt.value || null,
    endsAt: cloneEndsAt.value || null,
    carryWorkspaceMembers: carryWorkspaceMembers.value,
    carryTeachingAssignments: carryTeachingAssignments.value,
    carryLeaderships: carryLeaderships.value,
    carryPendingInvitations: carryPendingInvitations.value,
  };
}

async function previewTermTransition() {
  if (!cloneSourceTermId.value) {
    errorMessage.value = "请选择源学期";
    return;
  }
  termBusy.value = true;
  errorMessage.value = "";
  try {
    termTransitionPreview.value = await classworksV2Api.previewTermTransition(
      cloneSourceTermId.value,
      termTransitionInput(),
    );
  } catch (error) {
    termTransitionPreview.value = null;
    errorMessage.value = describeApiError(error, "学期迁移预检失败");
  } finally {
    termBusy.value = false;
  }
}

async function cloneTerm() {
  if (!cloneSourceTermId.value) {
    errorMessage.value = "请选择源学期";
    return;
  }
  if (!termTransitionPreview.value) {
    await previewTermTransition();
    if (!termTransitionPreview.value) return;
  }
  if (!await confirmAction({
    title: "建立新学期草稿？",
    message: "将按照当前迁移选项创建新学期草稿，创建后仍可继续调整。",
    confirmText: "创建草稿",
  })) return;
  termBusy.value = true;
  try {
    const result = await classworksV2Api.createTermTransition(cloneSourceTermId.value, termTransitionInput());
    successMessage.value = `已创建草稿学期：${result.name}，复制 ${result.workspaces} 个教学空间、${result.teachingAssignments} 条任课关系。`;
    await bootstrap();
    cloneSourceTermId.value = result.id;
    cloneTermName.value = "";
    termTransitionPreview.value = null;
  } catch (error) {
    errorMessage.value = describeApiError(error, "建立新学期失败");
  } finally {
    termBusy.value = false;
  }
}

async function prepareTermActivation(term) {
  termBusy.value = true;
  errorMessage.value = "";
  activationReadiness.value = null;
  activationForce.value = false;
  activationRebindScreens.value = true;
  try {
    activationReadiness.value = await classworksV2Api.termTransitionReadiness(term.id);
    termActivationDialog.value = true;
  } catch (error) {
    errorMessage.value = describeApiError(error, "学期启用检查失败");
  } finally {
    termBusy.value = false;
  }
}

async function activateTerm() {
  if (!activationReadiness.value?.term?.id) return;
  termBusy.value = true;
  errorMessage.value = "";
  try {
    const result = await classworksV2Api.activateTermTransition(activationReadiness.value.term.id, {
      force: activationForce.value,
      rebindScreens: activationRebindScreens.value,
    });
    successMessage.value = `已切换到${result.term.name}，迁移 ${result.reboundScreens} 台大屏。`;
    termActivationDialog.value = false;
    await bootstrap();
  } catch (error) {
    errorMessage.value = describeApiError(error, "启用学期失败");
  } finally {
    termBusy.value = false;
  }
}

watch(selectedSchoolId, () => {
  const activeTerm = selectedSchoolTerms.value.find((term) => term.status === "ACTIVE");
  const preferredTerm = selectedSchoolTerms.value.find((term) => term.id === requestedTermId);
  selectedTermId.value = preferredTerm?.id || activeTerm?.id || termOptions.value[0]?.value || "";
  requestedTermId = "";
  cloneSourceTermId.value = activeTerm?.id || termOptions.value[0]?.value || "";
  recentCredentials.value = [];
  loadLocalAccounts();
  loadScreenAccounts();
  loadSchoolHomeworkSettings();
});
watch(organizationText, () => {
  organizationReport.value = null;
});
watch([organizationAuthMode, organizationAllowOAuth, organizationSharedPassword], () => {
  organizationReport.value = null;
});
watch([
  teacherEmail,
  teacherUsername,
  teacherName,
  teacherPin,
  teacherRole,
  selectedWorkspaceCodes,
  batchMode,
  assignmentBatchText,
], () => {
  assignmentReport.value = null;
}, {deep: true});
watch(selectedTermId, () => {
  selectedWorkspaceCodes.value = [];
  assignmentReport.value = null;
  loadRoster();
});
watch(tab, (value) => {
  if (value === "accounts") loadLocalAccounts();
  if (value === "screens") {
    loadRoster();
    loadScreenAccounts();
    loadSchoolHomeworkSettings();
    startDutyPolling();
  } else {
    stopDutyPolling();
  }
});
watch([tab, selectedSchoolId, selectedTermId], ([section, schoolId, termId]) => {
  if (!signedIn.value || !schoolId) return;
  try {
    localStorage.setItem(ADMIN_CONTEXT_KEY, JSON.stringify({tab: section, schoolId, termId}));
  } catch {
    // URL state remains available when local storage is restricted.
  }
  const nextQuery = {...route.query, section, school: schoolId};
  if (termId) nextQuery.term = termId;
  else delete nextQuery.term;
  const unchanged = String(route.query.section || "") === section &&
    String(route.query.school || "") === schoolId &&
    String(route.query.term || "") === termId;
  if (!unchanged) void router.replace({query: nextQuery});
});
watch(() => route.query.section, (section) => {
  const value = String(section || "");
  if (!ADMIN_TABS.has(value) || value === tab.value) return;
  void navigateAdminTab(value).then((changed) => {
    if (!changed) void router.replace({query: {...route.query, section: tab.value}});
  });
});
watch(cloneSourceTermId, (termId) => {
  const source = selectedSchoolTerms.value.find((term) => term.id === termId);
  if (!source) return;
  const nextSemester = source.semester === 1 ? 2 : 1;
  const nextYear = source.semester === 1 ? source.academicYear : source.academicYear + 1;
  cloneAcademicYear.value = nextYear;
  cloneSemester.value = nextSemester;
  cloneTermName.value = `${nextYear}-${nextYear + 1}学年第${nextSemester === 1 ? "一" : "二"}学期`;
  termTransitionPreview.value = null;
});
watch([
  cloneTermName,
  cloneAcademicYear,
  cloneSemester,
  cloneStartsAt,
  cloneEndsAt,
  carryWorkspaceMembers,
  carryTeachingAssignments,
  carryLeaderships,
  carryPendingInvitations,
], () => {
  termTransitionPreview.value = null;
});
function warnBeforeUnload(event) {
  if (!currentSectionHasUnsavedChanges.value) return;
  event.preventDefault();
  event.returnValue = "";
}

onBeforeRouteLeave(() => !screenAccountAccessAllowed() || confirmDiscardCurrentSection());
onMounted(() => {
  window.addEventListener("beforeunload", warnBeforeUnload);
  bootstrap();
});
onUnmounted(() => {
  window.removeEventListener("beforeunload", warnBeforeUnload);
});
</script>

<style scoped>
.admin-page {
  max-width: 1500px;
}
.admin-navigation-panel {
  float: left;
  width: 260px;
}
.admin-mobile-page-switcher { display: none; }
.admin-content-with-navigation {
  margin-left: 280px;
  min-width: 0;
}

@media (max-width: 959px) {
  .admin-navigation-panel {
    float: none;
    margin-bottom: 20px;
    width: 100%;
  }
  .admin-mobile-page-switcher {
    background: rgba(var(--v-theme-surface), 0.96);
    display: block;
    padding: 8px;
    position: sticky;
    top: 72px;
    z-index: 5;
  }
  .admin-content-with-navigation { margin-left: 0; }
}

</style>
