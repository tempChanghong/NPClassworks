<template>
  <v-app>
    <v-main class="setup-page">
      <v-container
        class="py-8 py-md-12"
        max-width="1120"
      >
        <div class="setup-heading mb-7">
          <v-avatar
            color="primary"
            size="58"
            variant="tonal"
          >
            <v-icon
              icon="mdi-server-cog-outline"
              size="32"
            />
          </v-avatar>
          <div>
            <div class="text-overline text-primary font-weight-bold">
              NPCLASSWORKS KV
            </div>
            <h1 class="text-h4 font-weight-bold">
              实例首次配置
            </h1>
            <p class="text-body-1 text-medium-emphasis mb-0">
              先建立可登录的学校，再按实际掌握的资料逐步补充班级、教师和大屏。
            </p>
          </div>
        </div>

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
        <v-progress-linear
          v-if="loading"
          class="mb-5"
          indeterminate
          rounded
        />

        <v-card
          v-if="status?.state === 'COMPLETED'"
          class="rounded-xl pa-3"
          elevation="3"
        >
          <v-empty-state
            icon="mdi-check-decagram-outline"
            text="初始化入口已经锁定。请使用学校管理员账号继续管理学校。"
            title="实例已经完成初始化"
          >
            <template #actions>
              <v-btn
                color="primary"
                prepend-icon="mdi-view-dashboard-outline"
                to="/classworks-admin"
              >
                进入学校管理
              </v-btn>
              <v-btn
                prepend-icon="mdi-home-outline"
                to="/"
              >
                返回作业板
              </v-btn>
            </template>
          </v-empty-state>
        </v-card>

        <template v-else>
          <v-card
            class="rounded-xl mb-5"
            elevation="2"
          >
            <v-card-text class="pa-4 pa-md-5">
              <div class="stage-track">
                <button
                  v-for="(item, index) in stageItems"
                  :key="item.value"
                  class="stage-item"
                  :class="{active: stage === item.value, done: stage > item.value}"
                  :disabled="item.value > unlockedStage"
                  type="button"
                  @click="stage = item.value"
                >
                  <span>{{ stage > item.value ? '✓' : index + 1 }}</span><div>{{ item.title }}</div>
                </button>
              </div>
            </v-card-text>
          </v-card>

          <v-window v-model="stage">
            <v-window-item :value="1">
              <v-card
                class="rounded-xl"
                elevation="3"
              >
                <v-card-title class="pa-6 pb-2">
                  服务检查与初始化授权
                </v-card-title>
                <v-card-text class="pa-6 pt-3">
                  <v-list
                    class="check-list rounded-lg mb-5"
                    lines="two"
                  >
                    <v-list-item
                      v-for="check in status?.checks || []"
                      :key="check.code"
                      :prepend-icon="check.ok ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline'"
                      :title="check.message"
                    >
                      <template #append>
                        <v-chip
                          :color="check.ok ? 'success' : check.severity === 'ERROR' ? 'error' : 'warning'"
                          size="small"
                          variant="tonal"
                        >
                          {{ check.ok ? '正常' : check.severity === 'ERROR' ? '必须处理' : '建议处理' }}
                        </v-chip>
                      </template>
                    </v-list-item>
                  </v-list>
                  <v-alert
                    v-if="status?.state === 'CONFIGURING'"
                    class="mb-4"
                    type="info"
                    variant="tonal"
                  >
                    检测到未完成的初始化。验证部署密钥后可继续配置。
                  </v-alert>
                  <v-alert
                    v-if="statusLoadError"
                    class="mb-4"
                    type="error"
                    variant="tonal"
                  >
                    <div class="font-weight-medium mb-1">
                      无法连接 KV 后端
                    </div>
                    <div>{{ statusLoadError }}</div>
                    <div class="mt-2 text-body-2">
                      当前请求地址：{{ apiServerUrl }}
                    </div>
                    <v-btn
                      class="mt-3"
                      :loading="loading"
                      prepend-icon="mdi-refresh"
                      size="small"
                      variant="tonal"
                      @click="loadStatus"
                    >
                      重新检查
                    </v-btn>
                  </v-alert>
                  <v-alert
                    v-else-if="status && !status.canStart"
                    class="mb-4"
                    type="warning"
                    variant="tonal"
                  >
                    请部署人员先补齐服务器环境变量并重启 KV 后端，然后刷新本页。
                  </v-alert>
                  <v-text-field
                    v-model="setupKey"
                    :append-inner-icon="showSetupKey ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                    autocomplete="off"
                    label="BOOTSTRAP_SETUP_KEY"
                    :type="showSetupKey ? 'text' : 'password'"
                    variant="outlined"
                    @click:append-inner="showSetupKey = !showSetupKey"
                  />
                  <div class="text-body-2 text-medium-emphasis mb-5">
                    请输入服务器部署环境中的初始化密钥。验证后安装会话有效 15 分钟。
                  </div>
                  <v-btn
                    color="primary"
                    :disabled="!setupKey || !status?.canStart"
                    :loading="saving"
                    size="large"
                    @click="authorizeSetup"
                  >
                    验证并继续
                  </v-btn>
                </v-card-text>
              </v-card>
            </v-window-item>

            <v-window-item :value="2">
              <v-card
                class="rounded-xl"
                elevation="3"
              >
                <v-card-title class="pa-6 pb-2">
                  管理员、学校与学期
                </v-card-title>
                <v-card-text class="pa-6 pt-3">
                  <v-expansion-panels
                    v-if="status?.state === 'NEW'"
                    class="mb-5"
                  >
                    <v-expansion-panel>
                      <v-expansion-panel-title>
                        <div class="d-flex align-center ga-3">
                          <v-icon
                            color="primary"
                            icon="mdi-server-network"
                          />
                          <div>
                            <div class="font-weight-bold">
                              从旧服务器迁入整校数据
                            </div>
                            <div class="text-caption text-medium-emphasis">
                              选择学校管理员导出的 .npcw-transfer 加密文件
                            </div>
                          </div>
                        </div>
                      </v-expansion-panel-title>
                      <v-expansion-panel-text>
                        <v-alert
                          class="mb-4"
                          type="warning"
                          variant="tonal"
                        >
                          目标必须是空白实例。导入会恢复学校、账号、班级、作业通知和审计记录；网页登录会话失效，大屏需要使用原账号和 PIN 重新绑定。
                        </v-alert>
                        <v-file-input
                          v-model="migrationFile"
                          accept=".npcw-transfer,application/vnd.npclassworks.transfer+json"
                          label="迁移包"
                          prepend-icon="mdi-package-down"
                          show-size
                          variant="outlined"
                          @update:model-value="migrationPreview = null; migrationResult = null"
                        />
                        <v-text-field
                          v-model="migrationPassphrase"
                          :append-inner-icon="showMigrationPassphrase ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                          label="迁移密码"
                          :type="showMigrationPassphrase ? 'text' : 'password'"
                          variant="outlined"
                          @click:append-inner="showMigrationPassphrase = !showMigrationPassphrase"
                        />
                        <v-alert
                          v-if="migrationPreview"
                          class="mb-4"
                          type="success"
                          variant="tonal"
                        >
                          <div class="font-weight-bold mb-1">
                            {{ migrationPreview.manifest.school.name }}（{{ migrationPreview.manifest.school.code }}）
                          </div>
                          <div>
                            {{ migrationPreview.counts.accounts }} 个账号、{{ migrationPreview.counts.workspaces }} 个教学空间、
                            {{ migrationPreview.counts.publications }} 条作业或通知、{{ migrationPreview.counts.screens }} 台大屏。
                          </div>
                          <div
                            v-for="warning in migrationPreview.warnings || []"
                            :key="warning"
                            class="text-body-2 mt-1"
                          >
                            • {{ warning }}
                          </div>
                        </v-alert>
                        <div class="d-flex flex-wrap ga-3">
                          <v-btn
                            :disabled="!selectedMigrationFile || migrationPassphrase.length < 12"
                            :loading="saving"
                            prepend-icon="mdi-file-search-outline"
                            variant="tonal"
                            @click="previewMigration"
                          >
                            预检迁移包
                          </v-btn>
                          <v-btn
                            color="primary"
                            :disabled="!migrationPreview"
                            :loading="saving"
                            prepend-icon="mdi-database-import-outline"
                            @click="importMigration"
                          >
                            确认导入
                          </v-btn>
                        </div>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                  </v-expansion-panels>
                  <v-alert
                    v-if="status?.counts?.localAccounts"
                    class="mb-5"
                    type="info"
                    variant="tonal"
                  >
                    检测到已创建的首位管理员。本步骤会保留该账号，并补齐学校和学期。
                  </v-alert>
                  <div class="setup-section mb-5">
                    <div class="text-subtitle-1 font-weight-bold mb-3">
                      本次初始化深度
                    </div>
                    <v-radio-group
                      v-model="setupMode"
                      hide-details
                    >
                      <v-radio
                        color="primary"
                        label="快速上线（推荐）：先创建学校、管理员和学期，分班确定后再配置教师关系与大屏"
                        value="QUICK"
                      />
                      <v-radio
                        color="primary"
                        label="完整配置：继续导入班级、首批教师和大屏账号"
                        value="FULL"
                      />
                    </v-radio-group>
                  </div>
                  <v-row>
                    <v-col
                      cols="12"
                      md="7"
                    >
                      <v-text-field
                        v-model.trim="form.schoolName"
                        label="学校名称"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="5"
                    >
                      <v-text-field
                        v-model.trim="form.schoolCode"
                        hint="部署后不建议修改，例如 TJ2HS"
                        label="学校代码"
                        persistent-hint
                        variant="outlined"
                      />
                    </v-col>
                    <template v-if="!status?.counts?.localAccounts">
                      <v-col
                        cols="12"
                        md="3"
                      >
                        <v-text-field
                          v-model.trim="form.administratorName"
                          label="管理员姓名"
                          variant="outlined"
                        />
                      </v-col>
                      <v-col
                        cols="12"
                        md="3"
                      >
                        <v-text-field
                          v-model.trim="form.username"
                          label="管理员短账号"
                          variant="outlined"
                        />
                      </v-col>
                      <v-col
                        cols="12"
                        md="3"
                      >
                        <v-text-field
                          v-model="form.pin"
                          :append-inner-icon="showAdministratorPin ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                          append-icon="mdi-auto-fix"
                          :error-messages="form.pin && !/^\d{4,8}$/.test(form.pin) ? ['PIN 必须是4至8位数字'] : []"
                          inputmode="numeric"
                          label="管理员 PIN（4—8位数字）"
                          :type="showAdministratorPin ? 'text' : 'password'"
                          variant="outlined"
                          @click:append="generateNumericPin(form)"
                          @click:append-inner="showAdministratorPin = !showAdministratorPin"
                        />
                      </v-col>
                      <v-col
                        cols="12"
                        md="3"
                      >
                        <v-text-field
                          v-model="form.pinConfirm"
                          :error-messages="form.pinConfirm && form.pin !== form.pinConfirm ? ['两次输入的管理员 PIN 不一致'] : []"
                          inputmode="numeric"
                          label="再次输入管理员 PIN"
                          :type="showAdministratorPin ? 'text' : 'password'"
                          variant="outlined"
                        />
                      </v-col>
                    </template>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-select
                        v-model="form.teacherAuthMode"
                        :items="authModeOptions"
                        item-title="title"
                        item-value="value"
                        label="教师登录方式"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      v-if="form.teacherAuthMode === 'SHARED_PASSWORD'"
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model="form.sharedPassword"
                        :append-inner-icon="showSharedPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                        append-icon="mdi-auto-fix"
                        :error-messages="form.sharedPassword && (form.sharedPassword.length < 8 || form.sharedPassword.length > 64) ? ['通用口令需为8至64个字符'] : []"
                        label="学校通用教师密码（8—64位）"
                        :type="showSharedPassword ? 'text' : 'password'"
                        variant="outlined"
                        @click:append="generateSharedPassword"
                        @click:append-inner="showSharedPassword = !showSharedPassword"
                      />
                    </v-col>
                    <v-col
                      v-if="form.teacherAuthMode === 'SHARED_PASSWORD'"
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model="form.sharedPasswordConfirm"
                        :error-messages="form.sharedPasswordConfirm && form.sharedPassword !== form.sharedPasswordConfirm ? ['两次输入的通用教师密码不一致'] : []"
                        label="再次输入学校通用教师密码"
                        :type="showSharedPassword ? 'text' : 'password'"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col cols="12">
                      <v-switch
                        v-model="form.allowOAuthTeacherLogin"
                        color="primary"
                        hide-details
                        label="同时保留 OAuth 邮箱登录作为备用方式"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="5"
                    >
                      <v-text-field
                        v-model.trim="form.termName"
                        label="当前学期名称"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="6"
                      md="3"
                    >
                      <v-text-field
                        v-model.number="form.academicYear"
                        label="学年起始年份"
                        type="number"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="6"
                      md="4"
                    >
                      <v-select
                        v-model="form.semester"
                        :items="semesterOptions"
                        item-title="title"
                        item-value="value"
                        label="学期"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model="form.startsAt"
                        label="开始日期（可选）"
                        type="date"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model="form.endsAt"
                        label="结束日期（可选）"
                        type="date"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col cols="12">
                      <v-switch
                        v-model="form.createDefaultSubjects"
                        color="primary"
                        hide-details
                        label="创建语数英、物化生、史地政九个常用科目"
                      />
                    </v-col>
                  </v-row>
                  <v-alert
                    class="my-4"
                    type="info"
                    variant="tonal"
                  >
                    确认后开始创建学校和首个管理员账号。
                  </v-alert>
                  <div class="d-flex flex-wrap ga-3">
                    <v-btn
                      color="primary"
                      :disabled="!coreInputValid"
                      :loading="saving"
                      size="large"
                      @click="initializeCore"
                    >
                      创建核心数据
                    </v-btn><v-btn
                      variant="text"
                      @click="stage = 1"
                    >
                      返回
                    </v-btn>
                  </div>
                </v-card-text>
              </v-card>
            </v-window-item>

            <v-window-item :value="3">
              <v-card
                class="rounded-xl"
                elevation="3"
              >
                <v-card-title class="pa-6 pb-2">
                  组织与班级
                </v-card-title>
                <v-card-text class="pa-6 pt-3">
                  <v-alert
                    class="mb-5"
                    type="info"
                    variant="tonal"
                  >
                    已载入当前七班制参考方案：一、四班物化生，二班政治，三班物化；五至七班暂用化学、生物、地理表示“每班各定一科、合计二理一文”。具体对应仍可能变化，请按最终名单修改；尚未掌握分班情况时直接跳过最稳妥。
                  </v-alert>
                  <v-file-input
                    accept="application/json,.json"
                    class="mb-4"
                    clearable
                    label="导入组织配置 JSON 文件"
                    prepend-icon="mdi-file-upload-outline"
                    variant="outlined"
                    @update:model-value="loadOrganizationFile"
                  />
                  <v-textarea
                    v-model="organizationText"
                    auto-grow
                    class="organization-editor"
                    label="组织配置 JSON"
                    rows="14"
                    variant="outlined"
                    @update:model-value="organizationReport = null"
                  />
                  <validation-summary
                    v-if="organizationReport"
                    :report="organizationReport"
                  />
                  <div class="d-flex flex-wrap ga-3 mt-4">
                    <v-btn
                      color="primary"
                      :loading="saving"
                      prepend-icon="mdi-check-decagram-outline"
                      @click="validateOrganization"
                    >
                      预检配置
                    </v-btn>
                    <v-btn
                      :disabled="!organizationReport?.valid"
                      :loading="saving"
                      prepend-icon="mdi-database-import-outline"
                      variant="tonal"
                      @click="saveOrganization"
                    >
                      确认导入
                    </v-btn>
                    <v-btn
                      variant="text"
                      @click="goToStage(4)"
                    >
                      暂不配置
                    </v-btn>
                  </div>
                </v-card-text>
              </v-card>
            </v-window-item>

            <v-window-item :value="4">
              <v-card
                class="rounded-xl"
                elevation="3"
              >
                <v-card-title class="pa-6 pb-2">
                  首批教师账号与任课空间
                </v-card-title>
                <v-card-text class="pa-6 pt-3">
                  <v-alert
                    v-if="setupContext?.school?.teacherAuthMode === 'OAUTH_EMAIL'"
                    class="mb-5"
                    type="info"
                    variant="tonal"
                  >
                    当前学校使用 OAuth 邮箱登录。初始化完成后，可在学校后台按邮箱添加教师。
                  </v-alert>
                  <v-alert
                    v-if="setupContext?.school?.teacherAuthMode !== 'OAUTH_EMAIL' && !workspaceOptions.length"
                    class="mb-5"
                    type="info"
                    variant="tonal"
                  >
                    还没有班级或走班教学空间。现在仍可先创建教师登录账号，待分班确定后再到学校后台分配任课关系。
                  </v-alert>
                  <template v-if="setupContext?.school?.teacherAuthMode !== 'OAUTH_EMAIL'">
                    <v-btn-toggle
                      v-model="teacherImportMode"
                      class="mb-5"
                      color="primary"
                      mandatory
                      variant="outlined"
                    >
                      <v-btn value="FORM">
                        手动添加
                      </v-btn>
                      <v-btn value="JSON">
                        导入教师配置 JSON
                      </v-btn>
                    </v-btn-toggle>
                    <template v-if="teacherImportMode === 'FORM'">
                      <div
                        v-for="(teacher, index) in teachers"
                        :key="teacher.key"
                        class="teacher-row mb-4"
                      >
                        <div class="d-flex align-center justify-space-between mb-3">
                          <strong>教师 {{ index + 1 }}</strong><v-btn
                            v-if="teachers.length > 1"
                            icon="mdi-close"
                            size="small"
                            variant="text"
                            @click="teachers.splice(index, 1)"
                          />
                        </div>
                        <v-row>
                          <v-col
                            cols="12"
                            md="2"
                          >
                            <v-text-field
                              v-model.trim="teacher.name"
                              hide-details
                              label="姓名"
                              variant="outlined"
                            />
                          </v-col>
                          <v-col
                            cols="12"
                            md="2"
                          >
                            <v-text-field
                              v-model.trim="teacher.username"
                              :error-messages="teacherUsernameErrors(teacher)"
                              label="短账号"
                              variant="outlined"
                            />
                          </v-col>
                          <v-col
                            v-if="setupContext?.school?.teacherAuthMode === 'LOCAL_PIN'"
                            cols="12"
                            md="2"
                          >
                            <v-text-field
                              v-model="teacher.pin"
                              :append-inner-icon="teacher.showPin ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                              append-icon="mdi-auto-fix"
                              :error-messages="teacherPinErrors(teacher)"
                              inputmode="numeric"
                              label="PIN"
                              :type="teacher.showPin ? 'text' : 'password'"
                              variant="outlined"
                              @click:append="generateNumericPin(teacher)"
                              @click:append-inner="teacher.showPin = !teacher.showPin"
                            />
                          </v-col>
                          <v-col
                            v-if="setupContext?.school?.teacherAuthMode === 'LOCAL_PIN'"
                            cols="12"
                            md="2"
                          >
                            <v-text-field
                              v-model="teacher.pinConfirm"
                              :error-messages="teacher.pinConfirm && teacher.pin !== teacher.pinConfirm ? ['两次 PIN 不一致'] : []"
                              inputmode="numeric"
                              label="确认 PIN"
                              :type="teacher.showPin ? 'text' : 'password'"
                              variant="outlined"
                            />
                          </v-col>
                          <v-col
                            cols="12"
                            :md="setupContext?.school?.teacherAuthMode === 'LOCAL_PIN' ? 4 : 8"
                          >
                            <v-select
                              v-model="teacher.workspaceCodes"
                              chips
                              closable-chips
                              hide-details
                              :items="workspaceOptions"
                              item-title="title"
                              item-value="value"
                              label="任课班级/走班（可稍后分配）"
                              multiple
                              no-data-text="尚未创建班级，可留空"
                              variant="outlined"
                            />
                          </v-col>
                        </v-row>
                      </div>
                      <v-btn
                        class="mb-4"
                        prepend-icon="mdi-account-plus-outline"
                        variant="text"
                        @click="addTeacher"
                      >
                        继续添加教师
                      </v-btn>
                      <validation-summary
                        v-if="teacherReport"
                        :report="teacherReport"
                      />
                    </template>
                    <template v-else>
                      <v-alert
                        class="mb-4"
                        type="info"
                        variant="tonal"
                      >
                        可批量创建教师短账号、任课关系、年级组长和班主任职责。请填写学校、学期、科目和教学空间代码，并替换示例中的教师信息。
                      </v-alert>
                      <v-file-input
                        accept="application/json,.json"
                        class="mb-4"
                        clearable
                        label="导入教师配置 JSON 文件"
                        prepend-icon="mdi-account-arrow-up-outline"
                        variant="outlined"
                        @update:model-value="loadStaffConfigurationFile"
                      />
                      <v-textarea
                        v-model="staffConfigurationText"
                        auto-grow
                        class="organization-editor"
                        label="教师账号、任课与职责配置 JSON"
                        rows="16"
                        variant="outlined"
                        @update:model-value="staffConfigurationReport = null"
                      />
                      <validation-summary
                        v-if="staffConfigurationReport"
                        :report="staffConfigurationReport"
                      />
                    </template>
                  </template>
                  <div class="d-flex flex-wrap ga-3 mt-4">
                    <v-btn
                      v-if="setupContext?.school?.teacherAuthMode !== 'OAUTH_EMAIL' && teacherImportMode === 'FORM'"
                      color="primary"
                      :disabled="!teacherRowsValid"
                      :loading="saving"
                      prepend-icon="mdi-account-multiple-check-outline"
                      @click="saveTeachers"
                    >
                      预检并创建
                    </v-btn>
                    <template v-if="setupContext?.school?.teacherAuthMode !== 'OAUTH_EMAIL' && teacherImportMode === 'JSON'">
                      <v-btn
                        color="primary"
                        :loading="saving"
                        prepend-icon="mdi-check-decagram-outline"
                        @click="validateStaffConfiguration"
                      >
                        预检配置
                      </v-btn>
                      <v-btn
                        :disabled="!staffConfigurationReport?.valid"
                        :loading="saving"
                        prepend-icon="mdi-database-import-outline"
                        variant="tonal"
                        @click="saveStaffConfiguration"
                      >
                        确认导入
                      </v-btn>
                    </template>
                    <v-btn
                      variant="text"
                      @click="goToStage(5)"
                    >
                      暂不配置
                    </v-btn>
                  </div>
                </v-card-text>
              </v-card>
            </v-window-item>

            <v-window-item :value="5">
              <v-card
                class="rounded-xl"
                elevation="3"
              >
                <v-card-title class="pa-6 pb-2">
                  首个班级大屏账号
                </v-card-title>
                <v-card-text class="pa-6 pt-3">
                  <v-alert
                    class="mb-5"
                    type="info"
                    variant="tonal"
                  >
                    为行政班创建大屏账号。首次登录时，请在对应的班级一体机上完成设备绑定。
                  </v-alert>
                  <v-alert
                    v-if="!administrativeClassOptions.length"
                    class="mb-5"
                    type="warning"
                    variant="tonal"
                  >
                    配置行政班后即可创建大屏账号，本步骤可以稍后完成。
                  </v-alert>
                  <v-row v-else>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-select
                        v-model="screenForm.administrativeClassId"
                        :items="administrativeClassOptions"
                        item-title="title"
                        item-value="value"
                        label="所属行政班"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model.trim="screenForm.name"
                        label="大屏名称，例如 高二1班一体机"
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model.trim="screenForm.loginCode"
                        hint="3—32位字母、数字、点、横线或下划线"
                        label="大屏登录账号"
                        persistent-hint
                        variant="outlined"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model="screenForm.pin"
                        :append-inner-icon="showScreenPin ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                        append-icon="mdi-auto-fix"
                        :error-messages="screenForm.pin && !/^\d{4,8}$/.test(screenForm.pin) ? ['PIN 必须是4至8位数字'] : []"
                        inputmode="numeric"
                        label="大屏 PIN（4—8位数字）"
                        :type="showScreenPin ? 'text' : 'password'"
                        variant="outlined"
                        @click:append="generateNumericPin(screenForm)"
                        @click:append-inner="showScreenPin = !showScreenPin"
                      />
                    </v-col>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <v-text-field
                        v-model="screenForm.pinConfirm"
                        :error-messages="screenForm.pinConfirm && screenForm.pin !== screenForm.pinConfirm ? ['两次输入的大屏 PIN 不一致'] : []"
                        inputmode="numeric"
                        label="再次输入大屏 PIN"
                        :type="showScreenPin ? 'text' : 'password'"
                        variant="outlined"
                      />
                    </v-col>
                  </v-row>
                  <v-alert
                    v-if="screenCreated"
                    class="mb-4"
                    type="success"
                    variant="tonal"
                  >
                    大屏账号已创建，可以继续创建其他班级的大屏账号，或进入完成检查。
                  </v-alert>
                  <div class="d-flex flex-wrap ga-3 mt-4">
                    <v-btn
                      v-if="administrativeClassOptions.length"
                      color="primary"
                      :disabled="!screenInputValid"
                      :loading="saving"
                      prepend-icon="mdi-monitor-account"
                      @click="saveScreen"
                    >
                      创建大屏账号
                    </v-btn><v-btn
                      variant="text"
                      @click="goToStage(6)"
                    >
                      {{ screenCreated ? '完成大屏配置' : '暂不配置' }}
                    </v-btn>
                  </div>
                </v-card-text>
              </v-card>
            </v-window-item>

            <v-window-item :value="6">
              <SetupCompletionPanel
                v-model:acknowledged="credentialsAcknowledged"
                v-model:login="loginTest"
                v-model:show-secrets="showDeliverySecrets"
                :can-finish="canFinishSetup"
                :count-items="countItems"
                :credential-entries="credentialEntries"
                :credential-types="credentialTypes"
                :delivery-warning="deliveryWarning"
                :login-test-kind-options="loginTestKindOptions"
                :saving="saving"
                :setup-context="setupContext"
                :status="status"
                :verified-kinds="verifiedKinds"
                @copy-credential="copyCredential"
                @download-credentials="downloadCredentials"
                @finish="finishSetup"
                @return-to-configuration="stage = 3"
                @run-login-test="runLoginTest"
                @test-credential="testCredential"
              />
            </v-window-item>
          </v-window>
        </template>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import {computed, defineComponent, h, onBeforeUnmount, onMounted, reactive, ref} from "vue";
import {useRouter} from "vue-router";
import {completeInstanceSetup, createInstanceSetupScreen, createInstanceSetupSession, describeApiError, getInstanceSetupContext, getInstanceSetupOrganizationTemplate, getInstanceSetupStaffConfigurationTemplate, getInstanceSetupStatus, importInstanceMigration, importInstanceSetupOrganization, importInstanceSetupStaffConfiguration, importInstanceSetupTeachers, initializeInstanceCore, previewInstanceMigration, verifyInstanceSetupLogin} from "@/utils/classworksV2Client";
import {getServerUrl} from "@/utils/socketClient";
import SetupCompletionPanel from "@/components/setup/SetupCompletionPanel.vue";

const ValidationSummary = defineComponent({
  props: {report: {type: Object, required: true}},
  setup(props) {
    return () => h("div", {class: "validation-summary mt-4"}, [
      h("div", {class: props.report.valid ? "text-success" : "text-error"}, props.report.valid ? "校验通过" : "校验未通过"),
      ...(props.report.errors || []).map(item => h("div", {class: "text-body-2 text-error"}, `• ${item.message}`)),
      ...(props.report.warnings || []).map(item => h("div", {class: "text-body-2 text-warning"}, `• ${item.message}`)),
    ]);
  },
});

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
const status = ref(null);
const statusLoadError = ref("");
const apiServerUrl = getServerUrl();
const setupContext = ref(null);
const setupMode = ref("QUICK");
const stage = ref(1);
const unlockedStage = ref(1);
const setupKey = ref("");
const showSetupKey = ref(false);
const migrationFile = ref(null);
const migrationPassphrase = ref("");
const showMigrationPassphrase = ref(false);
const migrationPreview = ref(null);
const migrationResult = ref(null);
const organizationText = ref("");
const organizationReport = ref(null);
const teacherReport = ref(null);
const teacherImportMode = ref("FORM");
const staffConfigurationText = ref("");
const staffConfigurationReport = ref(null);
const screenCreated = ref(false);
const showAdministratorPin = ref(false);
const showSharedPassword = ref(false);
const showScreenPin = ref(false);
const showDeliverySecrets = ref(false);
const credentialsAcknowledged = ref(false);
const deliveryWarning = ref("");
const credentialEntries = reactive([]);
const verifiedKinds = reactive({OWNER: false, TEACHER: false, SCREEN: false});
const loginTest = reactive({kind: "OWNER", username: "", password: "", loading: false, message: "", error: ""});
let teacherKey = 0;
const teachers = reactive([]);
const now = new Date();
const schoolYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
const form = reactive({schoolName: "", schoolCode: "", administratorName: "", username: "admin", pin: "", pinConfirm: "", teacherAuthMode: "LOCAL_PIN", sharedPassword: "", sharedPasswordConfirm: "", allowOAuthTeacherLogin: false, termName: `${schoolYear}-${schoolYear + 1}学年第一学期`, academicYear: schoolYear, semester: 1, startsAt: "", endsAt: "", createDefaultSubjects: true});
const screenForm = reactive({administrativeClassId: "", name: "", loginCode: "", pin: "", pinConfirm: ""});
const stageItems = [{value: 1, title: "服务授权"}, {value: 2, title: "核心信息"}, {value: 3, title: "班级组织"}, {value: 4, title: "教师"}, {value: 5, title: "大屏"}, {value: 6, title: "完成"}];
const authModeOptions = [{title: "教师个人账号＋PIN（推荐）", value: "LOCAL_PIN"}, {title: "教师账号＋学校通用密码", value: "SHARED_PASSWORD"}, {title: "OAuth 邮箱登录", value: "OAUTH_EMAIL"}];
const semesterOptions = [{title: "第一学期", value: 1}, {title: "第二学期", value: 2}];
const countItems = computed(() => [
  {title: "行政班/走班", value: status.value?.counts?.workspaces || 0, icon: "mdi-google-classroom"},
  {title: "教师账号", value: status.value?.counts?.teacherAccounts || 0, icon: "mdi-account-key-outline"},
  {title: "教师任课关系", value: status.value?.counts?.teacherMemberships || 0, icon: "mdi-account-school-outline"},
  {title: "大屏账号", value: status.value?.counts?.screens || 0, icon: "mdi-monitor-account"},
  {title: "科目", value: status.value?.counts?.subjects || 0, icon: "mdi-book-open-page-variant-outline"},
]);
const workspaceOptions = computed(() => (setupContext.value?.workspaces || []).map(item => ({title: `${item.name}（${item.type === "ADMIN_CLASS" ? "行政班" : "走班"}）`, value: item.code})));
const administrativeClassOptions = computed(() => (setupContext.value?.workspaces || []).filter(item => item.type === "ADMIN_CLASS").map(item => ({title: item.name, value: item.id})));
const loginTestKindOptions = computed(() => [
  {title: "管理员账号", value: "OWNER"},
  ...(setupContext.value?.school?.teacherAuthMode !== "OAUTH_EMAIL" ? [{title: "教师账号", value: "TEACHER"}] : []),
  ...(status.value?.counts?.screens ? [{title: "大屏账号", value: "SCREEN"}] : []),
]);
const administratorPinValid = computed(() => /^\d{4,8}$/.test(form.pin) && form.pin === form.pinConfirm);
const sharedPasswordValid = computed(() => form.teacherAuthMode !== "SHARED_PASSWORD" || (form.sharedPassword.length >= 8 && form.sharedPassword.length <= 64 && form.sharedPassword === form.sharedPasswordConfirm));
const coreInputValid = computed(() => Boolean(form.schoolName.trim() && form.schoolCode.trim() && form.termName.trim() && sharedPasswordValid.value && (status.value?.counts?.localAccounts || (form.administratorName.trim() && form.username.trim() && administratorPinValid.value))));
const screenInputValid = computed(() => Boolean(screenForm.administrativeClassId && screenForm.name.trim() && /^[A-Za-z0-9._-]{3,32}$/.test(screenForm.loginCode.trim()) && /^\d{4,8}$/.test(screenForm.pin) && screenForm.pin === screenForm.pinConfirm));
const teacherRowsValid = computed(() => {
  const usernames = teachers.map(item => item.username.trim().toLowerCase());
  const uniqueUsernames = new Set(usernames.filter(Boolean)).size === usernames.filter(Boolean).length;
  const pins = teachers.map(item => item.pin).filter(Boolean);
  const uniquePins = setupContext.value?.school?.teacherAuthMode !== "LOCAL_PIN" || new Set(pins).size === pins.length;
  return uniqueUsernames && uniquePins && teachers.length > 0 && teachers.every(item => {
    const validIdentity = item.name.trim() && /^[a-z0-9][a-z0-9._-]{1,31}$/.test(item.username.trim().toLowerCase());
    const validPin = setupContext.value?.school?.teacherAuthMode !== "LOCAL_PIN" || (/^\d{4,8}$/.test(item.pin) && item.pin === item.pinConfirm);
    return validIdentity && validPin;
  });
});
const credentialTypes = {OWNER: "管理员", TEACHER: "教师", SCREEN: "大屏", SHARED_PASSWORD: "教师通用口令"};
const mustAcknowledgeCredentials = computed(() => credentialEntries.length > 0 && !credentialsAcknowledged.value);
const canFinishSetup = computed(() => verifiedKinds.OWNER && !mustAcknowledgeCredentials.value);
const selectedMigrationFile = computed(() => selectedFile(migrationFile.value));

function reportFromError(error) { return error?.response?.data?.data || {valid: false, errors: [{message: describeApiError(error, "校验失败")}], warnings: []}; }
function dateOnly(value) { return value ? String(value).slice(0, 10) : undefined; }
function adaptOrganizationTemplate(template, context) {
  const codeByName = new Map((context.subjects || []).map(subject => [subject.name, subject.code]));
  const oldNameByCode = new Map((template.subjects || []).map(subject => [subject.code, subject.name]));
  const mapCode = code => codeByName.get(oldNameByCode.get(code)) || code;
  return {
    ...template,
    school: {code: context.school.code, name: context.school.name, teacherAuth: {mode: context.school.teacherAuthMode, allowOAuthFallback: context.school.allowOAuthTeacherLogin}},
    term: {name: context.term.name, academicYear: context.term.academicYear, semester: context.term.semester, startsAt: dateOnly(context.term.startsAt), endsAt: dateOnly(context.term.endsAt), status: "ACTIVE"},
    subjects: (context.subjects || template.subjects).map(({code, name, category, sortOrder}) => ({code, name, category, sortOrder})),
    administrativeClasses: (template.administrativeClasses || []).map(item => ({...item, subjectRules: Object.fromEntries(Object.entries(item.subjectRules || {}).map(([code, mode]) => [mapCode(code), mode]))})),
    courseGroups: (template.courseGroups || []).map(item => ({...item, subject: mapCode(item.subject)})),
  };
}
function adaptStaffConfigurationTemplate(template, context) {
  const subjectCodeByName = new Map((context.subjects || []).map(subject => [subject.name, subject.code]));
  const templateSubjectNameByCode = new Map([
    ["CHN", "语文"], ["MATH", "数学"], ["ENG", "英语"], ["PHY", "物理"], ["CHE", "化学"],
    ["BIO", "生物"], ["HIS", "历史"], ["GEO", "地理"], ["POL", "政治"],
  ]);
  const mapSubjectCode = code => subjectCodeByName.get(templateSubjectNameByCode.get(code)) || code;
  const availableWorkspaceCodes = new Set((context.workspaces || []).map(workspace => workspace.code));
  const teachers = (template.teachers || []).map(teacher => ({
    ...teacher,
    credential: context.school.teacherAuthMode === "SHARED_PASSWORD"
      ? {mode: "SHARED_PASSWORD"}
      : teacher.credential,
    teachingAssignments: (teacher.teachingAssignments || [])
      .filter(assignment => availableWorkspaceCodes.has(assignment.workspaceCode))
      .map(assignment => ({...assignment, subjectCode: mapSubjectCode(assignment.subjectCode)})),
    responsibilities: {
      gradeLeaderships: (teacher.responsibilities?.gradeLeaderships || [])
        .filter(item => (context.grades || []).some(grade => grade.code === item.gradeCode)),
      classLeaderships: (teacher.responsibilities?.classLeaderships || [])
        .filter(item => availableWorkspaceCodes.has(item.classCode)),
    },
  }));
  return {
    schemaVersion: 1,
    schoolCode: context.school.code,
    term: {academicYear: context.term.academicYear, semester: context.term.semester},
    teachers,
  };
}
function selectedFile(value) {
  return Array.isArray(value) ? value[0] : value;
}
async function readJsonFile(value, onText, onError) {
  const file = selectedFile(value);
  if (!file) return;
  try {
    const text = await file.text();
    JSON.parse(text);
    onText(text);
  } catch (error) {
    onError(`无法读取 JSON 文件：${error.message}`);
  }
}
async function loadOrganizationFile(value) {
  await readJsonFile(value, text => {
    organizationText.value = text;
    organizationReport.value = null;
  }, message => {
    organizationReport.value = {valid: false, errors: [{message}], warnings: []};
  });
}
async function loadStaffConfigurationFile(value) {
  await readJsonFile(value, text => {
    staffConfigurationText.value = text;
    staffConfigurationReport.value = null;
  }, message => {
    staffConfigurationReport.value = {valid: false, errors: [{message}], warnings: []};
  });
}
function addTeacher() { teachers.push({key: ++teacherKey, name: "", username: "", pin: "", pinConfirm: "", showPin: false, workspaceCodes: []}); }
function generateNumericPin(target, confirmationKey = "pinConfirm") {
  const usedPins = new Set(teachers.filter(item => item !== target).map(item => item.pin).filter(Boolean));
  let pin;
  do {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    pin = String(100000 + (values[0] % 900000));
  } while (usedPins.has(pin));
  target.pin = pin;
  target[confirmationKey] = target.pin;
}
function teacherUsernameErrors(teacher) {
  const username = teacher.username.trim().toLowerCase();
  if (teacher.username && !/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) return ["需为2至32位小写字母、数字、点、横线或下划线"];
  if (username && teachers.filter(item => item.username.trim().toLowerCase() === username).length > 1) return ["该短账号在本批次中重复"];
  return [];
}
function teacherPinErrors(teacher) {
  if (teacher.pin && !/^\d{4,8}$/.test(teacher.pin)) return ["需为4至8位数字"];
  if (teacher.pin && teachers.filter(item => item.pin === teacher.pin).length > 1) return ["该 PIN 在本批次中重复，请为教师分配不同 PIN"];
  return [];
}
function generateSharedPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const values = new Uint32Array(14);
  window.crypto.getRandomValues(values);
  form.sharedPassword = [...values].map(value => alphabet[value % alphabet.length]).join("");
  form.sharedPasswordConfirm = form.sharedPassword;
}
function rememberCredential(entry) {
  const existing = credentialEntries.findIndex(item => item.id === entry.id);
  if (existing >= 0) credentialEntries.splice(existing, 1, entry);
  else credentialEntries.push(entry);
  credentialsAcknowledged.value = false;
}
function clearCredentialMemory() {
  credentialEntries.splice(0);
  loginTest.password = "";
}
function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function credentialCsv() {
  const rows = [["类型", "名称", "学校代码", "账号", "凭据类型", "初始凭据", "说明"], ...credentialEntries.map(item => [credentialTypes[item.kind] || item.kind, item.name, item.schoolCode, item.username, item.secretLabel, item.secret, item.detail || ""])];
  return `\uFEFF${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}`;
}
function downloadCredentials() {
  const blob = new window.Blob([credentialCsv()], {type: "text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${setupContext.value?.school?.code || form.schoolCode || "NPClassworks"}-首次账号凭据.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
async function copyCredential(item) {
  await navigator.clipboard.writeText(`${item.name}\n学校代码：${item.schoolCode}\n账号：${item.username}\n${item.secretLabel}：${item.secret}`);
}
function useCredentialForTest(item) {
  loginTest.kind = item.kind === "SHARED_PASSWORD" ? "TEACHER" : item.kind;
  loginTest.username = item.username;
  loginTest.password = item.secret;
  loginTest.message = "";
  loginTest.error = "";
}
async function testCredential(item) {
  useCredentialForTest(item);
  await runLoginTest();
}
async function loadStatus() {
  loading.value = true;
  statusLoadError.value = "";
  try {
    status.value = await getInstanceSetupStatus();
  } catch (error) {
    status.value = null;
    statusLoadError.value = describeApiError(error, "请检查 API 域名、HTTPS 反向代理和 CORS 配置");
  } finally {
    loading.value = false;
  }
}
async function loadSetupResources(forceOrganizationTemplate = false, forceStaffTemplate = false) {
  const [context, template, staffTemplate] = await Promise.all([getInstanceSetupContext(), getInstanceSetupOrganizationTemplate(), getInstanceSetupStaffConfigurationTemplate()]);
  setupContext.value = context;
  if (!organizationText.value || forceOrganizationTemplate) organizationText.value = JSON.stringify(adaptOrganizationTemplate(template, context), null, 2);
  if (!staffConfigurationText.value || forceStaffTemplate) staffConfigurationText.value = JSON.stringify(adaptStaffConfigurationTemplate(staffTemplate, context), null, 2);
  if (!teachers.length) addTeacher();
}
async function authorizeSetup() {
  saving.value = true;
  errorMessage.value = "";
  try {
    await createInstanceSetupSession(setupKey.value);
    setupKey.value = "";
    if (status.value?.counts?.owners && status.value?.counts?.activeTerms) {
      await loadSetupResources(true);
      stage.value = status.value?.counts?.workspaces ? (status.value?.counts?.teacherAccounts ? 5 : 4) : 3;
      unlockedStage.value = Math.max(3, stage.value);
    } else { stage.value = 2; unlockedStage.value = 2; }
  } catch (error) { errorMessage.value = describeApiError(error, "初始化密钥验证失败"); } finally { saving.value = false; }
}
async function previewMigration() {
  if (!selectedMigrationFile.value) return;
  saving.value = true;
  errorMessage.value = "";
  migrationPreview.value = null;
  try {
    migrationPreview.value = await previewInstanceMigration(selectedMigrationFile.value, migrationPassphrase.value);
  } catch (error) {
    errorMessage.value = describeApiError(error, "迁移包预检失败");
  } finally {
    saving.value = false;
  }
}
async function importMigration() {
  if (!selectedMigrationFile.value || !migrationPreview.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    migrationResult.value = await importInstanceMigration(selectedMigrationFile.value, migrationPassphrase.value);
    migrationPassphrase.value = "";
    migrationFile.value = null;
    migrationPreview.value = null;
    deliveryWarning.value = `已导入 ${migrationResult.value.school.name}。原账号 PIN 保持不变；所有用户需要重新登录，${migrationResult.value.screensRequireRebind} 台大屏需要重新绑定。`;
    await Promise.all([loadStatus(), loadSetupResources()]);
    loginTest.kind = "OWNER";
    loginTest.username = "";
    loginTest.password = "";
    goToStage(6);
  } catch (error) {
    errorMessage.value = describeApiError(error, "学校数据导入失败");
  } finally {
    saving.value = false;
  }
}
async function initializeCore() {
  if (!coreInputValid.value) {
    errorMessage.value = "请先补全信息，并确认两次输入的管理员或教师登录凭据一致";
    return;
  }
  saving.value = true;
  errorMessage.value = "";
  try {
    const administratorPin = form.pin;
    const sharedPassword = form.sharedPassword;
    const result = await initializeInstanceCore({...form});
    rememberCredential({id: `owner:${result.account.username}`, kind: "OWNER", name: result.account.name, schoolCode: result.school.code, username: result.account.username, secretLabel: "管理员 PIN", secret: administratorPin, detail: "学校首位所有者"});
    if (form.teacherAuthMode === "SHARED_PASSWORD") {
      rememberCredential({id: "shared-password", kind: "SHARED_PASSWORD", name: "全校教师通用口令", schoolCode: result.school.code, username: "（配合各教师短账号使用）", secretLabel: "通用教师口令", secret: sharedPassword, detail: "请仅交给教师，不要张贴在班级大屏旁"});
    }
    useCredentialForTest(credentialEntries.find(item => item.kind === "OWNER"));
    form.pin = ""; form.pinConfirm = ""; form.sharedPassword = ""; form.sharedPasswordConfirm = "";
    await Promise.all([loadStatus(), loadSetupResources(true)]);
    if (setupMode.value === "QUICK") goToStage(6);
    else goToStage(3);
  } catch (error) { errorMessage.value = describeApiError(error, "核心初始化失败"); } finally { saving.value = false; }
}
function parsedOrganization() {
  try { return JSON.parse(organizationText.value); } catch (error) { organizationReport.value = {valid: false, errors: [{message: `JSON 格式错误：${error.message}`}], warnings: []}; return null; }
}
async function validateOrganization() {
  const document = parsedOrganization();
  if (!document) return;
  saving.value = true;
  try { organizationReport.value = await importInstanceSetupOrganization(document, true); } catch (error) { organizationReport.value = reportFromError(error); } finally { saving.value = false; }
}
async function saveOrganization() {
  const document = parsedOrganization();
  if (!document) return;
  saving.value = true; errorMessage.value = "";
  try { await importInstanceSetupOrganization(document, false); await Promise.all([loadStatus(), loadSetupResources(false, true)]); goToStage(4); } catch (error) { organizationReport.value = reportFromError(error); errorMessage.value = describeApiError(error, "组织配置导入失败"); } finally { saving.value = false; }
}
async function saveTeachers() {
  if (!teacherRowsValid.value) {
    errorMessage.value = "请检查教师短账号和两次输入的 PIN；同一批次不能使用重复账号或重复 PIN";
    return;
  }
  const assignments = teachers.map(({name, username, pin, workspaceCodes}) => ({name, username, pin, workspaceCodes, role: "TEACHER"}));
  saving.value = true; errorMessage.value = "";
  try {
    teacherReport.value = await importInstanceSetupTeachers({assignments}, true);
    if (!teacherReport.value.valid) return;
    teacherReport.value = await importInstanceSetupTeachers({assignments}, false);
    const sharedSecret = credentialEntries.find(item => item.kind === "SHARED_PASSWORD")?.secret || "";
    assignments.forEach(item => {
      const secret = setupContext.value.school.teacherAuthMode === "LOCAL_PIN" ? item.pin : sharedSecret;
      if (!secret) {
        deliveryWarning.value = "教师账号已经创建，但本次恢复的安装会话中没有学校通用教师口令明文，因此无法重新导出该口令。请使用部署时保存的口令，遗忘时在管理后台重置。";
        return;
      }
      rememberCredential({
        id: `teacher:${item.username.toLowerCase()}`,
        kind: "TEACHER",
        name: item.name,
        schoolCode: setupContext.value.school.code,
        username: item.username.toLowerCase(),
        secretLabel: setupContext.value.school.teacherAuthMode === "LOCAL_PIN" ? "个人 PIN" : "学校通用教师口令",
        secret,
        detail: item.workspaceCodes.length ? item.workspaceCodes.join("、") : "尚未分配任课空间",
      });
    });
    teachers.forEach(item => { item.pin = ""; item.pinConfirm = ""; });
    await Promise.all([loadStatus(), loadSetupResources()]); goToStage(5);
  } catch (error) { teacherReport.value = reportFromError(error); } finally { saving.value = false; }
}
function parsedStaffConfiguration() {
  try {
    return JSON.parse(staffConfigurationText.value);
  } catch (error) {
    staffConfigurationReport.value = {valid: false, errors: [{message: `JSON 格式错误：${error.message}`}], warnings: []};
    return null;
  }
}
async function validateStaffConfiguration() {
  const document = parsedStaffConfiguration();
  if (!document) return;
  saving.value = true;
  try {
    staffConfigurationReport.value = await importInstanceSetupStaffConfiguration(document, true);
  } catch (error) {
    staffConfigurationReport.value = reportFromError(error);
  } finally {
    saving.value = false;
  }
}
async function saveStaffConfiguration() {
  const document = parsedStaffConfiguration();
  if (!document) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    const result = await importInstanceSetupStaffConfiguration(document, false);
    staffConfigurationReport.value = result;
    const byUsername = new Map((document.teachers || []).map(teacher => [String(teacher.username || "").trim().toLowerCase(), teacher]));
    for (const credential of result.credentials || []) {
      const teacher = byUsername.get(credential.username);
      rememberCredential({
        id: `teacher:${credential.username}`,
        kind: "TEACHER",
        name: credential.name,
        schoolCode: setupContext.value.school.code,
        username: credential.username,
        secretLabel: "个人 PIN",
        secret: credential.pin,
        detail: (teacher?.teachingAssignments || []).map(item => item.workspaceCode).join("、") || "尚未分配任课空间",
      });
    }
    if (setupContext.value.school.teacherAuthMode === "SHARED_PASSWORD") {
      const sharedSecret = credentialEntries.find(item => item.kind === "SHARED_PASSWORD")?.secret || "";
      for (const teacher of document.teachers || []) {
        if (!sharedSecret) {
          deliveryWarning.value = "教师账号已经创建，但当前安装会话没有学校通用教师口令明文；请使用部署时保存的口令，遗忘时在后台重置。";
          break;
        }
        rememberCredential({
          id: `teacher:${String(teacher.username).toLowerCase()}`,
          kind: "TEACHER",
          name: teacher.name,
          schoolCode: setupContext.value.school.code,
          username: String(teacher.username).toLowerCase(),
          secretLabel: "学校通用教师口令",
          secret: sharedSecret,
          detail: (teacher.teachingAssignments || []).map(item => item.workspaceCode).join("、") || "尚未分配任课空间",
        });
      }
    } else if ((result.credentials || []).length < (document.teachers || []).length) {
      deliveryWarning.value = "部分教师账号已经存在且使用 GENERATE_PIN，系统保留了原 PIN；原始 PIN 无法再次导出，需要时可在学校后台重置。";
    }
    await Promise.all([loadStatus(), loadSetupResources()]);
    goToStage(5);
  } catch (error) {
    staffConfigurationReport.value = reportFromError(error);
    errorMessage.value = describeApiError(error, "教师配置导入失败");
  } finally {
    saving.value = false;
  }
}
async function saveScreen() {
  if (!screenInputValid.value) {
    errorMessage.value = "请补全大屏账号信息，并确认两次输入的 PIN 一致";
    return;
  }
  saving.value = true; errorMessage.value = "";
  try {
    const submitted = {...screenForm};
    const created = await createInstanceSetupScreen(submitted);
    rememberCredential({id: `screen:${created.loginCode}`, kind: "SCREEN", name: created.name, schoolCode: setupContext.value.school.code, username: created.loginCode, secretLabel: "大屏 PIN", secret: submitted.pin, detail: created.administrativeClass?.name || "班级大屏"});
    screenForm.pin = ""; screenForm.pinConfirm = ""; screenForm.name = ""; screenForm.loginCode = ""; screenForm.administrativeClassId = ""; screenCreated.value = true;
    await Promise.all([loadStatus(), loadSetupResources()]);
  } catch (error) { errorMessage.value = describeApiError(error, "大屏账号创建失败"); } finally { saving.value = false; }
}
function goToStage(value) { stage.value = value; unlockedStage.value = Math.max(unlockedStage.value, value); }
async function runLoginTest() {
  loginTest.loading = true;
  loginTest.message = "";
  loginTest.error = "";
  try {
    const result = await verifyInstanceSetupLogin({
      kind: loginTest.kind,
      schoolCode: setupContext.value?.school?.code || form.schoolCode,
      username: loginTest.username,
      password: loginTest.password,
    });
    verifiedKinds[loginTest.kind] = true;
    loginTest.message = `${result.name || result.account} 的${credentialTypes[loginTest.kind]}登录凭据验证通过；未签发登录令牌，也未绑定设备。`;
  } catch (error) {
    verifiedKinds[loginTest.kind] = false;
    loginTest.error = describeApiError(error, "登录凭据验证失败");
  } finally {
    loginTest.loading = false;
  }
}
async function finishSetup() {
  saving.value = true; errorMessage.value = "";
  try { status.value = await completeInstanceSetup(); clearCredentialMemory(); await router.replace("/classworks-admin"); } catch (error) { errorMessage.value = describeApiError(error, "无法完成初始化"); } finally { saving.value = false; }
}
onMounted(loadStatus);
onBeforeUnmount(clearCredentialMemory);
</script>

<style scoped>
.setup-page { background: radial-gradient(circle at 15% 0%, rgba(var(--v-theme-primary), .12), transparent 38%), rgb(var(--v-theme-background)); min-height: 100vh; }
.setup-heading { align-items: center; display: flex; gap: 18px; }
.stage-track { display: grid; gap: 10px; grid-template-columns: repeat(6, minmax(0, 1fr)); }
.stage-item { align-items: center; background: transparent; border: 0; color: rgba(var(--v-theme-on-surface), .58); display: flex; gap: 8px; min-width: 0; padding: 4px; text-align: left; }
.stage-item span { align-items: center; border: 1px solid currentColor; border-radius: 50%; display: inline-flex; flex: 0 0 auto; height: 28px; justify-content: center; width: 28px; }
.stage-item div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stage-item.active { color: rgb(var(--v-theme-primary)); font-weight: 700; }
.stage-item.done { color: rgb(var(--v-theme-success)); }
.stage-item:disabled { cursor: default; opacity: .5; }
.check-list { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.count-tile { align-items: center; background: rgba(var(--v-theme-surface-variant), .38); border-radius: 14px; display: flex; gap: 12px; min-height: 76px; padding: 14px; }
.count-tile strong, .count-tile span { display: block; }
.count-tile strong { font-size: 1.35rem; }
.count-tile span { color: rgba(var(--v-theme-on-surface), .62); font-size: .78rem; }
.teacher-row, .validation-summary { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: 14px; padding: 16px; }
.setup-section { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: 16px; padding: 18px; }
.credential-table { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.credential-secret { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-weight: 700; letter-spacing: .04em; }
.organization-editor :deep(textarea) { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .83rem; line-height: 1.55; }
@media (max-width: 900px) { .stage-track { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 600px) { .setup-heading { align-items: flex-start; } .setup-heading h1 { font-size: 1.65rem !important; } .stage-track { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
