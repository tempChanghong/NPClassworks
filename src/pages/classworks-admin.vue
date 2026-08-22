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
              仅限所有 OWNER 都无法登录时使用。恢复会让该账号的其他设备全部退出。
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
              {{ managerMemberships.length ? `管理 ${managerMemberships.length} 所学校` : '尚无学校管理员权限' }}
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

      <v-tabs
        v-model="tab"
        class="mb-5"
        color="primary"
      >
        <v-tab value="overview">
          管理总览
        </v-tab>
        <v-tab value="organization">
          组织与班级
        </v-tab>
        <v-tab value="structure">
          授课结构
        </v-tab>
        <v-tab value="teachers">
          教师分配
        </v-tab>
        <v-tab value="accounts">
          账号与管理员
        </v-tab>
        <v-tab value="screens">
          大屏设备
        </v-tab>
        <v-tab value="terms">
          学期运维
        </v-tab>
      </v-tabs>

      <v-window v-model="tab">
        <v-window-item value="overview">
          <v-alert
            v-if="!managerMemberships.length"
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
                      v-model="selectedSchoolId"
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
                      v-model="selectedTermId"
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
              @navigate="tab = $event"
            />
          </template>
        </v-window-item>
        <v-window-item value="organization">
          <v-card class="rounded-xl">
            <v-card-title class="d-flex align-center flex-wrap ga-2 pa-5">
              学校组织配置
              <v-spacer />
              <v-btn
                prepend-icon="mdi-file-document-outline"
                variant="tonal"
                @click="loadTemplate"
              >
                载入八班制模板
              </v-btn>
            </v-card-title>
            <v-card-text class="px-5 pb-5">
              <v-alert
                class="mb-4"
                type="info"
                variant="tonal"
              >
                模板保证一、二班物化生全部随行政班；三至八班的固定科目目前按“历史、物理、化学、生物、地理、政治”示例排列，正式导入前请按学校实际情况修改。
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
                hint="至少8个字符；首次导入必填，之后留空表示不更换；后端只保存 bcrypt 哈希"
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
            v-if="!managerMemberships.length"
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
                      v-model="selectedSchoolId"
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
                      v-model="selectedTermId"
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
            <TeachingRelationshipOverview
              v-if="selectedSchoolId && selectedTermId"
              :school-id="selectedSchoolId"
              :term-id="selectedTermId"
            />
            <AcademicStructureManager
              v-if="selectedSchoolId && selectedTermId"
              :school-id="selectedSchoolId"
              :term-id="selectedTermId"
            />
          </template>
        </v-window-item>

        <v-window-item value="teachers">
          <v-alert
            v-if="!managerMemberships.length"
            type="warning"
            variant="tonal"
          >
            如果这是全新实例，请先在“组织与班级”中导入首个学校；如果学校已经存在，请联系现有 OWNER 或 ADMIN 授权。
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
                      v-model="selectedSchoolId"
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
                      v-model="selectedTermId"
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

            <v-card class="mb-5 rounded-xl">
              <v-card-title class="d-flex align-center pa-5 pb-2">
                <v-icon
                  class="mr-3"
                  color="primary"
                  icon="mdi-lightning-bolt-outline"
                />
                作业快捷输入
              </v-card-title>
              <v-card-text class="px-5 pb-5">
                <p class="text-body-2 text-medium-emphasis mb-4">
                  教师端和班级大屏共用。未选择学科时表示全科通用；限定学科的词只在对应科目下出现，排列顺序与此处一致。
                </p>
                <v-row
                  v-for="(item, index) in homeworkQuickInputs"
                  :key="index"
                  align="center"
                  dense
                >
                  <v-col
                    cols="12"
                    sm="3"
                    md="2"
                  >
                    <v-text-field
                      v-model.trim="item.label"
                      density="comfortable"
                      hide-details="auto"
                      label="按钮名称"
                      maxlength="16"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col
                    cols="12"
                    sm="5"
                    md="3"
                  >
                    <v-text-field
                      v-model="item.text"
                      :disabled="item.insertMode === 'NEW_LINE'"
                      density="comfortable"
                      hide-details="auto"
                      label="插入内容"
                      maxlength="120"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col
                    cols="6"
                    sm="4"
                    md="2"
                  >
                    <v-text-field
                      v-model.trim="item.group"
                      density="comfortable"
                      hide-details="auto"
                      label="分组"
                      maxlength="16"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col
                    cols="6"
                    sm="4"
                    md="2"
                  >
                    <v-select
                      v-model="item.insertMode"
                      density="comfortable"
                      hide-details="auto"
                      :items="quickInputModeOptions"
                      item-title="title"
                      item-value="value"
                      label="操作"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col
                    cols="10"
                    sm="7"
                    md="2"
                  >
                    <v-select
                      v-model="item.subjectIds"
                      chips
                      closable-chips
                      density="comfortable"
                      hide-details="auto"
                      :items="homeworkQuickInputSubjects"
                      item-title="name"
                      item-value="id"
                      label="适用学科（空为全科）"
                      multiple
                      variant="outlined"
                    />
                  </v-col>
                  <v-col
                    class="d-flex justify-end"
                    cols="2"
                    sm="1"
                  >
                    <v-btn
                      icon="mdi-delete-outline"
                      title="删除此快捷词"
                      variant="text"
                      @click="homeworkQuickInputs.splice(index, 1)"
                    />
                  </v-col>
                </v-row>
                <v-alert
                  v-if="!homeworkQuickInputs.length"
                  class="mb-3"
                  type="info"
                  variant="tonal"
                >
                  当前已关闭快捷输入；保存后教师端和大屏将不显示快捷词。
                </v-alert>
                <div class="d-flex flex-wrap ga-2 mt-4">
                  <v-btn
                    :disabled="homeworkQuickInputs.length >= 64"
                    prepend-icon="mdi-plus"
                    variant="tonal"
                    @click="addHomeworkQuickInput"
                  >
                    添加快捷词
                  </v-btn>
                  <v-btn
                    prepend-icon="mdi-restore"
                    variant="text"
                    @click="resetHomeworkQuickInputs"
                  >
                    恢复默认
                  </v-btn>
                  <v-spacer />
                  <v-btn
                    color="primary"
                    :loading="homeworkSettingsBusy"
                    prepend-icon="mdi-content-save-outline"
                    @click="saveSchoolHomeworkSettings"
                  >
                    保存全校配置
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>

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
                  <v-list lines="three">
                    <template
                      v-for="workspace in roster?.workspaces || []"
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
                </v-card>
              </v-col>
            </v-row>
          </template>
        </v-window-item>

        <v-window-item value="accounts">
          <v-alert
            v-if="!managerMemberships.length"
            type="warning"
            variant="tonal"
          >
            请先完成学校初始化或取得 OWNER/ADMIN 权限。
          </v-alert>
          <template v-else>
            <v-card class="mb-5 rounded-xl">
              <v-card-text class="pa-5 d-flex align-center flex-wrap ga-3">
                <v-select
                  v-model="selectedSchoolId"
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
                  @click="downloadAccountRoster"
                >
                  导出账号名册
                </v-btn>
                <v-btn
                  v-if="recentCredentials.length"
                  prepend-icon="mdi-key-outline"
                  variant="tonal"
                  @click="downloadRecentCredentials"
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
                      v-model.trim="newAdminUsername"
                      label="管理员短账号"
                      variant="outlined"
                    />
                    <v-text-field
                      v-model.trim="newAdminName"
                      label="管理员姓名"
                      variant="outlined"
                    />
                    <v-text-field
                      v-model="newAdminPin"
                      hint="4～8位数字"
                      label="初始 PIN"
                      persistent-hint
                      type="password"
                      variant="outlined"
                    />
                    <v-select
                      v-model="newAdminRole"
                      :items="adminRoleOptions"
                      item-title="title"
                      item-value="value"
                      label="学校角色"
                      variant="outlined"
                    />
                    <v-btn
                      block
                      color="primary"
                      :loading="accountBusy"
                      @click="createAdministrator"
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
                      :loading="accountBusy"
                      icon="mdi-refresh"
                      variant="text"
                      @click="loadLocalAccounts"
                    />
                  </v-card-title>
                  <v-list lines="three">
                    <template
                      v-for="account in localAccounts"
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
                          <div class="d-flex flex-wrap ga-1 justify-end">
                            <v-btn
                              v-if="account.id !== profile?.id"
                              size="small"
                              variant="text"
                              @click="resetAccountPin(account)"
                            >
                              重置 PIN
                            </v-btn>
                            <v-btn
                              v-if="account.disabled"
                              color="success"
                              size="small"
                              variant="text"
                              @click="setAccountDisabled(account, false)"
                            >
                              启用
                            </v-btn>
                            <v-btn
                              v-else-if="account.id !== profile?.id"
                              color="warning"
                              size="small"
                              variant="text"
                              @click="setAccountDisabled(account, true)"
                            >
                              停用
                            </v-btn>
                            <v-btn
                              v-if="account.id !== profile?.id"
                              color="error"
                              size="small"
                              variant="text"
                              @click="deactivateAccount(account)"
                            >
                              注销权限
                            </v-btn>
                          </div>
                        </template>
                      </v-list-item>
                      <v-divider />
                    </template>
                  </v-list>
                  <v-empty-state
                    v-if="!localAccounts.length && !accountBusy"
                    icon="mdi-account-off-outline"
                    text="当前没有本地账号"
                  />
                </v-card>
              </v-col>
            </v-row>
          </template>
        </v-window-item>

        <v-window-item value="screens">
          <v-alert
            v-if="!managerMemberships.length"
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
                      v-model="selectedSchoolId"
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
                      v-model="selectedTermId"
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

            <v-card class="mb-5 rounded-xl">
              <v-card-title class="d-flex align-center pa-5 pb-2">
                <v-icon
                  class="mr-3"
                  color="primary"
                  icon="mdi-calendar-clock-outline"
                />
                作业快捷截止时间
              </v-card-title>
              <v-card-text class="px-5 pb-5">
                <p class="text-body-2 text-medium-emphasis mb-4">
                  全校班级大屏共用；支持按操作当天向后计算，也支持自动选择下一个指定星期。
                </p>
                <v-row
                  v-for="(preset, index) in homeworkQuickDeadlines"
                  :key="index"
                  align="center"
                  dense
                >
                  <v-col
                    cols="12"
                    md="5"
                  >
                    <v-text-field
                      v-model.trim="preset.label"
                      density="comfortable"
                      hide-details="auto"
                      label="按钮名称"
                      maxlength="16"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col
                    cols="7"
                    md="3"
                  >
                    <v-select
                      :model-value="quickDeadlineDateValue(preset)"
                      density="comfortable"
                      hide-details="auto"
                      :items="quickDeadlineDayOptions"
                      item-title="title"
                      item-value="value"
                      label="截止日期"
                      variant="outlined"
                      @update:model-value="updateQuickDeadlineDateRule(preset, $event)"
                    />
                  </v-col>
                  <v-col
                    cols="4"
                    md="3"
                  >
                    <v-text-field
                      v-model="preset.time"
                      density="comfortable"
                      hide-details="auto"
                      label="时间"
                      type="time"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col
                    class="d-flex justify-end"
                    cols="1"
                  >
                    <v-btn
                      :disabled="homeworkQuickDeadlines.length <= 1"
                      icon="mdi-delete-outline"
                      title="删除此快捷时间"
                      variant="text"
                      @click="homeworkQuickDeadlines.splice(index, 1)"
                    />
                  </v-col>
                </v-row>
                <div class="d-flex flex-wrap ga-2 mt-4">
                  <v-btn
                    :disabled="homeworkQuickDeadlines.length >= 8"
                    prepend-icon="mdi-plus"
                    variant="tonal"
                    @click="addHomeworkQuickDeadline"
                  >
                    添加时间
                  </v-btn>
                  <v-btn
                    prepend-icon="mdi-restore"
                    variant="text"
                    @click="resetHomeworkQuickDeadlines"
                  >
                    恢复默认
                  </v-btn>
                  <v-spacer />
                  <v-btn
                    color="primary"
                    :loading="homeworkSettingsBusy"
                    prepend-icon="mdi-content-save-outline"
                    @click="saveSchoolHomeworkSettings"
                  >
                    保存全校配置
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>

            <v-row>
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
                      :loading="screenBusy"
                      icon="mdi-refresh"
                      variant="text"
                      @click="loadScreenAccounts"
                    />
                  </v-card-title>
                  <v-list lines="three">
                    <template
                      v-for="screen in screenAccounts"
                      :key="screen.id"
                    >
                      <v-list-item
                        :subtitle="screenAccountSummary(screen)"
                        :title="screen.name"
                      >
                        <template #prepend>
                          <v-avatar :color="screen.isActive ? 'primary' : 'grey'">
                            <v-icon icon="mdi-monitor-dashboard" />
                          </v-avatar>
                        </template>
                        <template #append>
                          <div class="d-flex flex-wrap ga-1 justify-end">
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
                        </template>
                      </v-list-item>
                      <v-divider />
                    </template>
                  </v-list>
                  <v-empty-state
                    v-if="!screenAccounts.length && !screenBusy"
                    icon="mdi-monitor-off"
                    text="当前学校还没有大屏账号"
                  />
                </v-card>
              </v-col>
            </v-row>
          </template>

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
                  hint="留空表示不修改；修改 PIN 不会让已绑定设备退出"
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
        </v-window-item>

        <v-window-item value="terms">
          <template v-if="managerMemberships.length">
            <v-card class="mb-5 rounded-xl">
              <v-card-text class="pa-5">
                <v-select
                  v-model="selectedSchoolId"
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
  </v-container>
</template>

<script setup>
import {computed, onMounted, ref, watch} from "vue";
import ValidationReport from "@/components/v2/ValidationReport.vue";
import AcademicStructureManager from "@/components/admin/AcademicStructureManager.vue";
import TeachingRelationshipOverview from "@/components/admin/TeachingRelationshipOverview.vue";
import StaffResponsibilityManager from "@/components/admin/StaffResponsibilityManager.vue";
import SchoolManagementOverview from "@/components/admin/SchoolManagementOverview.vue";
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
import {
  DEFAULT_HOMEWORK_QUICK_DEADLINES,
  sanitizeHomeworkQuickDeadlines,
} from "@/utils/homeworkQuickDeadlines";
import {
  DEFAULT_HOMEWORK_QUICK_INPUTS,
  sanitizeHomeworkQuickInputs,
} from "@/utils/homeworkQuickInputs";

const signedIn = ref(Boolean(getAccountTokens().accessToken));
const providers = ref([]);
const publicSchools = ref([]);
const localAuthStatus = ref({bootstrapRequired: false, bootstrapAvailable: false});
const profile = ref(null);
const schoolMemberships = ref([]);
const tab = ref("overview");
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
const organizationReport = ref(null);
const organizationBusy = ref(false);
const organizationAuthMode = ref("LOCAL_PIN");
const organizationAllowOAuth = ref(false);
const organizationSharedPassword = ref("");

const selectedSchoolId = ref("");
const selectedTermId = ref("");
const roster = ref(null);
const rosterBusy = ref(false);
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

const localAccounts = ref([]);
const accountBusy = ref(false);
const newAdminUsername = ref("");
const newAdminName = ref("");
const newAdminPin = ref("");
const newAdminRole = ref("ADMIN");
const screenAccounts = ref([]);
const screenBusy = ref(false);
const homeworkSettingsBusy = ref(false);
const homeworkQuickDeadlines = ref(DEFAULT_HOMEWORK_QUICK_DEADLINES.map((item) => ({...item})));
const homeworkQuickInputs = ref(DEFAULT_HOMEWORK_QUICK_INPUTS.map((item) => ({...item, subjectIds: []})));
const homeworkQuickInputSubjects = ref([]);
const newScreenName = ref("");
const newScreenLoginCode = ref("");
const newScreenPin = ref("");
const newScreenAdministrativeClassId = ref("");
const screenEditDialog = ref(false);
const editingScreenId = ref("");
const screenEdit = ref({name: "", loginCode: "", pin: "", administrativeClassId: ""});

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
  {title: "OAuth 邮箱（兼容）", value: "OAUTH_EMAIL"},
];
const quickDeadlineDayOptions = [
  ...Array.from({length: 15}, (_, dayOffset) => ({
  title: dayOffset === 0 ? "当天" : dayOffset === 1 ? "明天" : dayOffset === 2 ? "后天" : `${dayOffset}天后`,
    value: `relative:${dayOffset}`,
  })),
  ...[1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    title: `下${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][weekday]}`,
    value: `next-weekday:${weekday}`,
  })),
];
const quickInputModeOptions = [
  {title: "插入文字", value: "INLINE"},
  {title: "换行", value: "NEW_LINE"},
];

const publicSchoolOptions = computed(() => publicSchools.value.map((school) => ({
  title: school.name,
  value: school.code,
})));

const managerMemberships = computed(() => schoolMemberships.value.filter(
  (membership) => ["OWNER", "ADMIN"].includes(membership.role),
));
const schoolOptions = computed(() => managerMemberships.value.map((membership) => ({
  title: `${membership.school.name} · ${roleName(membership.role)}`,
  value: membership.school.id,
})));
const selectedSchool = computed(() => managerMemberships.value.find(
  (membership) => membership.school.id === selectedSchoolId.value,
));
const selectedTeacherAuthMode = computed(() => selectedSchool.value?.school.teacherAuthMode || "LOCAL_PIN");
const selectedSchoolTerms = computed(() => selectedSchool.value?.school.terms || []);
const adminRoleOptions = computed(() => selectedSchool.value?.role === "OWNER"
  ? [
      {title: "管理员", value: "ADMIN"},
      {title: "学校所有者", value: "OWNER"},
    ]
  : [{title: "管理员", value: "ADMIN"}]);
const authModeDescription = computed(() => ({
  LOCAL_PIN: "推荐方案：每位教师使用短账号和个人 PIN。学生知道其他教师姓名也不能冒用。",
  SHARED_PASSWORD: "极简方案：每位教师仍有短账号，但全校共用一个口令。口令泄露后可冒用任意教师，请定期更换。",
  OAUTH_EMAIL: "兼容方案：沿用邮箱预分配与 OAuth 登录；适合已有统一身份系统的学校。",
}[organizationAuthMode.value]));
const teacherAssignmentHelp = computed(() => selectedTeacherAuthMode.value === "OAUTH_EMAIL"
  ? "教师尚未登录也可以分配；其首次使用相同邮箱 OAuth 登录后会自动获得这些班级。"
  : selectedTeacherAuthMode.value === "SHARED_PASSWORD"
    ? "系统会立即创建教师短账号；教师使用学校通用口令登录。"
    : "系统会立即创建教师短账号；教师使用各自 PIN 登录，登录一次后可保持30天。");
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
    [profile.value, schoolMemberships.value] = await Promise.all([
      classworksV2Api.profile(),
      classworksV2Api.mySchools(),
    ]);
    if (!selectedSchoolId.value && managerMemberships.value.length) {
      selectedSchoolId.value = managerMemberships.value[0].school.id;
    }
  } catch (error) {
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
  if (!window.confirm("正式导入会更新同代码学校、学期和班级配置，确定继续吗？")) return;
  organizationBusy.value = true;
  try {
    organizationReport.value = await classworksV2Api.importOrganization(parseOrganization(), false);
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
  if (!window.confirm(`从 ${workspace.name} 移除 ${teacherAccountLabel(member.account)}？`)) return;
  try {
    await classworksV2Api.removeWorkspaceMember(workspace.id, member.accountId);
    successMessage.value = "教师教学空间已移除";
    await loadRoster();
  } catch (error) {
    errorMessage.value = describeApiError(error, "移除教师失败");
  }
}

async function removeInvitation(workspace, invitation) {
  if (!window.confirm(`取消 ${invitation.email} 对 ${workspace.name} 的待认领分配？`)) return;
  try {
    await classworksV2Api.removeWorkspaceInvitation(workspace.id, invitation.id);
    successMessage.value = "待认领分配已取消";
    await loadRoster();
  } catch (error) {
    errorMessage.value = describeApiError(error, "取消待认领分配失败");
  }
}

async function loadLocalAccounts() {
  if (!selectedSchoolId.value) {
    localAccounts.value = [];
    return;
  }
  accountBusy.value = true;
  try {
    localAccounts.value = await classworksV2Api.localAccounts(selectedSchoolId.value);
  } catch (error) {
    localAccounts.value = [];
    errorMessage.value = describeApiError(error, "加载本地账号失败");
  } finally {
    accountBusy.value = false;
  }
}

async function loadScreenAccounts() {
  if (!selectedSchoolId.value) {
    screenAccounts.value = [];
    return;
  }
  screenBusy.value = true;
  try {
    screenAccounts.value = await classworksV2Api.classroomScreens(selectedSchoolId.value);
  } catch (error) {
    screenAccounts.value = [];
    errorMessage.value = describeApiError(error, "加载大屏账号失败");
  } finally {
    screenBusy.value = false;
  }
}

async function loadSchoolHomeworkSettings() {
  if (!selectedSchoolId.value) {
    resetHomeworkQuickDeadlines();
    resetHomeworkQuickInputs();
    homeworkQuickInputSubjects.value = [];
    return;
  }
  homeworkSettingsBusy.value = true;
  try {
    const [settings, subjects] = await Promise.all([
      classworksV2Api.schoolHomeworkSettings(selectedSchoolId.value),
      classworksV2Api.subjects(selectedSchoolId.value),
    ]);
    homeworkQuickDeadlines.value = sanitizeHomeworkQuickDeadlines(settings.quickDeadlines);
    homeworkQuickInputs.value = sanitizeHomeworkQuickInputs(settings.quickInputs);
    homeworkQuickInputSubjects.value = subjects;
  } catch (error) {
    errorMessage.value = describeApiError(error, "加载作业快捷时间失败");
  } finally {
    homeworkSettingsBusy.value = false;
  }
}

function addHomeworkQuickDeadline() {
  if (homeworkQuickDeadlines.value.length >= 8) return;
  homeworkQuickDeadlines.value.push({label: "新时间", dayOffset: 1, time: "17:30"});
}

function quickDeadlineDateValue(preset) {
  return preset.dateRule === "next-weekday"
    ? `next-weekday:${preset.weekday}`
    : `relative:${preset.dayOffset}`;
}

function updateQuickDeadlineDateRule(preset, value) {
  const [rule, rawValue] = String(value).split(":");
  if (rule === "next-weekday") {
    preset.dateRule = "next-weekday";
    preset.weekday = Number(rawValue);
    delete preset.dayOffset;
    return;
  }
  delete preset.dateRule;
  delete preset.weekday;
  preset.dayOffset = Number(rawValue);
}

function resetHomeworkQuickDeadlines() {
  homeworkQuickDeadlines.value = DEFAULT_HOMEWORK_QUICK_DEADLINES.map((item) => ({...item}));
}

function addHomeworkQuickInput() {
  if (homeworkQuickInputs.value.length >= 64) return;
  homeworkQuickInputs.value.push({label: "新词", text: "", group: "常用", subjectIds: [], insertMode: "INLINE"});
}

function resetHomeworkQuickInputs() {
  homeworkQuickInputs.value = DEFAULT_HOMEWORK_QUICK_INPUTS.map((item) => ({...item, subjectIds: []}));
}

async function saveSchoolHomeworkSettings() {
  const valid = homeworkQuickDeadlines.value.length >= 1 && homeworkQuickDeadlines.value.length <= 8 &&
    homeworkQuickDeadlines.value.every((preset) => (
      preset.label.trim() && preset.label.trim().length <= 16 &&
      (preset.dateRule === "next-weekday"
        ? Number.isInteger(preset.weekday) && preset.weekday >= 0 && preset.weekday <= 6
        : Number.isInteger(preset.dayOffset) && preset.dayOffset >= 0 && preset.dayOffset <= 14) &&
      /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(preset.time)
    ));
  if (!valid) {
    errorMessage.value = "请填写1至8个有效快捷时间，名称不超过16字，并选择有效的相对日期或下周星期。";
    return;
  }
  const quickInputsValid = homeworkQuickInputs.value.length <= 64 && homeworkQuickInputs.value.every((item) => (
    item.label?.trim() && item.label.trim().length <= 16 &&
    String(item.text || "").trim().length <= 120 && String(item.group || "").trim().length <= 16 &&
    ["INLINE", "NEW_LINE"].includes(item.insertMode) &&
    (item.insertMode === "NEW_LINE" || String(item.text || "").trim()) &&
    Array.isArray(item.subjectIds)
  ));
  if (!quickInputsValid) {
    errorMessage.value = "请检查快捷词：按钮名必填且不超过16字，普通快捷词必须填写插入内容。";
    return;
  }
  homeworkSettingsBusy.value = true;
  errorMessage.value = "";
  try {
    const settings = await classworksV2Api.updateSchoolHomeworkSettings(selectedSchoolId.value, {
      quickDeadlines: homeworkQuickDeadlines.value,
      quickInputs: homeworkQuickInputs.value,
    });
    homeworkQuickDeadlines.value = sanitizeHomeworkQuickDeadlines(settings.quickDeadlines);
    homeworkQuickInputs.value = sanitizeHomeworkQuickInputs(settings.quickInputs);
    successMessage.value = "全校作业快捷时间和快捷词已保存；教师端和大屏刷新后生效。";
  } catch (error) {
    errorMessage.value = describeApiError(error, "保存作业快捷时间失败");
  } finally {
    homeworkSettingsBusy.value = false;
  }
}

async function createScreenAccount() {
  screenBusy.value = true;
  errorMessage.value = "";
  try {
    const created = await classworksV2Api.createClassroomScreenAccount(selectedSchoolId.value, {
      name: newScreenName.value,
      loginCode: newScreenLoginCode.value,
      pin: newScreenPin.value,
      administrativeClassId: newScreenAdministrativeClassId.value,
    });
    newScreenName.value = "";
    newScreenLoginCode.value = "";
    newScreenPin.value = "";
    newScreenAdministrativeClassId.value = "";
    successMessage.value = `大屏账号 ${created.loginCode} 已创建，请在对应一体机上完成首次登录。`;
    await loadScreenAccounts();
  } catch (error) {
    errorMessage.value = describeApiError(error, "创建大屏账号失败");
  } finally {
    screenBusy.value = false;
  }
}

function openScreenEdit(screen) {
  editingScreenId.value = screen.id;
  screenEdit.value = {
    name: screen.name,
    loginCode: screen.loginCode || "",
    pin: "",
    administrativeClassId: screen.administrativeClassId,
  };
  screenEditDialog.value = true;
}

async function saveScreenAccount() {
  if (!editingScreenId.value) return;
  screenBusy.value = true;
  errorMessage.value = "";
  try {
    const input = {
      name: screenEdit.value.name,
      loginCode: screenEdit.value.loginCode,
      administrativeClassId: screenEdit.value.administrativeClassId,
    };
    if (screenEdit.value.pin) input.pin = screenEdit.value.pin;
    await classworksV2Api.updateClassroomScreenAccount(
      selectedSchoolId.value,
      editingScreenId.value,
      input,
    );
    screenEditDialog.value = false;
    successMessage.value = "大屏账号已更新。";
    await loadScreenAccounts();
  } catch (error) {
    errorMessage.value = describeApiError(error, "更新大屏账号失败");
  } finally {
    screenBusy.value = false;
  }
}

async function resetScreenDevice(screen) {
  if (!window.confirm(`重置 ${screen.name} 的设备绑定？原浏览器会立即退出，之后可用同一账号和 PIN 在新设备登录。`)) return;
  screenBusy.value = true;
  try {
    await classworksV2Api.resetClassroomScreenDevice(selectedSchoolId.value, screen.id);
    successMessage.value = "旧设备登录已失效，可以在新设备上重新登录。";
    await loadScreenAccounts();
  } catch (error) {
    errorMessage.value = describeApiError(error, "重置大屏设备失败");
  } finally {
    screenBusy.value = false;
  }
}

async function setScreenActive(screen, isActive) {
  const action = isActive ? "启用" : "停用";
  if (!window.confirm(`${action} ${screen.name}？${isActive ? "" : "停用后该设备将无法读取或修改作业。"}`)) return;
  screenBusy.value = true;
  try {
    await classworksV2Api.updateClassroomScreenAccount(selectedSchoolId.value, screen.id, {isActive});
    successMessage.value = `大屏账号已${action}。`;
    await loadScreenAccounts();
  } catch (error) {
    errorMessage.value = describeApiError(error, `${action}大屏账号失败`);
  } finally {
    screenBusy.value = false;
  }
}

function screenAccountSummary(screen) {
  const login = screen.loginCode ? `账号 ${screen.loginCode}` : "旧版绑定（需设置账号）";
  const device = screen.deviceFingerprint ? "设备已激活" : "等待设备首次登录";
  const status = screen.isActive ? "已启用" : "已停用";
  const lastUsed = screen.lastUsedAt
    ? `最后使用 ${new Date(screen.lastUsedAt).toLocaleString("zh-CN")}`
    : "尚未使用";
  return `${screen.administrativeClass?.name || "未绑定班级"} · ${login} · ${device} · ${status} · ${lastUsed}`;
}

async function createAdministrator() {
  accountBusy.value = true;
  errorMessage.value = "";
  try {
    await classworksV2Api.createLocalAdministrator(selectedSchoolId.value, {
      username: newAdminUsername.value,
      name: newAdminName.value,
      pin: newAdminPin.value,
      role: newAdminRole.value,
    });
    recentCredentials.value = [{
      school: selectedSchool.value?.school.name || "",
      name: newAdminName.value,
      username: newAdminUsername.value,
      pin: newAdminPin.value,
      workspaces: roleName(newAdminRole.value),
    }];
    newAdminUsername.value = "";
    newAdminName.value = "";
    newAdminPin.value = "";
    successMessage.value = "第二管理员已创建；可用账号管理工具栏的下载按钮导出本次凭据。";
    await Promise.all([bootstrap(), loadLocalAccounts()]);
  } catch (error) {
    errorMessage.value = describeApiError(error, "创建管理员失败");
  } finally {
    accountBusy.value = false;
  }
}

async function resetAccountPin(account) {
  const pin = window.prompt(`为 ${account.name || account.username} 设置新的4～8位数字 PIN：`);
  if (pin === null) return;
  try {
    await classworksV2Api.updateLocalAccount(selectedSchoolId.value, account.id, {pin});
    recentCredentials.value = [{
      school: selectedSchool.value?.school.name || "",
      name: account.name,
      username: account.username,
      pin,
      workspaces: "PIN 已重置",
    }];
    successMessage.value = "PIN 已重置，该账号的其他设备已退出。";
    await loadLocalAccounts();
  } catch (error) {
    errorMessage.value = describeApiError(error, "重置 PIN 失败");
  }
}

async function setAccountDisabled(account, disabled) {
  const action = disabled ? "停用" : "启用";
  if (!window.confirm(`${action} ${account.name || account.username}？${disabled ? "其当前会话将被撤销，但班级分配会保留。" : ""}`)) return;
  try {
    await classworksV2Api.updateLocalAccount(selectedSchoolId.value, account.id, {disabled});
    successMessage.value = `账号已${action}`;
    await loadLocalAccounts();
  } catch (error) {
    errorMessage.value = describeApiError(error, `${action}账号失败`);
  }
}

async function deactivateAccount(account) {
  if (!window.confirm(`注销 ${account.name || account.username} 在本校的全部管理和教学权限？发布历史会保留。`)) return;
  try {
    await classworksV2Api.deactivateLocalAccount(selectedSchoolId.value, account.id);
    successMessage.value = "账号已停用，学校与教学空间权限已移除。";
    await Promise.all([bootstrap(), loadLocalAccounts(), loadRoster()]);
  } catch (error) {
    errorMessage.value = describeApiError(error, "注销账号权限失败");
  }
}

function accountSummary(account) {
  const role = account.schoolRole ? roleName(account.schoolRole) : "教师";
  const status = account.disabled
    ? "已停用"
    : account.lockedUntil && new Date(account.lockedUntil) > new Date()
      ? `锁定至 ${new Date(account.lockedUntil).toLocaleString("zh-CN")}`
      : "可登录";
  const activeWorkspaces = account.workspaces.filter((workspace) => workspace.term.status === "ACTIVE");
  const lastLogin = account.lastLoginAt
    ? new Date(account.lastLoginAt).toLocaleString("zh-CN")
    : "从未登录";
  return `${role} · ${status} · 当前学期 ${activeWorkspaces.length} 个教学空间 · 最后登录 ${lastLogin}`;
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
  if (!window.confirm(`${warning}\n\n确定将“${term.name}”设为${termStatusName(status)}吗？`)) return;
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
  if (!window.confirm("将按当前选项建立新学期草稿。创建后可继续调整，确定继续吗？")) return;
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
  selectedTermId.value = activeTerm?.id || termOptions.value[0]?.value || "";
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
  }
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
watch(adminRoleOptions, (options) => {
  if (!options.some((option) => option.value === newAdminRole.value)) {
    newAdminRole.value = "ADMIN";
  }
});

onMounted(bootstrap);
</script>

<style scoped>
.admin-page {
  max-width: 1500px;
}
</style>
