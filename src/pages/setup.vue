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
                    检测到未完成的初始化。重新验证部署密钥即可从已有数据继续，不会重复创建学校。
                  </v-alert>
                  <v-alert
                    v-if="!status?.canStart"
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
                    该密钥来自服务器部署环境，只建立15分钟的安装会话，不会成为日常登录密码。
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
                    此操作通过数据库事务一次完成。任一步失败都不会留下半个学校。
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
                    已载入一份高二行政班＋走班参考方案，并自动替换为当前学校、学期和科目代码。请按实际分班修改；尚未掌握分班情况时直接跳过最稳妥。
                  </v-alert>
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
                    当前学校选择 OAuth 邮箱登录，安装向导不创建短账号。请完成初始化后在学校后台按邮箱分配教师。
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
                  <div class="d-flex flex-wrap ga-3 mt-4">
                    <v-btn
                      v-if="setupContext?.school?.teacherAuthMode !== 'OAUTH_EMAIL'"
                      color="primary"
                      :disabled="!teacherRowsValid"
                      :loading="saving"
                      prepend-icon="mdi-account-multiple-check-outline"
                      @click="saveTeachers"
                    >
                      预检并创建
                    </v-btn>
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
                    大屏使用独立账号登录，不需要在一体机上输入管理员账号。这里只创建账号；首次在班级一体机登录后才会绑定该设备。
                  </v-alert>
                  <v-alert
                    v-if="!administrativeClassOptions.length"
                    class="mb-5"
                    type="warning"
                    variant="tonal"
                  >
                    尚未配置行政班，无法创建大屏账号。可以安全跳过。
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
              <v-card
                class="rounded-xl"
                elevation="3"
              >
                <v-card-title class="pa-6 pb-2">
                  检查并完成
                </v-card-title>
                <v-card-text class="pa-6 pt-3">
                  <v-alert
                    class="mb-5"
                    type="success"
                    variant="tonal"
                  >
                    核心数据已经可用。完成后将锁定安装入口，未配置的班级、教师和大屏仍可在学校管理后台继续添加。
                  </v-alert>
                  <div class="setup-section mb-5">
                    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-3">
                      <div>
                        <div class="text-h6">
                          一次性账号交付中心
                        </div>
                        <div class="text-body-2 text-medium-emphasis">
                          明文凭据只保存在当前页面内存中。刷新、离开或完成初始化后无法再次查看，只能由管理员重置。
                        </div>
                      </div>
                      <div
                        v-if="credentialEntries.length"
                        class="d-flex flex-wrap ga-2"
                      >
                        <v-btn
                          :prepend-icon="showDeliverySecrets ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                          variant="tonal"
                          @click="showDeliverySecrets = !showDeliverySecrets"
                        >
                          {{ showDeliverySecrets ? '隐藏凭据' : '显示凭据' }}
                        </v-btn>
                        <v-btn
                          prepend-icon="mdi-file-download-outline"
                          variant="tonal"
                          @click="downloadCredentials"
                        >
                          下载 CSV
                        </v-btn>
                      </div>
                    </div>
                    <v-alert
                      v-if="!credentialEntries.length"
                      type="warning"
                      variant="tonal"
                    >
                      当前浏览器没有可交付的明文凭据，可能是初始化中途刷新或重新进入。已有账号的原始 PIN 无法从服务器取回；请完成登录测试，遗忘时在管理后台重置。
                    </v-alert>
                    <v-alert
                      v-if="deliveryWarning"
                      class="mb-3"
                      type="warning"
                      variant="tonal"
                    >
                      {{ deliveryWarning }}
                    </v-alert>
                    <template v-else>
                      <v-table class="credential-table rounded-lg">
                        <thead>
                          <tr>
                            <th>类型 / 名称</th><th>账号</th><th>初始凭据</th><th>用途</th><th />
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="item in credentialEntries"
                            :key="item.id"
                          >
                            <td>
                              <strong>{{ credentialTypes[item.kind] || item.kind }}</strong>
                              <div class="text-caption text-medium-emphasis">
                                {{ item.name }}
                              </div>
                            </td>
                            <td>{{ item.username }}</td>
                            <td>
                              <span class="credential-secret">{{ showDeliverySecrets ? item.secret : '••••••••' }}</span>
                              <div class="text-caption text-medium-emphasis">
                                {{ item.secretLabel }}
                              </div>
                            </td>
                            <td>{{ item.detail }}</td>
                            <td class="text-no-wrap">
                              <v-btn
                                icon="mdi-content-copy"
                                size="small"
                                title="复制凭据"
                                variant="text"
                                @click="copyCredential(item)"
                              />
                              <v-btn
                                v-if="item.kind !== 'SHARED_PASSWORD'"
                                icon="mdi-shield-check-outline"
                                size="small"
                                title="验证该账号"
                                variant="text"
                                @click="testCredential(item)"
                              />
                            </td>
                          </tr>
                        </tbody>
                      </v-table>
                      <v-checkbox
                        v-model="credentialsAcknowledged"
                        class="mt-3"
                        color="primary"
                        hide-details
                        label="我已下载、复制或打印并妥善保存本次创建的账号凭据"
                      />
                    </template>
                  </div>

                  <div class="setup-section mb-5">
                    <div class="d-flex align-center ga-3 mb-2">
                      <v-icon
                        color="primary"
                        icon="mdi-shield-check-outline"
                      />
                      <div class="text-h6">
                        上线前登录测试
                      </div>
                      <v-chip
                        :color="verifiedKinds.OWNER ? 'success' : 'warning'"
                        size="small"
                        variant="tonal"
                      >
                        {{ verifiedKinds.OWNER ? '管理员已验证' : '需验证管理员' }}
                      </v-chip>
                    </div>
                    <div class="text-body-2 text-medium-emphasis mb-4">
                      测试只校验账号与凭据，不签发登录令牌，不记录为正式登录，也不会绑定大屏设备。
                    </div>
                    <v-row>
                      <v-col
                        cols="12"
                        md="3"
                      >
                        <v-select
                          v-model="loginTest.kind"
                          :items="loginTestKindOptions"
                          item-title="title"
                          item-value="value"
                          label="账号类型"
                          variant="outlined"
                          @update:model-value="loginTest.message = ''; loginTest.error = ''"
                        />
                      </v-col>
                      <v-col
                        cols="12"
                        md="4"
                      >
                        <v-text-field
                          v-model.trim="loginTest.username"
                          :label="loginTest.kind === 'SCREEN' ? '大屏登录账号' : '短账号'"
                          variant="outlined"
                        />
                      </v-col>
                      <v-col
                        cols="12"
                        md="5"
                      >
                        <v-text-field
                          v-model="loginTest.password"
                          :label="loginTest.kind === 'TEACHER' && setupContext?.school?.teacherAuthMode === 'SHARED_PASSWORD' ? '学校通用教师口令' : 'PIN'"
                          type="password"
                          variant="outlined"
                          @keyup.enter="runLoginTest"
                        />
                      </v-col>
                    </v-row>
                    <v-alert
                      v-if="loginTest.message"
                      class="mb-3"
                      type="success"
                      variant="tonal"
                    >
                      {{ loginTest.message }}
                    </v-alert>
                    <v-alert
                      v-if="loginTest.error"
                      class="mb-3"
                      type="error"
                      variant="tonal"
                    >
                      {{ loginTest.error }}
                    </v-alert>
                    <v-btn
                      color="primary"
                      :disabled="!loginTest.username || !loginTest.password"
                      :loading="loginTest.loading"
                      prepend-icon="mdi-login-variant"
                      variant="tonal"
                      @click="runLoginTest"
                    >
                      验证登录凭据
                    </v-btn>
                  </div>
                  <v-row class="mb-4">
                    <v-col
                      v-for="item in countItems"
                      :key="item.title"
                      cols="6"
                      md="3"
                    >
                      <div class="count-tile">
                        <v-icon
                          :icon="item.icon"
                          color="primary"
                        /><div><strong>{{ item.value }}</strong><span>{{ item.title }}</span></div>
                      </div>
                    </v-col>
                  </v-row>
                  <v-alert
                    v-if="!status?.counts?.workspaces"
                    class="mb-3"
                    type="warning"
                    variant="tonal"
                  >
                    尚未设置班级。完成后请优先进入“组织与教学关系”配置。
                  </v-alert>
                  <v-alert
                    v-if="!status?.counts?.screens"
                    class="mb-5"
                    type="info"
                    variant="tonal"
                  >
                    尚未创建大屏账号，不影响教师先使用系统。
                  </v-alert>
                  <div class="d-flex flex-wrap ga-3">
                    <v-btn
                      color="primary"
                      :disabled="!canFinishSetup"
                      :loading="saving"
                      prepend-icon="mdi-lock-check-outline"
                      size="large"
                      @click="finishSetup"
                    >
                      完成并锁定初始化
                    </v-btn><v-btn
                      variant="text"
                      @click="stage = 3"
                    >
                      返回补充配置
                    </v-btn>
                  </div>
                  <div
                    v-if="!canFinishSetup"
                    class="text-body-2 text-warning mt-3"
                  >
                    完成前必须通过管理员登录测试；若本页保存了新凭据，还需确认已经完成交付。
                  </div>
                </v-card-text>
              </v-card>
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
import {completeInstanceSetup, createInstanceSetupScreen, createInstanceSetupSession, describeApiError, getInstanceSetupContext, getInstanceSetupOrganizationTemplate, getInstanceSetupStatus, importInstanceSetupOrganization, importInstanceSetupTeachers, initializeInstanceCore, verifyInstanceSetupLogin} from "@/utils/classworksV2Client";

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
const setupContext = ref(null);
const setupMode = ref("QUICK");
const stage = ref(1);
const unlockedStage = ref(1);
const setupKey = ref("");
const showSetupKey = ref(false);
const organizationText = ref("");
const organizationReport = ref(null);
const teacherReport = ref(null);
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
  try { status.value = await getInstanceSetupStatus(); } catch (error) { errorMessage.value = describeApiError(error, "无法读取 KV 后端初始化状态"); } finally { loading.value = false; }
}
async function loadSetupResources(forceTemplate = false) {
  const [context, template] = await Promise.all([getInstanceSetupContext(), getInstanceSetupOrganizationTemplate()]);
  setupContext.value = context;
  if (!organizationText.value || forceTemplate) organizationText.value = JSON.stringify(adaptOrganizationTemplate(template, context), null, 2);
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
  try { await importInstanceSetupOrganization(document, false); await Promise.all([loadStatus(), loadSetupResources()]); goToStage(4); } catch (error) { organizationReport.value = reportFromError(error); errorMessage.value = describeApiError(error, "组织配置导入失败"); } finally { saving.value = false; }
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
